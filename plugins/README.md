# VCP 兼容插件目录

将 VCPToolBox 的插件目录直接复制到此处即可使用。

## 支持的插件类型

仅支持 `pluginType: "synchronous"` + `protocol: "stdio"` 的插件。

## OCFS 调用格式

```ocfs
插件名: key1=value1| key2=value2
```

或 JSON 格式：
```ocfs
插件名: {"key1": "value1", "key2": "value2"}
```

### 示例

```ocfs
UrlFetch: url=https://example.com| mode=text
FileOperator: command=ListDirectory| directoryPath=/home/user/docs
```

## 依赖安装

插件的依赖包需全局安装，与项目现有模式保持一致：

**Python 插件：** 使用 uv 全局安装
```bash
uv pip install requests pillow  # 按各插件实际需求安装
```

**Node.js 插件：** 使用 pnpm 全局安装
```bash
pnpm add -g axios dotenv  # 按各插件实际需求安装
```

## 注意事项

1. 插件名不区分大小写（`UrlFetch` 和 `urlfetch` 等效）
2. 与内置 OCFS action 同名的插件会被忽略（内置优先）
3. 每个插件需确保依赖已安装（`npm install` 等）
