# Workbench 封面系统迁移设计 V0.1

[English](workbench-cover-system-migration-v0.1.md) | 中文

本文是现有 Obsidian S15/G3.10 小红书封面系统迁移到 Business Workbench 的设计参考。范围止于规则映射、执行节点、数据归属和等价性验证；不包含代码实现、生图 Provider 接入、图片生成、正文链修改或 Obsidian 写入。

## 审计依据

本设计基于 2026-09-10 机器上的活跃 S15/G3.10 文件和 Business Workbench 源码，Workbench HEAD 为 `4aaefd40e10b067a27b32f606b45ca10b78faba2`。下列 Obsidian/S15 路径均相对于 `<PRIVATE_XHS_VAULT_ROOT>/`。

主要 Obsidian/S15 依据如下：

- `03 项目生态【生命体】/项目-小红书/01_小红书生产创作系统/00_系统总控/新版封面系统与笔记创作系统接口交接说明_V1.0.md`
- `.agents/skills/S15-封面设计-G3.10/SKILL.md`
- `.agents/skills/S15-封面设计-G3.10/00_系统核心/02_正式Skill/routing/routing_matrix.json`
- `.agents/skills/S15-封面设计-G3.10/00_系统核心/02_正式Skill/config/formal_selection_map.json`
- `.agents/skills/S15-封面设计-G3.10/00_系统核心/02_正式Skill/contracts/P1-P8页面设计契约总表.json`
- `.agents/skills/S15-封面设计-G3.10/00_系统核心/02_正式Skill/contracts/P1-P8图片槽位契约.json`
- `.agents/skills/S15-封面设计-G3.10/00_系统核心/02_正式Skill/rules/热点流量型_Editorial共享封面生产规范_V1.0.md`
- `.agents/skills/S15-封面设计-G3.10/00_系统核心/02_正式Skill/rules/干货型_Swiss共享封面生产规范_V1.0.md`
- `.agents/skills/S15-封面设计-G3.10/00_系统核心/01_正式模板库/template_library_index.json`

这些文件必须作为迁移输入建立不可变快照。只复制文件名或版本号不足以证明规则一致，执行包还必须记录源文件 SHA-256、模板树 Hash 及其 Hash 算法标识。

本次审计观察到的关键 SHA-256 为：接口说明 `208a5fd5d05e578b0b26eb6aba642d24a2c495c04c52c3b415564801d0384486`、路由矩阵 `67a05e4403ab005cbd2f952bd81d40e2e09ff0cb4481933eef04161f076d395e`、正式模板选择映射 `39574135d483773f11b4a5ce3b2550dc35f8f3f28e4a76f2f75aaf269abd4cd6`、页面设计契约 `f884204fcb95cce71bbe3632834525f4455f23be09d0f05828bebc0329033d03`、图片槽位契约 `ada238ebda97419e56564905da7fac75c10ad24b7ca3c7a3196384021bf4fbd0`。这些值只标识本次分析输入，后续实施必须重新冻结而不能硬编码为永久版本。

## A. Obsidian 现有封面流程

### 正式执行顺序

现有封面系统采用“终稿后接管”：系统二任务卡经人工确认后由系统一/S3生成《小红书笔记完整方案.md》，人工确认终稿并写入 `content_status=final` 和非空 `finalized_at` 后，S15/G3.10 才能开始。S15 不读取任务卡作为正式业务输入，也不得在终稿字段缺失时回退到任务卡猜值。

```text
正文终稿与终稿确认
→ 建立 G3.10 任务和终稿快照
→ note_type 确定模板家族与模板版本
→ 拆分 P1-P8、生成文案和换行合同
→ 使用真实模板生成无素材框架预览
→ 人工确认内容和视觉方向
→ 生成 image_tasks.json 与素材提示词
→ 人工确认素材方向
→ 生成素材并形成联系总览
→ 人工确认素材
→ 锁定素材并注入固定模板
→ Playwright/Chromium 渲染 P1-P8
→ 校验并生成 production_manifest 与执行报告
→ 人工视觉终审
→ S6 发布同步
```

未经框架确认不得生成素材，未经素材确认不得渲染最终 PNG，技术渲染通过不得代替人工视觉通过。

### 终稿输入

唯一必需业务输入是人工确认后的《小红书笔记完整方案.md》。必需信息包括产品、账号、轮次、`note_id`、`note_type`、最终标题、完整正文、对外事实与结论、品牌或产品名称、CTA、正式话题、`content_status=final` 和非空 `finalized_at`。标题配对信息、真实图片、证据来源、不可改写词和视觉规避方向可以作为可选输入，但缺失时不得补造事实。

S15 生成自己的 `task_id`。迁入 Workbench 后必须同时保留 Workbench Job ID 和 S15 业务 `task_id`，二者不得互相替代。

### 模板路由

Workbench 使用 `hot-traffic`、`dry-search`、`recommendation`，S15 使用 `hot_traffic`、`search_solution`、`recommendation_conversion`。迁移适配器必须执行下列封闭映射，不得模糊匹配或由 AI 选择。

| Workbench note_type | S15 note_type | 模板家族 | 模板版本 |
|---|---|---|---|
| `hot-traffic` | `hot_traffic` | Editorial | `V1_1_Editorial_Clean` |
| `dry-search` | `search_solution` | Swiss | `V2_1_Swiss_Purple_QingYa` |
| `recommendation` | `recommendation_conversion` | Swiss | `V2_1_Swiss_Purple_QingYa` |

Editorial 的 P1-P8 模板固定为 `M01, M02, M03, M05, M06, M07, M09, M15`。Swiss 的 P1-P8 模板固定为 `S01, S02, S06, S05, S03_G3.7-B_POSTER, S10, S07, S12`。历史 Editorial `V1` 和 Swiss `S04/S08/S09/S11` 只能识别历史记录，不得进入新生产。

Editorial 的 `visual_route` 只能从 `brand_campaign`、`brand_visual_system`、`master_design_philosophy_concept`、`brand_evolution_timeline` 中选择；Swiss 的路线分别固定为 `search_solution` 或 `recommendation_conversion`。`visual_route` 不得改变模板家族、版本或 P1-P8 映射。

### P1-P8 页面职责

| 页面 | Editorial 热点流量型 | Swiss 干货搜索型 | Swiss 干货推荐型 |
|---|---|---|---|
| P1 | 强冲突封面，只保留一个核心矛盾 | 问题与直接答案 | 推荐对象、适用人群与价值 |
| P2 | 真实场景和第一视觉证据 | 错误认知与真正原因的对照 | 普通选择与有逻辑选择的对照 |
| P3 | 核心判断及其理由 | 三步解决框架 | 三步推荐或筛选框架 |
| P4 | 关键检查点、问题或判断清单 | 三条卡点或风险 | 三条避坑和不适合情形 |
| P5 | 四图证据墙，四个切面同一视觉体系 | 真实案例或视觉证据 | 真实产品、资源、案例或结果 |
| P6 | 阶段归纳和结构化结论 | 六组判断指标 | 六组判断维度 |
| P7 | 单一强观点或传播金句 | 三组修正动作或结论 | 三组使用建议或结论 |
| P8 | Before/After 收口，不增加新观点 | 八格行动矩阵和总结 | 八格收藏矩阵和自然承接 |

页面必须依次承接前一页并向后一页交付信息。P8 只收束已有内容，不得开出新的知识分支。

### 文案槽位

模板 DOM、选择器、固定文案、字号、颜色和版式以正式模板、`field_map.json`、`injection_contract.json` 和页面设计契约为准。AI 只能提供允许写入的字段值，Host 只能使用 `textContent` 或受控素材路径注入，禁止 AI 或注入器写 HTML、CSS、`innerHTML` 或固定字段。

| 页面 | Editorial 可写必填槽位摘要 |
|---|---|
| P1 | 主标题、副标题、摘要、主图 |
| P2 | 主标题、摘要、一个正文项、主图 |
| P3 | 主标题、关键判断、三个正文项、主图 |
| P4 | 主标题、五组条目标题与正文、摘要 |
| P5 | 主标题、四条图片说明、四张图片 |
| P6 | 主标题、摘要、四组条目标题与正文、关键判断 |
| P7 | 主标题、摘要、一个正文项 |
| P8 | 主标题、Before/After 两组标题及各三条内容 |

| 页面 | Swiss 可写必填槽位摘要 |
|---|---|
| P1 | 主标题、摘要 |
| P2 | 主标题、四个对照正文项、摘要 |
| P3 | 主标题、三组流程节点标题与正文 |
| P4 | 主标题、三组警示标题与正文 |
| P5 | 主标题、owner/status/format/review 四项元信息、主图 |
| P6 | 主标题、六组指标名称与数值 |
| P7 | 主标题、三组结论标题与正文、摘要 |
| P8 | 主标题、八个矩阵标签、摘要、固定主数字字段 |

Editorial 标题行数和字符合同固定：P1/P2 为两行且两行不等长，P3 为 `4+5`，P4 为单行 6 字，P5 为 `5+5` 或 `6+6`，P6 为 `5+6` 或 `6+6` 且第二行 6 字，P7 为 `6+6`，P8 为 `4+4` 或 `5+5`。Swiss P1-P8 均为严格两行；P1 第一行 5–6 字、第二行 7–8 字且第二行更长，P2 第一行 6–7 字、第二行 5–6 字，P3-P8 每行 5–6 字。浏览器实际行数是最终依据，不能靠缩字、压字距或改容器规避超限。

正文标题与 P1 标题可以不同，但必须保持同一对象、问题、答案、结论和真实数字。P1 可以压缩表达，不能创造另一个选题、添加终稿没有的承诺或数字。

### 图片槽位

| 类型 | 页面 | 槽位 | 容器尺寸 | 裁切规则 |
|---|---|---|---|---|
| Editorial | P1/M01 | `page.image.hero` | 904×565，约 16:10 | `cover`, `50% 62%` |
| Editorial | P2/M02 | `page.image.hero` | 904×638.625，约 1.42:1 | `cover`, `50% 58%` |
| Editorial | P3/M03 | `page.image.hero` | 904×565，约 16:10 | `cover`, `50% 50%` |
| Editorial | P5/M06 | `page.image.item_01` 至 `04` | 每张 439×329.25，4:3 | `cover`, `50% 50%` |
| Swiss | P5/S03 | `page.image.hero` | 920×446.59375，约 2.06:1 | `cover`, `50% 55%` |

Editorial 共 7 个素材槽位，P4/P6/P7/P8 不得强行加图。Swiss 只有 P5 单图槽，其他页面不得凭需要临时加图。素材主体必须位于 10% 边距形成的安全区；来源不明、缺失或裁切会丢失主体时停止，不得以纯色块或虚构图片填充正式成图。

Editorial 素材不得包含文字、Logo、水印、可识别软件 UI、伪文字、产品名称、Leo 签名或页码，生图模型不得直接生成完整 P1-P8 页面。Swiss P5 允许真实海报、案例图或文本海报，但来源必须明确。

### 固定禁止项

- 不得在终稿未确认时建立正式封面任务，也不得由 S15 修改终稿状态或原始终稿。
- 不得跨读任务卡补齐终稿元数据，不得补造事实、数字、案例、品牌证据或产品承诺。
- 不得让 AI 决定模板家族、模板版本、模板 ID、DOM 结构、固定栏目标签、字体、颜色、页面尺寸或素材槽位。
- 不得写入未定义字段、固定字段、HTML、CSS 或 `innerHTML`，不得修改正式模板源文件。
- 不得通过缩字、隐藏溢出、扩大容器或临时 CSS 让不合格文案通过。
- 不得在框架审核前生成素材，不得在素材审核前渲染最终 PNG，不得把技术验证等同于视觉批准。
- 不得使用 viewport/fullPage 截图；必须截取 `.poster.xhs`，找不到或尺寸无效时直接失败。
- 消费者页面不得显示内部任务 ID、模板 ID、测试编号、技术路径或内部年份标记。
- Swiss 不得使用受控英文节点词库外的词，不得为搜索型和推荐型分叉模板组件或字体规则。

### 验收规则

正式验收分为六层：终稿状态和元数据；路由及模板 Hash；P1-P8 页面和字段 Schema；标题、字符容量及浏览器实际行数；素材来源、槽位、裁切和人工批准；渲染文件数量、尺寸、字体、模板完整性、溢出、黑边和裁切。任一硬检查失败都必须保留失败状态，不能静默修正或继续下一阶段。

最终必须存在按顺序命名的 `P1.png` 至 `P8.png`、总览图、`production_manifest.json`、实际显示行数检查表和执行报告。S6 只读取终稿、八张 PNG 和有效的 production manifest。

## B. Workbench 对应节点

### 当前可以直接复用的能力

Business Workbench 已有持久化 Batch/Job/Attempt、执行租约、恢复、不可变文本 Artifact、Execution Package、读取和 Skill 白名单、来源 Hash、Review 证据、lineage、幂等和 CAS。这些能力可以承担封面任务的状态、输入快照、人工确认和失败证据。

当前实现不能直接承载封面输出：`BusinessJobType` 只允许 `xhs-body`，Agent Action 只包含正文动作，普通 Artifact 只写 UTF-8 `.md`，正文 Output Bundle 固定为三个文本文件，Review 也绑定正文 Candidate。迁移实现需要在 Business Workbench 包内增加 `xhs-cover` 类型、封面专用动作、可验证的二进制 Artifact 与多文件 Bundle、封面 Review 数据结构；不需要修改 AgentLoop、WorkflowEngine、Session 核心格式或 Harness Core。

### 节点映射

| Obsidian/S15 阶段 | Workbench 节点 | 权威输出 | 人工暂停点 |
|---|---|---|---|
| 终稿门控、快照、路由、P1-P8拆分、真实模板预审 | `xhs-cover-plan-v0` | Cover Plan Bundle | 内容与视觉方案审核 |
| `image_tasks.json`、提示词、素材生成、联系总览 | `xhs-cover-material-generate-v0` | Material Requirement/Asset Bundle | 素材方向及素材审核 |
| 锁定素材、模板注入、渲染、验证和报告 | `xhs-cover-compose-v0` | Cover Candidate Bundle | 最终视觉审核 |

`task_manifest.json` 继续作为 S15 兼容投影，但 Workbench Job 是生命周期唯一真源。Obsidian 的 `G3.10_封面任务` 目录是后续 Promotion 的投影目标，不是执行期间的状态真源。

### Workflow 05：`xhs-cover-plan-v0`

输入是已批准的正式笔记 Artifact、终稿批准证据、完整正文、`note_type`、产品模块、标题配对信息、可选真实证据和品牌素材引用，以及 S15 规则和模板快照。执行包只暴露这些文件，不允许扫描 Obsidian。

Host 先验证终稿状态、批准证据、来源 Hash、note type 映射、路由表和模板树 Hash。AI 只能从终稿提炼 P1-P8 的标题、正文、证据分配和受控视觉方向；Host 写入固定模板 ID、允许字段、实际换行、容量和图片槽位。

输出至少包括 `source_note_manifest.json`、`note_content_plan.json`、`P1-P8审核单.md`、`render_line_contract.json`、`visual_route.json`、视觉方向说明和真实模板预审引用。成功状态为 `WAITING_COVER_PLAN_REVIEW`，人工批准后形成绑定 Plan Bundle ID 与 Hash 的 Review Artifact。

验收要求是终稿来源可验证、路由唯一、P1-P8 正好八页、模板映射完全一致、字段均在允许集合内、页面职责与承接关系完整、内容不超容量、没有新增事实、预审使用真实模板和字体。任何失败都不得启动 Workflow 06。

### Workflow 06：`xhs-cover-material-generate-v0`

输入是已批准的 Plan Bundle、对应 Review Artifact、固定图片槽位定义、允许引用的真实素材和来源 Hash。直接来源必须是已批准方案，不能重新从正文生成另一套方案。

在未接入生图 Provider 的 V0.1 中，该节点只编译素材需求，输出 `image_tasks.json`、逐槽位 prompts、素材需求清单和素材 Manifest 草案，不产生图片。每项必须记录页面、槽位 ID、数量、容器尺寸、目标比例、安全区、场景、风格、核心证明点、允许事实、禁止项和最大尝试次数；无图片页面也要显式记录为零需求。

接入 Provider 后，同一节点可在素材方向人工批准后调用受控 Adapter，将生成结果保存为不可变素材 Artifact，生成 `asset_manifest.json` 和联系总览，再暂停等待素材审核。只有 Review 绑定的素材 Hash 可以进入 Workflow 07。

验收要求是每个槽位与模板契约一一对应、数量无缺失或增加、尺寸和裁切参数来自模板而非 AI、提示词不含未批准事实、素材有来源与 Hash、失败不会重复扣费或隐式重试。没有人工批准时不得生成素材或进入合成。

### Workflow 07：`xhs-cover-compose-v0`

输入是批准后的 Plan Bundle、批准后的 Asset Bundle、模板树快照、字段注入定义、行数合同、字体 Manifest 和所有来源 Hash。该节点不调用语言模型或生图模型。

Host 把模板复制到隔离 workspace，通过字段 ID 注入已批准文案和素材，运行 Playwright/Chromium，截取 `.poster.xhs`，生成 P1-P8、总览、production manifest、行数检查表和执行报告。模板源文件、版式和文字结构保持只读。

验收要求是八页齐全且顺序固定、字段值 round-trip、模板和素材 Hash 未变、字体无 fallback、无溢出或碰撞、行数合同通过、裁切不丢主体、无外层黑边或透明空白、消费者页面不泄露内部字段。通过后状态为 `WAITING_FINAL_VISUAL_REVIEW`；人工批准只产生 Promotion 资格，本节点不得直接写 Obsidian 或发布。

### 文件映射

| 现有 G3.10 文件 | Workbench 归属 |
|---|---|
| `task_manifest.json`、任务状态 | Job/Attempt 状态及兼容投影 |
| 终稿快照、`source_note_manifest.json` | 输入 Artifact 与 Execution Package |
| `note_content_plan.json`、审核单、visual route、line contract、模板预审 | Cover Plan Bundle |
| Plan/视觉审核记录 | Cover Plan Review Artifact |
| `image_tasks.json`、prompts、素材需求 | Material Requirement Bundle |
| 单张素材、联系总览、`asset_manifest.json`、素材审核记录 | Material Asset Bundle 与 Review Artifact |
| P1-P8、总览、production manifest、行数表、执行报告 | Cover Candidate Bundle 与 Validation Artifact |
| HTML 工作副本、浏览器缓存 | Attempt 临时 workspace，不进入正式 Artifact |

## C. 业务真值

业务真值来自人工确认后的正文终稿及其批准证据，包括产品、账号、轮次、note identity、note type、最终标题、正文、核心问题与判断、公开事实和数字、品牌与产品名称、CTA、话题、真实案例来源、允许使用的真实素材以及明确禁止改写的内容。Workbench 必须按字节快照并记录 Hash，不能在封面阶段回写或修正这些内容。

人工批准后的 P1-P8 方案和人工批准后的素材也会成为本次封面任务的下游真值，但只对绑定的 Job、Attempt 和源 Hash 有效。上游正文、方案或素材任一 Hash 改变，后续批准自动失效。

模板名称、模板版本、P1-P8 映射、图片槽位和渲染规则不是单篇业务真值；它们是系统规则。AI 提出的页面文案和视觉方向在人工批准前也不是业务真值。

## D. 执行参数

执行参数包括 Workbench Job/Attempt ID、S15 task ID、工作目录、Artifact ID、输入和输出 Hash、执行时间、租约、幂等键、阶段状态、模板树 Hash 算法、浏览器和 Playwright 版本、字体 Manifest、渲染倍数、临时输出路径、Provider 名称、模型、超时、最大生成次数和调用收据。

模板家族和版本是由固定路由派生的执行参数。`visual_route` 对 Editorial 可以由 AI 在受控枚举内提出，但必须经过 Host 校验和人工批准；Swiss 路线由 note type 确定。执行参数不得被写回正文或被当成新的业务内容。

## E. 需要代码固定的内容

- Workbench note type 到 S15 note type 的三项完整映射，以及未知类型直接拒绝。
- 三类笔记对应的模板家族、模板版本和 P1-P8 模板 ID。
- P1-P8 数量、顺序、页面职责、必填和可选字段、固定字段及禁止写字段。
- 每个文本槽位的字符容量、行数、标点、数字来源和浏览器实测规则。
- 每个图片槽位的页面、字段 ID、数量、容器尺寸、比例、安全区、裁切位置和缺失处理。
- 模板、规则、字体、输入、方案、素材和输出的 Hash 验证。
- 终稿、方案、素材和最终视觉四类人工状态的准入条件与失效条件。
- 模板只读、路径隔离、禁止 symlink 逃逸、禁止跨 Job 读取和禁止 Obsidian 写入。
- 固定 DOM 注入方式、`.poster.xhs` 截图方式、最终文件名、页数、尺寸和 Manifest 验证。
- Provider 调用授权、最大调用次数、幂等、失败退出和 Runtime 恢复；恢复不得重复生图。

这些规则必须由 Host 校验，不能仅写进 Prompt 要求模型自律。

## F. 允许 AI 生成的内容

AI 可以在终稿和固定页面职责内提炼 P1-P8 页面标题、摘要、条目、关键判断、Before/After 文案、专题名称和素材语义方向。AI 可以为已存在的图片槽位描述场景、主体、构图、风格和负面提示词，也可以在 Editorial 的受控视觉路线枚举中提出候选路线。

AI 不得决定模板家族、版本、模板 ID、页面数量、字段 ID、图片数量、槽位尺寸、字体、颜色、DOM、CSS、实际换行、输出尺寸或是否跳过人工审核。AI 也不得添加终稿没有的事实、数字、经历、结果承诺、品牌证据、产品模块或额外页面。

Host 负责身份、路由、Hash、字段、数量、字符、行数、尺寸、路径、模板完整性和文件完整性。AI 负责受限语义转译和素材描述。简哥负责方案取舍、素材取舍和最终视觉批准。

## 同一笔记结果等价策略

“Obsidian 结果约等于 Workbench 结果”必须拆成可验证条件，不能以肉眼相似或模型自报为准。

### 迁移已有 G3.10 任务

已有任务要复现原结果时，Workbench 必须直接导入终稿快照、`note_content_plan.json`、`render_line_contract.json`、`visual_route.json`、已批准素材和 `asset_manifest.json`，验证原 Hash 后执行模板合成。不得重新调用 AI 生成页面文案或素材，否则只能证明规则相同，不能证明输出相同。

### 生产新的封面任务

新任务包含 AI 生成的页面文案或素材描述，无法保证与另一次 Obsidian Agent 运行逐字或逐像素相同。可承诺的等价范围是：同一终稿 Hash、同一路由、同一模板树、同一 P1-P8 职责、同一字段集合、同一图片槽位、同一人工审核节点和同一确定性验收结果。

### 等价验证矩阵

| 层级 | 必须相等的证据 |
|---|---|
| 输入 | 终稿 bytes、终稿 Hash、批准记录、note identity 和 note type |
| 规则 | 路由文件 Hash、页面契约 Hash、图片槽位契约 Hash、模板树 Hash、字体 Manifest Hash |
| 计划 | P1-P8 模板 ID、字段集合、页面顺序、line contract；回放模式还要求字段值逐项相等 |
| 素材 | asset ID、槽位、文件 Hash、尺寸、比例、裁切位置和人工批准记录 |
| 渲染输入 | 模板副本 Hash、注入字段和值、素材 Hash、浏览器和字体版本 |
| 输出 | 八张文件数量与顺序、物理尺寸、无溢出、无裁切、模板结构；同环境回放再比较像素或感知差异 |
| 状态 | 每个人工批准和失败状态都绑定相同直接来源及 Hash |

PNG 不应默认要求跨机器字节完全相同，因为字体抗锯齿、浏览器和图片编码可能产生差异。同一渲染环境可要求字节 Hash；跨环境应要求固定结构、尺寸和像素差异阈值，并把浏览器、操作系统、字体文件和模板版本写入 Manifest。

## 实施前必须收口的差异

1. `P1-P8图片槽位契约.json` 只显式登记了 `Swiss_recommendation` 的 P5 槽位，`note_content_plan.schema.json` 却同时要求搜索型和推荐型 P5 主图。正式迁移前必须在 S15 权威层确认搜索型是否复用该槽位，不能由 Workbench 静默补条目。
2. 根 S15 入口和接口说明把最终 PNG 验收写为 1080×1440，Editorial/Swiss 共享规范又把正式导出写为 2160×2880 或“@2x 等效 1080×1440”。实现前必须冻结逻辑画布、渲染倍率和物理文件尺寸三个字段，不能同时接受两种物理尺寸。
3. `formal_selection_map.json` 的 `formal_library_status` 仍为 `packaged_not_entered`，而模板索引把两套新模板标为正式真源。Workbench 应以经过确认的模板索引和树 Hash 为准，并在接入前消除这处状态歧义。
4. 现有 `production_manifest` Schema 只约束少量顶层字段，不足以证明八页、素材、模板、字体和验证结果的完整关系。Workbench Cover Candidate Bundle 需要更强的 Manifest，但不得改变旧文件的业务含义。
5. 现有 Workbench Artifact 和 Output Bundle 只支持正文文本结果，不能安全保存 PNG 或任意数量文件。二进制 Artifact 与多文件 Bundle 是进入合成节点前的必需能力。
6. S15 当前允许 `review` 与 `fast`，但正式流程要求三个人工暂停点。Workbench V0.1 迁移验证只应开放 review 路径；是否保留 fast 必须另行批准。

上述六项未收口前，可以完成只读解析、计划编译和零 Provider 回放设计，但不能宣称 Workbench 与 Obsidian 已实现正式 1:1 生产等价。

## 结论

迁移应保留一套 Business Workbench 插件和三个版本化动作：`xhs-cover-plan-v0`、`xhs-cover-material-generate-v0`、`xhs-cover-compose-v0`。Workbench 负责持久状态、不可变证据、受限输入、人工批准和恢复；S15 规则快照负责模板、页面、字段、素材槽位和渲染规则；AI 只在固定槽位内完成语义转译；Obsidian 只作为批准后兼容投影和发布读取位置。

第一项后续实施工作不是接入生图模型，而是冻结 S15 规则快照、解决六项权威差异，并用已有终稿、计划和素材做零 Provider shadow replay。回放达到输入、路由、字段、素材和渲染等价后，才适合设计真实生图 Provider Adapter。
