# DeepSeek Harness macOS Shell

English | [中文](README.zh.md)

`DeepSeekHarness.swift` is the source for the native wrapper used by the local macOS installation. It starts `apps/cli/lib/bin.js web --no-open` from this checkout and renders `http://127.0.0.1:3080` in a `WKWebView`; the flag prevents the server from also handing the page to the default browser. On macOS 14 and newer, that local Web view uses no proxy configuration so a disabled system proxy cannot divert the loopback page and leave the application blank.

The wrapper installs a standard macOS Edit menu with Undo, Redo, Cut, Copy, Paste, and Select All. Those responder-chain commands allow `⌘X`, `⌘C`, `⌘V`, and `⌘A` to reach the focused WebKit text input.

## Companion Orb

The native shell includes an always-on-top voice companion that stays available when the main window is closed. Harness exposes it in two places: a waveform plus **Voice** label beside **Settings**, and the composer's black circular primary control. An empty composer shows the voice waveform; the bridge uses the native send button's enabled state together with text, paste, drop, and attachment changes, so entering text or attaching a file immediately restores the black send arrow. The composer control intercepts the pointer-down at its visible topmost bounds so an underlying disabled Web button cannot swallow the voice action. `⌘⇧Space` starts a conversation and `⌘⇧V` shows or hides the companion. A conversation opens the compact form; a single orb click starts, finishes, or interrupts speech, a double click transitions to or from the egg-sized display, and dragging moves it across the desktop. Right-clicking exposes the same controls. The native surface remains visibly animated while idle: a deep-blue asymmetric shell continuously rotates, stretches, and changes outline around brighter electric-blue filaments, flowing particles, and a luminous core.

Speech is transcribed through the macOS Speech framework and submitted into the active Harness composer. The active session therefore keeps its selected model, permission preset, workspace, skills, and tools. The bridge watches only that submitted turn, reflects listening, thinking, tool-execution, and speaking states in the orb animation, and emits complete short clauses while the model is still streaming. The native queue starts the first clause without waiting for the final answer, pre-generates the next clause during playback, and automatically resumes listening after the spoken response ends. During playback, a voice-processed microphone tap feeds both a lower-latency energy detector and partial Chinese recognition. A sustained foreground level or a recognized phrase that does not match the current spoken clause interrupts the complete turn: native playback stops, the bridge clicks the active Harness stop control, and normal recognition resumes while retaining any recognized interruption phrase. Voice submission waits until the composer leaves its busy state and retries for a bounded period, so a phrase spoken during cancellation is not discarded. Clicking the orb provides the same deterministic interruption path. The response row remains visually suppressed during the voice turn and is revealed after playback, so the interaction is not paced by text appearing ahead of the voice. Before synthesis, the wrapper excludes reasoning rows, code elements, controls, presentation-only Markdown, URLs, emoji, English-only stream fragments, and every leading non-Chinese block when Chinese prose follows. It also rewrites common report-style transitions into shorter spoken Mandarin and limits one spoken turn while leaving the complete text available in the conversation.

When the user permits online natural speech, output prefers the pinned `edge-tts` runtime and the conversational `zh-CN-YunxiNeural` voice for lower first-clause latency and less formal Mandarin prosody. The wrapper applies only slight pitch, equalization, delay, and reverb through one persistent AVAudioEngine graph, preserving the human voice while adding restrained spatial polish. The locally installed Kokoro 82M Mandarin model with `zm_yunxi` remains the private fallback. Its app-owned Python daemon loads once, serves synthesis through a user-private Unix socket, and exits with the desktop process. The current local installation uses approximately 1.3 GB of disk and about 750 MB of memory while the warmed local daemon is running.

The application asks once before sending each short answer clause to the Microsoft Edge speech service; it never includes model credentials, files, or the complete conversation. Rejecting online output selects local Kokoro. If the selected neural backend fails, the spoken turn stops and listening resumes without switching to the mechanical macOS system voice. The **Voice output settings…** application-menu item changes the saved choice. No output mode creates a second model configuration or stores model credentials.

The selected DeepSeek and Kimi providers accept text turns rather than a continuous audio stream. This companion reduces turn latency, resumes listening automatically, and supports barge-in, but it is not an audio-native full-duplex model session: simultaneous semantic listening and speaking requires a provider with a real-time audio API.

The application also declares Documents-folder access because this local installation and its workspaces live under the user's Documents directory. The first voice action asks for macOS Microphone and Speech Recognition permission. If the active page has no writable conversation, the companion opens the main window and reports that it could not send instead of creating a hidden session.

## File selection

The wrapper serves Web file-input requests through a native `NSOpenPanel` attached to the application window. The panel follows the page's directory and multiple-selection flags, and selecting or cancelling resolves the originating WebKit request exactly once.

## Local branding

The application-only Web view presents the sidebar name as **DeepSeek Harness** without the local build hash and presents the empty-session headline as **简哥 · 探索未知之境** without the preview badge. A main-frame user script applies these exact substitutions to the initial document and later client remounts. The served Web page remains unchanged when opened in an external browser.

## Updates

The wrapper checks the official repository four seconds after launch and every six hours while it remains open. Detection fetches only into `<PRIVATE_UPDATE_TEST_ROOT>/upstream-full.git`; it never fetches the production checkout. A blue **Test new version** button appears over the lower-left corner when the official `master` is newer than Stable V0. The panel shows the Stable SHA, candidate SHA, added commit count, detection time, test status, compatibility result, and whether production changed.

Clicking **Test new version** runs the bundled `controlled-update.mjs`. Each run extracts the verified Stable V0 source snapshot into a new physical candidate directory, fetches the detected SHA from the Test-only mirror, and replays the ten Stable V0 customization commits there. It uses `<PRIVATE_DSH_TEST_ROOT>/candidates/<candidate>` as `DSH_HOME`, restores the pinned Stable V0 Web Profile into that home, installs with the frozen root lockfile, builds Runtime and Web, and starts a temporary Runtime on port 3180. The checks cover source replay, frozen install, build outputs, HTTP, RPC, WebSocket, Workspace and Session creation, Skill Registry, focused Workflow capability tests, pinned Profile bundles, and macOS shell typechecking. The Test Runtime is stopped after the report is written.

Candidate states and reports live under the Test root. Failed candidates remain inspectable and cannot be approved. A passed candidate exposes **Approve Stable upgrade**, which asks for explicit confirmation and records `approved`; V0.1 does not implement `promoted` or write the production repository. The legacy `update-harness.sh` always refuses production in-place updates.

The wrapper gives the Web server and every updater command an explicit macOS package-manager search path covering `/usr/local/bin` and `/opt/homebrew/bin`. GUI launches therefore expose the installed `pnpm`, `corepack`, and `npx` commands to profile-plugin update panels instead of inheriting Finder's restricted `/usr/bin:/bin` path.

Production `~/.dsh`, port 3080, and the production server remain active during candidate testing. The application must remain open until the candidate runner reports completion, and update checks do not run while the application is closed.

## Build and install

Build the arm64 executable from the repository root. The macOS 15.4 SDK is selected explicitly on machines whose newest Command Line Tools compiler and SDK patch versions do not match:

```sh
swiftc -sdk /Library/Developer/CommandLineTools/SDKs/MacOSX15.4.sdk \
  -module-cache-path /private/tmp/deepseek-harness-swift-cache \
  -target arm64-apple-macos13.0 \
  -framework AppKit -framework WebKit -framework AVFoundation -framework Speech \
  desktop/macos/DeepSeekHarness.swift desktop/macos/SpeechText.swift \
  -o /private/tmp/DeepSeekHarness
```

Install the executable as `Contents/MacOS/DeepSeekHarness`, install `Info.plist` as `Contents/Info.plist`, and copy both `controlled-update.mjs` and the disabled legacy `update-harness.sh` to the application bundle's `Contents/Resources` directory. Sign the bundle after all files are in place.

For the existing local installation, `desktop/macos/install-local.sh` uses `uv` when available to install the isolated Python 3.12 Kokoro runtime and download its model on first installation. It also installs the pinned online speech runtime, performs the application copy steps, and ad-hoc signs the bundle after the executable above has been compiled. If the selected natural-speech runtime is unavailable, the spoken turn ends without switching to macOS system speech.

Run the speech-cleaning regression test:

```sh
swiftc -target arm64-apple-macos13.0 \
  desktop/macos/SpeechText.swift desktop/macos/test-speech-text.swift \
  -o /private/tmp/test-speech-text
/private/tmp/test-speech-text
```

Run the controlled-updater integration test against temporary local Git repositories, isolated DSH homes, and a loopback fixture Runtime:

```sh
/bin/zsh desktop/macos/test-update-harness.sh
```
