# Agent Note: AI Workspace 侧栏导航

Status: implemented

[English](2026-09-25-ai-workspace-sidebar-navigation.md) | 中文

## Problem

以 Main Operator、Workflow Agent、Review Agent、Visual Agent 和 Archive Agent 命名的吉祥物身份，会让首页分组看起来像员工名册；实际上，选择入口只会改变本地 Hero 呈现。

## Decision

空白会话 Home 是默认主视图，不另设 Home 导航按钮。“新会话”之后显示五个 AI Workspace 入口和默认折叠的“更多能力”。展开后显示工作区、任务看板、SSH 与技能中心；侧栏实际承载的只有 Workspace 与 Session 浏览器，其余标签指向现有会话内或设置入口，不新增路由。非空 Session 会隐藏 Home 入口与“更多能力”，但保留原生浏览器用于会话导航。设置仍固定在底部。

选择 AI Workspace 入口只会改变本地选中状态和空会话 Hero 的 Mascot。Command 是默认入口。Hero 使用私人问候语，不显示身份名称或预览标签。该选择不会打开或切换运行时 Workspace、创建会话、发送指令或修改 Job 数据。侧栏展开时入口显示 64px Mascot，不带方块底或常驻名称；悬停显示名称提示，选中时增加浅色身份底与身份色左侧条。收起轨道将标记缩小至 44px。Mascot SVG 主体直接使用 Command 蓝、Projects 翡翠绿、Work 橙、Studios 紫罗兰和 Radar 青绿色，不使用 CSS 滤镜改色。资产复用权仍未确认。本决策取代早期的 [Home Agent 侧栏层级记录](2026-09-25-home-agent-sidebar-v2.zh.md)。

## Alternatives considered

**保留 AI Team 标签和成员语义。**这种表达会暗示存在五位员工，与实际仅选择首页展示身份的行为不符。

**移除吉祥物身份。**所需的一级 Workspace 入口需要视觉身份；保留现有标记可以延续识别，同时不改变资产内容或渲染值。

**在每个活跃 Session 中保留 Home 分组。**这些入口没有目标路由，而原生 Workspace 与 Session 浏览器已经提供真实的会话导航；在对话中继续显示 Home 分组会混淆两种不同作用。

**替换原生 Workspace 与 Session 浏览器。**该组件负责真实的 Harness 浏览行为，因此继续与这些本地展示选择器分离。

**在每个 Mascot 后保留彩色方块。**标记本身已经携带身份色；移除重复的方块底能保持图标清楚，也避免每个 Home 入口都变成彩色按钮。

**始终展开所有 Harness Tools。**原生 Workspace 浏览器继续用于会话导航；任务看板、SSH 与 Skills 属于次级能力入口，可收在同一个 disclosure 内。

**另建一套 Workbench 首页。**Harness 首页已经持有输入区、Workspace 选择器、附件、模型选择、权限和语音交互；第二个首页会重复这些控件。

**另设 Home 导航按钮。**空白会话默认显示 Home 分组；再加按钮会在命令框之前增加冗余入口。

**导入研究过的吉祥物引擎。**其源代码没有已确认的产品复用权，静态本地标记已足以表达 Workspace 身份。

## Consequences

侧栏与 Hero 共用一个客户端本地 Workspace 身份选择器。五个入口为 Command、Projects、Work、Studios 和 Radar；它们不会选择运行时 Workspace 或 Agent。Home 内折叠的“更多能力”是能力索引，不是新增路由；任务看板、SSH 与 Skills 控件仍由现有会话或设置页面持有。原生 Workspace 与 Session 浏览器、设置、编辑器和对话界面继续由原有组件负责。

## Testing

侧栏测试固定 Home 层级、五个 AI Workspace 入口、“更多能力”的折叠状态与展开标签、选择行为、原生 Workspace 浏览器可用性，以及非空 Session 中隐藏 Home 控件的行为。Hero 测试固定默认 Command 问候语和 Mascot 选择行为。基础组件测试固定五种吉祥物轮廓和本地展示状态行为。
