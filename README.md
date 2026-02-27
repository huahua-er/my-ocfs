# 🦞 my-ocfs (OpenClaw File System)

> **🙏 致敬声明 (Attribution / Credits)**
> 
> 本项目的大部分核心代码、文件结构设计以及实现逻辑完全灵感来源于并**抄袭/复刻自**开源项目 [VCPToolBox (by lioensky)](https://github.com/lioensky/VCPToolBox)。插件系统更是直接兼容的该项目。
> 特此向原作者 [lioensky](https://github.com/lioensky) 及原项目表示最诚挚的感谢和致敬！
> 其实你如果不是非要体验openclaw，原项目VCPToolBox已经非常成熟且功能强大，你可以直接使用。（但是学习成本我觉得，可能比openclaw还高，因为配置逻辑比较散落）

**my-ocfs** 是一个基于 [OpenClaw](https://github.com/openclaw/openclaw) 网关构建的文本代理操作系统。

它的核心理念是通过**纯文本代码块（```ocfs）解析与异步守护进程**，为无法稳定使用原生 API 工具调用（Tool Calls）的 AI 模型，提供一套健壮、全功能、解除硬沙箱限制的通用系统底座。



## ✨ 核心特性

- **文本驱动运行**：支持通过文本中的 ` ```ocfs ` 代码块直接对系统发号施令，赋予基础模型满级能力。
- **环境抗性与稳定性**：
  - 内置基于 Puppeteer 的 `ocfs_fetch`，自带 Stealth 防护、绕过反爬、支持本地 Cookie 注入，支持智能滚屏和多级链接解析。
  - 接通 Gateway `/tools/invoke` 底层 API，完美桥接 Brave / Perplexity 的原生 `web_search` 搜索引擎。
- **无沙箱界限操作**：文件系统默认映射至 `/home/node/.openclaw/workspace-ocfs` 并打破严格的沙盒限制（默认 `/home/node` 环境）。允许直接调用 `exec` 执行底层 Linux / Windows 命令。
- **防抖防错流式处理**：底层实现了 150ms 的防抖和流式指纹去重（Debounce & Deduplication），防止 AI 重试导致的指令重播风暴。文件覆盖编辑自带 `backup` 保底保护。
- **动态 VCP 热插拔**：支持外部能力的运行时热加载。

## 📁 核心架构

- `hooks/ocfs-boot/handler.js`：跟随 OpenClaw 生命周期的自启挂载钩子，负责接管日志流和清场旧进程。
- `scripts/ocfs-daemon.js`：守护进程，实时监听 agents 会话下的 `sessions` 日志文件变动，捕捉 OCFS 指令。
- `scripts/codeblock-fs.js`：司令部解析器。负责切分命令、调用处理器并利用 OpenClaw Native CLI 注入 `[OCFS-SYSTEM-NOTIFICATION]` 异步反馈信号到 AI 会话。
- `scripts/handlers/`：各类动作的具体实现（文件 CRUD、网关接口代理、本地爬虫）。
- `plugins/`：VCP扩展插件样例目录，项目放了一个插件，其余可以直接从VCP项目复制。
- `skills/`： 有一个skill，帮助从vcp插件直接生成供ocfs使用的插件文档说明。以便agent按需加载vcp插件的使用说明。

## 🚀 快速起步

插件强耦合于 OpenClaw，因此在使用前，你需要有一个已经部署好的 OpenClaw 环境。

1. **部署目录**
   将本仓库的文件 `workspace-ocfs`复制到你的 OpenClaw 会话工作区中心目录下，一般为 `~/.openclaw/workspace-ocfs/`。
   让你现有agent帮你添加一个agent，并做好其他 multi-agent 的配置。workspace-ocfs的命名已经在代码写死，为避免冲突也只监听 agents/ocfs-specialist 目录下的会话。

```
{
   "agents": {
      "list": [
         {
            "id": "ocfs-specialist",
            "name": "OCFS 专员",
            "workspace": "/home/node/.openclaw/workspace-ocfs",
            "agentDir": "/home/node/.openclaw/agents/ocfs-specialist",
            "model": {
               "primary": "deepseek-chat",
               "fallbacks": [
                  "doubao"
               ]
            },
            "skills": [],
            "tools": {
               "profile": "minimal"
            }
         }
      ]
   }
}
```
   
2. **环境变量配置**
   在 `scripts/config.env` 中配置你的参数：
   
3. **配置并开启 Hooks**
   为了让后台 Daemon 能够随网关自动启动，你需要让 OpenClaw 能够发现并启用位于 `workspace-ocfs/hooks` 下的钩子。
   
   **方式 A（推荐）：通过 CLI 直接启用**
   如果你的 ` workspace ` 配置正确，可以直接使用命令启用：
   ```bash
   openclaw hooks list
   openclaw hooks enable ocfs-boot
   ```

   **方式 B：通过全局 `openclaw.json` 配置**
   如果 Hooks 没有被自动发现，可以在 `~/.openclaw/openclaw.json` 中配置额外加载路径并启用它：
   ```json
   {
     "hooks": {
       "internal": {
         "enabled": true,
         "load": {
           "extraDirs": [
             "/home/node/.openclaw/workspace-ocfs/hooks"
           ]
         },
         "entries": {
           "ocfs-boot": {
             "enabled": true
           }
         }
       }
     }
   }
   ```

4. **重启你的 OpenClaw Gateway**
   随着网关的启动发出的 `gateway:startup` 钩子，`ocfs-boot` 中的 Handler 会自动激活后台 Daemon 进程，并在控制台打出带有 `[ocfs/boot]` 颜色的日志，表示底座就绪。

## 🤖 智能体（Agent）认知注入

在 `/workspace-ocfs/` 目录下，包含了一系列喂给 AI 的提示词和文档，用来塑造 AI 的人格，其实主要是TOOLS,AGENTS是在原官方文档前面添加了一段提醒的文档，中文部分是添加内容，根据需要决定是否保留。
- `AGENTS.md`：核心工作流指导规范。
- `TOOLS.md`：语法手册。让 AI 知道有哪些 `ocfs` 开头的原生动作和快捷命令（例如 `ocfs_fetch`, `web_search`, `subagents` 等）可以使用。

> **给 AI 的特别说明**：遇到任何阻碍，本能反应应当是查阅 `TOOLS.md` 并使用 `ocfs` 代码块脱困。

## 🛠 扩展 OCFS 插件

如需新增 vcp 插件：
1. 在 `plugins/` 目录下放置插件文件。可以直接从vcp项目复制，自己创建则查阅vcp项目文档。
2. 使用skill为插件生成使用文档，并放在plugins目录下。
3. TOOLS.md 中写明新增插件的用法，让你的 AI 需要时去读取插件名命名的文档。

## 🛡️ 安全提示

本插件挂载于openclaw网关，请按openclaw建议管理好安全设置。

---
📝 *Powered by OCFS. 为下一代 Agent 全自动化构建。*
