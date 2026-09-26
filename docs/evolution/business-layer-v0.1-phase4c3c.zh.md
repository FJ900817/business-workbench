# Business Layer V0.1 Phase 4C-3C Evolution

[English](business-layer-v0.1-phase4c3c.md) | 中文

版本：Phase 4C-3C

日期：2026-09-04

## Before

XHS 生成已经保留原始三文件 output bundle，但 Draft 内只有模型自报的标题与正文字数标签。TaskCard 硬规则没有投影到最终 prompt checklist，也没有确定性内容证据随 bundle 持久化。

## After

Host 投影 TaskCard 明确硬规则，将其追加到 restricted user instruction 末尾，并由 `xhs-hard-contract-l1-v1` 验证未修改 Draft。实际标题/正文字数、精确关键词证据、标题关键词检查、评论数量、话题数量、deferred check 与 `PASS/WARN/FAIL` 保存到一份不可变 `validation` Artifact。Output bundle 与 Validation Artifact 在同一次 Job compare-and-swap 中成为权威事实，schema version 5 不变。

## Evidence

Synthetic tests 覆盖范围边界、Unicode、Markdown 标题包装、可选 `正文：`、评论格式、hashtag、错误和缺失的模型自报数字、重复执行、重启与 Draft 字节不变。只读 replay 复现四份冻结样本的标题/正文结果，并保持全部四份 SHA-256 不变。未调用 Provider，也未写入 Obsidian。

## Screenshots

无。本阶段没有 UI 改动。

## Remaining work

开头/中段/末尾关键词位置及语义要求保持 deferred，直到独立 segment 定义完成。进入十二样本前，需要先运行一组新的四篇 verification set。
