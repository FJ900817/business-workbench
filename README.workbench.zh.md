# Business Workbench 源码快照

这是基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) MIT 许可制作的独立源码快照，不是 DeepSeek 官方发行版。代码来源是 2026-09-26 本地 `master` 提交 `4aaefd40e10b067a27b32f606b45ca10b78faba2` 与当时经审查的未提交工作树；上游对照提交为 `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`。本仓以新的初始提交发布，不携带本地私人 Git 历史。

## 能运行什么

- Harness 原有 Web、Session、Workspace、模型、工具和 Composer。
- 空会话首页的 Business Workbench 身份层：Command、Projects、Work、Studios、Radar，点击只改变呈现，不会启动业务 Job 或进入独立页面。
- `packages/business/business-workbench/` 的 Host 业务插件：Batch、Attempt、小红书任务卡与明确规则检查、Review Artifact、Revision/Retry 和局部长度修复。该插件尚无正式 Web Remote/UI。
- `desktop/macos/` 是本地 macOS Shell 源码；当前不是可直接安装的正式 App 包。启动它之前需构建 Web，并用 `DSH_REPO_PATH` 指向当前源码目录。

**尚未实现：**可操作的 Dashboard、Radar、Studios、完整小红书生产链的 Web 页面与真实数据接线。旧 Direction A 页面和文章配图是静态演示，没有并入本仓。

## 从源码启动 Web

需要 Git、符合根 `package.json` `engines` 的 Node、pnpm。根目录声明 `pnpm@11.7.0`。

```sh
git clone https://github.com/FJ900817/business-workbench.git
cd business-workbench
pnpm install
pnpm run build
pnpm dsh web --no-open
```

打开 `http://127.0.0.1:3080`。模型调用需要自行配置 Provider 凭据；不要将 `.env`、`~/.dsh`、私人 Session 或工作资料提交到仓库。建议为实验指定隔离的 `DSH_HOME`，并使用最小 Workspace 目录。Workspace 不是操作系统沙箱。

## 开源资产处理

公开版本用五个原创的字母占位 SVG 替代了本地原型中的 Grok 派生角色。占位图位于 `apps/web/public/workspace-mascots/`；它们只用于保持 UI 插槽可运行，并非正式品牌形象。本仓不含原角色、动画引擎、39 状态资源、个人 `outputs/`、私人 Vault 或本地配置。根 `LICENSE`、vendored 许可和 `THIRD_PARTY_NOTICES.md` 应随源码保留。

## 验证与限制

本地原工作树曾通过 `pnpm run typecheck`、`pnpm run lint`、`pnpm run doc-sync` 与五个定向测试文件共 98 个测试。公开快照替换了视觉资产并移除了私人路径，发布前还须对快照本身重新验证。Desktop 安装器目前仍依赖既有 `.app` 骨架和编译好的可执行文件，不能作为一键安装说明。

更多当前实现和限制见 `packages/business/business-workbench/README.md`、`desktop/macos/README.md` 与 `docs/architecture/`。
