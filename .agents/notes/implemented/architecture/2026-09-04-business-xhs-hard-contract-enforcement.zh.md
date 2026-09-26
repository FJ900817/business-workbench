# Agent Note：XHS 硬规则由 Host 投影、重申并验证

Status: implemented

[English](2026-09-04-business-xhs-hard-contract-enforcement.md) | 中文

## 问题

首轮四个生产 XHS 样本保持了正确的输入隔离与路由，但标题长度、正文长度和精确关键词执行并不稳定。四个样本中的模型自报字符数均有错误。执行路径保存了原始 Output Bundle，却没有持久化冻结 TaskCard 要求及实际输出事实的独立证据。生成后修正文稿会抹除实验需要衡量的 First-Pass 证据。

## 决策

`dsh-business-workbench` 先把冻结正式 TaskCard 编译为 `xhs-task-card-contract-v2`，再投影为执行规则。编译结果包含正式 compiler 与生产身份、确认状态、note type、标题与正文范围、精确关键词及其要求位置、正文结构条目、产品模块、评论数量、按顺序排列的精确话题值和明确禁止行。编译器只接受封闭的正式 note type 与精确机器字段语法。生产真源 adapter 会把系统二当前正式推荐型标识 `干货推荐型（soft_plant）` 确定性映射为 TaskCard 规范机器值 `干货推荐型（recommendation）`，且不会从人类可读文本推断 note type。必要字段缺失、重复、属于旧格式或互相矛盾时，在模型 I/O 前失败。生产解析还要求已确认的系统二任务与已确认的编译 TaskCard 包含顺序相同的十个唯一话题。`SEO高亮词：无` 显式表示本任务没有精确关键词要求；关键词字段缺失仍然失败。Host 将同一投影渲染为受限 user instruction 末尾的简短 checklist，因此 checklist 不能引入 TaskCard 中不存在的规则。

一次模型响应成功后，纯 L1 Validator 测量未经修改的 Draft。`xhs-draft-markdown-v1` 要求一个位于开头的 H1 标题、紧随其后的合并模型自报字符数行，以及按顺序排列的置顶评论、非置顶评论和话题 H2 section。这些区间缺失或存在歧义时，Parser 返回 `FORMAT_CONTRACT_FAIL`，不产生实际计数或硬规则结果。独立的历史只读 replay 会保留该格式失败，仅在一种已知旧布局能够唯一确定全部区间时推导证据。

格式解析成功后，`countXhsFullCharacters` 生成的 Unicode 码点计数是权威事实；模型自报计数作为独立观测保留。Validator 检查标题与正文范围、精确关键词总次数、标题关键词要求、评论数量和最终 hashtag 的顺序词面。缺失、新增、重复、换序或第十一个话题都会返回 `HARD_CONTRACT_FAIL`，并保留精确的期望、实际、缺失和新增证据。比较不执行归一化、别名映射或语义匹配。Validator 记录每个必要关键词的精确码点偏移。开头、中段和末尾的位置要求在这些分段获得机器可读定义前保持未判定。正文结构语义、产品模块语义和文字形式的禁止项也继续延后。

Host 在一次 Job compare-and-swap 之前写入三文件 Output Bundle 和一个不可变 `validation` Artifact，再由该 CAS 将两者同时确认为权威事实。Validation Artifact 复用版本 5 已有的 Artifact 引用与存储机制，因此不需要升级 Schema。相同幂等键重放时直接返回已有结果，不会再次请求模型，也不会产生第二个权威 Validation Artifact。Validation 永不修改 Draft、重试生成或启动 Revision。

## 考虑过的替代方案

- **信任模型自报计数**——四样本基线已经证明这些标签不是可靠测量。
- **自动修复失败项**——重写、截短、扩写或插入关键词都会替换 First-Pass 样本，使实验失效。
- **从邻近自然语言推断缺失 TaskCard 字段**——自然语言 fallback 会把不完整卡或旧卡伪装成有效生产输入。
- **要求每种 note type 至少有一个精确关键词**——正式确认的热点流量任务可能显式没有 SEO 高亮词；拒绝这个状态是在改变业务真值，而不是验证它。
- **按百分比推断开头、中段和末尾**——TaskCard 没有定义这些边界，推断分段等于新增业务规则。
- **Markdown 解析有歧义后继续计数**——看似合理的标题或 section 边界不是权威证据，并会把格式缺陷误报为内容违规。
- **接受话题别名或语义相似**——这会引入正式生产真源中不存在的映射规则，并可能掩盖模型替换。
- **比较前排序或归一化话题值**——归一化会丢失编译 TaskCard 必须保留的上游顺序与精确词面。
- **把历史布局作为额外生产格式接受**——同时接受多种结构会保留歧义；兼容 Parser 仅用于只读 replay，不能授权新的 Run。
- **通过新 Schema 保存 Validation**——版本 5 已经支持不可变 `validation` Artifact 和 Job Artifact 引用。
- **Job 完成后再附加 Validation**——两次更新之间发生崩溃时，可能留下缺少必要确定性证据的权威 Draft。

## 影响

新的 `xhs-body-prepare-v0` Run 如果无法把冻结 TaskCard 编译为必要投影，或其话题与已确认的系统二任务不一致，会在访问 Provider 前失败。带显式空关键词策略的正式 `XHS-PROD-1.3` 卡可以在不发明关键词的情况下完成编译；缺少 compiler 身份或封闭双语 note type 的卡仍不受支持。模型指令包含唯一接受的 Markdown 结构和精确十个 hashtag。模型响应成功后，系统始终保留原始 Draft，并在不改写输出的情况下记录格式失败或确定性硬规则事实。既有历史 Output Bundle 不会被修改，也不会被追补 Artifact 引用；replay 只是只读证据。当前 TaskCard 均含语义或分段相关要求，所以即使所有确定性检查通过，Draft 仍可能是 `WARN`。
