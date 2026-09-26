# Agent Note: 首页 Agent 视觉选中

Status: implemented

[English](2026-09-24-home-agent-visual-selection.md) | 中文

下文的位置与行标签决策已由 [Home Agent 侧栏层级注记](2026-09-25-home-agent-sidebar-v2.zh.md)取代；本文继续记录仅用于展示的身份选择决定。

## Problem

[最初的 Workbench 身份定位](2026-09-24-workbench-home-identity.zh.md)只在 Workspace 浏览器下方放置五个文字名称，并在 Hero 标题上方放置较小的 Main Operator 标记。用户无法迅速区分角色，也看不到当前选中成员。把这些身份继续作为侧栏内另一组通栏列表展示，也会混淆 Harness 导航与首页团队的层级。此 UI 尚无运行时 Agent 选择能力，因此视觉测试不能暗示任务已经切换执行者。

## Decision

五个首页身份是仅在当前会话为空白或不存在时显示的展示控件。每行都是带 `aria-pressed` 的按钮；选中态通过 `ui-primitives` 中仅供客户端展示的 `useSyncExternalStore` 模块更新空会话 Hero 身份。默认选中 Main Operator。该状态不创建会话、不发送指令、不选择 Agent 预设，也不写入 Job 数据。当前侧栏位置、短名称和收起轨道行为由 [Home Agent 侧栏层级注记](2026-09-25-home-agent-sidebar-v2.zh.md)负责。

Hero 在原有品牌标记 slot 外包一层 72px 身份表面，位置仍在未改动的标题上方。Slot 占位者继续由部署方决定；本地回退仍为鱼形标记。选中其他成员只改变 Hero 的可见标签和标记外围样式。标记仅有低频待机缩放动作，`prefers-reduced-motion` 会禁用它。

## Alternatives considered

**将研究用 Grok Bot SVG 或引擎复制进客户端包。**隔离研究资产没有确认产品复用权，本次改动不把它放进 MIT 分发包。

**立即增加运行时 Agent 选择服务。**本次视觉身份测试不需要任务执行行为，新服务会模糊展示状态与 Agent 预设的界限。

**替换 Harness 首页布局。**现有侧栏、标题、Workspace 选择器和常驻输入区已明确持有导航与输入职责；改动其几何布局会超出身份升级范围。

**继续把团队成员做成第二组导航行。**通栏选中态会让成员看起来与 Harness 功能入口平级，但成员实际只改变首页展示身份。

## Consequences

首页提供五个可通过键盘选择的视觉身份，同时保留 Harness 输入与运行时 Agent 选择行为。各角色的吉祥物资产尚未获准再分发；选中态仅存在于当前页面，刷新后返回 Main Operator。
