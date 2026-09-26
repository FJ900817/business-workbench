# Agent Note: Harness 首页中的 Workbench 身份层

Status: implemented

[English](2026-09-24-workbench-home-identity.md) | 中文

## Problem

Harness 空会话首页已经拥有 Workspace 选择器和常驻输入区。另建 Workbench 首页会重复这些控件，并使两个入口逐渐分化。拟使用的 Grok Bot 复刻资源也没有得到可并入产品的权利确认。

## Decision

侧边栏外壳在 Workspace 浏览器下方、原有页脚上方渲染 AI Team 身份区域。后续[视觉选中决策](2026-09-24-home-agent-visual-selection.zh.md)增加纯展示点击状态；V1.0 使用五种静态 Grok 派生轮廓和四种本地展示状态，仍不会使这些行成为 Agent 预设控件。V1.1 精修角色的光学尺寸和外轮廓，为选中行增加柔和底色与窄标记，并为 Hero 和选中团队角色加入低频待机轻动效。该区域只在展开侧边栏时出现，不改变收起轨道和原导航控件。

空会话 Hero 会在不变的标题上方显示所选 Agent 吉祥物和名称，默认身份为 Main Operator。`conversation.hero.brand.mark` 仍保留为显式部署覆盖 slot；官方品牌包不再以 Harness 鱼形品牌图覆盖角色吉祥物。身份行位于标题布局高度之外，因此 Workspace 行和常驻输入区保持原位置。InputBar、它的能力 slot 和 macOS 语音挂载均未修改。

## Alternatives considered

**将完整 Grok Bot 引擎引入 UI 包。**没有许可依据，且会将动画引擎与其依赖一并带入可发布包，因此只在工作树中使用五个静态派生 SVG，明确限制为本地原型；该资源仍未获准用于发布或商业再分发。

**将五个名称做成运行时 Agent 选择器。**本轮没有归属明确的 Agent 选择操作；点击目标不能暗示 Harness 已切换执行预设。后续视觉选中决策将点击限制在展示层。

**在 Harness 首页旁边另建 Workbench 首页。**这会重复常驻输入区及其 Workspace、附件、模型、权限和语音交互。

## Consequences

首页保留 Harness 导航和输入行为。五个轮廓（blob、capsule、crystal、wedge、cloud）各有角色色；idle、thinking、working、complete 是不连接运行时的演示状态，且所有成员默认 idle。V1.1 的呼吸与状态点脉冲由 CSS 实现，频率低，并在 `prefers-reduced-motion` 下停用；它们不表示运行时状态。图像来自没有复用许可证的 Grok Bot 复刻资源，未获批准前不得作为可分发或商业产品资产发布。后续产品版本应以自有授权素材替换这些派生文件。
