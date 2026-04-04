# Evidence - 2026-04-04 19:49 - 双摄守护与自动降级（v44）

## UI 截图
- `docs/evidence/2026-04-04/2026-04-04-1949-dual-runtime-guard-diag-v44.png`
  - 展示诊断面板中新增的 `dual:degraded` 与 `self:degraded` 状态。
- `docs/evidence/2026-04-04/2026-04-04-1947-dual-runtime-guard-v44.png`
  - 展示 UI 在自动模式下保持 classic（双摄未 ready 时不自动切 dual race）。

## 关键验证命令
- `.\.venv\Scripts\python.exe -m pytest -q`
- `npm run build`
- `npm run test:web-dual-race`
- `npm run test:web-ws-reconnect-noise`
- `.\.venv\Scripts\python.exe main.py --camera-sources "0,1" --no-display --disable-websocket --max-frames 60 --self-check-sec 3 --dual-min-fps 6 --max-input-age-ms 800 --auto-degrade true --perf-report logs\perf-v44-dual.json`

## 结果摘要
- Python 测试：通过（36 passed）。
- Web 构建：通过。
- Dual race 回归：通过。
- WS reconnect 回归：通过（在测试前清理占用 8080/8765 的本地进程后）。
- 双摄 perf 报告：`runtime.dualReady=false`，`selfCheckStatus=degraded`，可正确触发降级判定。
