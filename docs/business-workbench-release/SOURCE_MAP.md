# 关键代码入口

| 范围 | 文件 | 当前作用 |
| --- | --- | --- |
| Web 配置 | `packages/bundle/web-app/cordis.patch.yml` | 将 Business Host 插件挂入 Web Profile |
| Business Host | `packages/business/business-workbench/src/` | Batch、Attempt、任务卡、硬规则、Review、Revision/Retry 与修复 |
| Business 测试 | `packages/business/business-workbench/tests/` | Host 行为的无密钥测试 |
| Sidebar | `packages/client/ui-sidebar/src/client/SidebarRoot.tsx` | 空会话 Workbench 入口与原 Workspace/Session 浏览器 |
| Hero | `packages/client/ui-conversation/src/client/skeleton/EmptyHero.tsx` | Workbench 问候语与身份图形插槽 |
| 身份数据/样式 | `packages/client/ui-primitives/src/WorkspaceIdentity.tsx`、`WorkspaceIdentity.module.css` | 五个展示身份与视觉状态 |
| 开源占位图 | `apps/web/public/workspace-mascots/` | 替换无明确再分发许可的本地角色资源 |
| Desktop | `desktop/macos/DeepSeekHarness.swift`、`controlled-update.mjs` | macOS Shell 与隔离更新候选测试 |

原始 Harness 的架构、安装和测试命令见根 `README.md`、`docs/architecture.md` 和 `docs/testing.md`。具体 Business 能力与未完成部分见 `packages/business/business-workbench/README.md`。
