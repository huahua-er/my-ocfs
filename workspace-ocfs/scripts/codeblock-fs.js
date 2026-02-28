const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const {
    handleList,
    handleRead,
    handleOutline,
    handleGrep,
    handleEdit,
    handleGSearch,
    handleWebFetch,
    handleVcpPlugin,
    getVcpPluginNames,
    loadVcpPlugins,
    handleExec
} = require('./ocfs-handlers.js');

const BASE_DIR = process.env.OCFS_WORKSPACE_DIR || '/home/node/.openclaw/workspace-ocfs';

// OpenClaw CLI 命令前缀：Docker 中用 node /app/dist/index.js，非 Docker 用 openclaw
const OPENCLAW_CMD = 'openclaw';
const CACHE_FILE = '/tmp/ocfs_processed.ids';

// 持久化消息去重
let processedMessages = new Set();
if (fs.existsSync(CACHE_FILE)) {
    try {
        processedMessages = new Set(fs.readFileSync(CACHE_FILE, 'utf8').split('\n').filter(Boolean));
    } catch (e) { }
}

// 内容级去重：防止同一 OCFS 指令块因不同 message_id 被重复执行（30 秒窗口）
const recentContentHashes = new Map(); // hash -> timestamp
const CONTENT_DEDUP_WINDOW_MS = 30000;

// 流式防抖：等待流式写入完成后再执行，防止中间态消息提前触发
const pendingOcfsExecutions = new Map(); // sessionKey -> { timer, msgId }
const OCFS_DEBOUNCE_MS = parseInt(process.env.OCFS_DEBOUNCE_MS, 10) || 1500;

function saveProcessedId(cacheKey) {
    processedMessages.add(cacheKey);
    fs.appendFileSync(CACHE_FILE, cacheKey + '\n');
}

if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });

/**
 * 处理消息核心逻辑
 */
function processMessage(rawLine, sessionKey, agentId) {
    if (!rawLine || !agentId) return;

    // 1. 严格身份准则：只处理来自 ocfs-specialist 专员会话的消息
    if (agentId !== 'ocfs-specialist') return;

    try {
        const data = JSON.parse(rawLine);

        // 2. 只处理助手(Assistant)生成的回复，不处理用户(User)或系统消息，防止指令重复执行
        if (!data.message || data.message.role !== 'assistant') return;

        const msgId = data.message_id || data.id;
        if (!msgId) return;
        const cacheKey = `${sessionKey}:${msgId}`;

        // 3. 消息 ID 级去重
        if (processedMessages.has(cacheKey)) return;

        let text = '';
        const content = data.message.content;
        if (Array.isArray(content)) {
            text = content.map(item => item.text || item.input || (typeof item === 'string' ? item : '')).join('');
        } else {
            text = typeof content === 'string' ? content : (content.text || '');
        }

        // 4. 彻底屏蔽所有系统回响和历史镜像（Subagent finished 等标记）
        if (text.includes('✅ Subagent') || text.includes('Subagent finished') || text.includes('[OCFS-SYSTEM-NOTIFICATION]')) return;

        if (text && /```ocfs/i.test(text)) {
            // 流式防护：只处理包含完整闭合 ``` 的 OCFS 块，跳过流式中间消息（未闭合的块）
            const ocfsBlocks = text.match(/```ocfs[\s\S]*?```/gi);
            if (!ocfsBlocks || ocfsBlocks.length === 0) {
                console.log(`[OCFS] Skipping unclosed OCFS block in ${sessionKey}:${msgId} (likely streaming intermediate)`);
                return;
            }

            // 内容级去重：对 OCFS 块内容计算哈希，30 秒内相同内容不重复执行
            const normalizedBlocks = ocfsBlocks.map(b => b.replace(/```\s*$/g, '').replace(/^```ocfs\s*/gi, '').trim()).join('|||');
            const contentHash = `${sessionKey}:ocfs:${crypto.createHash('md5').update(normalizedBlocks).digest('hex')}`;
            const now = Date.now();
            const lastSeen = recentContentHashes.get(contentHash);
            if (lastSeen && (now - lastSeen) < CONTENT_DEDUP_WINDOW_MS) {
                console.log(`[OCFS] Skipping duplicate OCFS content in ${sessionKey}:${msgId} (same content seen ${now - lastSeen}ms ago)`);
                saveProcessedId(cacheKey);
                return;
            }
            recentContentHashes.set(contentHash, now);

            console.log(`[OCFS] Detected OCFS block in ${sessionKey}:${msgId}`);
            saveProcessedId(cacheKey);

            // 流式防抖：如果同一 session 已有待执行任务，取消旧的，用最新内容覆盖
            if (pendingOcfsExecutions.has(sessionKey)) {
                clearTimeout(pendingOcfsExecutions.get(sessionKey).timer);
                console.log(`[OCFS] Superseding pending execution in ${sessionKey} with newer content from ${msgId}`);
            }

            const timer = setTimeout(() => {
                pendingOcfsExecutions.delete(sessionKey);
                executeOcfs(text, sessionKey, agentId).catch(err => {
                    console.error(`[OCFS] executeOcfs unhandled error for ${sessionKey}:${msgId}:`, err);
                });
            }, OCFS_DEBOUNCE_MS);
            pendingOcfsExecutions.set(sessionKey, { timer, msgId });
        }
    } catch (e) {
        console.error(`[OCFS] Error processing message ${sessionKey}:`, e);
    }
}

async function handleNativeTool(sessionKey, toolName, argsObj, sendFeedback, agentId = 'ocfs-specialist') {
    let token = process.env.OPENCLAW_GATEWAY_TOKEN || process.env.OPENCLAW_GATEWAY_PASSWORD;
    if (!token) {
        try {
            const stateDir = process.env.OPENCLAW_STATE_DIR || '/home/node/.openclaw';
            const cfgText = fs.readFileSync(path.join(stateDir, 'openclaw.json'), 'utf8');
            const match = cfgText.match(/["']?(?:token|password)["']?\s*:\s*["']([^"']+)["']/);
            if (match) token = match[1];
        } catch (e) { }
    }

    try {
        const formattedSessionKey = sessionKey.startsWith('agent:') ? sessionKey : `agent:${agentId}:${sessionKey}`;
        const payload = {
            tool: toolName,
            args: argsObj,
            sessionKey: formattedSessionKey
        };

        const response = await fetch('http://127.0.0.1:18789/tools/invoke', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (response.ok && result.ok) {
            let output = JSON.stringify(result.result, null, 2);
            if (output.length > 25000) output = output.substring(0, 25000) + '\n... (truncated)';
            sendFeedback(sessionKey, `✅ **${toolName}**:\n\`\`\`json\n${output}\n\`\`\``);
        } else {
            sendFeedback(sessionKey, `❌ **${toolName}** Failed: ${result.error?.message || JSON.stringify(result)}`);
        }
    } catch (err) {
        sendFeedback(sessionKey, `❌ **${toolName}** HTTP Exception: ${err.message}`);
    }
}

async function executeOcfs(text, sessionKey, agentId = 'ocfs-specialist') {
    const regex = /```ocfs([\s\S]*?)```/gi;
    let match;
    const tasks = [];

    // VCP 插件动态注册：每次执行前重新扫描插件目录，确保新增/删除的插件被感知
    loadVcpPlugins();
    // OpenClaw 原生工具（直接实现或 CLI 桥接）+ OCFS 独有工具
    const baseActions = [
        // 文件系统（直接实现）
        'ls', 'list', 'read', 'write', 'append', 'edit', 'grep', 'find',
        // OpenClaw CLI 桥接
        'exec', 'apply_patch', 'browser', 'message', 'cron', 'nodes',
        'sessions_list', 'sessions_send', 'sessions_history', 'sessions_spawn',
        'session_status', 'subagents', 'memory_search',
        // 联网工具
        'web_search', 'web_fetch',
        // OCFS 独有
        'outline', 'ocfs_fetch', 'ocfs_search',
    ];
    const vcpNames = getVcpPluginNames().filter(n => !baseActions.includes(n));
    const knownActions = [...baseActions, ...vcpNames];

    while ((match = regex.exec(text)) !== null) {
        const block = match[1].trim();
        const lines = block.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const firstColon = line.indexOf(':');
            if (firstColon === -1) continue;

            const action = line.substring(0, firstColon).trim().toLowerCase();
            const remainder = line.substring(firstColon + 1).trim();

            console.log(`[OCFS] Parsing Task - Action: ${action}, Remainder: ${remainder}`);

            let target = remainder;
            let content = '';

            if (action === 'exec') {
                target = 'master'; // fallback target session
                content = remainder; // entire remainder is the message

                let nextIdx = i + 1;
                while (nextIdx < lines.length) {
                    const nextLine = lines[nextIdx];
                    const match = nextLine.match(/^([a-zA-Z]+):/);
                    if (match) {
                        const possibleAction = match[1].toLowerCase();
                        if (knownActions.includes(possibleAction)) {
                            break;
                        }
                    }
                    content += (content ? '\n' : '') + nextLine;
                    nextIdx++;
                }
                i = nextIdx - 1;
            } else if (action === 'write' || action === 'append' || action === 'edit') {
                // 支持引号包裹文件名，解决文件名含空格的问题
                // 格式：write: "my file.md" content  或  write: 'my file.md' content
                const quoteMatch = remainder.match(/^(["'])(.*?)\1\s*([\s\S]*)$/);
                if (quoteMatch) {
                    target = quoteMatch[2].trim();
                    content = quoteMatch[3].trim();
                } else {
                    const spaceIndex = remainder.indexOf(' ');
                    if (spaceIndex !== -1) {
                        target = remainder.substring(0, spaceIndex).trim();
                        content = remainder.substring(spaceIndex + 1).trim();
                    } else {
                        target = remainder;
                        content = '';
                    }
                }
                // 路径鲁棒性：清理尾部斜杠，防止文件名被当作目录
                target = target.replace(/[\/\\]+$/, '');

                let nextIdx = i + 1;
                while (nextIdx < lines.length) {
                    const nextLine = lines[nextIdx];
                    const match = nextLine.match(/^([a-zA-Z]+):/);
                    if (match) {
                        const possibleAction = match[1].toLowerCase();
                        if (knownActions.includes(possibleAction)) {
                            break;
                        }
                    }
                    content += (content ? '\n' : '') + nextLine;
                    nextIdx++;
                }
                i = nextIdx - 1;
            }
            tasks.push({ action, target, content, fullPath: path.resolve(BASE_DIR, target) });
        }
    }

    if (tasks.length === 0) {
        console.log('[OCFS] No tasks found in block');
        return;
    }

    // 在执行 Session 内回传结果
    const executionId = crypto.randomBytes(4).toString('hex');
    console.log(`[OCFS] === executeOcfs START [${executionId}] session=${sessionKey} tasks=${tasks.length} ===`);

    const sendFeedback = (sKey, msg) => {
        try {
            console.log(`[OCFS] Sending Feedback [${executionId}] to ${sKey}: ${msg.substring(0, 80)}...`);

            const now = new Date();
            const timeStr = `${now.getFullYear()}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

            // 隐形注入反馈：不再投递到用户终端界面，纯粹作为大模型的上下文记忆
            // 采用清晰的定界符和提示语，确保大模型理解这是工具运行结果并继续作答
            const formattedMsg = `[OCFS-SYSTEM-NOTIFICATION]\n<ocfs_execution_result timestamp="${timeStr}">\n${msg}\n</ocfs_execution_result>\n\n(System: The above are the results of your requested codeblocks execution. Please continue your thoughts and formulate your reply to the user.)`;

            // 动态截获真实的投递上下文（解决外部渠道 TG/Discord 不能返回后续长对话的问题）
            let replyArgs = [];
            try {
                const stateDir = process.env.OPENCLAW_STATE_DIR || '/home/node/.openclaw';
                const sessionPath = path.join(stateDir, 'agents', agentId, 'sessions', `${sKey}.jsonl`);
                if (fs.existsSync(sessionPath)) {
                    const content = fs.readFileSync(sessionPath, 'utf8').trim();
                    const sLines = content.split('\n');
                    for (let i = sLines.length - 1; i >= 0; i--) {
                        if (!sLines[i]) continue;
                        try {
                            const data = JSON.parse(sLines[i]);
                            // 查找 deliveryContext，它通常依附于用户输入消息
                            const context = data.message?.deliveryContext || data.deliveryContext;
                            if (context && context.channel && context.to) {
                                // 必须避开内部 CLI 触发产生的幽灵环境，提取真正发消息的外部物理用户
                                if (context.channel !== 'cli' && context.channel !== 'local' && context.channel !== 'api') {
                                    replyArgs = ['--reply-channel', context.channel, '--reply-to', context.to];
                                    break;
                                }
                            }
                        } catch (err) { }
                    }
                }
            } catch (err) {
                console.error('[OCFS] Failed to extract delivery context:', err);
            }

            const args = [
                '/app/dist/index.js', 'agent',
                '--session-id', sKey,
                '--message', formattedMsg
            ];
            if (replyArgs.length > 0) {
                // 仅当查找到外部非静默渠道时，才开启下一次模型推理回应的强制投递和携带上下文回复信息
                args.push('--deliver', ...replyArgs);
            }

            spawnSync('/usr/local/bin/node', args, {
                encoding: 'utf8',
                env: {
                    ...process.env,
                    OPENCLAW_GATEWAY_URL: process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789'
                }
            });
        } catch (e) {
            console.error('[OCFS] Feedback error:', e);
        }
    };

    const allFeedbacks = [];
    const localSendFeedback = (sKey, msg) => {
        allFeedbacks.push(msg);
    };

    // 1. 执行所有任务
    for (const task of tasks) {
        try {
            const { action, target, content, fullPath } = task;
            console.log(`[OCFS] Executing Action: ${action} on ${target}`);

            // 安全日志：记录跨越默认工作目录的文件操作（不再硬拦截）
            const nonFsActions = ['exec', 'ocfs_fetch', 'ocfs_search', 'web_fetch', 'web_search', 'browser', 'message', 'cron', 'nodes', 'sessions_list', 'sessions_send', 'sessions_history', 'sessions_spawn', 'session_status', 'subagents', 'memory_search', 'apply_patch', 'find'];
            if (fullPath !== BASE_DIR && !fullPath.startsWith(BASE_DIR + path.sep) && !nonFsActions.includes(action) && !vcpNames.includes(action)) {
                console.log(`[OCFS] Notice: 文件操作目标在默认工作目录之外 (${target})`);
            }

            // OpenClaw CLI 全部可用命令白名单 (与 OpenClaw Router 对齐)
            const openclawCoreCommands = [
                'setup', 'onboard', 'configure', 'config', 'doctor', 'dashboard', 'reset', 'uninstall',
                'message', 'memory', 'agent', 'agents', 'status', 'health', 'sessions', 'browser',
                'acp', 'gateway', 'daemon', 'logs', 'system', 'models', 'approvals', 'nodes', 'devices',
                'node', 'sandbox', 'tui', 'cron', 'dns', 'docs', 'hooks', 'webhooks', 'qr', 'clawbot',
                'pairing', 'plugins', 'channels', 'directory', 'security', 'secrets', 'skills',
                'update', 'completion'
            ];

            if (action === 'write') {
                let backupMsg = '';

                // 鲁棒性检查：如果目标已存在且是目录，拒绝写入
                if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
                    localSendFeedback(sessionKey, `❌ **WRITE Error**: \`${target}\` 已存在且是一个目录，无法写入文件。请指定完整文件名（如 \`${target}/file.md\`）。`);
                    continue;
                }

                const dirPath = path.dirname(fullPath);
                if (!fs.existsSync(dirPath)) {
                    fs.mkdirSync(dirPath, { recursive: true });
                    console.log(`[OCFS] Created directory: ${dirPath}`);
                } else if (!fs.statSync(dirPath).isDirectory()) {
                    // 父路径存在但不是目录（是个文件），拒绝
                    localSendFeedback(sessionKey, `❌ **WRITE Error**: 父路径 \`${path.dirname(target)}\` 已被占用为文件，无法创建目录。`);
                    continue;
                }

                if (fs.existsSync(fullPath)) {
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace(/-\d{3}Z$/, '');
                    const ext = path.extname(fullPath);
                    const base = fullPath.slice(0, fullPath.length - ext.length);
                    const backupPath = `${base}.${timestamp}${ext}`;
                    fs.renameSync(fullPath, backupPath);
                    console.log(`[OCFS] Backed up existing file to ${backupPath}`);
                    backupMsg = '（已自动备份旧版本）';
                }

                fs.writeFileSync(fullPath, content);
                localSendFeedback(sessionKey, `✅ **WRITE**: \`${target}\` 成功${backupMsg}。`);
            }
            else if (action === 'append') {
                const appendContent = fs.existsSync(fullPath) ? `\n${content}` : content;
                fs.appendFileSync(fullPath, appendContent);
                localSendFeedback(sessionKey, `✅ **APPEND**: \`${target}\` 追加成功。`);
            }
            else if (action === 'edit') {
                handleEdit(fullPath, content);
                localSendFeedback(sessionKey, `✅ **EDIT**: \`${target}\` 局部修改成功。`);
            }
            else if (action === 'ls' || action === 'list') handleList(sessionKey, target, null, localSendFeedback);
            else if (action === 'read') handleRead(sessionKey, target, null, localSendFeedback);
            else if (action === 'outline') handleOutline(sessionKey, target, null, localSendFeedback);
            else if (action === 'grep') handleGrep(sessionKey, target, null, localSendFeedback);
            // OCFS 独有工具
            else if (action === 'ocfs_fetch') await handleWebFetch(sessionKey, target, null, localSendFeedback);
            else if (action === 'ocfs_search') await handleGSearch(sessionKey, target, null, localSendFeedback);
            else if (action === 'find') {
                const docsDir = process.env.OCFS_DOCS_DIR || '/home/node/github/text';
                await handleExec(sessionKey, `find ${docsDir} -name "${target.replace(/"/g, '\\"')}"`, null, localSendFeedback);
            }
            // exec 直接执行
            else if (action === 'exec') await handleExec(sessionKey, content, null, localSendFeedback);
            // OpenClaw CLI 桥接：特制覆写与向后兼容别名
            else if (action === 'message') await handleExec(sessionKey, `${OPENCLAW_CMD} message ${target}`, null, localSendFeedback, { timeout: 300000, hideEcho: true });
            else if (action === 'sessions_send') await handleExec(sessionKey, `${OPENCLAW_CMD} agent ${target}`, null, localSendFeedback, { timeout: 300000, hideEcho: true });
            else if (action === 'sessions_list') await handleExec(sessionKey, `${OPENCLAW_CMD} sessions ${target}`, null, localSendFeedback);
            else if (action === 'sessions_history') await handleExec(sessionKey, `${OPENCLAW_CMD} sessions ${target}`, null, localSendFeedback);
            else if (action === 'sessions_spawn') {
                let targetAgentId;
                let task = target;
                const agentMatch = target.match(/--agent\s+([^\s"']+)/);
                if (agentMatch) {
                    targetAgentId = agentMatch[1];
                    task = task.replace(agentMatch[0], '');
                }
                const msgMatch = task.match(/--message\s+([\s\S]+)$/);
                if (msgMatch) {
                    task = msgMatch[1];
                } else {
                    task = task.replace(/--message\s*/, '');
                }
                task = task.trim();

                // 去除可能存在的最外层引号包裹
                if ((task.startsWith('"') && task.endsWith('"')) || (task.startsWith("'") && task.endsWith("'"))) {
                    task = task.substring(1, task.length - 1);
                }

                const argsObj = { task };
                if (targetAgentId) argsObj.agentId = targetAgentId;
                // 注意：第五个参数必须传外部的 agentId（作为真正的呼叫源，也就是 ocfs-specialist 等）
                // argsObj.agentId 才是要分派过去的子智能体（如 ops、main 等）
                await handleNativeTool(sessionKey, 'sessions_spawn', argsObj, localSendFeedback, agentId);
            }
            else if (action === 'session_status') await handleExec(sessionKey, `${OPENCLAW_CMD} status ${target}`, null, localSendFeedback);
            // subagents 工具并不是 openclaw agents cli，而是原生 subagents!
            else if (action === 'subagents') {
                const subArgs = target.split(' ');
                const subCmd = subArgs[0]; // status, abort
                const subTarget = subArgs.slice(1).join(' '); // [id]
                await handleNativeTool(sessionKey, 'subagents', { action: subCmd, target: subTarget }, localSendFeedback, agentId);
            }
            else if (action === 'memory_search') await handleExec(sessionKey, `${OPENCLAW_CMD} memory search ${target}`, null, localSendFeedback);
            else if (openclawCoreCommands.includes(action)) await handleExec(sessionKey, `${OPENCLAW_CMD} ${action} ${target}`, null, localSendFeedback);

            // OCFS 内部功能与代理调用
            else if (action === 'web_fetch') await handleNativeTool(sessionKey, 'web_fetch', { url: target.split('|')[0].trim() }, localSendFeedback, agentId);
            else if (action === 'web_search') await handleNativeTool(sessionKey, 'web_search', { query: target }, localSendFeedback, agentId);

            // VCP 插件
            else if (vcpNames.includes(action)) await handleVcpPlugin(sessionKey, action, target, localSendFeedback);
            else {
                console.warn(`[OCFS] Unknown action: ${action}`);
            }
        } catch (err) {
            console.error(`[OCFS] Execution Error for ${task.action}:`, err);
            localSendFeedback(sessionKey, `❌ **Error on \`${task.action}\`**: ${err.message}`);
        }
    }

    // 2. 最后发送所有任务的合并反馈
    if (allFeedbacks.length > 0) {
        const combinedMessage = allFeedbacks.join('\n\n---\n\n');
        console.log(`[OCFS] === FINAL SEND [${executionId}] feedbacks=${allFeedbacks.length} totalLen=${combinedMessage.length} ===`);
        sendFeedback(sessionKey, combinedMessage);
    }
}

module.exports = { processMessage };
