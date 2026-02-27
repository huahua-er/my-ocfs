const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const AnonymizeUAPlugin = require('puppeteer-extra-plugin-anonymize-ua');
const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');
const { v4: uuidv4 } = require('uuid');

puppeteer.use(StealthPlugin());
puppeteer.use(AnonymizeUAPlugin());

const NODE_HOME = process.env.OCFS_SYSTEM_HOME || '/home/node';
const SNAPSHOT_DIR = process.env.OCFS_DOCS_DIR ? path.join(process.env.OCFS_DOCS_DIR, 'obsidian/附件') : path.join(NODE_HOME, 'github/text/obsidian', '附件');

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tiff', '.tif'];
const MIME_MAP = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.bmp': 'image/bmp', '.webp': 'image/webp',
    '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.tiff': 'image/tiff', '.tif': 'image/tiff'
};

const AD_SELECTORS = [
    'script', 'style', 'iframe', 'ins', '.ads', '[class*="ads"]',
    '[id*="ads"]', '.advertisement', '[class*="advertisement"]',
    '[id*="advertisement"]', '.banner', '[class*="banner"]', '[id*="banner"]',
    '.popup', '[class*="popup"]', '[id*="popup"]', 'nav', 'aside', 'footer',
    '[aria-hidden="true"]'
];

async function autoScroll(page, mode = 'text') {
    let lastHeight = await page.evaluate('document.body.scrollHeight');
    const maxScrolls = mode === 'snapshot' ? 3 : 5;
    let scrolls = 0;

    while (scrolls < maxScrolls) {
        await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
        await new Promise(resolve => setTimeout(resolve, 1000));

        let newHeight = await page.evaluate('document.body.scrollHeight');
        if (newHeight === lastHeight) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            newHeight = await page.evaluate('document.body.scrollHeight');
            if (newHeight === lastHeight) break;
        }
        lastHeight = newHeight;
        scrolls++;
    }
}

async function handleLocalFile(fileUrl) {
    let localPath;
    try {
        const fileUrlObj = new URL(fileUrl);
        localPath = decodeURIComponent(fileUrlObj.pathname);
        if (/^\/[A-Za-z]:/.test(localPath)) {
            localPath = localPath.substring(1);
        }
    } catch {
        localPath = decodeURIComponent(fileUrl.replace(/^file:\/\/\/?\/?(\w)/, '$1'));
    }

    try {
        await fsPromises.access(localPath);
    } catch {
        throw new Error(`本地文件不存在或无法访问: ${localPath}`);
    }

    const ext = path.extname(localPath).toLowerCase();

    if (IMAGE_EXTENSIONS.includes(ext)) {
        const buffer = await fsPromises.readFile(localPath);
        const mime = MIME_MAP[ext] || 'application/octet-stream';
        const base64 = buffer.toString('base64');
        const fileName = path.basename(localPath);

        return {
            type: 'image',
            content: [
                { type: 'text', text: `已读取本地图片: ${fileName}\n路径: ${localPath}\n类型: ${mime}\n大小: ${(buffer.length / 1024).toFixed(1)} KB` },
                { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } }
            ]
        };
    } else {
        const textContent = await fsPromises.readFile(localPath, 'utf-8');
        const fileName = path.basename(localPath);
        return { type: 'text', text: `文件: ${fileName}\n路径: ${localPath}\n\n${textContent}` };
    }
}

function isImageUrl(url) {
    try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname.toLowerCase();
        return IMAGE_EXTENSIONS.some(ext => pathname.endsWith(ext));
    } catch {
        return false;
    }
}

function parseRawCookies(cookieString, targetUrl) {
    const cookiePairs = cookieString.split(';').map(pair => pair.trim()).filter(pair => pair);
    return cookiePairs.map(pair => {
        const equalIndex = pair.indexOf('=');
        if (equalIndex === -1) return null;
        const name = pair.substring(0, equalIndex).trim();
        const value = pair.substring(equalIndex + 1).trim();
        return {
            name, value,
            domain: `.${targetUrl.hostname}`,
            url: `${targetUrl.protocol}//${targetUrl.hostname}`
        };
    }).filter(cookie => cookie !== null);
}

async function setupCookies(page, url) {
    const urlObj = new URL(url);
    let cookiesToSet = [];

    const fetchCookiesRawMulti = process.env.FETCH_COOKIES_RAW_MULTI;
    if (fetchCookiesRawMulti && fetchCookiesRawMulti.trim()) {
        try {
            const cookiesMap = JSON.parse(fetchCookiesRawMulti);
            for (const [domain, cookieString] of Object.entries(cookiesMap)) {
                if (urlObj.hostname.includes(domain)) {
                    cookiesToSet = parseRawCookies(cookieString, urlObj);
                    break;
                }
            }
        } catch (e) {
            console.error('[OCFS] WebFetch: 解析多站点 Cookies 失败:', e.message);
        }
    }

    if (cookiesToSet.length === 0) {
        const fetchCookiesRaw = process.env.FETCH_COOKIES_RAW;
        if (fetchCookiesRaw && fetchCookiesRaw.trim()) {
            try {
                cookiesToSet = parseRawCookies(fetchCookiesRaw, urlObj);
            } catch (e) {
                console.error('[OCFS] WebFetch: 解析原始 Cookies 失败:', e.message);
            }
        }
    }

    if (cookiesToSet.length === 0) {
        const fetchCookies = process.env.FETCH_COOKIES;
        if (fetchCookies && fetchCookies.trim()) {
            try {
                const cookies = JSON.parse(fetchCookies);
                if (Array.isArray(cookies) && cookies.length > 0) {
                    cookiesToSet = cookies.map(cookie => ({
                        ...cookie,
                        url: cookie.url || `${urlObj.protocol}//${cookie.domain || urlObj.hostname}`
                    }));
                }
            } catch (e) {
                console.error('[OCFS] WebFetch: 解析 JSON Cookies 失败:', e.message);
            }
        }
    }

    if (cookiesToSet.length > 0) {
        try {
            await page.setCookie(...cookiesToSet);
        } catch (e) {
            console.error('[OCFS] WebFetch: 设置 Cookies 失败:', e.message);
        }
    }
}

async function fetchWithPuppeteer(url, mode = 'text', proxyPort = null) {
    let browser;
    try {
        const findChromium = () => {
            if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
            const baseDir = process.env.PLAYWRIGHT_CACHE_DIR || path.join(NODE_HOME, '.cache/ms-playwright');
            try {
                const dirs = fs.readdirSync(baseDir).filter(d => d.startsWith('chromium-')).sort().reverse();
                for (const dir of dirs) {
                    const chromePath = path.join(baseDir, dir, 'chrome-linux64', 'chrome');
                    if (fs.existsSync(chromePath)) return chromePath;
                    const altPath = path.join(baseDir, dir, 'chrome-linux', 'chrome');
                    if (fs.existsSync(altPath)) return altPath;
                }
            } catch { }
            return undefined;
        };

        const launchOptions = {
            headless: true,
            executablePath: findChromium(),
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        };

        if (proxyPort) {
            launchOptions.args.push(`--proxy-server=http://127.0.0.1:${proxyPort}`);
        }

        browser = await puppeteer.launch(launchOptions);
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        await setupCookies(page, url);

        if (mode === 'image') {
            const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
            const buffer = await response.buffer();
            const contentType = response.headers()['content-type'] || 'image/png';
            const mime = contentType.split(';')[0].trim();
            const base64 = buffer.toString('base64');

            return {
                type: 'image',
                content: [
                    { type: 'text', text: `已下载网络图片: ${url}\n类型: ${mime}\n大小: ${(buffer.length / 1024).toFixed(1)} KB` },
                    { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } }
                ]
            };
        }

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        if (mode === 'snapshot') {
            await autoScroll(page, mode);
            const imageBuffer = await page.screenshot({ fullPage: true, type: 'png' });
            const fileName = `${uuidv4()}.png`;

            await fsPromises.mkdir(SNAPSHOT_DIR, { recursive: true });
            const savePath = path.join(SNAPSHOT_DIR, fileName);
            await fsPromises.writeFile(savePath, imageBuffer);

            const pageTitle = await page.title();
            const relativePath = `obsidian/附件/${fileName}`;
            const sizeKB = (imageBuffer.length / 1024).toFixed(1);

            return {
                type: 'text',
                text: `已截取网页快照: ${url}\n- 标题: ${pageTitle}\n- 已保存到: \`${relativePath}\`\n- 大小: ${sizeKB} KB`
            };
        }

        await autoScroll(page, mode);

        const groupedLinks = await page.evaluate(() => {
            const titleElements = Array.from(document.querySelectorAll('span.text-xl.font-bold'));
            const results = [];

            for (const titleEl of titleElements) {
                const category = titleEl.textContent.trim();
                const container = titleEl.closest('div[class*="rounded"]');
                if (!container) continue;

                const anchors = Array.from(container.querySelectorAll('a[href]'));
                const linkData = anchors.map(anchor => ({
                    title: anchor.textContent.trim(),
                    url: anchor.href
                })).filter(link =>
                    link.title &&
                    link.url &&
                    link.url.startsWith('http') &&
                    !link.url.startsWith('javascript:') &&
                    link.title.length > 5
                );

                const uniqueLinks = [];
                const seenUrls = new Set();
                for (const link of linkData) {
                    if (!seenUrls.has(link.url)) {
                        seenUrls.add(link.url);
                        uniqueLinks.push(link);
                    }
                }

                if (uniqueLinks.length > 0) {
                    results.push({ category, links: uniqueLinks });
                }
            }
            return results;
        });

        if (groupedLinks && groupedLinks.length > 0) {
            const pageTitle = await page.title();
            let markdownOutput = `页面标题: ${pageTitle}\n\n`;
            for (const group of groupedLinks) {
                markdownOutput += `## ${group.category}\n`;
                markdownOutput += group.links.map(link => `- [${link.title}](${link.url})`).join('\n');
                markdownOutput += '\n\n';
            }
            return { type: 'text', text: markdownOutput.trim() };
        }

        const pageContent = await page.content();
        const doc = new JSDOM(pageContent, { url });
        const reader = new Readability(doc.window.document);
        const article = reader.parse();

        if (article && article.textContent) {
            return { type: 'text', text: `标题: ${article.title}\n\n${article.textContent.trim()}` };
        } else {
            return { type: 'text', text: '成功获取网页，但无法提取主要内容或链接列表。' };
        }
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

async function handleWebFetch(sessionKey, targetExpr, meta, sendFeedback) {
    try {
        const parts = targetExpr.split('|').map(p => p.trim());
        const url = parts[0];
        let mode = (parts[1] || 'text').toLowerCase();

        if (!url) {
            throw new Error('缺少必需的参数: url');
        }

        if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('file://')) {
            throw new Error('无效的 URL 格式。URL 必须以 http:// 、 https:// 或 file:// 开头。');
        }

        let fetchResult;

        if (url.startsWith('file://')) {
            fetchResult = await handleLocalFile(url);
        } else {
            if (mode === 'text' && isImageUrl(url)) {
                mode = 'image';
            }

            try {
                fetchResult = await fetchWithPuppeteer(url, mode);
            } catch (e) {
                const proxyPort = process.env.FETCH_PROXY_PORT;
                if (proxyPort) {
                    try {
                        fetchResult = await fetchWithPuppeteer(url, mode, proxyPort);
                    } catch (proxyError) {
                        throw new Error(`直接访问和通过代理端口 ${proxyPort} 访问均失败。原始错误: ${e.message}, 代理错误: ${proxyError.message}`);
                    }
                } else {
                    throw e;
                }
            }
        }

        if (fetchResult.type === 'text') {
            let content = fetchResult.text;
            const maxLines = 200;
            const lines = content.split('\n');
            if (lines.length > maxLines) {
                content = lines.slice(0, maxLines).join('\n') + '\n\n... (truncated, total ' + lines.length + ' lines)';
            }
            sendFeedback(sessionKey, `🌐 **OCFS WebFetch**: \`${url}\`\n\n${content}`);
        } else if (fetchResult.type === 'image' && fetchResult.content) {
            const textPart = fetchResult.content.find(c => c.type === 'text');
            const imagePart = fetchResult.content.find(c => c.type === 'image_url');

            if (imagePart) {
                let imageUrl = imagePart.image_url.url;
                let htmlImg = `<img src="${imageUrl}" alt="image" width="500">`;
                sendFeedback(sessionKey, `🌐 **OCFS WebFetch**: \`${url}\`\n\n${textPart ? textPart.text + '\n\n' : ''}${htmlImg}`);
            } else if (textPart) {
                sendFeedback(sessionKey, `🌐 **OCFS WebFetch**: \`${url}\`\n\n${textPart.text}`);
            } else {
                sendFeedback(sessionKey, `🌐 **OCFS WebFetch**: \`${url}\`\n\n${JSON.stringify(fetchResult, null, 2)}`);
            }
        } else {
            sendFeedback(sessionKey, `🌐 **OCFS WebFetch**: \`${url}\`\n\n${JSON.stringify(fetchResult, null, 2)}`);
        }
    } catch (e) {
        sendFeedback(sessionKey, `❌ **OCFS WebFetch Error**: ${e.message}`);
    }
}

module.exports = { handleWebFetch };
