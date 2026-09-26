#!/bin/zsh

set -euo pipefail

repository=${0:A:h:h:h}
bundle="/Applications/DeepSeek Harness.app"
executable="/private/tmp/DeepSeekHarness-voice-orb"
voice_runtime="$HOME/Library/Application Support/DeepSeek Harness/voice-runtime"
voice_requirements="$repository/desktop/macos/voice-requirements.txt"
kokoro_runtime="$HOME/Library/Application Support/DeepSeek Harness/kokoro-runtime"
kokoro_requirements="$repository/desktop/macos/kokoro-requirements.txt"
kokoro_model_marker="$HOME/Library/Application Support/DeepSeek Harness/kokoro-model-cache/hub/models--hexgrad--Kokoro-82M/refs/main"

if [[ ! -d "$bundle/Contents/MacOS" || ! -d "$bundle/Contents/Resources" ]]; then
  print -u2 "找不到已经安装的 DeepSeek Harness.app。"
  exit 10
fi

if [[ ! -x "$executable" ]]; then
  print -u2 "找不到已编译的语音伴侣客户端：$executable"
  exit 11
fi

python_path=""
for candidate in /usr/local/bin/python3 /opt/homebrew/bin/python3 /usr/bin/python3; do
  if [[ -x "$candidate" ]]; then
    python_path="$candidate"
    break
  fi
done

if [[ -n "$python_path" ]]; then
  /bin/mkdir -p "${voice_runtime:h}"
  if "$python_path" -m venv "$voice_runtime" \
    && "$voice_runtime/bin/python" -m pip install --disable-pip-version-check --quiet -r "$voice_requirements"; then
    print "自然中文语音运行环境已就绪。"
  else
    print -u2 "在线自然语音安装失败；客户端不会切换到系统机械音色。"
  fi
else
  print -u2 "找不到 Python 3；在线自然语音不可用。"
fi

if [[ -x /opt/homebrew/bin/uv ]]; then
  if [[ ! -x "$kokoro_runtime/bin/python" ]]; then
    if ! /opt/homebrew/bin/uv venv --python 3.12 "$kokoro_runtime"; then
      print -u2 "无法创建本地神经语音 Python 环境。"
    fi
  fi
  if [[ -x "$kokoro_runtime/bin/python" ]] \
    && /opt/homebrew/bin/uv pip install --python "$kokoro_runtime/bin/python" --quiet -r "$kokoro_requirements"; then
    if [[ ! -f "$kokoro_model_marker" ]] \
      && ! "$kokoro_runtime/bin/python" "$repository/desktop/macos/kokoro-voice.py" --preload; then
      print -u2 "本地语音模型下载失败；选择在线语音后仍可使用在线自然语音。"
    fi
    if [[ -f "$kokoro_model_marker" ]]; then
      print "本地低延迟未来语音运行环境已就绪。"
    fi
  else
    print -u2 "本地神经语音安装失败；选择在线语音后仍可使用在线自然语音。"
  fi
else
  print -u2 "找不到 uv；本地神经语音不可用。"
fi

/usr/bin/install -m 755 "$executable" "$bundle/Contents/MacOS/DeepSeekHarness"
/usr/bin/install -m 644 "$repository/desktop/macos/Info.plist" "$bundle/Contents/Info.plist"
/usr/bin/install -m 755 "$repository/desktop/macos/update-harness.sh" "$bundle/Contents/Resources/update-harness.sh"
/usr/bin/install -m 755 "$repository/desktop/macos/controlled-update.mjs" "$bundle/Contents/Resources/controlled-update.mjs"
/usr/bin/install -m 755 "$repository/desktop/macos/kokoro-voice.py" "$bundle/Contents/Resources/kokoro-voice.py"
/usr/bin/codesign --force --deep --sign - "$bundle"

print "DeepSeek Harness 语音伴侣客户端已安装。"
