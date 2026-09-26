import Foundation

/** Local cleanup and segmentation for text that is safe to hand to speech synthesis. */
enum SpeechText {
  /** Remove presentation syntax and non-verbal content from one assistant response. */
  static func clean(_ source: String) -> String {
    var text = source
    text = replace(text, pattern: #"(?s)```.*?```"#, with: "。")
    text = replace(text, pattern: #"`[^`]*`"#, with: "")
    text = replace(text, pattern: #"!\[[^\]]*\]\([^)]*\)"#, with: "")
    text = replace(text, pattern: #"\[([^\]]+)\]\([^)]*\)"#, with: "$1")
    text = replace(text, pattern: #"https?://\S+|www\.\S+"#, with: "")
    text = replace(text, pattern: #"<[^>]+>"#, with: "")
    text = replace(text, pattern: #"(?m)^\s{0,3}(?:#{1,6}|[-*+]\s|\d+[.)]\s|>\s?)"#, with: "")
    text = replace(text, pattern: #"[*_~|]"#, with: "")

    var usefulLines = text.components(separatedBy: .newlines).filter { line in
      let value = line.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      return !["copy", "copied", "复制", "已复制"].contains(value)
    }
    if usefulLines.contains(where: containsHan) {
      while let first = usefulLines.first, !containsHan(first) {
        usefulLines.removeFirst()
      }
    }
    text = usefulLines.joined(separator: "。")
    text = String(text.unicodeScalars.filter { scalar in
      if scalar.value == 0x200D || scalar.value == 0xFE0E || scalar.value == 0xFE0F { return false }
      if CharacterSet.alphanumerics.contains(scalar) { return true }
      return !scalar.properties.isEmoji && !scalar.properties.isEmojiPresentation
    })
    text = replace(text, pattern: #"[^\p{L}\p{N}\s，。！？；：、,.!?;:（）()《》“”‘’—-]"#, with: "")
    text = trimLeadingEnglishNoise(text)
    text = replace(text, pattern: #"[\t ]+"#, with: " ")
    text = replace(text, pattern: #"\s*([，。！？；：、,.!?;:])\s*"#, with: "$1")
    text = replace(text, pattern: #"[。．.]{2,}"#, with: "。")
    text = replace(text, pattern: #"[，,]{2,}"#, with: "，")
    return text.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  /** Split cleaned prose into short requests so the first neural audio starts quickly. */
  static func chunks(_ source: String, firstLimit: Int = 48, laterLimit: Int = 220, maximumCharacters: Int = 900) -> [String] {
    let text = String(clean(source).prefix(maximumCharacters))
    guard !text.isEmpty else { return [] }
    var result: [String] = []
    var current = ""
    let sentenceStops: Set<Character> = ["。", "！", "？", "!", "?", "；", ";"]
    let softStops: Set<Character> = ["，", ",", "：", ":", "、"]

    func flush() {
      let value = current.trimmingCharacters(in: .whitespacesAndNewlines)
      if !value.isEmpty { result.append(value) }
      current = ""
    }

    for character in text {
      current.append(character)
      let limit = result.isEmpty ? firstLimit : laterLimit
      if sentenceStops.contains(character) || (current.count >= limit && softStops.contains(character)) || current.count >= limit + 18 {
        flush()
      }
    }
    flush()
    return result
  }

  /** Return one cleaned Mandarin speech unit, rejecting code or English-only stream fragments. */
  static func spokenChunk(_ source: String) -> String? {
    let value = conversationalize(clean(source))
    guard value.unicodeScalars.contains(where: isHan) else { return nil }
    return value.count >= 2 ? value : nil
  }

  /** Return whether a partial microphone transcript is probably the currently playing answer. */
  static func isLikelyPlaybackEcho(_ transcript: String, spokenText: String) -> Bool {
    let heard = speechComparisonKey(transcript)
    let spoken = speechComparisonKey(spokenText)
    guard heard.count >= 2, !spoken.isEmpty else { return true }
    return spoken.contains(heard) || (spoken.count >= 4 && heard.contains(spoken))
  }

  private static func conversationalize(_ source: String) -> String {
    var text = source
    text = replace(text, pattern: #"^(?:回答|结论|总结|简而言之|简单来说|直接说)[：:，,\s]*"#, with: "")
    text = replace(text, pattern: #"(?:首先|第一(?:点|个)?(?:是)?)[：:，,\s]*"#, with: "先说，")
    text = replace(text, pattern: #"(?:其次|第二(?:点|个)?(?:是)?)[：:，,\s]*"#, with: "再说，")
    text = replace(text, pattern: #"(?:最后|第三(?:点|个)?(?:是)?)[：:，,\s]*"#, with: "最后，")
    text = replace(text, pattern: #"(?:需要注意的是|值得注意的是)[：:，,\s]*"#, with: "要注意，")
    text = replace(text, pattern: #"(?:值得一提的是|此外)[：:，,\s]*"#, with: "另外，")
    text = replace(text, pattern: #"(?:综上所述|因此)[：:，,\s]*"#, with: "所以，")
    text = replace(text, pattern: #"然而[：:，,\s]*"#, with: "不过，")
    text = replace(text, pattern: #"[；;：:]"#, with: "，")
    text = replace(text, pattern: #"[，,]{2,}"#, with: "，")
    return text.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private static func replace(_ source: String, pattern: String, with replacement: String) -> String {
    source.replacingOccurrences(of: pattern, with: replacement, options: .regularExpression)
  }

  private static func trimLeadingEnglishNoise(_ source: String) -> String {
    let scalars = source.unicodeScalars
    guard scalars.contains(where: isHan), let firstHan = scalars.firstIndex(where: isHan) else { return source }
    let prefix = String(scalars[..<firstHan])
    guard prefix.range(of: #"[A-Za-z]"#, options: .regularExpression) != nil else { return source }
    return String(scalars[firstHan...])
  }

  private static func containsHan(_ source: String) -> Bool {
    source.unicodeScalars.contains(where: isHan)
  }

  private static func speechComparisonKey(_ source: String) -> String {
    String(source.lowercased().unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) })
  }

  private static func isHan(_ scalar: Unicode.Scalar) -> Bool {
    (0x3400...0x4DBF).contains(scalar.value)
      || (0x4E00...0x9FFF).contains(scalar.value)
      || (0xF900...0xFAFF).contains(scalar.value)
  }
}
