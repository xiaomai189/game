# 证据：左右手校正与换道提速 v6

## 证据类型
- 等效证据（代码片段 + 验证命令结果）。

## 证据文件
- `docs/evidence/2026-04-02-lr-fix-fast-lane-v6.txt`

## 说明
- 本次变更主要是动作语义与输入响应参数调整，证据以实现片段为主。
- 运行验证已执行：
  - `npm run build`
  - `.\.venv\Scripts\python.exe -m pytest -q`
  - `.\.venv\Scripts\python.exe main.py --demo --max-frames 45 --no-display --disable-websocket`

