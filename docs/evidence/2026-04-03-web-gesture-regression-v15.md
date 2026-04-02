# 证据：Web 换道稳定性回归自动化 v15

## 证据类型
- 自动化命令执行证据（Playwright 关键路径断言）。

## 执行命令
```powershell
npm run test:web-gesture
```

## 结果
- 命令输出：`web gesture regression passed`
- 覆盖断言：
  - 左手即时切左。
  - 锁定窗口内反向输入被阻断。
  - 锁定结束后反向输入生效。
  - 双手放下约 30ms 回中。
  - stale 输入冻结换道。
