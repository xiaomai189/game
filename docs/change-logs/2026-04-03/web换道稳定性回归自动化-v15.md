# 变更记录：Web 换道稳定性回归自动化 v15

## 基本信息
- 日期：2026-04-03
- 任务/PRD：`docs/rpd/2026-04-03-web换道稳定性回归自动化-v15.md`
- 负责人：Codex

## 改动内容
- `scripts/test-web-gesture-state.mjs`
  - 新增 Playwright 回归脚本，自动拉起 `web/` 静态服务并执行换道关键路径断言。
- `package.json`
  - 新增命令：`test:web-gesture`。
- `README.md`
  - 增加回归测试命令说明。

## 改动原因
- 将 v13 的关键交互规则固化为可重复执行的自动化回归，降低后续回归风险。

## 验证结果
- 构建：通过
  - `npm run build`
- 功能：通过
  - `npm run test:web-gesture`
  - 输出：`web gesture regression passed`
- 其他测试：通过
  - `.\.venv\Scripts\python.exe -m pytest -q`
  - 结果：`14 passed`

## 证据
- `docs/evidence/2026-04-03-web-gesture-regression-v15.md`

## 备注
- `npm run build` 执行情况及说明：已执行并通过，产物输出至 `dist/`。
