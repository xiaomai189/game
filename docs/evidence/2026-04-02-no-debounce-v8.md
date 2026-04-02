# 证据：换道去防抖 v8

## 证据类型
- 等效证据（代码片段 + 残留项扫描结果）。

## 证据文件
- `docs/evidence/2026-04-02-no-debounce-v8.txt`

## 说明
- 证据文件包含：
  - 换道函数已改为 `applyLaneImmediately(...)`。
  - `onPose()` 已改为直接换道调用。
  - 已确认无 `laneCandidate/laneDebounce/applyLaneWithDebounce` 残留。

