# Business Workbench UI Architecture V0.1

[English](business-workbench-ui-architecture-v0.1.md) | 中文

本文提出 Business Workbench UI 的三年产品架构方向，供人工审核。它定义信息组织、页面职责、数据映射和扩展方式，不表示相关页面已经实现，也不授权修改现有业务流程。

## 1. 产品定位

**核心定位：Business Workbench 是面向可审计 AI 生产流程的多项目操作系统，把业务真值、AI 执行、人工决策、产物和证据组织成可追溯、可恢复、可扩展的生产闭环。**

它解决的不是“怎样再做一个聊天入口”，而是 AI 生产进入真实业务后出现的五类问题：任务身份和业务真值分散、执行状态不可见、人工审核缺少明确入口、产物版本与来源难以追踪、失败与恢复缺少受控边界。

| 对比对象 | 主要工作方式 | Business Workbench 的区别 |
|---|---|---|
| ChatGPT 聊天窗口 | 以对话为中心，结果主要存在于消息历史 | 以项目、工作流、任务、产物和审核证据为中心；对话可以是入口，但不是业务记录本体 |
| Claude Code 等编码代理 | 以代码仓库和开发任务为主要操作对象 | 面向内容、视觉、咨询和企业交付等业务生产，核心对象不是代码 diff，而是受约束的业务 Artifact |
| 普通自动化工具 | 强调触发器、连接器和步骤编排 | 除执行外，还管理业务真值、人工 Gate、版本 lineage、失败退出和可审计证据 |
| SaaS 后台 | 围绕固定业务表单和 CRUD 管理 | 围绕动态生产生命周期组织信息，同时保持严格业务约束和人工控制 |

Workbench 的产品单位是“一个可追踪的生产任务”，不是一轮对话。其价值来自可见的状态、可验证的产物、明确的人工决定和受控的下一步。

## 2. 信息架构

```text
Business Workbench
├─ Project layer
│  ├─ Home / Dashboard
│  ├─ Projects
│  │  ├─ Project Overview
│  │  ├─ Workflow Detail
│  │  └─ Project context and business-truth entry points
│  └─ Cross-project work queue
├─ Production-capability layer
│  ├─ Workflows
│  ├─ Review Center
│  ├─ Artifact Center
│  └─ Studios
│     ├─ Cover Studio
│     └─ Image Studio (reserved)
└─ System layer
   ├─ Runtime health and recovery
   ├─ Capability, template, and Runtime versions
   ├─ Integrations and Providers
   ├─ Gates, policy, and permissions
   └─ Audit and settings
```

项目层回答“正在为谁生产、目标是什么、现在进行到哪里”。生产能力层回答“怎样执行、审核和管理产物”。系统层回答“由哪些受控能力运行、系统是否健康、规则和证据在哪里”。三个层级不能混合：项目不拥有 Renderer 实现，Studio 不定义业务真值，系统设置不替代项目审核。

## 3. 一级导航

第一版采用稳定的全局左侧导航，加项目切换器和上下文顶部栏。一级导航不出现“小红书笔记”“公众号文章”等渠道专用名称。

| 一级入口 | 层级 | 职责 |
|---|---|---|
| 首页 | 项目层 | 聚合待办、阻断、审核、最近完成和系统健康信号 |
| 项目 | 项目层 | 浏览项目组合并进入单个 Project Overview |
| 工作流 | 生产能力层 | 跨项目查看运行中、等待人工、失败和已完成的 Workflow / Job |
| 审核 | 生产能力层 | 处理所有需要人作出明确决定的 Review 与 Gate |
| 产物 | 生产能力层 | 查找、预览和追溯 Artifact、版本、SHA 与 lineage |
| Studio | 生产能力层 | 进入 Cover Studio；为 Image Studio 和后续专业工作区保留扩展位 |
| 系统 | 系统层 | 查看运行状态、能力版本、集成、策略和审计；普通生产用户默认折叠 |

项目切换器只改变当前范围，不改变页面类型。用户可从全局队列进入某项工作，也可在项目上下文内查看同一页面的过滤结果。

## 4. 页面地图与职责

### PAGE 1：Dashboard

Dashboard 是“今天需要注意什么”的工作入口，不是数据大屏。首屏按优先级展示：等待我审核、被 Gate 阻断、运行中任务、最近完成产物和运行健康。每项必须回答当前状态、原因、责任人或责任阶段、可执行的下一步，并可进入相应详情。

Grok Bot 在此提供简短的生产态势说明，但不制造独立聊天流，也不替代原始状态和证据。

### PAGE 2：Project Overview

Project Overview 展示项目身份、业务目标、启用的生产能力、当前生产周期、主要工作流、待审核事项和最近产物。项目可以是“小红书虚拟产品”“公众号内容工厂”或“B 端咨询交付”，页面骨架不随渠道变化。

渠道专属内容通过项目能力卡片和工作流定义进入，例如小红书显示正文生产与封面路线，公众号可显示长文、配图和发布预览。项目页只引用业务真值来源，不在 UI 内复制另一套真值。

### PAGE 3：Workflow Detail

Workflow Detail 是单个任务生命周期的主视图。它以时间线或节点图展示 Workflow、Job、Attempt、Gate、Review 和 Artifact 的关系，并突出当前节点、输入、输出、失败原因、恢复资格和下一步。

页面默认显示业务语言；执行参数、Runtime 版本、请求摘要和 SHA 放入 Evidence Context Panel。失败状态必须保留真实结果，不能把重试或修订显示成对原失败的覆盖。

### PAGE 4：Review Center

Review Center 是人工控制 AI 的正式入口。它提供待审核队列、来源锁定、前后版本对比、约束检查、审核意见和明确决策。审核行为必须绑定 source Job、Attempt、Artifact SHA 和 Review 类型。

Review Center 不通过“聊天回复”隐式表达批准。批准、要求修改、阻断和拒绝必须是清晰、可审计、作用范围有限的决定；系统同时展示该决定会解锁或阻断的下一节点。

### PAGE 5：Artifact Center

Artifact Center 管理产物而非普通文件。每张 Artifact Card 展示类型、项目、来源任务、版本、状态、创建时间、SHA、预览能力、lineage 和是否具备晋升资格。

用户可以在详情页查看文件、图片、Markdown、Output Bundle、Renderer 结果和历史版本。删除、覆盖和晋升属于独立受控动作；第一版以只读追溯和预览为主。

### PAGE 6：Cover Studio

Cover Studio 展示正文到封面的确定性交接：正式正文、`title_pair_contract`、模板路由、Cover Plan、P1-P8 页面、图片槽位、Renderer 结果、Gate 和 Baseline 对比。

Swiss 与 Editorial 是模板家族和路由结果，不是两个独立产品。Studio 不允许 AI 自由改变模板序列，也不承担素材生成。它消费已选择的素材，并调用 Certified Cover Renderer 进行稳定合成。

### PAGE 7：Image Studio（预留）

Image Studio 负责创造和选择素材，包含图片需求解析、Prompt 版本、多模型生成、候选对比、人工选择和素材资产沉淀。其正式输出是“已选择且带 lineage 的图片 Artifact”，由 Cover Studio 和 Renderer 消费。

Image Studio 不是 Renderer。前者处理生成的不确定性和人工选择，后者根据固定模板、字段和素材稳定生成最终页面。两者之间通过明确的素材任务、槽位身份、文件 SHA 和批准状态交接。

## 5. 可扩展项目模型

新增公众号项目时，以下页面直接复用：Dashboard、Project Overview、Workflow Detail、Review Center、Artifact Center、系统层页面、Grok Bot 状态表达，以及 Job、Artifact、Review、Gate 的可视化组件。

需要新增的是公众号自己的工作流定义、任务合同、文章类型规则、长文预览和渠道专属 Studio。若需要文章排版或公众号头图，可在 Studio 下注册 Article Studio 或 Publishing Preview，而不是新增一套全局导航。

扩展遵循三条原则：项目声明它启用的能力；能力通过已有业务服务提供数据和动作；UI Shell 只根据能力清单组合页面。新增渠道不得改变 Job、Artifact、Review、Gate 的通用含义，也不得把渠道字段提升为全局字段。

## 6. 数据映射

UI 不重新定义业务数据，也不直接写持久化文件。它读取现有服务的查询投影，并通过现有受控命令触发动作。

| 现有业务对象 | UI 表达 | 主要出现位置 |
|---|---|---|
| Project | 项目上下文、目标、能力和生产状态 | Dashboard、Project Overview |
| Workflow | 生产流程定义与实例进度 | Project Overview、Workflow Detail |
| Job | 一项有明确身份的生产工作 | Dashboard、Workflows、Workflow Detail |
| Attempt | 一次不可变执行及其结果 | Workflow Detail、Evidence Panel |
| Artifact | 可预览、可追溯的生产产物 | Artifact Center、Review Center、Studios |
| Review | 人工判断、意见和批准范围 | Review Center、Workflow Detail |
| Gate | 是否允许进入下一阶段的确定性结果 | 全局 Status、Workflow Detail、Studios |
| Renderer Result | 页面 PNG、Manifest、验证结果和 Runtime 身份 | Cover Studio、Artifact Center |
| Baseline / Contract identity | 回归基准和验收依据 | Cover Studio、System、Evidence Panel |

列表和首页可以使用只读索引提高检索效率，但索引不是新的业务真源。UI 不根据视觉状态猜测 Gate，不根据文件存在推断审批，也不把前端草稿当作 Artifact。

## 7. AI Mascot：Grok Bot

沿用已经确认的 Grok Bot 形象，不重新设计角色。它的正式定位是 **AI Workbench Assistant / Digital Operator**：让系统状态更易理解，提示用户关注异常和下一步，但不成为聊天机器人或决策代理。

| 状态 | 含义 | 典型位置 |
|---|---|---|
| `idle` | 当前无紧急事项，提示可继续的工作 | Dashboard 空闲区、项目概览 |
| `thinking` | AI Job 正在执行，展示阶段而非伪造进度 | Workflow 当前节点 |
| `awaiting_review` | 系统已完成工作，等待人工决定 | Dashboard、Review Center |
| `alert` | 存在需要关注但可处理的异常 | 项目卡、Workflow Detail |
| `blocked` | Gate 明确阻断，必须查看原因 | Workflow、Studio 验收区 |
| `success` | 一个受控阶段完成，不表示整个项目完成 | 完成反馈、Artifact 生成结果 |

Mascot 只能补充状态文字，不能替代状态标签、错误原因或审核按钮。关键审批场景减少动画和情绪表达；所有状态具备文字与无障碍标签，不能仅靠表情或颜色传递。

## 8. 视觉设计系统方向

视觉语言定义为“安静的创作运营空间”：以内容和产物为主角，以轻量层次表达生产状态，避免传统 ERP 的密集表格和技术控制台感。

- 画布：偏暖的低对比中性色，详情与预览使用清晰分层，不依赖大面积阴影。
- 色彩：品牌紫用于当前焦点和 AI 活动态；绿色只表示已验证；琥珀色表示待处理；红色仅表示阻断或破坏性操作。
- 排版：标题清晰、正文舒展、技术证据使用等宽字体；业务信息和工程证据有明显视觉层级。
- 密度：首屏保持克制，通过折叠、Context Panel 和 Evidence Drawer 渐进呈现细节，不把所有字段铺成表格。
- 预览：Markdown、图片和页面产物优先获得大面积画布；元数据围绕预览组织。
- 动效：只用于状态变化、节点推进和面板关系，时间短且可关闭；不把等待动画伪装成真实进度。

参考 Linear 的状态清晰度、Notion 的内容空间、Figma 的对象与属性关系、Raycast 的快速操作感，但不复制任何一套外观。Workbench 自身的识别来自“生产时间线 + Artifact 预览 + Evidence Context”的组合。

## 9. 组件系统与布局原则

全局复用组件包括 `Card`、`Status`、`Timeline`、`Preview`、`Review Block`、`Artifact Card`、`Workflow Node`、`Gate Row`、`Diff View` 和 `Evidence Drawer`。它们表达稳定业务概念，不包含小红书字段。Cover Page Grid、Image Candidate Grid 等属于 Studio 内部复合组件。

页面采用四区结构：左侧全局导航、顶部项目与环境上下文、中央主工作区、右侧可折叠 Context Panel。使用规则如下：

- 详情页用于需要独立 URL、深度生命周期或可共享上下文的对象，例如 Job、Artifact 和 Review。
- 右侧栏用于在不离开当前任务时查看来源、Gate、元数据和轻量操作。
- 弹窗只用于短确认、单一选择和破坏性操作复核；长文审核、diff、lineage 和失败诊断不得放进弹窗。
- 双栏或三栏布局用于“来源—候选—审核”这类必须同时比较的任务，移动端第一阶段只保证只读查看，不承诺完整生产操作。

## 10. 第一阶段开发范围

待本设计获人工确认后，第一阶段只建设支持当前已验证业务链路的通用 UI 骨架：应用 Shell 与项目切换、Dashboard、Project Overview、Workflow Detail、Review Center、Artifact Center、Cover Studio 的只读证据与预览，以及 Image Studio 的占位入口和接口说明。

小红书虚拟产品作为首个 Project Adapter 接入，但页面继续使用 Project、Workflow、Job、Artifact、Review 和 Gate 等通用对象。第一阶段不建设自由工作流设计器、不接生图模型、不做发布平台、不改 Business Workbench 数据合同，也不把 Grok Bot 做成开放聊天入口。

第一阶段验收重点是：用户能看懂一项任务为何处于当前状态，能找到它的输入、产物、审核和失败证据，能在正确位置作出受控人工决定，并且不会因 UI 展示产生新的业务真值。

## 11. 后续扩展路线

| 阶段 | 目标 | 主要增量 |
|---|---|---|
| V0.1 | 可见、可审、可追溯 | 通用 Shell、七类核心页面、小红书项目适配、Cover Studio 只读能力 |
| V0.2 | 可控执行与素材闭环 | 受控动作、晋升流程、Image Studio、多模型候选与素材选择 |
| V0.3 | 第二类业务验证 | 公众号 Project Adapter、长文与发布预览，验证页面和组件复用率 |
| V1 | 多项目生产平台 | 能力注册、跨项目队列、角色权限、策略配置、项目模板 |
| 三年方向 | 企业级 AI 生产工作台 | 业务组合视图、跨项目资产复用、治理审计、企业交付和可插拔 Studio 生态 |

每次扩展优先新增 Project Adapter、Workflow 定义或 Studio 能力；只有通用业务对象发生真实变化时才修改全局信息架构。

## 12. 待人工确认

进入开发前需要确认五项产品决策：核心定位是否成立；七个一级入口是否足够；项目切换器是否作为全局范围控制；Review Center 是否成为唯一正式人工决定入口；Image Studio 与 Renderer 的职责分离是否按本文执行。确认前不创建页面、组件、按钮或数据绑定。
