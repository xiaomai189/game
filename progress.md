Original prompt: 目前我认为前端的游戏界面太丑，完全没有看到动漫元素，只看到圆圈和长方形，看看使用什么skill创建更加游戏化

## 2026-04-04 v37 Classic 回合反馈与快捷控制增强
- 新增主状态反馈区：Health 条、Pace 条、Round hint。
- 新增快捷键闭环：
  - `Enter/Space`：READY 启动、PAUSED 恢复、GAME_OVER 重开
  - `P`：RUNNING/PAUSED 切换
  - `R`：快速重开
- 回合结束原因可视化：碰撞结束后显示 `collision`，并写入 `render_game_to_text().round.gameOverReason`。
- `auto` 输入模式降噪：仅在 RUNNING 时尝试相机连接，待机不反复重连。
- 新增回归：`npm run test:web-hotkeys-feedback`，并纳入 `npm run preflight`。
- 验证通过：`npm run build`、`npm run test:web-hotkeys-feedback`、`npm run test:web-input-mode-fallback`、`npm run preflight`。

## 2026-04-02 v12 初始化
- 已读取 `develop-web-game` 与 `imagegen` 技能文档。
- 当前环境 `OPENAI_API_KEY` 缺失，无法直接调用 imagegen 生成外部素材。
- 决策：先执行纯前端动漫化重制（可运行版本），保留后续贴图替换接口。

## TODO
- 重构 HUD/CSS 视觉语言（动漫霓虹风）。
- 重构 Canvas 渲染（背景、玩家、障碍、状态层）。
- 增加 `window.render_game_to_text` 与 `window.advanceTime(ms)`。
- 跑 Playwright 客户端并检查截图/状态输出/控制链路。
- 补 changelog 和 evidence。

## 2026-04-02 v12 视觉重构（进行中）
- `web/index.html` 已加入品牌头（Neon Pose Runner）、胶囊状态块、扫描线容器。
- `web/styles.css` 已改为霓虹动漫风主题：高对比渐变背景、HUD 卡片、赛博按钮、扫描线层。
- `web/game.js` 已重写渲染：
  - 分层背景（夜空/月光/城市剪影/速度线/漂浮粒子）
  - 玩家改为悬浮机体样式（切道特效 + 护盾环）
  - 障碍改为能量门样式（危险门 + 安全门辉光）
  - 新增 `window.render_game_to_text` 与 `window.advanceTime(ms)`。

## 2026-04-02 v12 验证结果
- `npm run build`：通过。
- `.\.venv\Scripts\python.exe -m pytest -q`：通过（11 passed）。
- 已安装 `playwright` 并运行 `develop-web-game` 客户端。
- 证据已输出到 `docs/evidence/v12-playwright/`（shot/state 文件）。

## 后续建议
- 若要进一步增强“动漫感”，建议在设置 `OPENAI_API_KEY` 后调用 `imagegen` 批量生成：
  - 主角机体贴图（透明底 PNG）
  - 能量门障碍贴图
  - 城市天际线背景层
  - UI 图标（护盾、连击、速度）
## 2026-04-03 v23 Demo 自动切道修复
- 复现：`--demo` 模式下会周期性模拟 `right_hand_up`，前端出现 middle/right 来回切道。
- 方案：`main.py` 新增 `--demo-auto-actions`，默认关闭；`--demo` 默认改为中立动作，不自动切道。
- 验证：
  - `pytest -q` -> 17 passed
  - `npm run build` -> pass
  - Playwright 连续 lane 采样 `unique=["middle"]`
## 2026-04-04 v25 玩法可理解性增强
- 新增 HUD 目标说明与规则说明，解决“看不懂在玩什么”的反馈。
- 新增实时诊断区：stream、input age、actions、source。
- 修复前端连接状态文案乱码。
- 回归通过：`npm run preflight`（pytest/build/web-gesture/web-workout 全通过）。

## 2026-04-04 v26 删除三种训练模式
- 按用户要求删除 `sprint_lane / squat_gate / reaction_drill`，仅保留 `classic`。
- 收敛 `web/game/index.js` 为 classic-only，`switch_workout_mode` 兼容保留但固定 classic。
- 清理脚本/CI 中 workout 回归项并删除对应测试脚本。
- 验证通过：`npm run preflight`，一键运行后 `workoutMode=classic`。

## 2026-04-04 v27 Classic 可玩性兜底
- 增加键盘兜底控制：`←/A` 左道，`→/D` 右道，`↓/S` 下蹲。
- 增加手动输入优先窗口，解决键盘输入被 websocket 中立流立即覆盖问题。
- 修复 `stop-oneclick.ps1` 在 pid 文件不存在时的异常。
- 回归通过：`npm run preflight`。

## 2026-04-04 v28 Classic 时间归零续时
- 修复 `Classic` 在 `Time=0` 时强制 `GAME_OVER` 的问题，改为时间自动续时循环。
- 新增 `test:web-classic-timer` 回归，覆盖“续时不断局 + 碰撞仍结束”。
- 预检通过：`npm run preflight`。

## 2026-04-04 v29 YOLO 稳态识别优化
- 动作识别新增：启动校准、关键点平滑、动作防抖、移动迟滞。
- 主目标选择新增：面积+距离粘性策略，减少多人场景下目标跳变。
- 验证通过：`.\.venv\Scripts\python.exe -m pytest -q`（21 passed）与 `npm run build`。

## 2026-04-04 v30 YOLO 健康评分与自适应降级
- 新增 health score（融合 fps/延迟/丢帧/跟踪质量/校准进度）。
- 新增运行时自适应控制器，动态调整 `infer_scale` 与 `inference_stride`。
- 诊断字段已写入 warning、web payload 与 perf report。
- 验证通过：`.\.venv\Scripts\python.exe -m pytest -q`（23 passed）与 `npm run build`。

## 2026-04-04 v31 游戏端健康联动调节
- Web classic 接入 YOLO `healthScore`，低健康自动降速并降低刷怪节奏。
- 诊断区新增 `health/stride/scale` 显示。
- 新增 `npm run test:web-health-adaptive` 回归并纳入 `preflight`。
- 验证通过：`npm run preflight`。

## 2026-04-04 v32 动漫角色 + 2.5D 视觉升级
- classic 渲染升级为动漫角色占位 + 2.5D 透视场景（不改玩法判定）。
- 新增视觉回归：`npm run test:web-visual-upgrade`，并接入 `preflight`。
- 验证通过：`npm run preflight`。

## 2026-04-04 v33 角色素材化与皮肤切换
- 新增皮肤 manifest + 两套角色素材（`neon`、`sakura`）+ 回退皮肤（`prototype`）。
- 新增运行时皮肤切换 API：`window.set_avatar_skin`、`window.get_avatar_skins`。
- 素材缺失时自动从 sprite 回退 procedural，不影响游戏运行。
- 新增回归：`npm run test:web-avatar-skins` 并接入 `preflight`。

## 2026-04-04 v34 角色动画包与樱花轻彩
- 新增角色动画状态机：`idle/move_left/move_right/hit/miss/game_over`，并带过渡 blend。
- 新增视觉预设 API：`window.set_visual_preset`、`window.get_visual_presets`，支持 `sakura-lite/neon` 切换。
- HUD 说明与诊断文案改为可读文本，诊断区新增 `preset` 显示。
- 新增回归：`npm run test:web-avatar-animation` 并接入 `preflight`。
- 验证通过：`npm run preflight`。

## 2026-04-04 v35 classic 专业化 UI 重构
- classic HUD 重构为主状态区 / 控制区 / 诊断区三层结构。
- 新增诊断区折叠开关 `#btnDiagToggle`，默认折叠，支持运行时展开查看。
- `render_game_to_text().visual` 新增 `uiVariant=classic-pro-v35` 便于回归观察。
- 验证通过：`npm run build`、`npm run test:web-avatar-animation`、`npm run preflight`。

## 2026-04-04 v36 可玩性稳定化与演示模式增强
- 新增输入模式体系：`auto/camera/keyboard/demo`，并增加 `set_input_mode/get_input_mode` API。
- `auto` 在相机离线时自动 fallback 到 keyboard；`demo` 支持无相机自动动作演示。
- classic 文本状态新增 `visual.inputMode`，`uiVariant` 升级为 `classic-pro-v36`。
- 新增回归：`npm run test:web-input-mode-fallback`、`npm run test:web-round-flow` 并接入 `preflight`。
- 验证通过：`npm run build`、`npm run test:web-input-mode-fallback`、`npm run test:web-round-flow`、`npm run preflight`。
