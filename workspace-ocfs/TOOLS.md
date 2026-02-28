# TOOLS.md - OCFS 命令系统

> **说明**：这里是属于你的 OCFS 专属操作区，标准的系统调用方式是使用 `ocfs` 代码块。如果你偶尔使用了系统原生 Tool 并且成功了那也没问题，系统不会限制你；但请记住，下面记载的 `动作:参数` 这个 OCFS 命令词汇表才是你在这个工作区内**默认和最核心的本能技能树**。

## 完整工具列表 [[[使用前 认真 完整 阅读 ## 核心定位]]]

### 文件系统（OCFS 直接实现）

| 工具名 | 说明 | 示例 |
|--------|------|------|
| `ls` | 列出目录 | `ls:.` `ls:./subdir` |
| `read` | 读取文件 | `read:file.md` `read:file.md@10-20` `read:file.md#标题` |
| `write` | 创建文件（自动备份） | `write:file.md` 后跟内容 |
| `append` | 追加到文件末尾 | `append:file.md` 后跟内容 |
| `edit` | 搜索替换 | `edit:file.md` 后跟 SEARCH/REPLACE |
| `grep` | 正则搜索 | `grep:file.log\|ERROR` |
| `find` | glob 查找文件 | `find:*.md` |
| `outline` | Markdown 标题提取 | `outline:manual.md` |

### OpenClaw 原生工具（CLI 桥接）

你现在拥有对 OpenClaw 原生 CLI 工具树的 **全量完整访问权限**。你的调用口令直接对应 CLI 的一级子命令。
所有命令用法均为 `命令名:参数选项`。例如：`status:--deep`，相当于在终端执行 `openclaw status --deep`。

#### 1. Agent 与对话管理 (高频使用)
| 工具名 | 说明 | 示例 |
|--------|------|------|
| `agent` | 执行单轮 AI Agent 对话，或测试指定 Agent | `agent:--message "hello"` |
| `agents` | 管理隔离的 Agents（工作区、认证、路由等） | `agents:list` |
| `sessions` | 管理与查询存储的会话日志 | `sessions:--all-agents` |
| `status` | 查询各渠道连通性及最近操作状态 | `status:--deep` |
| `memory` | 搜索、审查、重建长期记忆索引 | `memory:search "偏好"` |
| `cron` | 计划任务调度管理 | `cron:list` 或 `cron:add ...` |
| `browser` | 操控系统浏览器管理与状态 | `browser:status` 或 `browser:open URL` |

#### 2. 通道与外联通信
| 工具名 | 说明 | 示例 |
|--------|------|------|
| `message` | 发送、读取、管理多渠道消息 | `message:send --channel telegram --target ID ...` |
| `channels`| 审查连接的聊天通道（Telegram, Discord等）| `channels:list` |
| `directory`| 查找支持频道的联系人、群组ID信息 | `directory:search ...` |
| `webhooks`| Webhook 辅助集成配置与调试 | `webhooks:status` |
| `pairing` | 审批 DM 频道传入的安全配对请求 | `pairing:list` |

#### 3. 插件、模型与扩展
| 工具名 | 说明 | 示例 |
|--------|------|------|
| `models` | 发现、扫描和配置可用大模型 | `models:list` |
| `plugins` | 检查或安装 OpenClaw 插件及扩展 | `plugins:list` |
| `skills` | 列出或检查可用的技能树 (Skills) | `skills:list` |
| `acp` | Agent Control Protocol (ACP) 相关测试工具 | `acp:list` |
| `hooks` | 管理内部 Agent 生命周期的回调钩子 | `hooks:list` |

#### 4. 分布式网关与系统运维 (多用于查错或深层管理)
| 工具名 | 说明 |
|--------|------|
| `docs` | 搜索查询 OpenClaw 原生开发文档 (`docs:--query "architecture"`) |
| `logs` | 通过 RPC 请求并实时截取网关底层的日志输出 |
| `health` | 获取网关的实时运行健康检测信息 |
| `system` | 审查系统事件、心跳以及在线状态 |
| `nodes` | 网关管理的工作节点连通测试与下发管理 |
| `sandbox`| Agent 环境代码安全沙盒 (Docker等) 调度控制 |
| `security`| 审计安全与本地配置文件 |
| `secrets` | 在运行时重载环境变量密码挂载点 |
| `approvals`| 审批网关拦下的高危 Exec 命令请求 |
| `update` | 检查 OpenClaw CLI 和 网关本体的安装更新 |

> *备注其它内部与人工交互维护指令也均已可用，但极少由你在自动化中主动调用：`setup`, `onboard`, `configure`, `config`, `doctor`, `dashboard`, `reset`, `uninstall`, `gateway`, `daemon`, `devices`, `node`, `tui`, `dns`, `qr`, `clawbot`, `completion`*
> *由于以上全部命令均已打通，你可以抛弃先前的 `sessions_list`、`sessions_history`、`session_status`、`memory_search` 等旧别名，直接使用对应的核心指令 `sessions:`、`status:`、`memory:`，系统会自动为你流转。*

> **关于特制的高级生命周期指令：**
> | `sessions_spawn` | OCFS/OpenClaw 原生子任务委派。非当前原生进程执行，它通过 API 派发，具备跨Agent异步等待和状态隔离！ | `sessions_spawn:--agent {agentId} --message "..."` |
> | `subagents` | API 端点调用 （支持管理自己 Spawn 出的子代） | `subagents:status` 或 `subagents:abort <id>` |
> | `exec` | 直接执行在主节点底层的任何 bash/系统 命令 | `exec:npm run build` |

### OCFS 联网与原生网络检索工具

| 工具名 | 说明 | 示例 |
|--------|------|------|
| `web_search` | OpenClaw 原生 API 网络搜索 (Brave/Perplexity) | `web_search:关键词` |
| `web_fetch` | OpenClaw 原生 API 网页内容抓取 | `web_fetch:https://example.com` |
| `ocfs_search` | OCFS 独有：AI 多关键词并发深度调研 | `ocfs_search:主题\|关键词1,关键词2\|true` |
| `ocfs_fetch` | OCFS 独有Puppeteer爬虫。参数：`URL\|模式`<br>支持模式：<br>- `text` (默认)：提取纯净正文与多级链接<br>- `snapshot`：全页智能滚屏截图并存入 obsidian/附件<br>- `image`：直接下载远程/本地图片文件<br>自带 Stealth 隐身、自动解决 Cloudflare 盾，并支持在 config.env 传 `FETCH_COOKIES` 或代理。 | `ocfs_fetch:https://example.com\|snapshot` <br> `ocfs_fetch:URL\|text`<br> `ocfs_fetch:file:///C:/...\|image` |

### VCP 插件
动态注册，`ls:./plugins` 查看，`read:./plugins/{Command}.md` 查看用法。

> 文件操作路径相对于工作目录 `$OPENCLAW_HOME/.openclaw/workspace-ocfs` 解析（与 OpenClaw 一致）。

---

### 用法详解

#### 文件操作
```ocfs
ls:.
read:project.md#Roadmap
find:*.md
outline:manual.md
grep:data.log|ERROR_CODE_500
```ocfs

```ocfs
write:notes/todo.md
今日任务清单。
```ocfs

```ocfs
edit:config.js
<<<< SEARCH
const version = "1.0.0";
====
const version = "2.0.0";
>>>>
```ocfs

#### OpenClaw CLI 桥接（直接用工具名调用）
```ocfs
message:send --channel telegram --target "123456789" --message "任务完成。"
```ocfs

```ocfs
sessions:--all-agents --json
```ocfs

```ocfs
status:--deep
```ocfs

```ocfs
browser:status
```ocfs

```ocfs
cron:list
```ocfs

```ocfs
memory:search "花儿的偏好"
```ocfs

也可以通过 exec 调用任意命令：
```ocfs
exec:openclaw message send --channel telegram --target "123456789" --message "也可以这样发"
```ocfs

#### OCFS 独有工具
```ocfs
ocfs_fetch:https://example.com|text
```ocfs

```ocfs
ocfs_search:2026 AI趋势|AI, 2026, 行业|true
```ocfs

---

### 零散记忆录入规范
#### 准入三原则
- **跨时效性**：6 个月后是否仍有参考价值？
- **逻辑密度**：是否包含因果推导或模式识别？
- **主人关联度**：是否影响主人的决策、心情或环境？

#### 内容五结构
- **核心概念**：一句话定性。
- **关键逻辑**：演化链条（A → B → C）。
- **主人滤镜**：对主人的具体意义。
- **反思与洞察**：真实性评估或风险提示。
- **关联节点**：与旧记忆的逻辑串联。

#### 头部 YAML 规范
- 必须含 `Tag:` 开头
- 禁用泛化词（新闻、今天等）
- 必须包含：`逻辑沉淀`、`决策参考`、`趋势跟踪` 或具体领域标签