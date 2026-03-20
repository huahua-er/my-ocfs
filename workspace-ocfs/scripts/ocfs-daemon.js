const fs = require('fs');
const path = require('path');

// 针对当前节点进程：自动为所有 [OCFS] 日志加上 ANSI 颜色
const originalLog = console.log;
const originalError = console.error;
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';

console.log = function (...args) {
    if (typeof args[0] === 'string' && args[0].includes('[OCFS]')) {
        const ts = new Date().toISOString();
        args[0] = args[0].replace(/\[OCFS\]\s*(Boot:)?\s*(VCP:)?\s*/i, (match, boot, vcp) => {
            let cat = 'ocfs';
            if (boot) cat = 'ocfs/boot';
            else if (vcp) cat = 'ocfs/vcp';
            return `${ts} [${CYAN}${cat}${RESET}] `;
        });
    }
    originalLog.apply(console, args);
};

console.error = function (...args) {
    if (typeof args[0] === 'string' && args[0].includes('[OCFS]')) {
        const ts = new Date().toISOString();
        args[0] = args[0].replace(/\[OCFS\]\s*(Boot:)?\s*(VCP:)?\s*/i, (match, boot, vcp) => {
            let cat = 'ocfs';
            if (boot) cat = 'ocfs/boot';
            else if (vcp) cat = 'ocfs/vcp';
            return `${ts} [${RED}${cat}${RESET}] `;
        });
    }
    originalError.apply(console, args);
};

// 零依赖解析 config.env (Node.js 20.6.0+ 原生支持 loadEnvFile)
try {
    process.loadEnvFile(require('path').resolve(__dirname, 'config.env'));
} catch (e) {
    if (e.code !== 'ENOENT') console.error('[OCFS] parse config.env error:', e);
}
const { processMessage } = require('./codeblock-fs.js');

const NODE_HOME = process.env.OCFS_SYSTEM_HOME || '/home/node';
const AGENTS_DIR = process.env.OPENCLAW_STATE_DIR ? `${process.env.OPENCLAW_STATE_DIR}/agents` : `${NODE_HOME}/.openclaw/agents`;
const activeWatchers = new Map();
const offsets = new Map();
const lineBuffers = new Map(); // 现在存储的是 Buffer
const updateTimers = new Map(); // fs.watch debounce 定时器

/**
 * 动态发现所有 Agent 的 sessions 目录
 */
function findSessionsDirs(startPath) {
    let results = [];
    if (!fs.existsSync(startPath)) return results;
    try {
        const files = fs.readdirSync(startPath);
        for (const file of files) {
            const fullPath = path.join(startPath, file);
            if (fs.statSync(fullPath).isDirectory()) {
                if (file === 'sessions') {
                    const agentId = path.basename(path.dirname(fullPath));
                    results.push({ path: fullPath, agentId });
                } else {
                    results = results.concat(findSessionsDirs(fullPath));
                }
            }
        }
    } catch (e) { }
    return results;
}

function handleUpdate(fullPath, filename, agentId) {
    try {
        if (!fs.existsSync(fullPath)) return;
        const stats = fs.statSync(fullPath);
        const lastOffset = offsets.get(fullPath) || 0;
        console.log('[OCFS] handleUpdate: file=' + filename + ' offset=' + lastOffset + ' size=' + stats.size + ' t=' + Date.now());

        if (stats.size > lastOffset) {
            const fd = fs.openSync(fullPath, 'r');
            const readSize = stats.size - lastOffset;
            const readBuffer = Buffer.alloc(readSize);
            fs.readSync(fd, readBuffer, 0, readSize, lastOffset);
            fs.closeSync(fd);

            // 合并旧缓冲区和新读取的 Buffer
            const existingBuffer = lineBuffers.get(fullPath) || Buffer.alloc(0);
            const combinedBuffer = Buffer.concat([existingBuffer, readBuffer]);

            const sessionKey = filename.replace('.jsonl', '');

            // 严格按字节流查找换行符
            let lastNewlineIndex = -1;
            for (let i = 0; i < combinedBuffer.length; i++) {
                if (combinedBuffer[i] === 10) { // '\n'
                    const lineBuffer = combinedBuffer.slice(lastNewlineIndex + 1, i);
                    const line = lineBuffer.toString('utf8').trim();
                    // 只要包含 ocfs 代码块，即便是增量写入也尝试处理
                    if (line && (line.startsWith('{') || line.includes('```ocfs'))) {
                        try {
                            processMessage(line, sessionKey, agentId);
                        } catch (e) { }
                    }
                    lastNewlineIndex = i;
                }
            }

            // 核心修复：每次读取完必须把 offset 推进到本次读完的位置
            // 因为没有处理完的字节已经存入 lineBuffers，下次不能重复读
            offsets.set(fullPath, lastOffset + readSize);

            // 更新行缓冲区：截取最后一个换行符之后的内容留作下一次拼接
            if (lastNewlineIndex !== -1) {
                const processedBytes = lastNewlineIndex + 1;
                lineBuffers.set(fullPath, combinedBuffer.slice(processedBytes));
            } else {
                // 没有发现换行符，全部留存到缓冲区
                lineBuffers.set(fullPath, combinedBuffer);
            }
        }
    } catch (e) {
        console.error('[OCFS] Update Error:', e);
    }
}

function watchSessionFile(fullPath, filename, agentId, forceFromStart = false) {
    if (activeWatchers.has(fullPath)) return;

    offsets.set(fullPath, forceFromStart ? 0 : (fs.existsSync(fullPath) ? fs.statSync(fullPath).size : 0));
    lineBuffers.set(fullPath, Buffer.alloc(0));

    const watcher = fs.watch(fullPath, (event) => {
        if (event === 'change') {
            // Debounce: fs.watch 在 Linux 上可能对单次写入触发多次 change 事件
            if (updateTimers.has(fullPath)) {
                clearTimeout(updateTimers.get(fullPath));
            }
            updateTimers.set(fullPath, setTimeout(() => {
                updateTimers.delete(fullPath);
                handleUpdate(fullPath, filename, agentId);
            }, 150));
        }
    });

    activeWatchers.set(fullPath, watcher);
    console.log(`[OCFS] Monitoring Session (Native Watch): ${agentId}/${filename}`);

    // 关键修复：启动监听后立即执行一次 handleUpdate，处理已经在文件里的内容
    if (forceFromStart) {
        process.nextTick(() => handleUpdate(fullPath, filename, agentId));
    }
}

function watchDirectory(dirObj) {
    const { path: dirPath, agentId } = dirObj;
    if (activeWatchers.has(dirPath)) return;

    const allowedAgents = process.env.OCFS_ALLOWED_AGENTS ? process.env.OCFS_ALLOWED_AGENTS.split(',') : ['ocfs-specialist'];
    if (!allowedAgents.includes(agentId)) return;

    const pendingNewFiles = new Map(); // filename -> timer (防止 fs.watch 对新文件触发多个事件)

    // 目录监听：捕获所有文件系统的变更
    const watcher = fs.watch(dirPath, (event, filename) => {
        if (filename && filename.endsWith('.jsonl')) {
            const fullPath = path.join(dirPath, filename);
            // 防抖：多次事件只触发一次 watchSessionFile
            if (!activeWatchers.has(fullPath) && !pendingNewFiles.has(filename)) {
                console.log(`[OCFS] New or unmonitored session detected: ${filename}`);
                const timer = setTimeout(() => {
                    pendingNewFiles.delete(filename);
                    if (!activeWatchers.has(fullPath) && fs.existsSync(fullPath)) {
                        watchSessionFile(fullPath, filename, agentId, true);
                    }
                }, 300);
                pendingNewFiles.set(filename, timer);
            }
        }
    });
    activeWatchers.set(dirPath, watcher);

    // 初始化：启动时全量加载现有 session
    fs.readdirSync(dirPath).forEach(f => {
        if (f.endsWith('.jsonl')) watchSessionFile(path.join(dirPath, f), f, agentId);
    });
    console.log(`[OCFS] Active Watcher for directory: ${agentId}`);
}

function init() {
    console.log("[OCFS] Dynamic Agent Discovery Started...");
    const targets = findSessionsDirs(AGENTS_DIR);
    targets.forEach(watchDirectory);

    // 心跳机制：每 30 秒写入时间戳，供 Boot Handler 判断 daemon 是否健康
    const HEARTBEAT_FILE = '/tmp/ocfs-heartbeat';
    const writeHeartbeat = () => {
        try { fs.writeFileSync(HEARTBEAT_FILE, Date.now().toString()); } catch (e) { }
    };
    writeHeartbeat();
    setInterval(writeHeartbeat, 30000);

    // 优雅退出：收到 SIGTERM 时清理 watchers
    process.on('SIGTERM', () => {
        console.log('[OCFS] 收到 SIGTERM，正在清理 watchers...');
        for (const [key, watcher] of activeWatchers) {
            try { watcher.close(); } catch (e) { }
        }
        activeWatchers.clear();
        process.exit(0);
    });
}

init();
