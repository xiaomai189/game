# Evidence - 2026-04-04 23:56 - 后端窗口双路分屏预览（v46）

## 预览截图
- `docs/evidence/2026-04-04/2026-04-04-2354-backend-dual-preview-v46.png`
  - 由后端运行命令自动导出（`--save-preview`），可见双路分屏（cam0/cam1）与每路状态条。

## 验证命令
- `.\.venv\Scripts\python.exe -m pytest -q`
- `npm run build`
- `.\.venv\Scripts\python.exe main.py --camera-sources "0,1" --no-display --disable-websocket --max-frames 30 --save-preview docs\evidence\2026-04-04\2026-04-04-2354-backend-dual-preview-v46.png`

## 结果
- 测试通过，构建通过。
- 导出的预览图显示后端双摄分屏成功。
