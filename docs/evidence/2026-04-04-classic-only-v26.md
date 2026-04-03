# 证据：Classic-only 运行验证（v26）

## 启动命令
```powershell
.\scripts\run-oneclick.ps1 -SkipInstall -SkipBuild -NoBrowser
```

## 验证步骤
1. 打开 `http://127.0.0.1:8080`
2. 点击“启动”
3. 读取 `window.render_game_to_text()`

## 结果
- `workoutMode = "classic"`
- `mode = "RUNNING"`
- 页面 HUD 已显示 classic 目标与规则，未出现训练模式内容。

## 截图
- `docs/evidence/2026-04-04-classic-only-v26.png`
