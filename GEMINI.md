# GEMINI.md - AI 助手项目理解指南

这份文档是我（AI 助手）对 `my-ocfs` 项目的深度理解总结。在后续的开发、调试和重构过程中，我将以此作为核心上下文依据。

## 1. 项目概述 (Project Overview)

**my-ocfs** 是一个基于 [OpenClaw](https://github.com/openclaw/openclaw) 网关构建的代理操作系统 (openclaw File System)。
它的核心理念是为 AI 代理（代号“小C”）提供一套**无需依赖原生 API 工具调用（Tool Calls）的通用操作系统底座**。在这个环境中，通过纯文本输出被标记为 ` ```ocfs ` 的专属代码块是其进行一切系统交互（如文件操作、网页抓取、网络搜索及调用 OpenClaw 原生 CLI命令）的**默认及核心方式**。即使遇到不支持原生 Tool 的模型，也能拥有满级能力。

主要运行环境假定在 `/home/node` 下，文件操作的默认工作目录为 `/home/node/.openclaw/workspace-ocfs` (已对齐 OpenClaw 的默认 Workspace)，不再受硬性沙箱限制。通过支持**“原生 Tool Calls”与“OCFS 代码块”双轨制并行**，代理拥有了极高的容错率和操作上限。

### 关键附加目录辅助说明
- **`docs/`**：这是 OpenClaw 的官方说明文档。在后续的开发中遇到网关原生配置或运行机制问题时，应重点从这里查询参考。
- **`workspace-ocfs/hooks/`**：包含 OCFS 针对 OpenClaw 的挂载拦截文件。它的作用是将咱们的系统钩入并挂载到 OpenClaw 全局的声明周期中（比如自启动执行钩子）。

## 2. 核心架构与工作流 (Architecture & Workflow)

整个系统由基于 Node.js 的守护进程、指令解析器和一系列特定动作的处理器组成。工作流基于**文件变动监听（File Watching）**和**异步反馈（Asynchronous Feedback）**。

### 监控与解析层
1. **守护进程 (`workspace-ocfs/scripts/ocfs-daemon.js`)**: 
   - 动态扫描 `/home/node/.openclaw/agents/` 查找所有代理的 `sessions` 目录（当前主要监听 `ocfs-specialist`）。
   - 使用 `fs.watch` 实时监听这些会话 JSONL 文件的写入。
   - 包含流式读取和 Buffer 拼接逻辑，并内置 150ms 级别防抖和处理过内容的偏移量（Offset）记录。
   - 定期向 `/tmp/ocfs-heartbeat` 写入心跳。
2. **指令提取与防抖 (`workspace-ocfs/scripts/codeblock-fs.js`)**:
   - 当检测到消息中包含 ` ```ocfs ` 代码块时，会提取完整的执行块。
   - 实现多层去重策略：消息 ID 校验、内容哈希去重（30s 窗口）、流式防抖（默认等待 1.5s 后执行，以保证代理已结束该命令块输出）。
   - 负责调用子模块执行相应操作，并通过 OpenClaw CLI 将执行结果注入回会话当中（作为 `[OCFS-SYSTEM-NOTIFICATION]` 提示反馈给 Agent）。

### 执行处理器层 (`workspace-ocfs/scripts/handlers/`)
所有的实际功能都被拆分并在此处实现：
- **`fs-actions.js`**: 包含 `ls`, `read`, `write`, `append`, `edit`, `outline`, `grep`、`find` 等本地文件 CRUD 和查询操作（默认相对于 Workspace 工作目录解析，无沙盒硬拦截）。
- **`webfetch.js`**: 获取网页内容，支持正文提取、全页浏览器截图（保存到 `obsidian/附件` 下）及图片直接下载。
- **`gsearch.js`**: 接入 AI 大模型提供的异步网络高级联网搜索功能。
- **`vcp-bridge.js`**: 动态 VCP 插件模块，从特定目录（如 `config.env` 中的 `VCP_PLUGINS_DIR`）中热加载外部能力。
- **`exec.js`**: 系统命令执行器，以 `/home/node` 为工作目录，可执行任意系统命令和 OpenClaw CLI（如 `openclaw message`、`openclaw sessions` 等）。

### 运行时引导与集成
- **引导钩子 (`workspace-ocfs/hooks/ocfs-boot/handler.js`)**: 在 OpenClaw 触发 `gateway:startup` 时，确保杀掉旧的 Daemon 守护进程，并通过 `spawn('node')` 原生接管系统的日志流向 (`stdio: 'inherit'`)，保障服务的长久常驻与无缝聚合。
- **环境变量配置 (`workspace-ocfs/scripts/config.env`)**: 为整个服务提供比如代理网络、抓取用的 Cookie 配置、搜索使用的 API 密钥、以及通知系统的白名单等环境变量。

## 3. 代理（Agent）人格与协议定义

位于 `workspace-ocfs/` 目录下的 Markdown 文件充当了智能体的“灵魂”、约束和协议使用手册。
- **身份认同 (`IDENTITY.md` & `SOUL.md`)**: "小C"，温柔、干练、精简、极度效率化。全能 OCFS 操作员，不限于文件管理。
- **核心规约 (`AGENTS.md`)**:
  - “零废话原则”，直接用带 `ocfs` 标签的代码块执行任务。
  - 可通过 `exec:openclaw <command>` 调用 OpenClaw 原生 CLI 的全部能力（message、sessions、status 等）。
  - 需要在接到 `[OCFS-SYSTEM-NOTIFICATION]` 确认的系统反馈后验证结果，不能在此之前宣称完成并且结束会话。
- **操作指令 (`TOOLS.md`)**: 给模型阅读的详细语法手册，涵盖文件操作、联网工具和 OpenClaw CLI 完整命令树。
- **记忆机制 (`MEMORY.md`)**: 提供一个长期记忆持久化的规范，通过归档“零散记忆”进行存储参考。

## 4. 安全与边界防范 (Security Model)

- **默认工作目录**: 文件操作默认相对于 `/home/node/.openclaw/workspace-ocfs` 解析路径，全面解除硬性沙箱拦截。非白名单的跨目录操作会在日志中记录，但不阻断。
- **exec 开放性**: `exec` 命令以 `/home/node` 为工作目录，可执行任意系统命令和 OpenClaw CLI，拥有完整的系统级操作能力。
- **防覆写**: `write` 等原生编辑能力带有自我保护，修改老文件时将自动生成带时间戳的备份文件避免数据丢失错乱。
- **消息限流去重**: 利用指纹与事件锁防止因为 Agent 多次重试或者系统 Event 故障带来的指令重播风暴。
- **OCFS 为核心主导的双轨制**: 本项目并不是为了屏蔽原生 Tool Call，而是为特制环境提供稳健的基石。对于支持 Tool Call 且能够成功使用的模型，系统不强加阻碍，顺其自然即可；但对于模型自身而言，其认知里的最佳标准和遇到阻碍时的本能反应，应当始终是依赖于 `workspace-ocfs/TOOLS.md` 中定义的 `ocfs` 代码块。这给所有模型赋予了无视平台限制的一揽子统一工具链。

## 5. 开发建议与排障指南 (Development Guide)

如果未来需要协助进行开发、功能叠加和排查 Bug，我需时刻牢记以下几点：
1. **流式分块中断与断包**:
   在实现任何新的执行逻辑时依然要注意，`JSONL` 的文件变更是字节流与行拼接的。任何逻辑都不能假定 `fs.watch` 触发时文件就已经被完整写入。处理一定要对行结束符 `\n` 进行安全边界检测。
2. **多重事件重置触发**:
   Linux `/ Windows` 下 `fs.watch` 原生事件会多次发送。当前的定时防抖 `Timer` 和游标指针 (`offsets` Buffer) 以及延时防抖 `Pending Execution` 都是为了规避这个问题而特意拉扯和保留的平衡。排查 bug 时要通过 Debug 输出验证这两者的配合是否失效。
3. **支持新的 OCFS Action 命令**:
   涉及核心代码点修改：
   - 处理器新增：`workspace-ocfs/scripts/handlers/[feature].js` (如存在)
   - 挂载抛出：`workspace-ocfs/scripts/ocfs-handlers.js`
   - 入网检测点解析与分发：`workspace-ocfs/scripts/codeblock-fs.js`
   - Agent 上下文告知：修改 `workspace-ocfs/TOOLS.md`，更新让 AI 知道该如何使用新口令。

---
📝 *该文档由 AI 助手创建用于维持本地工作区认知。今后若核心结构变动，也应实时更进此份资料，保持同步上下文刷新。*
