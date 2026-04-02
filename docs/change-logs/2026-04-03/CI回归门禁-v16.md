# 变更记录：CI 回归门禁 v16

## 基本信息
- 日期：2026-04-03
- 任务/PRD：`docs/rpd/2026-04-03-CI回归门禁-v16.md`
- 负责人：Codex

## 改动内容
- `.github/workflows/ci.yml`
  - 新增 CI 工作流：安装 Python/Node 依赖与 Playwright Chromium。
  - 执行门禁：`pytest -q`、`npm run build`、`npm run test:web-gesture`。
- `scripts/preflight.mjs`
  - 新增本地一键预检脚本，优先使用项目 `.venv` Python。
  - 串行执行：Python 单测、Web 构建、Web 换道回归。
- `package.json`
  - 新增命令：`npm run preflight`。
- `README.md`
  - 补充本地 preflight 用法与 CI 门禁说明。

## 改动原因
- 将关键验证流程固化为 CI 与本地一致的门禁，减少回归漏检。

## 验证结果
- 构建：通过
  - `npm run build`（由 `npm run preflight` 内执行）
- 功能：通过
  - `npm run preflight`
  - 结果包含：`14 passed`、`build` 通过、`web gesture regression passed`
- 其他测试：通过
  - `npm run test:web-gesture`（在 preflight 中执行）

## 证据
- `docs/evidence/2026-04-03-ci-preflight-v16.md`

## 备注
- `npm run build` 执行情况及说明：已执行并通过，输出 `dist/` 产物。
