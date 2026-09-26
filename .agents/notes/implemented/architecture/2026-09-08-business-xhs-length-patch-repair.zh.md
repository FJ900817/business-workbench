# Agent Note：XHS 字数小修由 Host 应用受限模型建议

状态：已实施

[English](2026-09-08-business-xhs-length-patch-repair.md) | 中文

本 Note 收窄后续只处理标题/正文字数的 Repair，但不替代 [V0 lineage Note](2026-09-06-business-xhs-revision-retry-v0.zh.md) 中范围更广的历史 Contract Repair 与 Revision 决定。

## 问题

一篇真实 XHS 候选稿已通过业务审核，却只因确定性的标题与正文字数范围失败。原有 Contract Repair action 要求模型返回完整 Draft；真实执行把正文从 848 字符改到 876 字符，同时标题仍为 17 字符。继续整稿生成既会削弱已通过的业务内容，也无法保证数值约束。

## 决定

`xhs-body-length-repair-v0` 是独立的无 Skill 执行。Preflight 必须同时验证 hash 绑定的 `PASS` Review、格式完整的来源候选稿、对应 Hard Validation，以及只包含 `titleRange` 或 `bodyRange` 的失败。已启动的 length-repair Agent Run 会消耗该来源候选稿唯一一次额度；length-repair 输出不能进入 Repair 2 或普通业务 Revision。

模型只返回一个严格 JSON proposal，其中最多包含三个标题候选和三组互相独立的正文方案。每组正文方案由局部、单行的 `old_text` 到 `new_text` 替换组成。模型不能返回完整 Draft 或字符 metadata。Host 会拒绝未知字段、多行值、在来源中出现零次或多次的文本，以及相互重叠的替换。

每个 trial 都从同一份精确且不可变的来源 Draft 开始。Host 应用建议的标题和正文修改，以 `countXhsFullCharacters` 重建标题/正文 metadata，解析 `xhs-draft-markdown-v1`，重跑当前 Hard Contract Validator，对比来源中的评论和话题，并要求 Review 中每个可精确检查的 `preserve` 值仍然存在。这些确定性检查不宣称能够证明语义等价；该判断由人类 Patch Approval 负责。没有 trial 通过时，操作只存储 proposal evidence，不产生候选稿。多个 trial 通过时，Host 先按 Unicode Levenshtein 距离最小选择，再按 proposal 顺序决胜，不进行第二次模型调用。

机器有效的候选稿保持 `CANDIDATE_READY`。独立 Patch Approval 只记录 `APPROVE / PROMOTION_ELIGIBLE` 或 `REJECT / STOP`，并包含修改前后标题与 Host 计数。Approval 不启动执行，也不执行 Obsidian promotion。现有 Schema V5 可以表达新增 action、lineage、Artifact 与 Output Bundle，无需重写历史记录。

## 考虑过的替代方案

- **复用 Contract Repair**——其整稿响应宽于安全字数 patch，且已经在真实数值目标上失败。
- **让模型选择自己认为合规的结果**——模型自报计数不是权威，不能替代 Validator 的计数器。
- **累积应用正文方案**——后续 trial 会依赖已拒绝修改，无法再与已审核来源比较。
- **自动晋升通过的 patch**——确定性字数检查不能证明业务语义仍然可接受。
- **提升 Schema 版本**——当前追加式 union 与不可变 Artifact plane 已能表达新执行，不需要修改持久化 Job 字段。

## 结果

调用方创建新的 single Job 与 PASS Review，执行只读资格检查，取得执行权，再冻结四项精确证据输入。一次 Provider 请求只能产生 proposal evidence，或产生一个权威 repaired Candidate。来源候选稿及其业务 PASS 始终不变。Promotion 具备资格前必须由人查看 patch diff，拒绝后该次 Repair 正式结束。
