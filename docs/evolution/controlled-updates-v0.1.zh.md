# 受控升级 V0.1

[English](controlled-updates-v0.1.md) | 中文

版本：V0.1 · 日期：2026-08-24

## Before

原 macOS 壳只提供一个小型更新入口。发现官方 `master` 更新后，点击会停止生产 Runtime，在生产检出中原地 rebase，执行 frozen install 与完整 build，再重启生产。冲突或构建失败因此会直接发生在唯一可用的源码与产物目录中。

![Before：原更新入口](controlled-updates-v0.1/images/before.jpeg)

## After

检测现在会记录 Stable SHA、候选 SHA、新增 commit 数与检测时间，不会 fetch 生产检出。**测试新版本**会打开聚焦面板，所有写目标都位于独立 Test 根目录与候选专属 `DSH_HOME`。

![After：发现候选](controlled-updates-v0.1/images/after-detected.jpeg)

候选通过后，面板会展示兼容结果、通过项数量、生产隔离说明、报告入口与批准门禁。2026-08-24 当天官方 `master` 仍等于 Stable V0 上游基线，因此截图使用界面中明确标记的 Evolution 夹具；该夹具是在精确基线上增加的一个空提交，并执行了完整候选流程。

![After：候选通过](controlled-updates-v0.1/images/after-passed.jpeg)

## 本次新增能力

- Test-only 上游镜像、带版本的物理候选目录，以及 `detected`、`testing`、`passed`、`failed`、`approved` 候选状态。
- 重放十个定制提交前，验证 Stable V0 源码与 Profile 快照。
- frozen 依赖安装、完整 Runtime/Web build、Workspace/Session/Skill/Workflow 聚焦套件、macOS 壳 typecheck，以及在 3180 端口执行真实 HTTP/RPC/WebSocket/Workspace/Session/Skill 检查。
- JSON 与 Markdown 候选报告，记录构建 hash、固定 Profile 版本、失败原因与恢复材料引用。
- 明确确认后只记录批准，不 promote，也不修改生产。

## 现在如何解决

候选测试不会停止生产 Runtime、写生产仓库、使用生产 `~/.dsh`，也不会更新 Profile 插件。旧原地更新程序会立即退出。失败候选会保留供诊断，且不能批准。

## 仍未解决的问题

V0.1 有意不实现 `promoted`。后续改造必须在允许任何生产写入前，新建升级前恢复点，再次验证 Stable Manifest 与恢复材料，通过单独审查的 promote 流程应用已批准候选，并验证回滚。

本次实施期间官方上游没有更新，因此首个真实官方候选要等检测到新提交后才能验证。带标签的 Evolution 夹具证明了完整机制，但不会伪装成上游版本。

## 截图路径

- `docs/evolution/controlled-updates-v0.1/images/before.jpeg`
- `docs/evolution/controlled-updates-v0.1/images/after-detected.jpeg`
- `docs/evolution/controlled-updates-v0.1/images/after-passed.jpeg`
