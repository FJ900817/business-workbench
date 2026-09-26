import Foundation

private func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
  guard condition() else {
    FileHandle.standardError.write(Data("FAIL: \(message)\n".utf8))
    exit(1)
  }
}

@main
private struct SpeechTextTest {
  static func main() {
    let noisy = """
    😊 **Here is the answer**
    这是自然语言回答 ✅，不会朗读表情。
    ```swift
    print("do not speak")
    ```
    [查看资料](https://example.com) Copy
    """
    let clean = SpeechText.clean(noisy)
    expect(!clean.contains("😊"), "emoji must be removed")
    expect(!clean.contains("Here is the answer"), "leading English UI noise must be removed")
    expect(!clean.contains("print"), "code blocks must be removed")
    expect(!clean.contains("https://"), "URLs must be removed")
    expect(clean.contains("这是自然语言回答"), "Chinese answer must remain")
    let longCodePrefix = String(repeating: "const result = await executeTask();\n", count: 12)
    let cleanedPrefix = SpeechText.clean(longCodePrefix + "现在开始用中文回答。")
    expect(cleanedPrefix == "现在开始用中文回答。", "long leading code-like English must be removed")
    expect(SpeechText.chunks(String(repeating: "这是一个自然句子，", count: 20)).count > 1, "long speech must be chunked")
    expect(SpeechText.chunks("短句。").first == "短句。", "short speech must remain intact")
    expect(SpeechText.spokenChunk("```ts\nconst value = 1\n```") == nil, "code-only stream chunks must not be spoken")
    expect(SpeechText.spokenChunk("Here is the answer.") == nil, "English-only stream chunks must not be spoken")
    expect(SpeechText.spokenChunk("好的，我们现在开始。") == "好的，我们现在开始。", "Mandarin stream chunks must remain speakable")
    expect(SpeechText.spokenChunk("结论：首先，需要注意的是延迟。") == "先说，要注意，延迟。", "written headings must become conversational Mandarin")
    expect(SpeechText.isLikelyPlaybackEcho("现在开始", spokenText: "好的，我们现在开始。"), "matching playback transcript must be treated as echo")
    expect(!SpeechText.isLikelyPlaybackEcho("请先停一下", spokenText: "好的，我们现在开始。"), "new foreground speech must be treated as an interruption")
    print("speech text tests passed")
  }
}
