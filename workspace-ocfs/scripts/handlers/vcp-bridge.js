// handlers/vcp-bridge.js
// VCP 插件桥接适配器 - 兼容 VCPToolBox 的 synchronous stdio 插件

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const NODE_HOME = process.env.OCFS_SYSTEM_HOME || '/home/node';
const PLUGINS_DIR = process.env.VCP_PLUGINS_DIR || path.join(NODE_HOME, '.codex/plugins');
const plugins = new Map(); // key: lowercase name, value: plugin info

/**
 * 扫描 plugins/ 目录，加载所有 VCP 插件 manifest
 */
function loadPlugins() {
    plugins.clear();
    if (!fs.existsSync(PLUGINS_DIR)) {
        fs.mkdirSync(PLUGINS_DIR, { recursive: true });
        console.log(`[OCFS] VCP: Created plugins directory: ${PLUGINS_DIR}`);
        return;
    }

    let entries;
    try {
        entries = fs.readdirSync(PLUGINS_DIR, { withFileTypes: true });
    } catch (e) {
        console.error(`[OCFS] VCP: Failed to read plugins directory:`, e.message);
        return;
    }

    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const pluginPath = path.join(PLUGINS_DIR, entry.name);
        const manifestPath = path.join(pluginPath, 'plugin-manifest.json');
        if (!fs.existsSync(manifestPath)) continue;

        try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

            if (!manifest.name || !manifest.entryPoint?.command) {
                console.warn(`[VCP-Bridge] Invalid manifest in ${entry.name}, skipping`);
                continue;
            }
            // 只支持 synchronous + stdio
            if (manifest.pluginType && manifest.pluginType !== 'synchronous') {
                console.log(`[OCFS] VCP: Plugin "${manifest.name}" type "${manifest.pluginType}" not supported, skipping`);
                continue;
            }
            if (manifest.communication?.protocol && manifest.communication.protocol !== 'stdio') {
                console.log(`[OCFS] VCP: Plugin "${manifest.name}" protocol "${manifest.communication.protocol}" not supported, skipping`);
                continue;
            }

            // 加载 config.env / .env
            let pluginEnv = {};
            for (const envFile of ['config.env', '.env']) {
                const envPath = path.join(pluginPath, envFile);
                if (fs.existsSync(envPath)) {
                    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
                        line = line.trim();
                        if (!line || line.startsWith('#')) return;
                        const eqIdx = line.indexOf('=');
                        if (eqIdx === -1) return;
                        pluginEnv[line.substring(0, eqIdx).trim()] = line.substring(eqIdx + 1).trim();
                    });
                }
            }

            plugins.set(manifest.name.toLowerCase(), {
                name: manifest.name,
                displayName: manifest.displayName || manifest.name,
                command: manifest.entryPoint.command,
                timeout: manifest.communication?.timeout || 60000,
                basePath: pluginPath,
                env: pluginEnv
            });
            console.log(`[OCFS] VCP: Loaded: ${manifest.displayName || manifest.name} (${manifest.name})`);
        } catch (e) {
            console.error(`[OCFS] VCP: Error loading plugin from ${entry.name}:`, e.message);
        }
    }
    console.log(`[OCFS] VCP: Total plugins loaded: ${plugins.size}`);
}

/** 获取所有已注册 VCP 插件名（小写） */
function getVcpPluginNames() {
    return Array.from(plugins.keys());
}

/**
 * 解析参数字符串为对象
 * 支持 KV 格式: "key1=value1| key2=value2"
 * 支持 JSON 格式: '{"key": "value"}'
 */
function parseParams(paramString) {
    if (!paramString || !paramString.trim()) return {};
    const trimmed = paramString.trim();

    // 优先尝试 JSON
    if (trimmed.startsWith('{')) {
        try { return JSON.parse(trimmed); } catch (e) { /* 降级到 KV */ }
    }

    // KV 解析: key=value| key2=value2
    const params = {};
    const parts = trimmed.split(/\|\s*/);
    for (const part of parts) {
        const eqIdx = part.indexOf('=');
        if (eqIdx === -1) continue;
        const key = part.substring(0, eqIdx).trim();
        const value = part.substring(eqIdx + 1).trim();
        if (key) params[key] = value;
    }
    return params;
}

/**
 * 执行 VCP 插件
 * @param {string} sessionKey
 * @param {string} pluginName - 插件名（小写）
 * @param {string} paramString - KV 或 JSON 参数字符串
 * @param {Function} sendFeedback - (sessionKey, message) => void
 */
function handleVcpPlugin(sessionKey, pluginName, paramString, sendFeedback) {
    return new Promise((resolve) => {
        const plugin = plugins.get(pluginName.toLowerCase());
        if (!plugin) {
            sendFeedback(sessionKey, `❌ **VCP Error**: 插件 \`${pluginName}\` 未找到。已注册: ${getVcpPluginNames().join(', ') || '(无)'}`);
            return resolve();
        }

        const params = parseParams(paramString);
        const inputJson = JSON.stringify(params);
        console.log(`[OCFS] VCP: Executing: ${plugin.name}, params: ${inputJson.substring(0, 200)}`);

        const [cmd, ...args] = plugin.command.split(' ');
        const NODE_HOME = process.env.OCFS_SYSTEM_HOME || '/home/node';
        const GLOBAL_NODE_PATH = process.env.GLOBAL_NODE_PATH || path.join(NODE_HOME, '.local/share/pnpm/global/5/node_modules');
        const env = { ...process.env, ...plugin.env, NODE_PATH: GLOBAL_NODE_PATH };
        const child = spawn(cmd, args, {
            cwd: plugin.basePath, shell: true, env, windowsHide: true
        });

        let stdout = '', stderr = '', exited = false;

        const timer = setTimeout(() => {
            if (!exited) {
                child.kill('SIGKILL');
                sendFeedback(sessionKey, `❌ **VCP Timeout**: 插件 \`${plugin.name}\` 超时 (${plugin.timeout}ms)`);
                resolve();
            }
        }, plugin.timeout);

        child.stdout.on('data', d => { stdout += d.toString(); });
        child.stderr.on('data', d => { stderr += d.toString(); });

        child.on('error', err => {
            exited = true; clearTimeout(timer);
            sendFeedback(sessionKey, `❌ **VCP Error**: 插件 \`${plugin.name}\` 启动失败: ${err.message}`);
            resolve();
        });

        child.on('exit', (code, signal) => {
            exited = true; clearTimeout(timer);
            if (signal === 'SIGKILL') return;

            try {
                const resp = JSON.parse(stdout.trim());
                if (resp.status === 'success') {
                    let text;
                    if (typeof resp.result === 'string') {
                        text = resp.result;
                    } else if (resp.result?.content && Array.isArray(resp.result.content)) {
                        // 多模态返回：提取文本部分
                        text = resp.result.content.filter(i => i.type === 'text').map(i => i.text).join('\n');
                        if (!text) text = JSON.stringify(resp.result, null, 2);
                    } else {
                        text = typeof resp.result === 'object'
                            ? JSON.stringify(resp.result, null, 2)
                            : String(resp.result ?? '(无结果)');
                    }
                    sendFeedback(sessionKey, `✅ **${plugin.displayName}**:\n${text}`);
                } else {
                    const errMsg = typeof resp.error === 'string' ? resp.error : JSON.stringify(resp.error, null, 2);
                    sendFeedback(sessionKey, `❌ **${plugin.displayName} Error**: ${errMsg}`);
                }
            } catch (e) {
                const output = (stderr || stdout || '(无输出)').substring(0, 500);
                if (code !== 0) {
                    sendFeedback(sessionKey, `❌ **VCP Error**: \`${plugin.name}\` 退出码 ${code}\n${output}`);
                } else {
                    sendFeedback(sessionKey, `✅ **${plugin.displayName}**:\n${stdout.trim().substring(0, 2000) || '(无输出)'}`);
                }
            }
            resolve();
        });

        try { child.stdin.write(inputJson); child.stdin.end(); }
        catch (e) { console.error(`[OCFS] VCP: stdin write error for ${plugin.name}:`, e.message); }
    });
}

// 模块加载时自动扫描插件
loadPlugins();

module.exports = { handleVcpPlugin, getVcpPluginNames, loadPlugins, parseParams };
