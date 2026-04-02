# Web 跑酷 P1 证据（2026-04-02）

## 启动方式
1. 启动姿态服务（示例）：
```powershell
.\.venv\Scripts\python.exe main.py --demo --duration-sec 45 --max-frames 18000 --no-display --websocket-port 8765
```
2. 启动静态服务：
```powershell
python -m http.server 8080 -d web
```
3. 浏览器访问：
```text
http://127.0.0.1:8080
```

## 证据文件
- `docs/evidence/2026-04-02-web-runner-p1.png`

## 结果说明
- 页面显示“已连接姿态服务”。
- 跑酷画面、通道、玩家位置与分数均可实时更新。
