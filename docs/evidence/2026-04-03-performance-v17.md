# 证据：性能优化 v17

## 证据类型
- 性能报告 JSON（程序运行时导出）。

## 执行命令
```powershell
.\.venv\Scripts\python.exe main.py --no-display --max-frames 120 --disable-websocket --perf-report docs/evidence/2026-04-03-perf-v17-camera.json
```

## 结果摘要（camera）
- `captureFps`: `9.4`
- `inferFps`: `10.23`
- `renderFps`: `10.23`
- `p95LatencyMs`: `140.83`
- `frameDropRate`: `0.0083`
- `inferenceScaleFinal`: `0.75`（自适应降档生效）

## 附加（demo）报告
- `docs/evidence/2026-04-03-perf-v17.json`

## 证据文件
- `docs/evidence/2026-04-03-perf-v17-camera.json`
- `docs/evidence/2026-04-03-perf-v17.json`
