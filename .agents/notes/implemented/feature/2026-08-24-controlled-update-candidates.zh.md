# Agent Note: 隔离的受控升级候选

Status: implemented

[English](2026-08-24-controlled-update-candidates.md) | 中文

## Problem

原本地 macOS 更新入口会停止生产 Runtime，并在生产检出中执行 rebase、依赖安装与构建。冲突、依赖失败、产物替换不完整或 Profile 不兼容都会直接发生在唯一可运行的环境。Stable V0 恢复版本已经存在，但更新检测与执行没有把它作为不可变候选来源，也没有强制使用隔离数据目录。

## Decision

macOS 壳把上游提交视为候选，不把它视为更新生产的授权。官方检测只 fetch 到 `<PRIVATE_UPDATE_TEST_ROOT>/upstream-full.git`；检测与候选执行都不读写生产仓库。候选状态是 Test 根目录中的版本化 JSON 文档，支持 `detected`、`testing`、`passed`、`failed`、`approved`，并保留 `promoted` 状态。

每次测试都会创建新的物理目录，并把已验证的 Stable V0 独立源码快照解压到其中。执行器从 Test 镜像取得已检测 SHA，按照 Stable Manifest 记录的上游基线重放十个定制提交。候选把 `<PRIVATE_DSH_TEST_ROOT>/candidates` 下的目录用作 `DSH_HOME`，在其中恢复已验证的 Stable Profile 压缩包，并把候选 Runtime 的 `HOME` 指向私有子目录。生产 `~/.dsh`、3080 端口、源码、Runtime 产物与 Profile 从不成为写目标。

候选执行器要求 frozen install 与完整 Runtime/Web build，记录 lockfile 和构建 hash，运行 Workspace/Session/Skill/Workflow 聚焦测试与候选 macOS 壳 typecheck，再在 3180 端口启动候选 Runtime。它分别等待页面与 RPC 路由就绪，打开 host WebSocket，创建 Test Workspace 与 Session，查询 Skill Registry，并验证固定 Profile 组合已经启动。最终 JSON 与 Markdown 报告写入前，Test Runtime 会停止。

只有 `passed` 才会显示批准操作。原生界面会再次确认并记录 `approved`；V0.1 不实现 promote，也不执行任何生产写入。旧 `update-harness.sh` 始终拒绝执行。

## Testing

`desktop/macos/test-update-harness.sh` 使用临时仓库验证旧更新拒绝、Test 根状态写入、物理候选重放、隔离 DSH home、回环 Runtime/API/WebSocket 检查、Stable 检出保持不变，以及批准状态迁移。一个在 Stable 上游基线上增加空提交、并明确标记的 Evolution 候选运行了完整非快速夹具路径，通过包括完整 build 与固定生产 Profile 快照在内的 15 项检查。实施期间官方 `master` 没有更新，因此没有可测试的官方候选。

## Alternatives considered

- **保留依赖回滚的原地更新程序**——拒绝，因为 reset 与重建仍会修改唯一生产检出，也无法让源码、Profile、数据、Runtime 与 App 兼容性成为原子操作。
- **在生产仓库内部使用 Git worktree**——拒绝，因为它会与生产共享仓库元数据和对象维护，不满足独立物理源码要求。
- **把生产 `~/.dsh` 复制到每个候选**——拒绝，因为实时复制可能不一致，会把 Credentials 与业务 Session 带入测试，也会让不兼容候选修改原本用于生产恢复的数据。
- **在同一次改造中实现 promote**——拒绝，因为候选隔离可以单独验证；安全 promote 还需要新的升级前恢复版本、App 替换顺序与单独审查的回滚流程。

## Consequences

上游失败只会消耗 Test 根目录中的磁盘与构建时间，生产会继续运行。每个失败或通过的执行都能独立检查；V0.1 不删除旧候选。完整物理隔离会重复依赖与编译缓存，因此一次完整候选会占用数 GB，并需要数分钟构建。批准现在是明确且持久的，但有意不等于升级：在后续 promote 机制实现并获批前，生产继续停留在 Stable。
