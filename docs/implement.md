技术实施方案 / 开发任务拆解表

适用于：Windows 本机运行的 YOLO Pose 体感游戏原型

一、技术实施方案
1. 实施目标

在 Windows 本机上完成一套可运行的体感游戏原型，满足以下要求：

本机摄像头实时采集
YOLO Pose 实时人体关键点识别
动作规则判断
基础游戏逻辑联动
本地 UI 展示
支持后续扩展为更多玩法或接 Unity
2. 总体技术架构

建议采用 单机单进程、模块化分层 架构。

2.1 架构分层
A. 设备接入层

负责摄像头初始化、视频帧采集、分辨率设置、镜像处理。

B. 姿态识别层

负责 YOLO Pose 模型加载、推理、关键点输出、骨架绘制。

C. 动作识别层

负责根据关键点坐标计算用户动作状态，例如：

左手举起
右手举起
双手举起
下蹲
左移
右移
D. 游戏逻辑层

负责：

状态机
计分
倒计时
目标刷新
命中判定
模式切换
E. 渲染展示层

负责：

视频画面显示
游戏元素绘制
HUD 信息显示
操作提示展示
F. 配置与日志层

负责：

参数配置
调试开关
错误日志
运行日志
3. 推荐目录结构
pose_game/
├── main.py
├── config.py
├── requirements.txt
├── README.md
├── assets/
│   ├── sounds/
│   └── images/
├── models/
│   └── yolo11n-pose.pt
├── core/
│   ├── camera.py
│   ├── pose_engine.py
│   ├── action_engine.py
│   ├── game_engine.py
│   ├── renderer.py
│   └── utils.py
├── logs/
└── tests/
4. 模块设计
4.1 camera.py
职责
打开本机摄像头
设置分辨率
读取帧
镜像处理
释放资源
输入
camera_index
width
height
mirror
输出
frame
核心接口建议
class CameraManager:
    def __init__(self, camera_index=0, width=1280, height=720, mirror=True):
        ...
    def open(self):
        ...
    def read(self):
        ...
    def release(self):
        ...
4.2 pose_engine.py
职责
加载 YOLO Pose 模型
执行推理
提取关键点
返回单人关键点结果
输入
frame
输出
keypoints
boxes
annotated_frame
关键要求
只取主目标人物
支持 CPU / GPU
支持置信度过滤
核心接口建议
class PoseEngine:
    def __init__(self, model_path, device="cpu", conf=0.5):
        ...
    def infer(self, frame):
        ...
    def get_primary_person_keypoints(self, result):
        ...
4.3 action_engine.py
职责
根据关键点判断动作
输出统一动作状态
输入
keypoints
frame_shape
输出
action_state
输出示例
{
    "right_hand_up": True,
    "left_hand_up": False,
    "both_hands_up": False,
    "squat": False,
    "move_left": False,
    "move_right": True,
    "body_center": (640, 310)
}
动作判定建议
右手举起

right_wrist_y < right_shoulder_y - threshold

左手举起

left_wrist_y < left_shoulder_y - threshold

双手举起

左右手同时满足举手条件

下蹲

通过肩部中心与髋部中心的垂直距离变化判断

左右移动

通过肩部中心点相对画面中心偏移判断

核心接口建议
class ActionEngine:
    def __init__(self, config):
        ...
    def detect(self, keypoints, frame_shape):
        ...
4.4 game_engine.py
职责
管理游戏状态
接收动作输入
控制计分、目标、时间
产生 UI 所需状态数据
游戏状态建议
INIT
READY
RUNNING
PAUSED
GAME_OVER
输入
action_state
current_time
输出
game_state
score
target_position
countdown
hit_result
核心接口建议
class GameEngine:
    def __init__(self, config):
        ...
    def start(self):
        ...
    def reset(self):
        ...
    def update(self, action_state, now):
        ...
    def get_state(self):
        ...
4.5 renderer.py
职责
渲染骨架
叠加目标点
显示分数、倒计时、动作状态、FPS
显示提示文案
输入
frame
pose_result
action_state
game_state
输出
rendered_frame
核心接口建议
class Renderer:
    def __init__(self, config):
        ...
    def draw(self, frame, pose_result, action_state, game_state, fps):
        ...
4.6 config.py
职责

统一管理项目参数。

建议参数
CAMERA_INDEX = 0
FRAME_WIDTH = 1280
FRAME_HEIGHT = 720
MIRROR = True

MODEL_PATH = "models/yolo11n-pose.pt"
DEVICE = "cpu"
CONFIDENCE = 0.5

HAND_UP_MARGIN = 20
SQUAT_THRESHOLD = 85
MOVE_THRESHOLD = 80
ACTION_COOLDOWN = 0.8

GAME_DURATION = 60
TARGET_RADIUS = 70
FAST_TARGET_RADIUS = 90
DEBUG = True
二、主流程设计
1. 程序启动流程
启动程序
→ 加载配置
→ 初始化日志
→ 打开摄像头
→ 加载 YOLO Pose 模型
→ 初始化动作识别模块
→ 初始化游戏引擎
→ 初始化渲染模块
→ 进入主循环
2. 主循环流程
读取摄像头帧
→ 姿态推理
→ 提取关键点
→ 动作识别
→ 更新游戏逻辑
→ 渲染 UI
→ 显示窗口
→ 监听退出按键
三、数据结构建议
1. 关键点结构
{
    "nose": (x, y, conf),
    "left_shoulder": (x, y, conf),
    "right_shoulder": (x, y, conf),
    "left_wrist": (x, y, conf),
    "right_wrist": (x, y, conf),
    "left_hip": (x, y, conf),
    "right_hip": (x, y, conf)
}
2. 动作状态结构
{
    "tracked": True,
    "right_hand_up": False,
    "left_hand_up": True,
    "both_hands_up": False,
    "squat": False,
    "move_left": False,
    "move_right": False
}
3. 游戏状态结构
{
    "status": "RUNNING",
    "score": 5,
    "hits": 7,
    "countdown": 38,
    "target_x": 880,
    "target_y": 260,
    "mode": "FAST"
}
四、开发任务拆解表

下面按“能排期、能分工”的方式拆。

任务 A：项目初始化
工作内容
创建项目目录
建立虚拟环境
安装依赖
下载模型
建立 README
建立基础配置文件
输出
可运行空项目
requirements.txt
模型文件就位
工时建议

0.5 天

任务 B：摄像头模块开发
工作内容
封装摄像头读取类
支持摄像头索引
支持分辨率设置
支持镜像
异常处理
验收标准
能稳定显示实时摄像头画面
摄像头异常时有明确报错
工时建议

0.5 天

任务 C：YOLO Pose 推理模块开发
工作内容
模型加载
单帧推理
提取主人物关键点
骨架可视化
CPU/GPU 切换
验收标准
能在实时视频中显示人体骨架
能输出关键点坐标
无人时不崩溃
工时建议

1 天

任务 D：动作识别模块开发
工作内容
举左手判定
举右手判定
双手举起判定
下蹲判定
左右移动判定
冷却与防抖处理
验收标准
至少 4 个动作识别有效
动作状态可输出到屏幕
抖动不会频繁误触发
工时建议

1 天

任务 E：游戏引擎开发
工作内容
游戏状态机
计分逻辑
目标随机生成
命中检测
倒计时
开始/结束逻辑
验收标准
可完整玩一局
命中加分正确
倒计时结束正确
工时建议

1 天

任务 F：渲染与 UI 开发
工作内容
分数显示
FPS 显示
动作状态显示
提示文字显示
目标图形显示
结束画面显示
验收标准
UI 信息清晰
不遮挡主要交互区域
演示效果可接受
工时建议

0.5~1 天

任务 G：参数配置与日志开发
工作内容
统一配置项管理
阈值配置化
Debug 开关
运行日志输出
验收标准
不改主逻辑即可调参
能查看主要错误原因
工时建议

0.5 天

任务 H：联调与性能优化
工作内容
调整分辨率
调整模型
优化动作阈值
优化循环逻辑
降低误判率
稳定连续运行
验收标准
运行 10 分钟不崩溃
帧率达到目标范围
动作响应基本自然
工时建议

1~2 天

任务 I：打包与交付整理
工作内容
编写启动说明
整理依赖说明
可选 PyInstaller 打包
输出演示版目录
验收标准
非开发人员可按说明运行
项目目录清晰
工时建议

0.5~1 天

五、建议排期
方案一：最短可运行版

适合快速验证

阶段	内容	工时
Day 1	项目初始化 + 摄像头 + Pose 推理	1.5 天
Day 2	动作识别 + 简单 UI	1 天
Day 3	游戏逻辑 + 联调	1 天

合计：3~4 天

方案二：演示优化版

适合客户展示

阶段	内容	工时
第 1 阶段	技术打通	1.5 天
第 2 阶段	动作模块与游戏逻辑	2 天
第 3 阶段	UI、调参与稳定性优化	2 天
第 4 阶段	打包与文档	1 天

合计：5~7 天

六、人员分工建议

如果只有 1 个人，可以串行完成。
如果有 2 个人，建议这样分：

开发 A
camera
pose_engine
action_engine
开发 B
game_engine
renderer
config
打包和文档
共同
联调
参数优化
演示测试
七、关键技术风险与应对
风险 1：CPU 帧率不足
应对
降低输入分辨率
使用轻量模型
降低渲染复杂度
优先单人识别
风险 2：动作误判较多
应对
加冷却时间
加连续帧确认
阈值配置化
限制站位区域
风险 3：不同人效果差异大
应对
增加校准步骤
根据肩宽/躯干高度做比例阈值
提供调试面板
风险 4：现场光照影响识别
应对
优先正面光
限制背景复杂度
调低摄像头曝光波动
八、后续技术演进路线
第一步

Windows 本机 Python 原型跑通

第二步

识别和游戏逻辑分层，便于扩展玩法

第三步

接入 Unity 做更完整展示界面

第四步

识别模块服务化，为后续 Docker 或远程部署做准备

九、首版实施建议

我建议你首版按下面边界执行：

必做
摄像头读取
YOLO Pose 单人识别
右手举起
左手举起
下蹲
一个游戏玩法
分数和倒计时
基本 UI
可后置
左右移动
双手举起
音效
开始页/结束页美化
exe 打包
Unity 接入