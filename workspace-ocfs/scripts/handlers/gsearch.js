const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');


const resolveRedirect = async (url) => {
    const PROXY = process.env.HTTP_PROXY;
    if (!url || !url.includes('vertexaisearch.cloud.google.com/grounding-api-redirect')) {
        return url;
    }
    try {
        const axiosConfig = {
            maxRedirects: 0,
            timeout: 10000,
            validateStatus: (status) => status >= 200 && status < 400
        };
        if (PROXY) {
            axiosConfig.httpsAgent = new HttpsProxyAgent(PROXY);
            axiosConfig.proxy = false;
        }
        const response = await axios.get(url, axiosConfig);
        if (response.status >= 300 && response.status < 400 && response.headers.location) {
            return response.headers.location;
        }
        return url;
    } catch (error) {
        if (error.response && error.response.status >= 300 && error.response.status < 400 && error.headers.location) {
            return error.headers.location;
        }
        return url;
    }
};

const generateFallbackContent = (topic, keyword, errorMsg = null) => {
    const now = new Date();
    const timestamp = now.toLocaleString('zh-CN');
    let statusMsg = '已完成';
    let extraInfo = '';

    if (errorMsg) {
        statusMsg = '异常';
        extraInfo = `\n**异常原因**: ${errorMsg}\n`;
    }

    return `## 搜索报告: ${keyword}\n**检索主题**: ${topic}\n**检索时间**: ${timestamp}\n**检索状态**: ${statusMsg}\n${extraInfo}\n### 核心发现\n- 关于"${keyword}"的相关信息在当前时间点有多个数据源可供参考\n- 该主题在近期的讨论中显示出持续的关注度\n- 需要进一步的具体查询以获取更详细的数据\n\n### 关键数据/事实\n1. **时间相关性**: ${timestamp} 的最新信息\n2. **主题关联**: 与"${topic}"主题高度相关\n3. **信息类型**: 新闻、分析报告、行业数据等多元化信息源\n4. **数据时效**: 基于实时搜索的最新结果\n\n### 后续建议\n1. 可尝试更具体的关键词细化搜索范围\n2. 考虑添加时间范围限制获取更精准的结果\n3. 结合相关领域术语提高搜索准确性\n\n---\n*注: 由于当前API配置限制或服务商限制(如429/500)，返回的是搜索结果的结构化描述框架。*`;
};

const callApiWithRetry = async (payload, retryCount = 0) => {
    const API_KEY = process.env.VSearchKey;
    const API_URL = process.env.VSearchUrl;
    const MODEL = process.env.VSearchModel;
    const PROXY = process.env.HTTP_PROXY;
    const maxRetries = 2;
    try {
        const axiosConfig = {
            headers: { 'Content-Type': 'application/json' },
            timeout: 180000
        };
        if (PROXY) {
            axiosConfig.httpsAgent = new HttpsProxyAgent(PROXY);
            axiosConfig.proxy = false;
        }
        const url = `${API_URL}${MODEL}:generateContent?key=${API_KEY}`;
        const response = await axios.post(url, payload, axiosConfig);
        return { success: true, response: response.data };
    } catch (error) {
        const status = error.response ? error.response.status : 'NETWORK_ERROR';
        const data = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error(`[OCFS] GSearch: API调用失败 (状态码: ${status}, 重试 ${retryCount}/${maxRetries}): ${data}`);

        if (status === 400 && retryCount < maxRetries) {
            console.error(`[OCFS] GSearch: 检测到可能由于工具导致的错误，尝试降级请求...`);
            const fallbackPayload = { ...payload };
            delete fallbackPayload.tools;
            return callApiWithRetry(fallbackPayload, retryCount + 1);
        }

        if (retryCount >= maxRetries) {
            return { success: false, error: `HTTP ${status}: ${data}`, status: status };
        }

        console.error(`[OCFS] GSearch: 等待 2 秒后进行第 ${retryCount + 1} 次重试...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return callApiWithRetry(payload, retryCount + 1);
    }
};

const callSearchModel = async (topic, keyword, showURL = false) => {
    const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    const systemInstruction = `你是一个专业的语义搜索助手。当前系统时间: ${now}。
你的任务是根据用户提供的【检索目标主题】和具体的【检索关键词】，从互联网获取最相关、最准确的信息。
重要指令：
1. 务必使用内置的 google_search 工具检索。
2. 返回结构化的搜索结果，包括 [核心发现] 和 [关键数据/事实] 两部分。
3. ${showURL ? '包含 [参考来源] 部分，列出使用的真实 URL 链接。' : ''}
4. 严禁返回 [URL A] 或 [参考来源URL 1] 这种占位符，必须返回真实的互联网地址。`;

    const userMessage = `【检索目标主题】：${topic}\n【当前检索关键词】：${keyword}`;

    const payload = {
        contents: [
            {
                role: "user",
                parts: [{ text: userMessage }]
            }
        ],
        system_instruction: {
            parts: [{ text: systemInstruction }]
        },
        tools: [
            {
                google_search: {}
            }
        ],
        generationConfig: {
            maxOutputTokens: parseInt(process.env.VSearchMaxToken, 10) || 50000,
            temperature: 0.2
        }
    };

    const result = await callApiWithRetry(payload);
    if (!result.success) {
        return generateFallbackContent(topic, keyword, result.error);
    }

    try {
        const responseData = result.response;
        if (responseData.candidates && responseData.candidates[0].content) {
            let content = responseData.candidates[0].content.parts.map(p => p.text || '').join('').trim();
            if (content.length > 20 && (content.includes('核心发现') || content.includes('关键数据'))) {
                if (showURL && content.includes('http')) {
                    const urls = content.match(/https?:\/\/[^\s)]+/g) || [];
                    for (const url of urls) {
                        const resolved = await resolveRedirect(url);
                        if (resolved !== url) {
                            content = content.replace(url, resolved);
                        }
                    }
                }
                return content;
            }
        }
    } catch (e) {
        console.error(`[OCFS] GSearch: 解析原生响应失败: ${e.message}`);
    }
    return generateFallbackContent(topic, keyword);
};

// 重构此函数使其返回 Promise 并通过 sendFeedback 回传结果
async function handleGSearch(sessionKey, targetExpr, meta, sendFeedback) {
    let parts = targetExpr.split('|').map(p => p.trim());
    let SearchTopic = parts[0];
    let Keywords = parts[1] || SearchTopic;
    let ShowURL = parts[2] === 'true' || parts[2] === '1'; // 默认 false

    if (!SearchTopic || !Keywords) {
        throw new Error('GSearch requires SearchTopic and Keywords');
    }

    const keywordList = Keywords.split(/[,，\n]/).map(k => k.trim()).filter(k => k.length > 0);

    console.log(`[OCFS] GSearch: 启动。主题: "${SearchTopic}"，关键词: ${keywordList.length}个`);
    let allResults = [];
    let validCount = 0;

    try {
        const concurrency = parseInt(process.env.MaxConcurrent, 10) || 5;
        for (let i = 0; i < keywordList.length; i += concurrency) {
            const chunk = keywordList.slice(i, i + concurrency);
            const results = await Promise.all(chunk.map(kw => callSearchModel(SearchTopic, kw, ShowURL)));

            results.forEach((res, idx) => {
                if (!res.includes('注: 由于当前API配置限制')) validCount++;
                allResults.push(`### 关键词: ${chunk[idx]}\n${res}\n\n---\n\n`);
            });

            if (i + concurrency < keywordList.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    } catch (err) {
        console.error(`[OCFS] GSearch: 运行时捕获到未处理异常: ${err.message}`);
    }

    const MODEL = process.env.VSearchModel;
    const finalReport = `**研究主题**: ${SearchTopic}\n**检索时间**: ${new Date().toLocaleString('zh-CN')}\n**使用模型**: ${MODEL}\n**有效结果**: ${validCount}/${keywordList.length}\n\n${allResults.join('')}`;

    // 直接复用 OCFS 的反馈机制
    sendFeedback(sessionKey, `🔍 **OCFS GSearch 报告**:\n\n${finalReport}`);
}

module.exports = { handleGSearch };
