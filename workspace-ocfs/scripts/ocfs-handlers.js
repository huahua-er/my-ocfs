// 优先加载 config.env 配置
const path = require('path');
// 零依赖解析 config.env
try {
    process.loadEnvFile(path.resolve(__dirname, 'config.env'));
} catch (e) {
    if (e.code !== 'ENOENT') console.error('[OCFS] parse config.env error:', e);
}

// 设置全局 pnpm node_modules 路径
if (!process.env.NODE_PATH) {
    process.env.NODE_PATH = process.env.GLOBAL_NODE_PATH || '/home/node/.local/share/pnpm/global/5/node_modules';
    require('module').Module._initPaths();
}


const { handleList, handleRead, handleOutline, handleGrep, handleEdit } = require('./handlers/fs-actions');
const { handleWebFetch } = require('./handlers/webfetch');
const { handleGSearch } = require('./handlers/gsearch');
const { handleVcpPlugin, getVcpPluginNames, loadPlugins: loadVcpPlugins } = require('./handlers/vcp-bridge');
const { handleExec } = require('./handlers/exec');

module.exports = {
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
};
