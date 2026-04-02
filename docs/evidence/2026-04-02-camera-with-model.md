# 真实摄像头 + 模型识别证据（2026-04-02）

## 运行命令
```powershell
.\.venv\Scripts\python.exe main.py --max-frames 220 --save-preview docs/evidence/2026-04-02-camera-with-model.png
```

## 输出结果
- 预览图：`docs/evidence/2026-04-02-camera-with-model.png`
- 运行输出：`Preview saved to: docs\evidence\2026-04-02-camera-with-model.png`

## 说明
- 模型文件已放置为：`models/yolo11n-pose.pt`。
- 证据图中可见人体关键点和骨架已渲染，说明姿态识别链路已生效。
