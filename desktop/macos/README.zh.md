# DeepSeek Harness macOS 外壳

[English](README.md) | 中文

`DeepSeekHarness.swift` 是本地 macOS 安装所使用的原生包装层源码。它从当前检出启动 `apps/cli/lib/bin.js web --no-open`，并在 `WKWebView` 中渲染 `http://127.0.0.1:3080`；该参数会阻止服务同时把页面交给默认浏览器。在 macOS 14 及以上版本中，该本地 Web 视图不使用代理配置，避免失效的系统代理转发回环页面而造成应用白屏。

该包装层安装了标准 macOS「编辑」菜单，包含撤销、重做、剪切、复制、粘贴与全选。这些响应链命令让 `⌘X`、`⌘C`、`⌘V` 和 `⌘A` 能到达当前聚焦的 WebKit 文本输入框。

## 语音伴侣球

原生外壳内置一个始终置顶的语音伴侣；即使关闭主窗口，它也可以继续留在桌面。Harness 提供两个入口：左下角“设置”右侧的声波符号与**语音**文字，以及输入框右侧的黑色圆形主操作。输入框为空时显示语音声波；桥接层会结合原生发送按钮的启用状态与文字、粘贴、拖放和附件变化，因此输入文字或添加文件后会立刻恢复为黑色发送箭头。输入框控件会在可见区域的最高层直接截获按下事件，避免底层禁用的网页按钮吞掉语音操作。`⌘⇧空格` 用于开始对话，`⌘⇧V` 用于显示或隐藏。开始对话时保持紧凑形态；单击球体可以开始、结束或打断播报，双击通过过渡切换到鸡蛋大小或恢复小尺寸，拖动可移动位置，右键菜单也提供相同控制。原生表面在空闲时也保持明显动画：深蓝色不对称外壳会持续旋转、拉伸和改变轮廓，内部是更明亮的电蓝流线、流沙颗粒与发光核心。

语音通过 macOS Speech 框架转成文字，再提交到当前 Harness 输入框。因此当前会话所选择的模型、权限预设、工作区、技能和工具都会保持不变。桥接层只跟踪由语音提交的这一轮会话，球体会分别显示聆听、思考、工具执行和播报状态，并在模型仍在流式输出时持续提取完整短句。原生队列不等待整段回答结束就开始播放第一句，同时在播放期间预生成下一句；回答播完后会自动恢复聆听。播报期间，带人声处理的麦克风 tap 会同时提供更低延迟的能量检测与中文局部识别；持续的前景音量，或与当前播报短句不匹配的识别结果，都会打断完整轮次：原生播报立即停止，桥接层点击当前 Harness 的停止控件，并在保留已经识别出的插话内容后恢复正常识别。语音提交会等待输入框离开占用状态，并在限定时间内自动重试，因此取消过程中说出的内容不会丢失。单击球体也会执行相同的确定性打断。语音轮次期间回答文字会暂时隐藏，播报结束后再显示，避免文字先出现、语音随后照读。合成前，原生包装层会排除思考行、代码元素、控件、只用于展示的 Markdown、链接、表情、仅含英文的流式片段，以及中文正文之前的所有非中文块；它还会把常见报告体衔接词改成更短的口语表达，并限制单轮播报长度，同时在会话中保留完整文字。

用户允许在线自然语音后，输出会优先使用固定版本的 `edge-tts` 与偏日常对话风格的 `zh-CN-YunxiNeural` 音色，以降低首句等待并减少正式播报感。包装层只通过一个持续运行的 AVAudioEngine 音频图加入轻微降调、均衡、短延迟与混响，在保留真人感的同时增加克制的空间质感。本地安装的 Kokoro 82M 普通话模型及其 `zm_yunxi` 音色作为隐私备用方式。由应用拥有的 Python 守护进程只加载一次模型，通过用户私有的 Unix socket 提供合成，并随桌面客户端一同退出。当前本地安装占用约 1.3 GB 磁盘，本地守护进程预热后的内存约为 750 MB。

应用会先询问一次，只有选择在线自然语音后，才会把当前需要播放的短句发送到 Microsoft Edge 语音服务；模型凭据、文件和完整会话不会随之发送。拒绝在线输出时会选择本地 Kokoro。如果选定的神经语音后端失败，本轮播报会停止并恢复聆听，不会再切换到机械化的 macOS 系统音色。应用菜单中的「语音输出设置…」可以修改已经保存的选择。所有输出方式都不会创建第二套模型配置，也不会保存模型密钥。

当前接入的 DeepSeek 与 Kimi 提供方接收的是文字轮次，而不是连续音频流。该伴侣会降低轮次延迟、自动恢复聆听并支持插话，但它不是音频原生的全双工模型会话；让模型在说话时同时进行语义聆听，需要接入具有实时音频 API 的提供方。

由于当前本地安装和工作区都位于用户的“文稿”目录，客户端也声明了文稿目录访问用途。第一次使用语音时，macOS 会请求麦克风和语音识别权限。如果当前页面没有可写入的会话，语音伴侣会打开主窗口并报告无法发送，不会在后台偷偷新建会话。

## 文件选择

包装层通过附着在应用窗口上的原生 `NSOpenPanel` 处理网页文件输入请求。面板遵循页面的目录选择与多选标志，用户选择或取消后，都会且只会完成一次发起请求的 WebKit 回调。

## 本地品牌

仅应用内的 Web 视图会把侧边栏名称显示为 **DeepSeek Harness**，不显示本地构建提交号；空会话标题显示为 **简哥 · 探索未知之境**，不显示预览版徽标。主框架用户脚本会对初始文档及后续客户端重新挂载应用这些精确替换。在外部浏览器中打开时，对外服务的 Web 页面保持不变。

## 更新

包装层会在启动四秒后检查官方仓库，并在保持打开期间每六小时检查一次。检测只会 fetch 到 `<PRIVATE_UPDATE_TEST_ROOT>/upstream-full.git`，不会 fetch 生产检出。官方 `master` 比 Stable V0 更新时，左下角会浮现蓝色的**测试新版本**按钮。面板会展示 Stable SHA、候选 SHA、新增 commit 数、检测时间、测试状态、兼容结果以及生产环境是否改变。

点击**测试新版本**会运行客户端内置的 `controlled-update.mjs`。每次执行都会把已验证的 Stable V0 源码快照解压到新的物理候选目录，从仅供 Test 使用的镜像取得已检测 SHA，并在该目录重放 Stable V0 的十个定制提交。候选使用 `<PRIVATE_DSH_TEST_ROOT>/candidates/<candidate>` 作为 `DSH_HOME`，把 Stable V0 固定 Web Profile 恢复到该目录，以 frozen 根 lockfile 安装依赖，构建 Runtime 与 Web，再于 3180 端口启动临时 Runtime。检查覆盖源码重放、frozen install、构建产物、HTTP、RPC、WebSocket、Workspace 与 Session 创建、Skill Registry、Workflow 聚焦能力测试、固定 Profile bundle，以及 macOS 壳 typecheck。报告写入后，Test Runtime 会停止。

候选状态与报告保存在 Test 根目录。失败候选仍可查看，但不能批准；通过候选才会出现**批准升级 Stable**，再次明确确认后只记录 `approved`。V0.1 不实现 `promoted`，也不会写生产仓库。旧 `update-harness.sh` 始终拒绝生产原地更新。

包装层会为 Web 服务和所有更新命令明确提供包含 `/usr/local/bin` 与 `/opt/homebrew/bin` 的 macOS 包管理器搜索路径。因此，从 Finder 启动客户端时，配置插件更新面板也能找到已经安装的 `pnpm`、`corepack` 与 `npx`，不会继承只有 `/usr/bin:/bin` 的受限路径。

候选测试期间，生产 `~/.dsh`、3080 端口与生产服务保持运行。候选执行器报告完成前必须保持应用打开；应用关闭期间不会检查更新。

## 构建与安装

在仓库根目录构建 arm64 可执行文件。如果机器上最新版 Command Line Tools 的编译器与 SDK 补丁版本不匹配，请显式选择 macOS 15.4 SDK：

```sh
swiftc -sdk /Library/Developer/CommandLineTools/SDKs/MacOSX15.4.sdk \
  -module-cache-path /private/tmp/deepseek-harness-swift-cache \
  -target arm64-apple-macos13.0 \
  -framework AppKit -framework WebKit -framework AVFoundation -framework Speech \
  desktop/macos/DeepSeekHarness.swift desktop/macos/SpeechText.swift \
  -o /private/tmp/DeepSeekHarness
```

把可执行文件安装为 `Contents/MacOS/DeepSeekHarness`，把 `Info.plist` 安装为 `Contents/Info.plist`，并把 `controlled-update.mjs` 与已禁用的旧 `update-harness.sh` 一并复制到应用包的 `Contents/Resources` 目录。所有文件就位后再签名应用包。

对于当前已有的本地客户端，在完成上述编译后运行 `desktop/macos/install-local.sh`；如果系统中存在 `uv`，脚本会安装隔离的 Python 3.12 Kokoro 运行环境，并在首次安装时下载模型。脚本也会安装固定版本的在线语音运行环境，执行应用文件复制与临时签名。如果选定的自然语音运行环境不可用，本轮播报会结束，不会切换到 macOS 系统语音。

运行朗读文本清理回归测试：

```sh
swiftc -target arm64-apple-macos13.0 \
  desktop/macos/SpeechText.swift desktop/macos/test-speech-text.swift \
  -o /private/tmp/test-speech-text
/private/tmp/test-speech-text
```

使用临时本地 Git 仓库、隔离 DSH home 与回环夹具 Runtime 运行受控更新程序集成测试：

```sh
/bin/zsh desktop/macos/test-update-harness.sh
```
