# 证据：一键部署运行 v20

## 目标
验证一键脚本可在 Windows 本地完成“启动 + 停止”闭环。

## 验证步骤
1. 启动：
```powershell
.\scripts\run-oneclick.ps1 -SkipInstall -SkipBuild -Demo -NoDisplay -NoBrowser -WebPort 18080 -WebsocketPort 18765
```

2. 检查可用性：
```powershell
(Invoke-WebRequest -Uri "http://127.0.0.1:18080" -UseBasicParsing -TimeoutSec 3).StatusCode
```
返回：`200`

3. 检查 PID 文件：
```text
logs/oneclick-processes.json
```
包含：`backendPid`、`webPid`、`webPort`、`websocketPort`

4. 停止：
```powershell
.\scripts\stop-oneclick.ps1
```

5. 二次检查端口：
```powershell
try { Invoke-WebRequest -Uri "http://127.0.0.1:18080" -UseBasicParsing -TimeoutSec 2 | Out-Null; "UP" } catch { "DOWN" }
```
返回：`DOWN`

## 附加回归
- `npm run build`：通过
- `npm run test:web-gesture`：通过
- `.\.venv\Scripts\python.exe -m pytest -q`：通过（`15 passed`）

