const { exec } = require('child_process');
const util = require('util');
const path = require('path');
const fs = require('fs');
const execAsync = util.promisify(exec);

const NODE_HOME = process.env.OCFS_SYSTEM_HOME || '/home/node';
const HOME_DIR = NODE_HOME;
// Docker 兼容：自动将 openclaw 替换为 node /app/dist/index.js
const OPENCLAW_CMD = fs.existsSync('/app/dist/index.js') ? 'node /app/dist/index.js' : 'openclaw';

// 清理 ANSI 色彩转义码的正则
const ANSI_REGEX = /\x1B\[[0-?]*[ -/]*[@-~]/g;

async function handleExec(sessionKey, command, meta, sendFeedback) {
    if (!command.trim()) {
        sendFeedback(sessionKey, `❌ **OCFS Error**: 没有提供需要执行的命令。`);
        return;
    }

    // 自动替换 openclaw 命令为环境兼容版本
    const resolvedCommand = command.replace(/^openclaw\b/, OPENCLAW_CMD);

    console.log(`[OCFS] Executing command: ${resolvedCommand}`);
    let result = `💻 **OCFS EXEC**:\n\`\`\`bash\n${command}\n\`\`\`\n\n`;

    try {
        // 设置执行超时 60s，强制剥离色彩环境变量，避免输出乱码
        const { stdout, stderr } = await execAsync(resolvedCommand, {
            cwd: HOME_DIR,
            timeout: 60000,
            env: { ...process.env, TERM: 'dumb', FORCE_COLOR: '0', NO_COLOR: '1' }
        });

        // 二次洗净：如果个别程序不尊守环境变量，用正则强制擦除 ANSI 转义码
        const cleanStdout = stdout ? stdout.replace(ANSI_REGEX, '') : '';
        const cleanStderr = stderr ? stderr.replace(ANSI_REGEX, '') : '';

        if (cleanStdout) {
            result += `**Stdout:**\n\`\`\`\n${cleanStdout.substring(0, 4000)}${cleanStdout.length > 4000 ? '\n...(truncated)' : ''}\n\`\`\`\n`;
        }
        if (cleanStderr) {
            result += `**Stderr:**\n\`\`\`\n${cleanStderr.substring(0, 4000)}${cleanStderr.length > 4000 ? '\n...(truncated)' : ''}\n\`\`\`\n`;
        }
        if (!cleanStdout && !cleanStderr) {
            result += `_(Command completed with no output)_\n`;
        }

        sendFeedback(sessionKey, result);
    } catch (e) {
        result += `**Error (Status ${e.code || 'unknown'}):**\n\`\`\`\n${e.message}\n\`\`\`\n`;
        if (e.stdout) {
            result += `**Stdout:**\n\`\`\`\n${e.stdout.replace(ANSI_REGEX, '').substring(0, 2000)}\n\`\`\`\n`;
        }
        if (e.stderr) {
            result += `**Stderr:**\n\`\`\`\n${e.stderr.replace(ANSI_REGEX, '').substring(0, 2000)}\n\`\`\`\n`;
        }
        console.error('[OCFS] Exec Error:', e);
        sendFeedback(sessionKey, result);
    }
}

module.exports = { handleExec };
