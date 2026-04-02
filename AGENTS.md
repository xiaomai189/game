# AGENTS.md

## 1. 项目定位
本项目是一个 **Windows 本机 YOLO Pose 体感游戏原型**。  
目标是在普通 USB 摄像头 + Windows PC 环境下，实现单人实时姿态识别与游戏交互，不依赖 Kinect 或深度相机。

## 2. 当前仓库状态
当前仓库处于初始化阶段，已有文档：
- `docs/PRD.md`
- `docs/implement.md`

后续实现、重构与测试，应优先对齐这两份文档。

## 3. 推荐技术栈
- Python 3.10+（建议 3.11）
- OpenCV（摄像头采集与图像处理）
- Ultralytics YOLO Pose（姿态推理）
- NumPy（数值计算）
- Pygame 或 OpenCV Overlay（原型渲染与 HUD）
- Pytest（单元测试）

## 4. 推荐目录结构
```text
game/
├─ AGENTS.md
├─ README.md
├─ requirements.txt
├─ main.py
├─ config.py
├─ assets/
│  ├─ images/
│  └─ sounds/
├─ models/
│  └─ yolo11n-pose.pt
├─ core/
│  ├─ camera.py
│  ├─ pose_engine.py
│  ├─ action_engine.py
│  ├─ game_engine.py
│  ├─ renderer.py
│  └─ utils.py
├─ tests/
└─ logs/
```

## 5. 模块职责约束
- `camera.py`：摄像头打开/读取/释放，分辨率与镜像配置。
- `pose_engine.py`：模型加载、推理、主目标关键点输出。
- `action_engine.py`：关键点规则判断（举手、下蹲、左右移动等）。
- `game_engine.py`：游戏状态机、计分、目标刷新、命中判定。
- `renderer.py`：视频帧叠加绘制、HUD、提示信息显示。
- `config.py`：集中维护阈值、摄像头参数、模型路径、调试开关。

禁止把所有逻辑堆叠到 `main.py`；`main.py` 仅做流程编排。

## 6. 开发与质量要求
- 默认单人场景，优先识别画面中的主要人物。
- 先保证可运行与稳定，再迭代精度和玩法复杂度。
- 关键参数（阈值、分辨率、置信度）必须可配置。
- 代码需补充必要类型注解和简洁注释（解释“为什么”，不是“做了什么”）。
- 新增功能需附带最小可验证测试或手工验证步骤。

## 7. 初始化执行建议（首次搭建）
1. 创建虚拟环境并安装依赖：
   - `python -m venv .venv`
   - `.\.venv\Scripts\Activate.ps1`
   - `pip install -r requirements.txt`
2. 下载或放置姿态模型到 `models/` 目录。
3. 完成 `camera.py` 与 `pose_engine.py` 的最小可运行链路（摄像头帧 + 骨架可视化）。
4. 接入 `action_engine.py` 的基础动作判定（至少：左手举起、右手举起、下蹲）。
5. 接入 `game_engine.py` 与 `renderer.py`，完成可玩的最小原型。

## 8. 运行与测试命令（约定）
- 运行主程序：`python main.py`
- 运行测试：`pytest -q`

## 9. 协作约定
- 修改前先阅读相关模块与 `docs/` 文档，避免与既定设计冲突。
- 优先小步提交，单次变更聚焦一个目标。
- 若发现文档与实现冲突，先在 PR/说明中明确差异与取舍理由，再改动。



## 强制交付流程（必须执行）
1. 先阅读相关代码与文档，明确变更边界。
2. 所有新任务先写 PRD（背景、目标、范围、方案、验收、风险）到 `docs/rpd/`。
3. PRD 确认后再实施代码改动。
4. 实施后补 `docs/change-logs/YYYY-MM-DD/`，记录改动、原因、验证结果。
5. 涉及 UI 改动必须附界面证据（截图或等效证据）到 `docs/evidence/`。
6. 默认执行 `npm run build`；若未执行需在变更记录里说明。

## 测试与验收
- 至少验证：构建通过 + 关键功能可用。
- 后端改动需验证登录、权限、数据写入/读取。
- 前端交互改动优先用 Playwright 复测关键路径。