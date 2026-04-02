# 证据：摄像头窗口去游戏叠加 v11

## 证据类型
- 等效证据（代码实现片段 + 参数接入）。

## 证据文件
- `docs/evidence/2026-04-02-camera-no-game-overlay-v11.txt`

## 说明
- 证据文件包含：
  - 渲染器 `show_game_overlay` 开关逻辑。
  - `main.py` 参数 `--show-camera-game-overlay` 接入。
  - `config.py` 默认值 `show_camera_game_overlay=False`。

