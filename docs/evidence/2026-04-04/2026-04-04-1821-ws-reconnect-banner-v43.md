# UI Evidence - 2026-04-04 18:21 - ws reconnect banner (v43)

## 验证目标
- 验证 YOLO 端离线时，连接条显示重连倒计时与 attempt。
- 验证文本状态包含 `transport` 诊断信息。

## 执行方式
- 静态服务：`python -m http.server 8080 -d dist`
- 浏览器：Playwright（headless）打开页面后切换 `Input=Camera`，等待断连重试文案出现并截图。

## 结果
- 连接条出现：`Pose stream offline, retry in 1.5s (attempt 1)`。
- `render_game_to_text()` 返回对象包含 `transport` 字段（脚本输出 `hasTransport=true`）。

## 证据文件
- `docs/evidence/2026-04-04/2026-04-04-1821-ws-reconnect-banner-v43.png`
