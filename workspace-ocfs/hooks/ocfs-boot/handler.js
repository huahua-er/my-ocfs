const { spawn, execSync } = require('child_process');
const path = require('path');

const logNative = (msg) => process.stdout.write(`${new Date().toISOString()} [\x1b[36mocfs/boot\x1b[0m] ${msg}\n`);
const errNative = (msg, err) => process.stderr.write(`${new Date().toISOString()} [\x1b[31mocfs/boot\x1b[0m] ${msg} ${err ? err.message || err : ''}\n`);

const handler = async (event) => {
    // 确保仅在网关启动时触发（兼容直接调用时 event 可能为空的情况）
    if (event && (event.type !== 'gateway' || event.action !== 'startup')) {
        return;
    }

    // 适配 OpenClaw 内部 Hook 逻辑：由于运行时的环境路径和文件层级往往是被接管或复制的
    // 所以绝对不能用 __dirname 这种相对路径去猜，老老实实写死绝对路径才是最稳的！
    const daemonPath = '/home/node/.openclaw/workspace-ocfs/scripts/ocfs-daemon.js';

    logNative('正在检查守护进程状态...');

    // 杀死旧的进程，确保守护进程与当前日志终端绑定
    try {
        const pids = execSync('pgrep -f "[o]cfs-daemon.js"').toString().trim().split('\n');
        for (const pid of pids) {
            if (pid) {
                logNative(`发现旧的守护进程 (PID: ${pid})，正在强制结束以接管日志...`);
                execSync(`kill -9 ${pid}`);
            }
        }
    } catch (e) {
        // pgrep 未找到进程时会抛出异常，这是正常的
    }

    logNative(`启动新进程并接入 OpenClaw 控制台...`);

    // 去除 detached 以便生命周期与 OpenClaw 绑定，使用 inherit 将日志直接打入主终端 (OpenClaw 日志系统)
    const subprocess = spawn('node', [daemonPath], {
        stdio: 'inherit'
    });

    subprocess.on('error', (err) => {
        errNative(`守护进程启动异常:`, err);
    });

    subprocess.unref(); // 取消引用，避免阻塞
    logNative(`守护进程已启动并合并日志`);
};

// 确保同时兼容直接引用和 OpenClaw 的默认导出 (fallback)
module.exports = handler;
module.exports.default = handler;
