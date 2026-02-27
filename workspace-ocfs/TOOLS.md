# TOOLS.md - OCFS 命令系统

> **说明**：这里是属于你的 OCFS 专属操作区，标准的系统调用方式是使用 `ocfs` 代码块。如果你偶尔使用了系统原生 Tool 并且成功了那也没问题，系统不会限制你；但请记住，下面记载的 `动作:参数` 这个 OCFS 命令词汇表才是你在这个工作区内**默认和最核心的本能技能树**。

## 完整工具列表

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

| 工具名 | 映射到 CLI | 示例 |
|--------|-----------|------|
| `exec` | 直接执行命令 | `exec:任意命令` |
| `browser` | `openclaw browser` | `browser:open URL` 或 `browser:status` |
| `message` | `openclaw message` | `message:send --channel telegram --target ID --message "内容"` |
| `cron` | `openclaw cron` | `cron:list` `cron:add ...` |
| `nodes` | `openclaw nodes` | `nodes:` |
| `sessions_list` | `openclaw sessions` | `sessions_list:--all-agents --json` |
| `sessions_send` | `openclaw agent` | `sessions_send:--session-id ID --message "内容"` |
| `sessions_history` | `openclaw sessions` | `sessions_history:--agent main --json` |
| `sessions_spawn` | `openclaw agent` | `sessions_spawn:--agent ops --message "任务"` |
| `session_status` | `openclaw status` | `session_status:` `session_status:--deep` |
| `subagents` | API 端点调用 （支持 status / abort） | `subagents:status` 或 `subagents:abort <id>` |
| `memory_search` | `openclaw memory search` | `memory_search:"关键词"` |
| `apply_patch` | `openclaw apply-patch` | `apply_patch:` 后跟 patch 内容 |

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
sessions_list:--all-agents --json
```ocfs

```ocfs
session_status:--deep
```ocfs

```ocfs
browser:open --url "https://example.com"
```ocfs

```ocfs
cron:list
```ocfs

```ocfs
memory_search:"花儿的偏好"
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