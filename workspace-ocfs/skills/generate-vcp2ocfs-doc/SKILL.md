---
name: generate-vcp2ocfs-doc
description: 读取插件目录中的 VCP plugin-manifest.json，为每个插件生成独立的 OCFS 格式调用说明 .md 文件
---

# 生成 VCP 插件 OCFS 调用文档

本 skill 为 `plugins/` 目录中的每个 VCP 插件生成一份独立的 `.md` 调用说明文件，带 YAML 元数据头，可供 AI system prompt 按需引用。

## 工作流程

```
1. list_dir → '~/.openclaw/workspace-ocfs/plugins'
2. 盘点已有文档：收集目录中所有 *.md 文件名（去掉 .md 后缀），记为 existingDocs
3. 盘点插件目录：收集所有包含 plugin-manifest.json 的plugins子目录名，记为 allPlugins
4. 计算差集：needDocs = allPlugins 中 manifest.name 不在 existingDocs 中的插件
5. 如果 needDocs 为空，告知用户"所有插件文档已就绪"并结束
6. 对每个 needDocs 中的插件:
   a. view_file → {子目录}/plugin-manifest.json
   b. 检查 pluginType === "synchronous" && protocol === "stdio"
   c. 查看插件入口文件头部 import，提取第三方依赖包名
   d. 解析 invocationCommands，提取参数信息
   e. 将 VCP 调用格式转换为 OCFS 格式
   f. 生成 plugins/{manifest.name}.md
```

## 输出文件规范

### 文件命名

每个插件生成一个文件，路径为：
```
~/.openclaw/workspace-ocfs/plugins/{manifest.name}.md
```
例如：`~/.openclaw/workspace-ocfs/plugins/BilibiliFetch.md`

### YAML 头部元数据（必需）

```yaml
---
name: {manifest.name}
description: {manifest.displayName} - {一句话概括核心能力}
commands: [{所有 commandIdentifier/command 列表}]
usage: "{manifest.name}: {最常用的调用示例}"
---
```

### 正文结构

```markdown
# {displayName}

{description 完整内容}

## 通用调用格式

\`\`\`ocfs
{PluginName}: 参数1=值1| 参数2=值2
\`\`\`

## 命令详情

### {commandName} — {一行简介}

{从 description 中提取的功能说明，去掉 VCP 调用格式部分}

**参数：**
- paramName (类型, 必需/可选): 说明
- ...

**OCFS 调用：**
\`\`\`ocfs
{PluginName}: param1=exampleValue| param2=exampleValue
\`\`\`

---

（重复以上结构，列出所有命令）
```

## VCP → OCFS 格式转换规则

从 manifest 的 `description` 和 `example` 字段中：

1. **去除** `<<<[TOOL_REQUEST]>>>` 到 `<<<[END_TOOL_REQUEST]>>>` 之间的 VCP 专属调用格式
2. **去除** `tool_name:「始」...「末」` 行（插件名已隐含在 OCFS action 中）
3. **转换** `paramName:「始」value「末」` → `paramName=value`
4. **拼接** 多个参数用 `| ` 分隔
5. **保留** description 中的功能说明、参数列表、注意事项等非 VCP 格式内容
6. **还原** `\n` 转义为实际换行

## 提取参数的方法

VCP 插件的 `description` 字段中参数列表通常以以下格式出现：

```
参数:
- paramName (类型, 必需): 说明
- paramName2 (类型, 可选, 默认xxx): 说明
```

或嵌入在调用格式中：
```
paramName:「始」说明文字「末」
```

优先使用独立的参数列表（更可靠），调用格式中的参数作为补充参考。

## 注意事项

- 如果 `plugins/` 目录为空，提示用户先从 VCPToolBox 复制插件
- 跳过 `pluginType` 不为 `synchronous` 的插件
- 如果 manifest 中没有 `invocationCommands`，跳过该插件
- 每个插件的 `.md` 文件独立，方便按需引用或删除
- Python 插件依赖用 `uv pip install` 全局安装，Node.js 插件依赖用 `pnpm add -g` 全局安装
- 依赖包通过查看插件入口文件的 import/require 语句确定，排除标准库模块
