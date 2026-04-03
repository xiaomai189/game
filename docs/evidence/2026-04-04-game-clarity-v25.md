# 证据：玩法可理解性增强（v25）

## 启动方式
```powershell
.\scripts\run-oneclick.ps1 -SkipInstall -SkipBuild -NoBrowser
```

## 检查点
1. 打开 `http://127.0.0.1:8080/?mode=sprint_lane`
2. 点击“启动”
3. 观察 HUD 新增内容：
   - 目标说明（objective）
   - 规则说明（legend）
   - 诊断区（stream / input age / actions / source）

## 结果
- 新增说明区正常显示，能直接解释“这个模式怎么玩/怎么得分/怎么失败”。
- 诊断区实时更新，可判断输入是否进入游戏逻辑。
- 截图：`docs/evidence/2026-04-04-game-clarity-v25.png`
