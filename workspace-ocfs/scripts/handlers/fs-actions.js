const fs = require('fs');
const path = require('path');

const NODE_HOME = process.env.OCFS_SYSTEM_HOME || '/home/node';
const BASE_DIR = process.env.OCFS_WORKSPACE_DIR || path.join(NODE_HOME, '.openclaw/workspace-ocfs');

// 清理 ANSI 色彩转义码的正则
const ANSI_REGEX = /\x1B\[[0-?]*[ -/]*[@-~]/g;

function handleList(sessionKey, targetPath, meta, sendFeedback) {
    try {
        const subPath = (targetPath && targetPath !== '.' && targetPath !== './') ? targetPath : '';
        const resolvedPath = path.resolve(BASE_DIR, subPath);

        if (!fs.existsSync(resolvedPath)) {
            return sendFeedback(sessionKey, `❌ **OCFS Error**: 找不到目录 \`${subPath || '.'}\``);
        }

        const stats = fs.statSync(resolvedPath);
        if (!stats.isDirectory()) {
            return sendFeedback(sessionKey, `❌ **OCFS Error**: 目标不是一个目录 \`${subPath}\``);
        }

        const files = fs.readdirSync(resolvedPath);
        let displayPath = subPath || '.';
        let result = `📂 **OCFS 文件列表** (${displayPath})\n\n`;

        if (files.length === 0) {
            return sendFeedback(sessionKey, result + "_该目录下没有文件。_");
        }

        const fileInfos = files.map(f => {
            const itemFullPath = path.join(resolvedPath, f);
            const itemStats = fs.statSync(itemFullPath);
            const isDir = itemStats.isDirectory();

            let info = `- \`${f}${isDir ? '/' : ''}\``;

            if (!isDir) {
                info += ` (${(itemStats.size / 1024).toFixed(1)} KB)`;
                if (f.endsWith('.md')) {
                    try {
                        const content = fs.readFileSync(itemFullPath, 'utf8');
                        const yamlMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
                        if (yamlMatch) {
                            const yamlSnippet = yamlMatch[1].trim().split('\n').slice(0, 3).join(', ');
                            info += ` 🏷️ { ${yamlSnippet}... }`;
                        }
                    } catch (e) { }
                }
            } else {
                info += ` [目录]`;
            }
            return info;
        });

        sendFeedback(sessionKey, result + fileInfos.join('\n'));
    } catch (e) {
        console.error('[OCFS] LS: Error:', e);
        sendFeedback(sessionKey, `❌ **OCFS LS Error**: ${e.message}`);
    }
}

function handleRead(sessionKey, targetExpr, meta, sendFeedback) {
    try {
        let [targetPath, fragment] = targetExpr.split(/[#@]/);
        const fullPath = path.resolve(BASE_DIR, targetPath);
        if (!fs.existsSync(fullPath)) return sendFeedback(sessionKey, `❌ **OCFS Error**: File not found \`${targetPath}\``);
        let content = fs.readFileSync(fullPath, 'utf8').replace(ANSI_REGEX, '');
        let lines = content.split('\n');
        let result = '';
        let title = `📖 **OCFS READ**: \`${targetPath}\``;
        if (targetExpr.includes('@')) {
            const [start, end] = fragment.split('-').map(n => parseInt(n, 10));
            result = lines.slice(start - 1, end).join('\n');
            title += ` (Lines ${start}-${end})`;
        } else if (targetExpr.includes('#')) {
            const headingPattern = new RegExp(`^#+\\s+${fragment}\\s*$`, 'i');
            const startIndex = lines.findIndex(line => headingPattern.test(line));
            if (startIndex === -1) return sendFeedback(sessionKey, `❌ **OCFS Error**: Heading \`${fragment}\` not found`);
            const startLevel = lines[startIndex].match(/^(#+)/)[1].length;
            let endIndex = lines.length;
            for (let i = startIndex + 1; i < lines.length; i++) {
                const match = lines[i].match(/^(#+)/);
                if (match && match[1].length <= startLevel) { endIndex = i; break; }
            }
            result = lines.slice(startIndex, endIndex).join('\n');
            title += ` (Section: ${fragment})`;
        } else { result = content; }
        sendFeedback(sessionKey, `${title}\n\n${result}`);
    } catch (e) { sendFeedback(sessionKey, `❌ **OCFS Error**: ${e.message}`); }
}

function handleOutline(sessionKey, targetPath, meta, sendFeedback) {
    try {
        const fullPath = path.resolve(BASE_DIR, targetPath);
        if (!fs.existsSync(fullPath)) return sendFeedback(sessionKey, `❌ **OCFS Error**: File not found \`${targetPath}\``);
        const outline = fs.readFileSync(fullPath, 'utf8').split('\n').map((line, index) => line.startsWith('#') ? `${index + 1}. ${line}` : null).filter(Boolean);
        sendFeedback(sessionKey, `Outline for \`${targetPath}\`:\n\n` + (outline.join('\n') || "_No headings found._"));
    } catch (e) { sendFeedback(sessionKey, `❌ **OCFS Error**: ${e.message}`); }
}

function handleGrep(sessionKey, targetExpr, meta, sendFeedback) {
    try {
        const [targetPath, pattern] = targetExpr.split('|');
        const fullPath = path.resolve(BASE_DIR, targetPath);
        if (!fs.existsSync(fullPath)) return sendFeedback(sessionKey, `❌ **OCFS Error**: File not found \`${targetPath}\``);
        const content = fs.readFileSync(fullPath, 'utf8').replace(ANSI_REGEX, '');
        const matches = content.split('\n').map((line, index) => new RegExp(pattern, 'i').test(line) ? `${index + 1}: ${line}` : null).filter(Boolean);
        sendFeedback(sessionKey, `🔍 **OCFS GREP**: \`${pattern}\` in \`${targetPath}\`\n\n` + (matches.join('\n') || "_No matches found._"));
    } catch (e) { sendFeedback(sessionKey, `❌ **OCFS Error**: ${e.message}`); }
}

function handleEdit(filePath, editContent) {
    if (!fs.existsSync(filePath)) {
        throw new Error('File not found');
    }
    let fileData = fs.readFileSync(filePath, 'utf8');
    const editRegex = /<<<< SEARCH\n([\s\S]*?)\n====\n([\s\S]*?)\n>>>>/g;
    let modified = false;
    let editMatch;
    while ((editMatch = editRegex.exec(editContent)) !== null) {
        const searchStr = editMatch[1];
        const replaceStr = editMatch[2];
        if (fileData.includes(searchStr)) {
            fileData = fileData.replace(searchStr, replaceStr);
            modified = true;
        } else {
            throw new Error(`找不到匹配的 SEARCH 内容块，请确保你提供的 SEARCH 中包含精确的字符内容及换行符：\n${searchStr.substring(0, 50)}...`);
        }
    }
    if (modified) {
        fs.writeFileSync(filePath, fileData);
    } else {
        throw new Error(`未找到任何有效的 SEARCH 块，格式错误或内容不匹配。`);
    }
}

module.exports = { handleList, handleRead, handleOutline, handleGrep, handleEdit };
