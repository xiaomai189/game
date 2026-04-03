# 证据：Demo 模式换道稳定性（v23）

## 启动命令
```powershell
.\scripts\run-oneclick.ps1 -SkipInstall -SkipBuild -NoBrowser -Demo -NoDisplay -WebPort 8080
```

## 验证步骤
1. 打开 `http://127.0.0.1:8080/?mode=sprint_lane`。
2. 点击“启动”。
3. 通过 `window.advanceTime(50)` 连续推进 180 次并读取 `window.render_game_to_text()` 的 `laneLabel`。

## 验证结果
- 采样结果：`unique lanes = ["middle"]`
- 首尾采样均为 `middle`
- 结论：在 `--demo`（未开启 `--demo-auto-actions`）下，不再出现中右自动来回切换。

## 截图
- `docs/evidence/2026-04-03-demo-lane-stable-v23.png`
