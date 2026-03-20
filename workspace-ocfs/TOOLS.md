# TOOLS.md - OCFS 命令系统

> **说明**：这里是属于你的 OCFS 专属操作区，标准的系统调用方式是使用 `ocfs` 代码块。如果你偶尔使用了系统原生 Tool 并且成功了那也没问题，系统不会限制你；但请记住，下面记载的 `动作:参数` 这个 OCFS 命令词汇表才是你在这个工作区内**默认和最核心的本能技能树**。

## 完整工具列表 [[[使用前 认真 完整 阅读 ## 核心定位]]]

### OpenClaw 核心工具（与 tool-catalog 对齐）

以下工具与 OpenClaw 原生工具目录完全对齐，通过 OCFS 代码块或 Gateway API 调用。

#### Files（文件系统）
| 工具名 | 说明 | 示例 |
|--------|------|------|
| `read` | 读取文件 | `read:file.md` `read:file.md@10-20` `read:file.md#标题` |
| `write` | 创建/覆写文件（自动备份） | `write:file.md` 后跟内容 |
| `edit` | 搜索替换精确编辑 | `edit:file.md` 后跟 SEARCH/REPLACE |
| `apply_patch` | OpenAI 格式补丁（Native API） | `apply_patch:file.md` 后跟 patch 内容 |

#### Runtime（运行时）
| 工具名 | 说明 | 示例 |
|--------|------|------|
| `exec` | 执行任意系统命令 | `exec:npm run build` |
| `process` | 管理后台进程（Native API） | `process:list` `process:poll <sessionId>` `process:kill <sessionId>` |

#### Web（联网）
| 工具名 | 说明 | 示例 |
|--------|------|------|
| `web_search` | OpenClaw 原生 API 网络搜索 | `web_search:关键词` |

#### Memory（记忆）
| 工具名 | 说明 | 示例 |
|--------|------|------|
| `memory_search` | 语义搜索记忆 | `memory_search:偏好` |
| `memory_get` | 读取记忆文件（Native API） | `memory_get:MEMORY.md` |

#### Sessions（会话管理）
| 工具名 | 说明 | 示例 |
|--------|------|------|
| `sessions_list` | 列出会话 | `sessions_list:--all-agents` |
| `sessions_history` | 会话历史 | `sessions_history:<session-id>` |
| `sessions_send` | 发送到会话 | `sessions_send:--message "hello"` |
| `sessions_spawn` | 派生子 Agent（Native API） | `sessions_spawn:--agent ocfs --message "任务"` |
| `subagents` | 管理子 Agent（Native API） | `subagents:status` `subagents:abort <id>` |
| `session_status` | 会话状态 | `session_status:--deep` |

#### UI（用户界面）
| 工具名 | 说明 | 示例 |
|--------|------|------|
| `browser` | 控制网页浏览器 | `browser:status` `browser:open URL` |
| `canvas` | 控制画布（Native API） | `canvas:present URL` `canvas:navigate URL` `canvas:snapshot` |

> `canvas` 支持的 action: `present`, `hide`, `navigate`, `eval`, `snapshot`, `a2ui_push`, `a2ui_reset`
> `eval` 和 `a2ui_push` 可在后续行传递多行内容（JavaScript / JSONL）

#### Messaging（消息通信）
| 工具名 | 说明 | 示例 |
|--------|------|------|
| `message` | 发送多渠道消息 | `message:send --channel telegram --target ID --message "内容"` |

#### Automation（自动化）
| 工具名 | 说明 | 示例 |
|--------|------|------|
| `cron` | 计划任务调度 | `cron:list` `cron:add ...` |
| `gateway` | 网关控制（Native API） | `gateway:restart reason=升级` `gateway:config.get` |

> `gateway` 支持的 action: `restart`, `config.get`, `config.schema`, `config.apply`, `config.patch`, `update.run`
> `config.apply` 和 `config.patch` 可在后续行传递多行 raw YAML 配置

#### Nodes（节点）
| 工具名 | 说明 | 示例 |
|--------|------|------|
| `nodes` | 管理工作节点与设备 | `nodes:list` |

#### Agents
| 工具名 | 说明 | 示例 |
|--------|------|------|
| `agents_list` | 列出可用 Agents（Native API） | `agents_list:` |

#### Media（媒体）
| 工具名 | 说明 | 示例 |
|--------|------|------|
| `image` | 图像理解分析（Native API） | `image:/path/to/img.png` 后续行可跟 prompt |
| `tts` | 文字转语音（Native API） | `tts:要朗读的文本` |

---

### OCFS 扩展工具（非 OpenClaw 原生）

| 工具名 | 说明 | 示例 |
|--------|------|------|
| `ls` | 列出目录 | `ls:.` `ls:./subdir` |
| `append` | 追加到文件末尾 | `append:file.md` 后跟内容 |
| `grep` | 正则搜索 | `grep:file.log\|ERROR` |
| `find` | glob 查找文件 | `find:*.md` |
| `outline` | Markdown 标题提取 | `outline:manual.md` |
| `ocfs_search` | AI 多关键词并发深度调研 | `ocfs_search:主题\|关键词1,关键词2\|true` |
| `ocfs_fetch` | Puppeteer 爬虫（text/snapshot/image） | `ocfs_fetch:URL\|text` `ocfs_fetch:URL\|snapshot` |

> 文件操作路径相对于工作目录 `$OPENCLAW_HOME/.openclaw/workspace-ocfs` 解析（与 OpenClaw 一致）。

### VCP 插件
动态注册，`ls:/home/node/.codex/plugins/` 查看，`read:/home/node/.codex/plugins/{Command}.md` 查看用法。

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

#### OpenClaw 核心工具
```ocfs
message:send --channel telegram --target "123456789" --message "任务完成。"
```ocfs

```ocfs
sessions_list:--all-agents --json
```ocfs

```ocfs
session_status:--deep
```ocfs

```ocfs
browser:status
```ocfs

```ocfs
cron:list
```ocfs

```ocfs
memory_search:花儿的偏好
```ocfs

```ocfs
memory_get:MEMORY.md
```ocfs

```ocfs
process:list
```ocfs

```ocfs
canvas:present https://example.com
```ocfs

```ocfs
canvas:eval
document.title
```ocfs

```ocfs
gateway:config.get
```ocfs

```ocfs
agents_list:
```ocfs

```ocfs
image:/path/to/photo.jpg
描述这张图片的内容
```ocfs

```ocfs
tts:你好世界，这是语音测试
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
