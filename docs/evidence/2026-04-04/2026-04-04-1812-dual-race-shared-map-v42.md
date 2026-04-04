# UI Evidence - 2026-04-04 18:12 - dual_race shared map (v42)

## 验证目标
- 确认双人模式为左右分屏。
- 确认两侧障碍节奏一致（同图共享障碍）。
- 确认头部 HUD 为 Dual Race 规则文案。

## 执行方式
- 本地静态服务：`python -m http.server 8080 -d dist`
- 浏览器自动化：Playwright 打开页面，切换 `Mode=Dual Race`，点击 `Start` 后截图。

## 结果
- 页面显示 `Status: RUNNING | Dual Race`。
- 左右两侧显示 `P1 Camera 0` 与 `P2 Camera 1`。
- 截图中两侧同一高度障碍布局一致，符合共享障碍图预期。

## 证据文件
- `docs/evidence/2026-04-04/2026-04-04-1812-dual-race-shared-map-v42.png`
