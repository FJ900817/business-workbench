# Business Layer V0.1 Phase 4C-1T

[English](business-layer-v0.1-phase4c1t.md) | 中文

- **版本：** Phase 4C-1T
- **日期：** 2026-09-02
- **UI：** 未改变；无需截图

## Before

生产规模的 `deepseek-v4-flash / low / 4096` 请求可能把全部生成 token 用于 reasoning，并在 final text 为零时达到 `max-tokens`。Business Workbench 会把所有已完成空输出统一分类为 `EMPTY_AGENT_OUTPUT`，成功结果的瞬态 metrics 也不暴露 finish reason。

## After

下一次实验的选定配置保留 model 与 output cap，但发送 adapter 持有的 `off` effort。一次 `5058` input tokens 的 synthetic production-path smoke 返回 `10` 个可见 output tokens、`0` reasoning、finish reason `stop`，且没有 tool execution。

Business Workbench 会把未来 final text 为零、reasoning token 大于零且由 `max-tokens` 结束的结果分类为 `REASONING_BUDGET_EXHAUSTED`，在 diagnostic version `2` 中记录有效请求预算事实，并为新鲜成功结果报告 finish reason。Schema 继续为 version `5`；生产真源、历史失败、tool policy、Job 语义和 Harness Core 均未改变。

## 仍未解决

下一次真实正文需要验证关闭 reasoning 后的内容质量，并重新取得授权。Deployment configuration 必须固定 `off / 4096`；上游模型或 API 变化后还需重新验证 Provider 行为。

完整证据见 [Phase 4C-1T 实验记录](../experiments/business-layer-v0.1-phase4c1t-reasoning-budget.zh.md)。
