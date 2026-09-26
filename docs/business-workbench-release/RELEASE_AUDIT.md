# Business Workbench 公开源码边界

快照日期：2026-09-26。来源：DeepSeek Harness `master` 的 `4aaefd40e10b067a27b32f606b45ca10b78faba2`，加上当时经过筛选的工作树。上游对照提交：`b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`。本仓用新的初始提交公开文件，不发布本机 Git 历史。

## 已包含

- 上游 Harness 的完整源码与 MIT、vendored 许可、第三方通知。
- `packages/business/business-workbench/` 的 Host 业务插件和相关测试。
- `packages/client/ui-sidebar/`、`ui-conversation/`、`ui-primitives/` 的空会话 Workbench 身份层。
- `desktop/macos/` 的本地 Shell 源码。
- 五个自主绘制的字母占位 SVG，保持 Workspace 图像插槽可运行。

## 已排除

- 本地 `.dsh/`、`.firecrawl/`、`~/.dsh/`、私人 Session、Credential、附件与业务 Vault。
- `outputs/` 中的静态设计稿、文章截图和研究副本。
- Grok/Grok Bot 派生图形、39 状态引擎、Rive、动画与外部字体文件。
- 本机 Git 历史及未经筛选的未跟踪文件。

## 当前限制

- 五个左侧 Workbench 入口只是空会话的视觉身份选择，不启动业务任务；正式的 Projects、Work、Radar、Studios 页面尚不存在。
- Business Workbench 插件仅在 Host 运行，没有正式 Remote/Web UI。截图中的 Dashboard 和完整业务链仍是静态示意。
- macOS Shell 曾按本机环境开发；公开快照去除了私人绝对路径，但 App 打包安装尚未作为通用流程验证。
- 小红书业务真源、Provider 凭据和真人审核不随仓库提供。运行真实业务需要用户自行配置合法的数据源、权限和 Provider。

## 许可与发布要求

根源码为 MIT；保留 `LICENSE`、vendored 许可与 `THIRD_PARTY_NOTICES.md`。代码许可不覆盖第三方商标、模型权重、角色形象和文章截图。占位 SVG 由本次发布制作，可作为本仓代码资产使用。正式二进制发行前仍需逐项核对 npm、Python 和语音模型的许可。
