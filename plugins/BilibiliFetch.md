---
name: BilibiliFetch
description: Bilibili 视频内容获取 - 字幕、弹幕、评论、截图快照，支持搜索视频/UP主
commands: [BilibiliFetch, BilibiliSearch, GetUpVideos]
usage: "BilibiliFetch: url=视频链接| danmaku_num=10"
---

# Bilibili 内容获取插件

根据 Bilibili URL 获取视频信息、字幕、弹幕、评论及快照截图。支持长链接和 b23.tv 短链接，支持搜索视频/UP主，支持获取UP主视频列表。

## 通用调用格式

```ocfs
BilibiliFetch: 参数1=值1| 参数2=值2
```ocfs

## 命令详情

### BilibiliFetch — 获取视频内容

获取 Bilibili 视频信息（标题、作者）、字幕、热门弹幕、热门评论、高能进度条（弹幕集中的时间点）以及视频特定时间点的快照截图。

**参数：**
- url (字符串, 必需): Bilibili 视频的 URL (支持 b23.tv 短链接)
- lang (字符串, 可选): 字幕语言代码, 例如 `ai-zh` 或 `ai-en`
- danmaku_num (数字, 可选): 获取热门弹幕的数量，默认为 0
- comment_num (数字, 可选): 获取热门评论的数量，默认为 0
- snapshots (字符串, 可选): 想要查看快照的时间点（秒），多个用逗号分隔，例如 `10,60,120`
- need_subs (布尔值, 可选): 是否需要获取字幕，默认为 true
- need_pbp (布尔值, 可选): 是否获取弹幕热度最高的几个时间点，默认为 true

**OCFS 调用：**
```ocfs
BilibiliFetch: url=https://b23.tv/b6PME73| danmaku_num=10| need_pbp=true
```ocfs

**完整示例：**
```ocfs
BilibiliFetch: url=https://b23.tv/b6PME73| danmaku_num=10| snapshots=15,45| comment_num=5
```ocfs

> 插件返回多模态结构化数据，包含文本和 HTML `<img>` 标签。请将 `<img>` 标签原样展示给用户以便渲染快照。

---

### BilibiliSearch — 搜索视频/UP主

关键词搜索 Bilibili 视频或 UP 主，支持分页。

**参数：**
- action (字符串, 必需): 固定为 `search`
- keyword (字符串, 必需): 搜索关键词
- search_type (字符串, 可选): `video`（搜索视频）或 `bili_user`（搜索用户），默认 `video`
- page (数字, 可选): 页码，默认为 1

**OCFS 调用：**
```ocfs
BilibiliFetch: action=search| keyword=Python教程| search_type=video
```ocfs

**搜索UP主：**
```ocfs
BilibiliFetch: action=search| keyword=影视飓风| search_type=bili_user
```ocfs

---

### GetUpVideos — 获取UP主视频列表

获取指定 UP 主（通过 mid）的所有投稿视频 BV 号。常用于搜索到用户后进一步获取其视频列表。

B 站链接格式：短链接 `https://b23.tv/BV号`，长链接 `https://www.bilibili.com/video/BV号`。

**参数：**
- action (字符串, 必需): 固定为 `get_up_videos`
- mid (字符串, 必需): 目标用户的 ID (mid)
- pn (数字, 可选): 页码，默认为 1
- ps (数字, 可选): 每页项数，最大 50，默认为 30

**OCFS 调用：**
```ocfs
BilibiliFetch: action=get_up_videos| mid=946974| pn=1
```ocfs
