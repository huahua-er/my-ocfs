---
name: ocfs-boot
description: "网关启动时自动拉起 OCFS 处理逻辑后台常驻"
metadata:
  "openclaw": {
    "emoji": "🚀",
    "events": ["gateway:startup"],
    "export": "default"
  }
---
# OCFS Boot
启动 OpenClaw 的常驻守护进程。
