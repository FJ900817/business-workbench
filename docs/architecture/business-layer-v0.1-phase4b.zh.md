# Business Layer V0.1 Phase 4B：XHS 正式生产执行门

[English](business-layer-v0.1-phase4b.md) | 中文

Phase 4B 让 `xhs-body-prepare-v0` 只能通过 Restricted Agent Runner 的显式安全 fixture route 执行。本阶段审计并冻结生产来源映射，建立三文件 intermediate 输出 bundle，并证明组装后的 fixture lifecycle。本阶段不执行真实任务卡、不在 runtime 解析生产 Vault 字节、不执行内容 Validation 或 Human Gate、不 promote 到 Obsidian、不新增 UI，也不修改 Harness Core。后续 [Phase 4C-0 source adapter](business-layer-v0.1-phase4c0.zh.md) 在不启用生产 Agent 执行的前提下满足了来源解析前置条件。

## 生产输入审计

只读审计覆盖当前生产 Vault 的 XHS 正式生产基线与四个账号 S3 文件。每份正式 S3 只要求一张已确认任务卡、本账号 S3 指令、由任务卡 `note_type` 选择的 V3.0 正文规则，以及对应黄金样稿。S3 指令属于模型策略，因此进入 Skill 快照而不是 package input。正式说明排除了单独的账号规则文件，以及产品描述或产品真值资料。

| 执行 role | 生产来源规则 | Runtime 处理方式 |
|---|---|---|
| `taskCard` | caller 选择的一张已确认任务卡文件 | 精确文件输入快照 |
| `writingRule` | 任务卡 `note_type` 选择的一份正式 V3.0 文件 | 精确文件输入快照 |
| `goldenSample` | 相同 `note_type` 选择的一份正式样稿 | 精确文件输入快照 |
| 账号 S3 | 账号自己的 `.agents/skills/S3-笔记写作-账号X/SKILL.md` | 精确 Skill 快照 |

Phase 4A 提议由四个输入文件修正为三个。删除 `accountRule` 与 `productTruth`；加入它们会违反获批 S3 运行说明。`allowedReadRoots` 保持为空，`allowedReadFiles` 必须与三个输入路径完全相等，因此 action 无法扫描项目或 Vault。

## 精确 S3 绑定

Harness Skill id 只允许小写 ASCII 标识符，而获批 S3 目录包含大写字母与中文。Phase 4B 不重命名或复制这些生产 Skill，也不放宽 registry parser。Host 持有四个确定性 adapter id，用于标识后续必须快照的精确正式来源：

| 账号 | Host Skill id | 正式来源 | 已审计基线 SHA-256 |
|---|---|---|---|
| `account1` | `xhs-s3-account1` | `.agents/skills/S3-笔记写作-账号1/SKILL.md` | `e718198d57caf4f6fe25b8ba617fad5fe4c4b804b59c49d04dca02535cbd50a7` |
| `account2` | `xhs-s3-account2` | `.agents/skills/S3-笔记写作-账号2/SKILL.md` | `7448eeec29199bfb0078d4a14207b378b0a4137dbd899188cf9103f0c2bc6350` |
| `account3` | `xhs-s3-account3` | `.agents/skills/S3-笔记写作-账号3/SKILL.md` | `12e3a3610ab31294a30d469e5cd33b3c3c28681c1340a3b27fdc6a4a2d350eb3` |
| `account4` | `xhs-s3-account4` | `.agents/skills/S3-笔记写作-账号4/SKILL.md` | `ef9a8daefd78deef5766f95537b2bc160d107b11498202d398b0191394619a68` |

可执行 fixture route 只把一个安全 Skill definition 注册到选定 adapter id，并冻结 winning provider、source、origin、存在时的 version、resource base、正文、资源与 manifest hash。已审计的正式 S3 文件没有声明独立 version 或 dependent-resource 列表；其必需 writing rule 与黄金样稿是显式执行输入。策略要求恰好选择一个 id；其他账号、额外 Skill、discovery result、未获批 origin、正文漂移或 manifest 漂移都会在模型 I/O 前失败。能够读取指定正式文件并报告 `project-agents` origin 的生产 resolver 仍是 Phase 4C 前置条件。

## 封闭 action policy

action 为 `xhs-body-prepare-v0`，Project 为 `xhs`，Workflow version 为 `xhs-body-prepare-v0`，policy version 为 `xhs-body-prepare-policy-v1`。请求必须声明 route mode `fixture`、四个账号之一，以及一个受支持的 `note_type`。Host 把该组合映射到精确 writing-rule 与 golden-sample binding，要求 `restricted-agent`，只使用一个账号 Skill，固定部署配置的 provider/model，并且不准入任何 callable tool。

Agent 获得一个全新 Session、一条由固定 action 指令与 Skill 快照组成的 complete system prompt，以及一条只含三个冻结输入的 user message。它不获得 preset、历史 Session、filesystem、Bash、Workspace、Skill discovery、subagent、Workflow tool 或替代模型选择。模型响应必须是只包含一个非空 `draft` 字符串的 JSON object，且最多 64 KiB；其余所有输出事实由 Host 生成。

## 输出 bundle 与结算

结果是一个恰好包含三个 UTF-8 文件的 `intermediate` Business 输出 bundle：

| 文件 | 所有者 | 必需事实 |
|---|---|---|
| `draft.md` | Host 解析后的模型正文 | 非空 Markdown、size 与 SHA-256 |
| `draft-metadata.json` | Host | Output version、Project/action、Batch/Job/Attempt、账号、正文类型、draft hash/size、validation slot |
| `provenance.json` | Host | Package/Skill manifest hash、精确 input/Skill 快照、action-policy version、provider/model、run identity、开始/结束时间、draft hash |

Host 在结算前验证精确文件名、JSON schema、Project/action identity、Batch/Job/Attempt/run 关系、input/Skill 事实、draft size/hash 与 manifest hash。Validation 只有一个禁用的预留 slot；本阶段执行结构与 provenance 检查，不判断内容质量。

输出 store 写入 owner-private staging 目录，对三个文件和 manifest 执行 fsync，原子 rename 完整目录到确定性的 Attempt-owned 位置，然后通过一次 Job compare-and-swap 绑定 bundle、完成 Agent Run 与 Attempt，并记录 idempotency receipt。只有这次状态更新成功后，published bytes 才是权威业务事实。发布前或发布中崩溃不会产生引用结果；发布后、CAS 前崩溃会留下只读可发现的 orphan。Reconciliation 绝不自动收编或删除 orphan。

一个 Attempt 最多持有一个权威输出 bundle。Idempotency key 为 `xhs-body-prepare-v0:attempt:<attemptId>`；重试直接返回同一持久结果，不产生第二次模型请求。不同 key 也不能为同一 Attempt 产生第二个成功 bundle。

## 验证

Keyless assembled snapshot 记录 action、policy version、固定模型策略、空工具策略、四个正式 Skill 映射、三个输入 role、三个输出名、安全 fixture Skill hash、schema version 与 fixture 输入内容 hash。Fixture integration 覆盖 Batch、Job、Attempt、lease、package、policy、Restricted Agent、bundle 发布、Job CAS、重启、验证读取、幂等重放与第二次成功拒绝。

负向覆盖拒绝错误 Project、action、账号、正文类型、Workflow、capability、Skill id、Skill origin、package、输入漂移、Skill 漂移、tool invocation、非法模型 JSON、缺少或多余输出字段、空或超大 draft、非法 metadata/provenance、关系或 hash 不一致、部分 bundle、manifest 损坏、重复成功、中断发布以及 v0/v1/v2 存储。

一次凭据门控 smoke 使用已配置的 `deepseek-official / deepseek-v4-flash` route 与安全临时 fixture，产生一个有效 bundle。Forbidden tool executor 调用为零，临时 DSH home 独立，托管 credential 文档 hash 未变化。该调用没有挂载任何生产任务卡或 Vault 路径。

## 为什么仍不开始真实内容生产

生产输入 resolver 与正式 S3 adapter 尚未接入 runtime。内容 Validation、Human Gate、review feedback 与 Obsidian promotion 也不存在。在这些控制存在前启用真实任务卡字节，会把来源映射审计变成生产授权。Phase 4B 因此只证明 fixture route，并让生产 gate 保持 fail closed。

## Phase 4C 前置条件

- 新增 Host-owned resolver：只接受获批任务卡引用，只读取三个确定性生产文件，验证审计基线与任务卡状态，并在不向 Agent 暴露 filesystem 权限的情况下生成相同 package。
- 新增 production Skill provider 或 adapter：只解析一个已映射 S3 文件，报告其正式 origin/source，并在无 discovery 或 fallback 的条件下冻结 winning definition。
- 在任何结果成为 `final` 或进入 Obsidian 前，冻结内容 Validation policy 与 Human Gate consumer。
- 为第一个单篇真实 Job 定义显式批准、恢复与审计 evidence；在完成审核前，保持四篇 Batch 生产关闭。

Harness Core、AgentLoop、WorkflowEngine、Session format、生产 Obsidian 数据、UI 与 Profile plugin 均未修改。
