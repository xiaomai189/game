# 证据：CI/本地门禁预检 v16

## 证据类型
- 命令执行证据（本地 preflight 一键预检）。

## 执行命令
```powershell
npm run preflight
```

## 结果
- Python 单测：`14 passed`
- Web 构建：通过（`Built web assets to .../dist`）
- Web 换道回归：通过（`web gesture regression passed`）

## 说明
- 该命令与 CI 工作流门禁项对齐，可用于提交前快速自检。
