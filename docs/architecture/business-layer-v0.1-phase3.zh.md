# Business Layer V0.1 Phase 3：受限 Agent Runtime

[English](business-layer-v0.1-phase3.md) | 中文

Phase 3 在继续由 `dsh-business-workbench` 持有执行权威的前提下，把冻结 Business execution package 接到一次真实 Harness AgentLoop 调用。本阶段只用 fixture 输入与 fixture Skill 证明策略强制有效；不生成小红书正文，不验证业务输出，不增加 Human Gate，不写入 Obsidian，不提供 UI，也不修改 Harness Core。

## 当前执行路径

```text
Host caller
  -> Job + current Attempt + live Lease
  -> immutable Execution Package
       -> exact logical input files and hashes
       -> exact Skill bodies, origins, and hashes
       -> requested capability and Skill subset
  -> fixed Host action policy
  -> fresh restricted Harness Agent Session
       -> complete prompt from frozen material only
       -> zero published tools + deny-all executor guard
       -> one fixed provider/model request
  -> durable Agent Run + intermediate Artifact provenance
```

Package 仍是请求而非授权。`resolveRestrictedAgentPolicy` 持有封闭的 `xhs` fixture action、允许的 `restricted-agent` capability，以及两个允许的 Skill id。部署配置持有 provider、model、reasoning effort、token 上限与 timeout。调用方不能通过 package 内容或 prompt 文本替换这些事实。

## Skill 物化

创建 package 时，系统在已配置的 XHS Project root 上，通过当前 Registry view 逐个解析精确请求的 Skill id，绝不列举或搜索 Skill。Package 存储 winning definition 的 id、source、provider、可选 path 或 resource base、完整正文、字节数、内容 hash、解析时间与 snapshot hash；有序 manifest hash 覆盖全部 snapshot。

每次模型请求前，Host 会在相同 Project root 重新解析相同 id，并比较完整 snapshot identity。Definition 缺失、正文变化、provider 变化、source layer shadow，或者 path/resource origin 变化都会以 `SKILL_DRIFT` 失败。Winning source/provider 不是 Host runtime 的 snapshot 会以 `SKILL_ORIGIN_NOT_ALLOWED` 失败。该 fixture policy 明确拒绝 Project、user、global 或 external-provider shadow，即使它们复用了允许的 id。

## 受限 Agent context

`HarnessRestrictedAgentRuntime` 通过既有 Agent Registry 与 AgentLoop 创建一个全新 Agent。其 scoped setup 选择 native tool presentation，把可见工具集限制为空，并安装 deny-all execution guard。即使部署默认处于 code mode，native presentation 也会阻止 reserved `run_code` 出现；如果 provider 无视空 schema list 仍产生 tool call，guard 是最终执行授权检查。

Setup 会抑制 runtime context，并安装一个 complete system-prompt section。该 section 只有固定 fixture 指令与冻结 Skill 正文。一条 user message 包含 Job、Attempt、package id、role、logical path 和冻结输入字节，不包含 Session history、preset、workspace inventory、Skill discovery result、filesystem path、shell capability 或 subagent capability。恶意输入始终只是被引用的数据，不能扩张 Host 权限。

临时 Session 只用于 AgentLoop lifecycle 与模型事件观察，并在单轮结束后销毁。持久化真源是 Business Agent Run，而不是临时 Session。

## Preflight 与结算

`runRestrictedAgent` 在模型 I/O 前检查 Job、指定且为 current running 的 Attempt、有效 lease owner 与 Runtime identity、精确 package id 和 manifest、输入字节、action policy、请求 capability/Skill subset、Skill origin 与 drift，以及必需 Agent service。通过后先持久化一条 `running` Agent Run，再调用模型。

成功文本输出会发布为一个不可变 `intermediate` Artifact。Artifact provenance 记录 Agent Run id、package id 与 manifest hash、Skill manifest hash和固定 model facts。同一 mutation 会结算 Agent Run 并写入 `run-agent` 幂等 receipt。复用调用 key 会返回已验证的已提交 Artifact，不再请求模型；Runtime 重启后同样成立。

Provider error、timeout、tool-call attempt、drift 或 policy rejection 会把 Attempt 结算为 failed 或 interrupted，并且不引用输出 Artifact。系统不自动重试。启动恢复会让遗留的 running Agent Run 随其 Attempt 一起变为 interrupted。再次执行必须显式创建新 Attempt 并取得新 lease。

## Schema 与兼容性

Storage schema 2 为每个 execution package 增加 `skillSnapshots` 与 `skillManifestHash`，为每个 Attempt 增加 `agentRuns`，为 Artifact reference 增加 restricted-Agent provenance，并增加 `run-agent` receipt。这些属于结构变更，因此 schema 1 现在 fail closed。此前生产环境不存在 Business domain，migration 继续明确不实现。

Agent Run 与 Artifact schema 会校验 ownership relation、唯一 run id 与 idempotency key、terminal timestamp 与 failure facts、completed-run Artifact reference，以及 provenance back-reference。模型可见的冻结输入和 Skill 正文可以从持久 Business record 与 Artifact provenance 重建。

## 验证范围

Keyless 临时 home 测试装配真实 Skill Registry、Tool Runtime、system-prompt service、Agent Registry、AgentLoop、Session store 与 deterministic LLM adapter。覆盖精确 Skill snapshot、无 ambient context、零 tool schema、executor denial、prompt injection、缺失/不允许/cross-origin Skill、正文与 origin drift、错误 package/Attempt/owner、过期 lease、input drift、provider error、timeout、幂等 replay、Artifact provenance 与重启恢复。既有 Phase 1、Phase 2 和 Web assembly 测试继续纳入范围。

生产验证只检查 assembly。当前 Web Profile 可以在不配置 `restrictedAgent` 的情况下加载插件；此时新执行 route 保持禁用，不创建 Job，也不请求模型。测试只使用 OS 临时 root，绝不读写生产 Obsidian 真源。

## 剩余风险与 Phase 4 前置条件

- Action policy 与输出仍是 fixture；真实 XHS action 需要经过评审的输入规格、批准的生产 Skill origin 与确定性输出 validation。
- JSON domain 仍要求单 Runtime writer。跨进程执行需要完整 writer coordination 设计，而不是局部 lock。
- Runtime 在 Artifact fsync 后、状态结算前崩溃，可能留下已验证 orphan；reconciliation 目前明确只读。

只有在真实 action policy、生产 Skill source、output schema、Validation boundary 与 no-Obsidian-write acceptance test 冻结后，Phase 4 才可以新增第一个真实 action。AgentLoop、WorkflowEngine、Session format 与 global tool policy 保持不变。
