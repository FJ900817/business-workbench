import AppKit
import AVFoundation
import Darwin
import Foundation
import Speech
import WebKit

private struct CommandResult {
  let status: Int32
  let output: String
}

private struct ControlledUpdateTestResult: Decodable {
  let name: String
  let status: String
}

private struct ControlledUpdateState: Decodable {
  let status: String
  let stableSHA: String
  let candidateSHA: String?
  let commitCount: Int
  let detectedAt: String?
  let testedAt: String?
  let approvedAt: String?
  let productionChanged: Bool
  let fixtureMode: Bool?
  let testRoot: String
  let testDshRoot: String
  let testPort: Int
  let candidateRoot: String?
  let reportMarkdown: String?
  let summary: String
  let failureReason: String?
  let tests: [ControlledUpdateTestResult]
}

/** Generates short neural-speech files and plays them through one effects graph. */
private final class NeuralSpeechPlayer: NSObject {
  enum Backend {
    case local
    case online
  }

  private let edgeExecutableURL: URL
  private let localPythonURL: URL
  private let localScriptURL: URL
  private var daemonProcess: Process?
  private var runID = UUID()
  private var processes: [Int: Process] = [:]
  private var outputs: [URL] = []
  private var ready: Set<Int> = []
  private var failed: Set<Int> = []
  private var nextIndex = 0
  private let audioEngine = AVAudioEngine()
  private let playerNode = AVAudioPlayerNode()
  private let pitchUnit = AVAudioUnitTimePitch()
  private let equalizer = AVAudioUnitEQ(numberOfBands: 2)
  private let reverb = AVAudioUnitReverb()
  private let delay = AVAudioUnitDelay()
  private var currentFile: AVAudioFile?
  private var directory: URL?
  private var retainedDirectories: [URL] = []
  private var completion: ((Bool) -> Void)?
  private var prefetchedText: String?
  private var prefetchProcess: Process?
  private var prefetchURL: URL?
  private var prefetchDirectory: URL?
  private var prefetchReady = false
  private var prefetchedBackend: Backend?
  var onPlaybackStarted: (() -> Void)?

  override init() {
    edgeExecutableURL = FileManager.default.homeDirectoryForCurrentUser
      .appendingPathComponent("Library/Application Support/DeepSeek Harness/voice-runtime/bin/edge-tts")
    localPythonURL = FileManager.default.homeDirectoryForCurrentUser
      .appendingPathComponent("Library/Application Support/DeepSeek Harness/kokoro-runtime/bin/python")
    localScriptURL = Bundle.main.resourceURL?.appendingPathComponent("kokoro-voice.py")
      ?? URL(fileURLWithPath: "/Applications/DeepSeek Harness.app/Contents/Resources/kokoro-voice.py")
    super.init()
    configureAudioGraph()
  }

  var isAvailable: Bool {
    isLocalAvailable || FileManager.default.isExecutableFile(atPath: edgeExecutableURL.path)
  }

  var isLocalAvailable: Bool {
    FileManager.default.isExecutableFile(atPath: localPythonURL.path)
      && FileManager.default.fileExists(atPath: localScriptURL.path)
  }

  var isOnlineAvailable: Bool {
    FileManager.default.isExecutableFile(atPath: edgeExecutableURL.path)
  }

  var isActive: Bool {
    playerNode.isPlaying || !processes.isEmpty
  }

  func prewarm() {
    if isLocalAvailable {
      startLocalDaemon()
    }
    guard isOnlineAvailable else { return }
    let process = Process()
    process.executableURL = edgeExecutableURL
    process.arguments = ["--version"]
    process.environment = Self.sanitizedEnvironment()
    process.standardOutput = FileHandle.nullDevice
    process.standardError = FileHandle.nullDevice
    try? process.run()
  }

  func prefetch(_ text: String, backend: Backend) {
    guard isAvailable, !text.isEmpty,
          text != prefetchedText || backend != prefetchedBackend else { return }
    stopPrefetch()
    let directory = FileManager.default.temporaryDirectory
      .appendingPathComponent("deepseek-harness-prefetch-\(UUID().uuidString)", isDirectory: true)
    let inputURL = directory.appendingPathComponent("speech.txt")
    let outputURL = directory.appendingPathComponent("speech.mp3")
    do {
      try FileManager.default.createDirectory(
        at: directory,
        withIntermediateDirectories: false,
        attributes: [.posixPermissions: 0o700]
      )
      try Data(text.utf8).write(to: inputURL, options: .withoutOverwriting)
      try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: inputURL.path)
      let process = makeProcess(inputURL: inputURL, outputURL: outputURL, backend: backend)
      prefetchedText = text
      prefetchedBackend = backend
      prefetchProcess = process
      prefetchURL = outputURL
      prefetchDirectory = directory
      process.terminationHandler = { [weak self, weak process] ended in
        DispatchQueue.main.async {
          guard let self, let process, self.prefetchProcess === process else { return }
          self.prefetchProcess = nil
          self.prefetchReady = ended.terminationStatus == 0
            && FileManager.default.fileExists(atPath: outputURL.path)
        }
      }
      try process.run()
    } catch {
      stopPrefetch()
    }
  }

  func speak(chunks: [String], backend: Backend, completion: @escaping (Bool) -> Void) {
    guard isAvailable, !chunks.isEmpty else {
      completion(false)
      return
    }
    let prefetchedFileExists = prefetchURL.map { FileManager.default.fileExists(atPath: $0.path) } ?? false
    let adoptsPrefetch = prefetchedText == chunks[0] && prefetchedBackend == backend
      && (prefetchReady || prefetchedFileExists || prefetchProcess?.isRunning == true)
    stop(notify: false, includingPrefetch: false)
    if !adoptsPrefetch { stopPrefetch() }
    let currentRun = UUID()
    runID = currentRun
    self.completion = completion
    nextIndex = 0
    let directory = FileManager.default.temporaryDirectory
      .appendingPathComponent("deepseek-harness-voice-\(currentRun.uuidString)", isDirectory: true)
    do {
      try FileManager.default.createDirectory(
        at: directory,
        withIntermediateDirectories: false,
        attributes: [.posixPermissions: 0o700]
      )
    } catch {
      finish(success: false)
      return
    }
    self.directory = directory
    outputs = chunks.indices.map { directory.appendingPathComponent("speech-\($0).mp3") }

    var firstIndexToGenerate = 0
    if adoptsPrefetch, let prefetchedURL = prefetchURL, let prefetchedDirectory = prefetchDirectory {
      outputs[0] = prefetchedURL
      retainedDirectories.append(prefetchedDirectory)
      if prefetchReady || prefetchedFileExists {
        ready.insert(0)
      } else if let process = prefetchProcess {
        attachCompletion(to: process, index: 0, outputURL: prefetchedURL, runID: currentRun)
        processes[0] = process
      }
      prefetchedText = nil
      prefetchedBackend = nil
      prefetchProcess = nil
      prefetchURL = nil
      prefetchDirectory = nil
      prefetchReady = false
      firstIndexToGenerate = 1
    }

    for (index, chunk) in chunks.enumerated() where index >= firstIndexToGenerate {
      let inputURL = directory.appendingPathComponent("speech-\(index).txt")
      do {
        try Data(chunk.utf8).write(to: inputURL, options: .withoutOverwriting)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: inputURL.path)
        try startGeneration(
          index: index,
          inputURL: inputURL,
          outputURL: outputs[index],
          runID: currentRun,
          backend: backend
        )
      } catch {
        failed.insert(index)
      }
    }
    tryPlayNext(runID: currentRun)
  }

  func stop() {
    stop(notify: false)
  }

  func shutdown() {
    stop(notify: false)
    if let daemonProcess, daemonProcess.isRunning { daemonProcess.terminate() }
    daemonProcess = nil
    audioEngine.stop()
  }

  func stopPlaybackPreservingPrefetch() {
    stop(notify: false, includingPrefetch: false)
  }

  private func startGeneration(
    index: Int,
    inputURL: URL,
    outputURL: URL,
    runID: UUID,
    backend: Backend
  ) throws {
    let process = makeProcess(inputURL: inputURL, outputURL: outputURL, backend: backend)
    attachCompletion(to: process, index: index, outputURL: outputURL, runID: runID)
    try process.run()
    processes[index] = process
  }

  private func attachCompletion(to process: Process, index: Int, outputURL: URL, runID: UUID) {
    process.terminationHandler = { [weak self] ended in
      DispatchQueue.main.async {
        guard let self, self.runID == runID else { return }
        self.processes.removeValue(forKey: index)
        if ended.terminationStatus == 0,
           FileManager.default.fileExists(atPath: outputURL.path) {
          self.ready.insert(index)
        } else {
          self.failed.insert(index)
        }
        self.tryPlayNext(runID: runID)
      }
    }
  }

  private func makeProcess(inputURL: URL, outputURL: URL, backend: Backend) -> Process {
    let process = Process()
    if backend == .local {
      startLocalDaemon()
      process.executableURL = localPythonURL
      process.arguments = [
        localScriptURL.path,
        "--file", inputURL.path,
        "--write-media", outputURL.path,
      ]
    } else {
      process.executableURL = edgeExecutableURL
      process.arguments = [
        "--voice", "zh-CN-YunxiNeural",
        "--rate=+3%",
        "--pitch=-2Hz",
        "--file", inputURL.path,
        "--write-media", outputURL.path,
      ]
    }
    process.environment = Self.sanitizedEnvironment()
    process.standardOutput = FileHandle.nullDevice
    process.standardError = FileHandle.nullDevice
    return process
  }

  private func startLocalDaemon() {
    guard isLocalAvailable, daemonProcess?.isRunning != true else { return }
    let process = Process()
    process.executableURL = localPythonURL
    process.arguments = [
      localScriptURL.path,
      "--daemon",
      "--parent-pid", String(getpid()),
    ]
    process.environment = Self.sanitizedEnvironment().merging([
      "PYTORCH_ENABLE_MPS_FALLBACK": "1",
    ]) { _, configured in configured }
    process.standardOutput = FileHandle.nullDevice
    process.standardError = FileHandle.nullDevice
    process.terminationHandler = { [weak self, weak process] _ in
      DispatchQueue.main.async {
        guard let self, let process, self.daemonProcess === process else { return }
        self.daemonProcess = nil
      }
    }
    do {
      try process.run()
      daemonProcess = process
    } catch {
      daemonProcess = nil
    }
  }

  private func tryPlayNext(runID: UUID) {
    guard self.runID == runID, currentFile == nil else { return }
    if nextIndex >= outputs.count {
      if processes.isEmpty { finish(success: true) }
      return
    }
    if failed.contains(nextIndex) {
      finish(success: false)
      return
    }
    guard ready.contains(nextIndex) else { return }
    do {
      let file = try AVAudioFile(forReading: outputs[nextIndex])
      currentFile = file
      if !audioEngine.isRunning {
        try audioEngine.start()
      }
      playerNode.scheduleFile(file, at: nil, completionCallbackType: .dataPlayedBack) { [weak self] _ in
        DispatchQueue.main.async {
          guard let self, self.runID == runID else { return }
          self.currentFile = nil
          self.nextIndex += 1
          self.tryPlayNext(runID: runID)
        }
      }
      playerNode.play()
      onPlaybackStarted?()
    } catch {
      finish(success: false)
    }
  }

  private func configureAudioGraph() {
    audioEngine.attach(playerNode)
    audioEngine.attach(pitchUnit)
    audioEngine.attach(equalizer)
    audioEngine.attach(reverb)
    audioEngine.attach(delay)
    audioEngine.connect(playerNode, to: pitchUnit, format: nil)
    audioEngine.connect(pitchUnit, to: equalizer, format: nil)
    audioEngine.connect(equalizer, to: reverb, format: nil)
    audioEngine.connect(reverb, to: delay, format: nil)
    audioEngine.connect(delay, to: audioEngine.mainMixerNode, format: nil)

    pitchUnit.pitch = -12
    pitchUnit.overlap = 8
    let lowShelf = equalizer.bands[0]
    lowShelf.filterType = .lowShelf
    lowShelf.frequency = 180
    lowShelf.gain = 0.7
    lowShelf.bypass = false
    let highShelf = equalizer.bands[1]
    highShelf.filterType = .highShelf
    highShelf.frequency = 4_200
    highShelf.gain = 0.6
    highShelf.bypass = false
    reverb.loadFactoryPreset(.mediumHall)
    reverb.wetDryMix = 2.2
    delay.delayTime = 0.012
    delay.feedback = 1
    delay.lowPassCutoff = 7_200
    delay.wetDryMix = 0.7
  }

  private func finish(success: Bool) {
    let completion = self.completion
    self.completion = nil
    let directory = self.directory
    self.directory = nil
    processes.values.forEach { process in
      if process.isRunning { process.terminate() }
    }
    processes.removeAll()
    playerNode.stop()
    currentFile = nil
    outputs.removeAll()
    ready.removeAll()
    failed.removeAll()
    nextIndex = 0
    if let directory { try? FileManager.default.removeItem(at: directory) }
    retainedDirectories.forEach { try? FileManager.default.removeItem(at: $0) }
    retainedDirectories.removeAll()
    completion?(success)
  }

  private func stop(notify: Bool, includingPrefetch: Bool = true) {
    runID = UUID()
    let completion = notify ? self.completion : nil
    self.completion = nil
    processes.values.forEach { process in
      if process.isRunning { process.terminate() }
    }
    processes.removeAll()
    playerNode.stop()
    currentFile = nil
    if let directory { try? FileManager.default.removeItem(at: directory) }
    directory = nil
    retainedDirectories.forEach { try? FileManager.default.removeItem(at: $0) }
    retainedDirectories.removeAll()
    outputs.removeAll()
    ready.removeAll()
    failed.removeAll()
    nextIndex = 0
    if includingPrefetch { stopPrefetch() }
    completion?(false)
  }

  private func stopPrefetch() {
    if let prefetchProcess, prefetchProcess.isRunning { prefetchProcess.terminate() }
    prefetchProcess = nil
    prefetchedText = nil
    prefetchedBackend = nil
    prefetchURL = nil
    prefetchReady = false
    if let prefetchDirectory { try? FileManager.default.removeItem(at: prefetchDirectory) }
    prefetchDirectory = nil
  }

  private static func sanitizedEnvironment() -> [String: String] {
    var environment = ProcessInfo.processInfo.environment
    for key in Array(environment.keys) {
      let upper = key.uppercased()
      if upper.contains("KEY") || upper.contains("SECRET") || upper.contains("TOKEN") || upper.contains("PASSWORD") {
        environment.removeValue(forKey: key)
      }
    }
    return environment
  }
}

private enum CompanionOrbState {
  case idle
  case listening
  case thinking
  case executing
  case speaking
  case error

  var title: String {
    switch self {
    case .idle: "轻触开始对话"
    case .listening: "正在聆听"
    case .thinking: "正在思考"
    case .executing: "正在执行"
    case .speaking: "正在回答"
    case .error: "需要检查"
    }
  }

  var colors: [NSColor] {
    switch self {
    case .idle: [NSColor(srgbRed: 0.52, green: 0.82, blue: 1, alpha: 1), .white, .black]
    case .listening: [NSColor(srgbRed: 0.14, green: 0.72, blue: 1, alpha: 1), .white, .black]
    case .thinking: [NSColor(srgbRed: 0.38, green: 0.58, blue: 1, alpha: 1), .white, .black]
    case .executing: [NSColor(srgbRed: 0.1, green: 0.86, blue: 1, alpha: 1), .white, .black]
    case .speaking: [NSColor(srgbRed: 0.28, green: 0.92, blue: 1, alpha: 1), .white, .black]
    case .error: [NSColor(srgbRed: 1, green: 0.28, blue: 0.34, alpha: 1), .white, .black]
    }
  }

  var speed: CGFloat {
    switch self {
    case .idle: 0.052
    case .listening: 0.11
    case .thinking: 0.082
    case .executing: 0.13
    case .speaking: 0.115
    case .error: 0.04
    }
  }
}

/** Animated, audio-reactive surface for the always-on-top companion. */
private final class CompanionOrbView: NSView {
  var onPrimaryAction: (() -> Void)?
  var onToggleSize: (() -> Void)?
  var onOpenHarness: (() -> Void)?
  var onHide: (() -> Void)?
  var state: CompanionOrbState = .idle {
    didSet { needsDisplay = true }
  }
  var audioLevel: CGFloat = 0 {
    didSet { needsDisplay = true }
  }
  var detail = "" {
    didSet { needsDisplay = true }
  }
  var expanded = false {
    didSet { needsDisplay = true }
  }

  private var phase: CGFloat = 0
  private var animationTimer: Timer?
  private var dragStartMouse: NSPoint?
  private var dragStartOrigin: NSPoint?

  override init(frame frameRect: NSRect) {
    super.init(frame: frameRect)
    wantsLayer = true
    layer?.backgroundColor = NSColor.clear.cgColor
    animationTimer = Timer.scheduledTimer(withTimeInterval: 1 / 30, repeats: true) { [weak self] _ in
      guard let self else { return }
      self.phase += self.state.speed
      self.audioLevel *= 0.9
      self.needsDisplay = true
    }
  }

  required init?(coder: NSCoder) {
    nil
  }

  deinit {
    animationTimer?.invalidate()
  }

  override var mouseDownCanMoveWindow: Bool { true }

  override func mouseDown(with event: NSEvent) {
    if event.clickCount == 2 {
      dragStartMouse = nil
      dragStartOrigin = nil
      onToggleSize?()
      return
    }
    dragStartMouse = NSEvent.mouseLocation
    dragStartOrigin = window?.frame.origin
  }

  override func mouseDragged(with event: NSEvent) {
    guard let window, let startMouse = dragStartMouse, let startOrigin = dragStartOrigin else { return }
    let current = NSEvent.mouseLocation
    window.setFrameOrigin(NSPoint(
      x: startOrigin.x + current.x - startMouse.x,
      y: startOrigin.y + current.y - startMouse.y
    ))
  }

  override func mouseUp(with event: NSEvent) {
    guard event.clickCount < 2 else { return }
    let start = dragStartMouse
    dragStartMouse = nil
    dragStartOrigin = nil
    guard let start else {
      onPrimaryAction?()
      return
    }
    let current = NSEvent.mouseLocation
    if hypot(current.x - start.x, current.y - start.y) < 4 { onPrimaryAction?() }
  }

  override func rightMouseDown(with event: NSEvent) {
    let menu = NSMenu(title: "语音伴侣")
    let talk = NSMenuItem(title: state == .listening ? "结束聆听" : "开始语音对话", action: #selector(primaryMenuAction(_:)), keyEquivalent: "")
    talk.target = self
    menu.addItem(talk)
    let size = NSMenuItem(title: expanded ? "缩成小球" : "展开语音球", action: #selector(sizeMenuAction(_:)), keyEquivalent: "")
    size.target = self
    menu.addItem(size)
    menu.addItem(.separator())
    let open = NSMenuItem(title: "打开 DeepSeek Harness", action: #selector(openMenuAction(_:)), keyEquivalent: "")
    open.target = self
    menu.addItem(open)
    let hide = NSMenuItem(title: "隐藏语音球", action: #selector(hideMenuAction(_:)), keyEquivalent: "")
    hide.target = self
    menu.addItem(hide)
    NSMenu.popUpContextMenu(menu, with: event, for: self)
  }

  @objc private func primaryMenuAction(_ sender: NSMenuItem) { onPrimaryAction?() }
  @objc private func sizeMenuAction(_ sender: NSMenuItem) { onToggleSize?() }
  @objc private func openMenuAction(_ sender: NSMenuItem) { onOpenHarness?() }
  @objc private func hideMenuAction(_ sender: NSMenuItem) { onHide?() }

  override func draw(_ dirtyRect: NSRect) {
    super.draw(dirtyRect)
    guard let context = NSGraphicsContext.current?.cgContext else { return }

    let labelSpace: CGFloat = expanded ? 44 : 0
    let orbRect = bounds.insetBy(dx: expanded ? 18 : 8, dy: expanded ? 16 : 8)
      .offsetBy(dx: 0, dy: labelSpace * 0.48)
    let baseCenter = NSPoint(x: orbRect.midX, y: orbRect.midY)
    let radiusX = orbRect.width * (expanded ? 0.41 : 0.42)
    let radiusY = orbRect.height * (expanded ? 0.39 : 0.42)
    let accent = state.colors[0]
    let activity: CGFloat = state == .idle ? 0.52 : 0.86
    let center = NSPoint(
      x: baseCenter.x + sin(phase * 0.71) * radiusX * 0.055,
      y: baseCenter.y + cos(phase * 0.57) * radiusY * 0.045
    )
    let dynamicRadiusX = radiusX * (1 + 0.075 * sin(phase * 0.83))
    let dynamicRadiusY = radiusY * (1 + 0.09 * cos(phase * 0.69))
    let rotation = phase * 0.19 + sin(phase * 0.41) * 0.28
    let pulse = 1 + 0.035 * sin(phase * 2.2) + min(audioLevel, 1) * 0.09
    let path = NSBezierPath()
    let points = 144
    for index in 0...points {
      let angle = CGFloat(index) / CGFloat(points) * .pi * 2
      let wave = sin(angle * 3 + phase * 1.9) * (expanded ? 0.11 : 0.085)
        + sin(angle * 5 - phase * 1.42) * 0.045
        + cos(angle * 8 + phase * 0.93) * 0.022
      let levelWave = sin(angle * 6 + phase * 4.2) * audioLevel * 0.065
      let radial = pulse * (1 + wave + levelWave)
      let localX = cos(angle) * dynamicRadiusX * radial
      let localY = sin(angle) * dynamicRadiusY * radial + (expanded ? sin(angle) * 5 : 0)
      let point = NSPoint(
        x: center.x + localX * cos(rotation) - localY * sin(rotation),
        y: center.y + localX * sin(rotation) + localY * cos(rotation)
      )
      if index == 0 { path.move(to: point) } else { path.line(to: point) }
    }
    path.close()

    context.saveGState()
    context.setShadow(offset: .zero, blur: expanded ? 46 : 24, color: accent.withAlphaComponent(0.4 + activity * 0.2).cgColor)
    NSColor(srgbRed: 0.018, green: 0.16, blue: 0.36, alpha: 0.98).setFill()
    path.fill()
    context.restoreGState()

    let glass = NSGradient(colors: [
      NSColor.white.withAlphaComponent(0.3),
      accent.withAlphaComponent(0.38 + activity * 0.15),
      NSColor(srgbRed: 0.02, green: 0.18, blue: 0.42, alpha: 0.97),
      NSColor(srgbRed: 0.005, green: 0.04, blue: 0.13, alpha: 0.98),
    ])
    glass?.draw(in: path, relativeCenterPosition: NSPoint(x: -0.38, y: 0.48))

    context.saveGState()
    path.addClip()
    for index in 0..<92 {
      let seed = CGFloat(index) * 2.399963
      let band = 0.12 + CGFloat(index % 13) / 16
      let drift = phase * (0.78 + CGFloat(index % 5) * 0.12)
      let angle = seed + drift * (index.isMultiple(of: 2) ? 1 : -1)
      let current = sin(seed * 1.7 + phase * 1.8) * 0.2
      let x = center.x + cos(angle) * radiusX * (band + current)
        + sin(phase * 2.1 + seed) * radiusX * 0.085
      let y = center.y + sin(angle * 0.92) * radiusY * band
        + cos(phase * 1.55 + seed * 0.7) * radiusY * 0.13
      let grain = (expanded ? 1.3 : 0.8) + CGFloat(index % 4) * (expanded ? 0.35 : 0.22)
      let particle = NSBezierPath(ovalIn: NSRect(x: x - grain / 2, y: y - grain / 2, width: grain, height: grain))
      (index.isMultiple(of: 7) ? NSColor.white : accent)
        .withAlphaComponent(0.26 + activity * (0.18 + CGFloat(index % 5) * 0.035)).setFill()
      particle.fill()
    }

    for index in 0..<7 {
      let offset = CGFloat(index) - 3
      let filament = NSBezierPath()
      filament.move(to: NSPoint(
        x: center.x - radiusX * 0.72,
        y: center.y + offset * radiusY * 0.1 + sin(phase * 1.8 + offset) * 13,
      ))
      filament.curve(
        to: NSPoint(
          x: center.x + radiusX * 0.7,
          y: center.y - offset * radiusY * 0.1 + cos(phase * 1.65 + offset) * 13,
        ),
        controlPoint1: NSPoint(
          x: center.x - radiusX * 0.24,
          y: center.y + radiusY * (0.56 - CGFloat(index) * 0.14) + sin(phase * 2.1) * 12,
        ),
        controlPoint2: NSPoint(
          x: center.x + radiusX * 0.22,
          y: center.y - radiusY * (0.48 - CGFloat(index) * 0.12) + cos(phase * 1.95) * 12,
        )
      )
      filament.lineWidth = expanded ? 1.25 : 0.78
      (index.isMultiple(of: 3) ? NSColor.white : accent)
        .withAlphaComponent(0.12 + activity * 0.15).setStroke()
      filament.stroke()
    }
    context.restoreGState()

    let coreScale = 0.25 + audioLevel * 0.055 + 0.028 * sin(phase * 3)
    let coreRect = NSRect(
      x: center.x - radiusX * coreScale,
      y: center.y - radiusY * coreScale,
      width: radiusX * coreScale * 2,
      height: radiusY * coreScale * 2,
    )
    let core = NSBezierPath(ovalIn: coreRect)
    context.saveGState()
    context.setShadow(offset: .zero, blur: expanded ? 24 : 12, color: accent.withAlphaComponent(0.55).cgColor)
    NSGradient(colors: [NSColor.white.withAlphaComponent(0.9), accent.withAlphaComponent(0.42), NSColor.clear])?
      .draw(in: core, angle: -45)
    context.restoreGState()

    context.saveGState()
    context.setShadow(offset: .zero, blur: expanded ? 14 : 8, color: accent.withAlphaComponent(0.6).cgColor)
    NSColor.white.withAlphaComponent(0.7).setStroke()
    path.lineWidth = expanded ? 1.6 : 1.05
    path.stroke()
    context.restoreGState()

    let arcRadius = min(radiusX, radiusY) * 1.04
    for index in 0..<4 {
      let start = CGFloat(index) * 86 + phase * (index.isMultiple(of: 2) ? 62 : -48)
      let arc = NSBezierPath()
      arc.appendArc(withCenter: center, radius: arcRadius - CGFloat(index) * 3.5, startAngle: start, endAngle: start + 18 + CGFloat(index) * 5)
      arc.lineCapStyle = .round
      arc.lineWidth = expanded ? 1.2 - CGFloat(index) * 0.16 : 0.75
      accent.withAlphaComponent(0.38 - CGFloat(index) * 0.055).setStroke()
      arc.stroke()
    }

    if expanded {
      let paragraph = NSMutableParagraphStyle()
      paragraph.alignment = .center
      let status = state.title as NSString
      status.draw(
        in: NSRect(x: 8, y: 22, width: bounds.width - 16, height: 20),
        withAttributes: [
          .font: NSFont.systemFont(ofSize: 13, weight: .semibold),
          .foregroundColor: NSColor.white.withAlphaComponent(0.9),
          .paragraphStyle: paragraph,
        ]
      )
      let secondary = (detail.isEmpty ? "DeepSeek Harness" : detail) as NSString
      secondary.draw(
        in: NSRect(x: 8, y: 7, width: bounds.width - 16, height: 16),
        withAttributes: [
          .font: NSFont.systemFont(ofSize: 10, weight: .medium),
          .foregroundColor: accent.withAlphaComponent(0.66),
          .paragraphStyle: paragraph,
        ]
      )
    }
  }
}

/** Owns the floating panel, speech recognition, and spoken responses. */
private final class CompanionOrbController: NSObject {
  var onTranscript: ((String) -> Void)?
  var onOpenHarness: (() -> Void)?
  var onError: ((String) -> Void)?
  var onResponsePlaybackFinished: (() -> Void)?
  var onInterruptActiveTurn: ((@escaping () -> Void) -> Void)?
  var requestNaturalVoiceConsent: ((@escaping (Bool) -> Void) -> Void)?

  private let compactSize = NSSize(width: 84, height: 84)
  private let expandedSize = NSSize(width: 194, height: 236)
  private let panel: NSPanel
  private let orbView: CompanionOrbView
  private let speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "zh-CN"))
  private let audioEngine = AVAudioEngine()
  private let neuralSpeech = NeuralSpeechPlayer()
  private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
  private var recognitionTask: SFSpeechRecognitionTask?
  private var silenceTimer: Timer?
  private var latestTranscript = ""
  private var recognitionSeed = ""
  private var audioTapInstalled = false
  private var speechRunID = UUID()
  private var responseQueue: [String] = []
  private var responseFinished = false
  private var playingResponseChunk = false
  private var voicePreferenceResolved = false
  private var speechBackend: NeuralSpeechPlayer.Backend?
  private var continuousConversation = false
  private var resumeTimer: Timer?
  private var responseActive = false
  private var spokenCharacterCount = 0
  private let spokenCharacterLimit = 520
  private var bargeInMonitoring = false
  private var bargeInArmedAt: TimeInterval = .greatestFiniteMagnitude
  private var bargeInNoiseFloor: Float = 0.006
  private var bargeInFrames = 0
  private var bargeInRecognitionRequest: SFSpeechAudioBufferRecognitionRequest?
  private var bargeInRecognitionTask: SFSpeechRecognitionTask?
  private var currentSpokenText = ""
  private(set) var state: CompanionOrbState = .idle
  private(set) var expanded = false

  override init() {
    orbView = CompanionOrbView(frame: NSRect(origin: .zero, size: compactSize))
    panel = NSPanel(
      contentRect: NSRect(origin: .zero, size: compactSize),
      styleMask: [.borderless, .nonactivatingPanel],
      backing: .buffered,
      defer: false,
    )
    super.init()
    panel.contentView = orbView
    panel.isOpaque = false
    panel.backgroundColor = .clear
    panel.hasShadow = false
    panel.level = .floating
    panel.hidesOnDeactivate = false
    panel.isReleasedWhenClosed = false
    panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
    panel.isMovableByWindowBackground = true
    panel.setFrameOrigin(Self.initialOrigin(for: compactSize))
    orbView.onPrimaryAction = { [weak self] in self?.toggleListening() }
    orbView.onToggleSize = { [weak self] in self?.toggleSize() }
    orbView.onOpenHarness = { [weak self] in self?.onOpenHarness?() }
    orbView.onHide = { [weak self] in self?.hide() }
    neuralSpeech.onPlaybackStarted = { [weak self] in self?.startBargeInMonitor() }
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in
      self?.neuralSpeech.prewarm()
    }
  }

  private static func initialOrigin(for size: NSSize) -> NSPoint {
    let visible = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
    return NSPoint(x: visible.maxX - size.width - 28, y: visible.midY - size.height / 2)
  }

  func show(startListening: Bool = false) {
    let appearing = !panel.isVisible
    if appearing {
      panel.alphaValue = 0
      panel.orderFrontRegardless()
      NSAnimationContext.runAnimationGroup { context in
        context.duration = 0.24
        context.timingFunction = CAMediaTimingFunction(name: .easeOut)
        panel.animator().alphaValue = 1
      }
    } else {
      panel.orderFrontRegardless()
    }
    if startListening {
      continuousConversation = true
      if state != .listening { toggleListening() }
    }
  }

  func hide() {
    continuousConversation = false
    resumeTimer?.invalidate()
    stopListening(submit: false)
    stopSpeaking()
    transition(to: .idle)
    onResponsePlaybackFinished?()
    panel.orderOut(nil)
  }

  func toggleVisibility() {
    panel.isVisible ? hide() : show()
  }

  func toggleSize() {
    setExpanded(!expanded)
  }

  private func setExpanded(_ next: Bool) {
    let targetSize = next ? expandedSize : compactSize
    guard expanded != next
      || abs(panel.frame.width - targetSize.width) > 1
      || abs(panel.frame.height - targetSize.height) > 1 else { return }
    expanded = next
    orbView.expanded = next
    var frame = panel.frame
    let anchor = NSPoint(x: frame.midX, y: frame.midY)
    frame.size = targetSize
    frame.origin = NSPoint(x: anchor.x - targetSize.width / 2, y: anchor.y - targetSize.height / 2)
    panel.setFrame(frame, display: true, animate: true)
  }

  func toggleListening() {
    show()
    switch state {
    case .listening:
      stopListening(submit: true)
    case .speaking, .thinking, .executing:
      interruptActiveTurnAndListen(seed: "")
    default:
      continuousConversation = true
      resumeTimer?.invalidate()
      stopSpeaking()
      onResponsePlaybackFinished?()
      requestPermissionsAndStart()
    }
  }

  func markThinking() {
    transition(to: .thinking)
  }

  func markExecuting() {
    transition(to: .executing)
  }

  func beginResponse() {
    resumeTimer?.invalidate()
    stopListening(submit: false)
    stopSpeaking()
    responseActive = true
    responseQueue.removeAll()
    responseFinished = false
    playingResponseChunk = false
    spokenCharacterCount = 0
    voicePreferenceResolved = false
    speechBackend = nil
    transition(to: .thinking, detail: "正在组织回答")
    guard neuralSpeech.isOnlineAvailable, let requestNaturalVoiceConsent else {
      speechBackend = neuralSpeech.isLocalAvailable ? .local : nil
      voicePreferenceResolved = true
      playNextResponseChunk()
      return
    }
    requestNaturalVoiceConsent { [weak self] allowed in
      DispatchQueue.main.async {
        guard let self else { return }
        self.speechBackend = allowed ? .online : (self.neuralSpeech.isLocalAvailable ? .local : nil)
        self.voicePreferenceResolved = true
        self.playNextResponseChunk()
      }
    }
  }

  func appendResponseChunk(_ text: String) {
    guard responseActive, spokenCharacterCount < spokenCharacterLimit else { return }
    guard let clean = SpeechText.spokenChunk(text) else { return }
    let remaining = spokenCharacterLimit - spokenCharacterCount
    let spoken = String(clean.prefix(remaining))
    spokenCharacterCount += spoken.count
    responseQueue.append(contentsOf: SpeechText.chunks(spoken, firstLimit: 42, laterLimit: 64, maximumCharacters: remaining))
    if playingResponseChunk,
       responseQueue.count == 1,
       let backend = speechBackend {
      neuralSpeech.prefetch(responseQueue[0], backend: backend)
    }
    playNextResponseChunk()
  }

  func finishResponse(_ trailingText: String = "") {
    guard responseActive else { return }
    if !trailingText.isEmpty { appendResponseChunk(trailingText) }
    responseFinished = true
    playNextResponseChunk()
  }

  func reportBridgeError(_ message: String) {
    transition(to: .error, detail: message)
    DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
      guard self?.state == .error else { return }
      self?.transition(to: .idle)
    }
  }

  func shutdown() {
    continuousConversation = false
    resumeTimer?.invalidate()
    silenceTimer?.invalidate()
    stopListening(submit: false)
    stopSpeaking()
    neuralSpeech.shutdown()
  }

  private func playNextResponseChunk() {
    guard voicePreferenceResolved, !playingResponseChunk else { return }
    guard !responseQueue.isEmpty else {
      if responseFinished { completeResponsePlayback() }
      return
    }
    let chunk = responseQueue.removeFirst()
    playingResponseChunk = true
    currentSpokenText = chunk
    let currentRun = UUID()
    speechRunID = currentRun
    guard let backend = speechBackend else {
      failResponsePlayback("没有可用的自然语音引擎")
      return
    }
    transition(to: .speaking, detail: backend == .online ? "实时自然语音" : "本地自然语音")
    neuralSpeech.speak(chunks: [chunk], backend: backend) { [weak self] succeeded in
      guard let self, self.speechRunID == currentRun else { return }
      if succeeded {
        self.playingResponseChunk = false
        self.prefetchQueuedResponse()
        self.playNextResponseChunk()
      } else {
        self.failResponsePlayback("自然语音连接中断")
      }
    }
    prefetchQueuedResponse()
  }

  private func prefetchQueuedResponse() {
    guard playingResponseChunk,
          let next = responseQueue.first,
          let backend = speechBackend else { return }
    neuralSpeech.prefetch(next, backend: backend)
  }

  private func completeResponsePlayback() {
    guard !playingResponseChunk else { return }
    responseActive = false
    stopBargeInMonitor()
    transition(to: .idle, detail: "随时可以继续说")
    onResponsePlaybackFinished?()
    guard continuousConversation, panel.isVisible else { return }
    resumeTimer?.invalidate()
    resumeTimer = Timer.scheduledTimer(withTimeInterval: 0.32, repeats: false) { [weak self] _ in
      guard let self, self.continuousConversation, self.state == .idle else { return }
      self.requestPermissionsAndStart()
    }
  }

  private func failResponsePlayback(_ detail: String) {
    speechRunID = UUID()
    responseActive = false
    responseQueue.removeAll()
    responseFinished = false
    playingResponseChunk = false
    currentSpokenText = ""
    stopBargeInMonitor()
    neuralSpeech.stop()
    transition(to: .error, detail: detail)
    onResponsePlaybackFinished?()
    guard continuousConversation, panel.isVisible else { return }
    resumeTimer?.invalidate()
    resumeTimer = Timer.scheduledTimer(withTimeInterval: 0.7, repeats: false) { [weak self] _ in
      guard let self, self.continuousConversation, self.panel.isVisible, self.state == .error else { return }
      self.transition(to: .idle, detail: "请继续说")
      self.requestPermissionsAndStart()
    }
  }

  private func stopSpeaking() {
    stopBargeInMonitor()
    speechRunID = UUID()
    responseActive = false
    responseQueue.removeAll()
    responseFinished = false
    playingResponseChunk = false
    voicePreferenceResolved = false
    speechBackend = nil
    currentSpokenText = ""
    neuralSpeech.stop()
  }

  private func startBargeInMonitor() {
    guard !bargeInMonitoring, state == .speaking, !audioTapInstalled else { return }
    let input = audioEngine.inputNode
    try? input.setVoiceProcessingEnabled(true)
    let format = input.outputFormat(forBus: 0)
    guard format.sampleRate > 0, format.channelCount > 0 else { return }
    bargeInMonitoring = true
    bargeInFrames = 0
    bargeInNoiseFloor = 0.003
    bargeInArmedAt = ProcessInfo.processInfo.systemUptime + 0.3
    let request = SFSpeechAudioBufferRecognitionRequest()
    request.shouldReportPartialResults = true
    request.taskHint = .dictation
    if #available(macOS 13.0, *) { request.addsPunctuation = true }
    bargeInRecognitionRequest = request
    bargeInRecognitionTask = speechRecognizer?.recognitionTask(with: request) { [weak self] result, _ in
      DispatchQueue.main.async {
        guard let self,
              self.bargeInMonitoring,
              self.state == .speaking,
              ProcessInfo.processInfo.systemUptime >= self.bargeInArmedAt,
              let transcript = result?.bestTranscription.formattedString,
              transcript.count >= 2,
              !SpeechText.isLikelyPlaybackEcho(transcript, spokenText: self.currentSpokenText) else { return }
        self.interruptForBargeIn(initialTranscript: transcript)
      }
    }
    input.installTap(onBus: 0, bufferSize: 512, format: format) { [weak self] buffer, _ in
      self?.bargeInRecognitionRequest?.append(buffer)
      guard let channel = buffer.floatChannelData?[0] else { return }
      let count = Int(buffer.frameLength)
      guard count > 0 else { return }
      var sum: Float = 0
      var samples = 0
      for index in stride(from: 0, to: count, by: 4) {
        let sample = channel[index]
        sum += sample * sample
        samples += 1
      }
      let rms = sqrt(sum / Float(max(1, samples)))
      DispatchQueue.main.async {
        self?.observeBargeInLevel(rms)
      }
    }
    audioTapInstalled = true
    do {
      audioEngine.prepare()
      try audioEngine.start()
    } catch {
      stopBargeInMonitor()
    }
  }

  private func observeBargeInLevel(_ rms: Float) {
    guard bargeInMonitoring, state == .speaking else { return }
    orbView.audioLevel = min(CGFloat(rms * 14), 1)
    guard ProcessInfo.processInfo.systemUptime >= bargeInArmedAt else {
      bargeInNoiseFloor = bargeInNoiseFloor * 0.82 + min(rms, 0.06) * 0.18
      return
    }
    let threshold = max(0.008, bargeInNoiseFloor * 1.32)
    if rms >= threshold {
      bargeInFrames += 1
    } else {
      bargeInFrames = max(0, bargeInFrames - 1)
      bargeInNoiseFloor = bargeInNoiseFloor * 0.97 + min(rms, 0.06) * 0.03
    }
    guard bargeInFrames >= 3 else { return }
    interruptForBargeIn(initialTranscript: "")
  }

  private func interruptForBargeIn(initialTranscript: String) {
    guard state == .speaking else { return }
    interruptActiveTurnAndListen(seed: initialTranscript)
  }

  private func interruptActiveTurnAndListen(seed: String) {
    switch state {
    case .speaking, .thinking, .executing:
      break
    default:
      return
    }
    continuousConversation = true
    resumeTimer?.invalidate()
    stopListening(submit: false)
    stopSpeaking()
    onResponsePlaybackFinished?()
    transition(to: .idle, detail: "已打断，请继续说")
    let resume = { [weak self] in
      guard let self, self.continuousConversation, self.panel.isVisible, self.state == .idle else { return }
      self.startListening(seed: seed)
    }
    if let onInterruptActiveTurn {
      onInterruptActiveTurn(resume)
    } else {
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.06, execute: resume)
    }
  }

  private func stopBargeInMonitor() {
    guard bargeInMonitoring else { return }
    bargeInMonitoring = false
    bargeInArmedAt = .greatestFiniteMagnitude
    bargeInFrames = 0
    bargeInRecognitionRequest?.endAudio()
    bargeInRecognitionTask?.cancel()
    bargeInRecognitionRequest = nil
    bargeInRecognitionTask = nil
    if audioEngine.isRunning { audioEngine.stop() }
    removeAudioTap()
    orbView.audioLevel = 0
  }

  private func requestPermissionsAndStart() {
    SFSpeechRecognizer.requestAuthorization { [weak self] speechStatus in
      DispatchQueue.main.async {
        guard let self else { return }
        guard speechStatus == .authorized else {
          self.permissionError("请在“系统设置 → 隐私与安全性 → 语音识别”中允许 DeepSeek Harness。")
          return
        }
        AVCaptureDevice.requestAccess(for: .audio) { [weak self] allowed in
          DispatchQueue.main.async {
            guard let self else { return }
            guard allowed else {
              self.permissionError("请在“系统设置 → 隐私与安全性 → 麦克风”中允许 DeepSeek Harness。")
              return
            }
            self.startListening()
          }
        }
      }
    }
  }

  private func permissionError(_ message: String) {
    transition(to: .error, detail: "缺少语音权限")
    onError?(message)
  }

  private func startListening(seed: String = "") {
    guard speechRecognizer?.isAvailable == true else {
      permissionError("当前无法连接 macOS 语音识别服务，请稍后再试。")
      return
    }
    stopBargeInMonitor()
    stopListening(submit: false)
    recognitionSeed = seed.trimmingCharacters(in: .whitespacesAndNewlines)
    latestTranscript = recognitionSeed
    let request = SFSpeechAudioBufferRecognitionRequest()
    request.shouldReportPartialResults = true
    request.taskHint = .dictation
    if #available(macOS 13.0, *) { request.addsPunctuation = true }
    recognitionRequest = request

    let input = audioEngine.inputNode
    let format = input.outputFormat(forBus: 0)
    input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
      self?.recognitionRequest?.append(buffer)
      guard let channel = buffer.floatChannelData?[0] else { return }
      let count = Int(buffer.frameLength)
      guard count > 0 else { return }
      var sum: Float = 0
      for index in stride(from: 0, to: count, by: 4) {
        let sample = channel[index]
        sum += sample * sample
      }
      let rms = sqrt(sum / Float(max(1, count / 4)))
      DispatchQueue.main.async {
        self?.orbView.audioLevel = min(CGFloat(rms * 12), 1)
      }
    }
    audioTapInstalled = true

    recognitionTask = speechRecognizer?.recognitionTask(with: request) { [weak self] result, error in
      DispatchQueue.main.async {
        guard let self, self.state == .listening else { return }
        if let result {
          let heard = result.bestTranscription.formattedString.trimmingCharacters(in: .whitespacesAndNewlines)
          if !heard.isEmpty {
            if self.recognitionSeed.isEmpty || heard.contains(self.recognitionSeed) {
              self.latestTranscript = heard
            } else if self.recognitionSeed.contains(heard) {
              self.latestTranscript = self.recognitionSeed
            } else {
              self.latestTranscript = "\(self.recognitionSeed)，\(heard)"
            }
            self.orbView.detail = String(self.latestTranscript.suffix(18))
            self.resetSilenceTimer()
          }
          if result.isFinal { self.stopListening(submit: true) }
        } else if error != nil && self.latestTranscript.isEmpty {
          self.reportBridgeError("没有听清，请再试一次")
          self.stopListening(submit: false)
        }
      }
    }

    do {
      audioEngine.prepare()
      try audioEngine.start()
      transition(to: .listening, detail: recognitionSeed.isEmpty ? "说完后停顿即可发送" : String(recognitionSeed.suffix(18)))
      resetSilenceTimer(initial: recognitionSeed.isEmpty)
    } catch {
      removeAudioTap()
      recognitionRequest = nil
      recognitionTask = nil
      permissionError("无法启动麦克风：\(error.localizedDescription)")
    }
  }

  private func resetSilenceTimer(initial: Bool = false) {
    silenceTimer?.invalidate()
    silenceTimer = Timer.scheduledTimer(withTimeInterval: initial ? 8 : 0.65, repeats: false) { [weak self] _ in
      guard let self, self.state == .listening else { return }
      self.stopListening(submit: !self.latestTranscript.isEmpty)
    }
  }

  private func stopListening(submit: Bool) {
    silenceTimer?.invalidate()
    silenceTimer = nil
    if audioEngine.isRunning { audioEngine.stop() }
    removeAudioTap()
    recognitionRequest?.endAudio()
    recognitionTask?.cancel()
    recognitionRequest = nil
    recognitionTask = nil
    let transcript = latestTranscript
    latestTranscript = ""
    recognitionSeed = ""
    orbView.audioLevel = 0
    if submit && !transcript.isEmpty {
      transition(to: .thinking, detail: String(transcript.suffix(18)))
      onTranscript?(transcript)
    } else if state == .listening {
      transition(to: .idle)
    }
  }

  private func removeAudioTap() {
    guard audioTapInstalled else { return }
    audioEngine.inputNode.removeTap(onBus: 0)
    audioTapInstalled = false
  }

  private func transition(to next: CompanionOrbState, detail: String = "") {
    state = next
    orbView.state = next
    orbView.detail = detail
  }

}

/** Native macOS shell for the locally built Harness Web application. */
final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKUIDelegate, WKScriptMessageHandler {
  private let projectURL = URL(fileURLWithPath: ProcessInfo.processInfo.environment["DSH_REPO_PATH"] ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Documents/DeepSeek-Harness").path, isDirectory: true)
  private let harnessURL = URL(string: "http://127.0.0.1:3080")!
  private let commandSearchPath = "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
  private let updateInterval: TimeInterval = 6 * 60 * 60
  private let naturalVoicePreferenceKey = "naturalVoiceConsentV1"
  private var server: Process?
  private var serverStopCompletion: (() -> Void)?
  private var expectedServerStop = false
  private var window: NSWindow?
  private var webView: WKWebView?
  private var updateButton: NSButton?
  private var updatePanel: NSPanel?
  private var controlledUpdateState: ControlledUpdateState?
  private var updateTimer: Timer?
  private var checkingForUpdate = false
  private var updateInProgress = false
  private var companion: CompanionOrbController?
  private var pendingVoiceTranscript: String?
  private var voiceSubmissionID = UUID()
  private var voiceSubmitAttempts = 0

  func applicationDidFinishLaunching(_ notification: Notification) {
    buildMainMenu()
    configureCompanion()
    guard authorizeProjectAccess() else { return }
    startServer()
    showWindow()
    loadHarness(retriesRemaining: 80)
    DispatchQueue.main.asyncAfter(deadline: .now() + 4) { [weak self] in
      self?.checkForUpdate()
    }
    updateTimer = Timer.scheduledTimer(withTimeInterval: updateInterval, repeats: true) { [weak self] _ in
      self?.checkForUpdate()
    }
  }

  private func authorizeProjectAccess() -> Bool {
    let manifestURL = projectURL.appendingPathComponent("package.json")
    do {
      _ = try Data(contentsOf: manifestURL, options: .mappedIfSafe)
      return true
    } catch {
      showError("无法访问本地 Harness 项目。请允许 DeepSeek Harness 访问“文稿”文件夹后重新打开。\n\n\(error.localizedDescription)")
      return false
    }
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    false
  }

  func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
    presentMainWindow()
    return true
  }

  func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
    if updateInProgress {
      showError("正在测试候选版本，请等待隔离验证完成后再退出。")
      return .terminateCancel
    }
    guard server?.isRunning == true else { return .terminateNow }
    stopServer {
      sender.reply(toApplicationShouldTerminate: true)
    }
    return .terminateLater
  }

  func applicationWillTerminate(_ notification: Notification) {
    voiceSubmissionID = UUID()
    pendingVoiceTranscript = nil
    companion?.shutdown()
    webView?.configuration.userContentController.removeScriptMessageHandler(forName: "companionOrb")
  }

  private func buildMainMenu() {
    let main = NSMenu()

    let applicationItem = NSMenuItem()
    let applicationMenu = NSMenu(title: "DeepSeek Harness")
    applicationMenu.addItem(withTitle: "关于 DeepSeek Harness", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
    applicationMenu.addItem(.separator())
    let companionItem = NSMenuItem(title: "显示或隐藏语音球", action: #selector(toggleCompanionOrb(_:)), keyEquivalent: "v")
    companionItem.keyEquivalentModifierMask = [.command, .shift]
    companionItem.target = self
    applicationMenu.addItem(companionItem)
    let talkItem = NSMenuItem(title: "开始语音对话", action: #selector(startCompanionConversation(_:)), keyEquivalent: " ")
    talkItem.keyEquivalentModifierMask = [.command, .shift]
    talkItem.target = self
    applicationMenu.addItem(talkItem)
    let voiceItem = NSMenuItem(title: "语音输出设置…", action: #selector(chooseVoiceOutput(_:)), keyEquivalent: "")
    voiceItem.target = self
    applicationMenu.addItem(voiceItem)
    applicationMenu.addItem(.separator())
    applicationMenu.addItem(withTitle: "退出 DeepSeek Harness", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    applicationItem.submenu = applicationMenu
    main.addItem(applicationItem)

    let editItem = NSMenuItem()
    let editMenu = NSMenu(title: "编辑")
    addEditItem(editMenu, title: "撤销", action: "undo:", key: "z")
    addEditItem(editMenu, title: "重做", action: "redo:", key: "z", modifiers: [.command, .shift])
    editMenu.addItem(.separator())
    addEditItem(editMenu, title: "剪切", action: "cut:", key: "x")
    addEditItem(editMenu, title: "复制", action: "copy:", key: "c")
    addEditItem(editMenu, title: "粘贴", action: "paste:", key: "v")
    addEditItem(editMenu, title: "全选", action: "selectAll:", key: "a")
    editItem.submenu = editMenu
    main.addItem(editItem)

    let windowItem = NSMenuItem()
    let windowMenu = NSMenu(title: "窗口")
    windowMenu.addItem(withTitle: "最小化", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
    windowMenu.addItem(withTitle: "缩放", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
    windowMenu.addItem(withTitle: "关闭窗口", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
    windowItem.submenu = windowMenu
    main.addItem(windowItem)

    NSApp.mainMenu = main
  }

  private func configureCompanion() {
    let companion = CompanionOrbController()
    companion.onTranscript = { [weak self] transcript in
      self?.submitVoiceTranscript(transcript)
    }
    companion.onOpenHarness = { [weak self] in
      self?.presentMainWindow()
    }
    companion.onError = { [weak self] message in
      self?.showError(message)
    }
    companion.onResponsePlaybackFinished = { [weak self] in
      self?.webView?.evaluateJavaScript("window.__dshCompanion?.revealResponse()")
    }
    companion.onInterruptActiveTurn = { [weak self] completion in
      self?.interruptActiveHarnessTurn(completion: completion)
    }
    companion.requestNaturalVoiceConsent = { [weak self] completion in
      self?.resolveNaturalVoicePreference(forcePrompt: false, completion: completion)
    }
    self.companion = companion
  }

  @objc private func chooseVoiceOutput(_ sender: Any?) {
    resolveNaturalVoicePreference(forcePrompt: true) { _ in }
  }

  private func resolveNaturalVoicePreference(forcePrompt: Bool, completion: @escaping (Bool) -> Void) {
    if !forcePrompt, let stored = UserDefaults.standard.object(forKey: naturalVoicePreferenceKey) as? Bool {
      completion(stored)
      return
    }
    NSApp.activate(ignoringOtherApps: true)
    let alert = NSAlert()
    alert.alertStyle = .informational
    alert.messageText = "实时自然语音设置"
    alert.informativeText = "“使用自然在线语音”会把当前需要播放的短句发送到 Microsoft Edge 语音服务，以获得更自然的中文音色和更低的首句延迟；不会发送模型密钥、文件或完整会话。\n\n选择“仅使用本地语音”后，客户端使用本机 Kokoro 模型；如果自然语音不可用，本轮会停止播报，不会切换成机械的系统音色。"
    alert.addButton(withTitle: "使用自然在线语音")
    alert.addButton(withTitle: "仅使用本地语音")
    let allowed = alert.runModal() == .alertFirstButtonReturn
    UserDefaults.standard.set(allowed, forKey: naturalVoicePreferenceKey)
    completion(allowed)
  }

  private func addEditItem(_ menu: NSMenu, title: String, action: String, key: String, modifiers: NSEvent.ModifierFlags = .command) {
    let item = NSMenuItem(title: title, action: Selector(action), keyEquivalent: key)
    item.keyEquivalentModifierMask = modifiers
    item.target = nil
    menu.addItem(item)
  }

  private func startServer() {
    let scriptURL = projectURL.appendingPathComponent("apps/cli/lib/bin.js")
    guard FileManager.default.fileExists(atPath: scriptURL.path) else {
      showError("找不到 Harness 构建文件：\n\(scriptURL.path)")
      return
    }
    let nodePaths = ["/usr/local/bin/node", "/opt/homebrew/bin/node"]
    guard let nodePath = nodePaths.first(where: { FileManager.default.isExecutableFile(atPath: $0) }) else {
      showError("找不到 Node.js。请安装 Node.js 后重新打开 DeepSeek Harness。")
      return
    }
    let process = Process()
    process.executableURL = URL(fileURLWithPath: nodePath)
    // A GUI-launched child can block in getcwd when its current directory is
    // inside macOS-protected Documents. The entry script is absolute and the
    // Web profile is stored under DSH_HOME, so use a neutral launch directory.
    process.currentDirectoryURL = FileManager.default.temporaryDirectory
    process.arguments = [scriptURL.path, "web", "--no-open"]
    process.environment = commandEnvironment()
    process.terminationHandler = { [weak self] endedProcess in
      DispatchQueue.main.async {
        guard let self else { return }
        if self.server === endedProcess { self.server = nil }
        if self.expectedServerStop {
          self.expectedServerStop = false
          let completion = self.serverStopCompletion
          self.serverStopCompletion = nil
          completion?()
        } else if endedProcess.terminationStatus != 0 {
          self.showError("Harness 本地服务已停止（退出码 \(endedProcess.terminationStatus)）。")
        }
      }
    }
    do {
      try process.run()
      server = process
    } catch {
      showError("无法启动 Harness 本地服务：\n\(error.localizedDescription)")
    }
  }

  private func stopServer(completion: @escaping () -> Void) {
    guard let server, server.isRunning else {
      self.server = nil
      completion()
      return
    }
    expectedServerStop = true
    serverStopCompletion = completion
    server.terminate()
    DispatchQueue.main.asyncAfter(deadline: .now() + 8) {
      guard server.isRunning else { return }
      kill(server.processIdentifier, SIGKILL)
    }
  }

  private func showWindow() {
    let configuration = WKWebViewConfiguration()
    installLocalBranding(in: configuration)
    installCompanionBridge(in: configuration)
    if #available(macOS 14.0, *) {
      let dataStore = WKWebsiteDataStore.nonPersistent()
      dataStore.proxyConfigurations = []
      configuration.websiteDataStore = dataStore
    }
    let view = WKWebView(frame: .zero, configuration: configuration)
    view.translatesAutoresizingMaskIntoConstraints = false
    view.uiDelegate = self

    let container = NSView(frame: .zero)
    container.addSubview(view)
    NSLayoutConstraint.activate([
      view.leadingAnchor.constraint(equalTo: container.leadingAnchor),
      view.trailingAnchor.constraint(equalTo: container.trailingAnchor),
      view.topAnchor.constraint(equalTo: container.topAnchor),
      view.bottomAnchor.constraint(equalTo: container.bottomAnchor),
    ])

    let button = NSButton(title: "测试新版本", target: self, action: #selector(openControlledUpdatePanel(_:)))
    button.translatesAutoresizingMaskIntoConstraints = false
    button.bezelStyle = .rounded
    button.controlSize = .small
    button.bezelColor = .systemBlue
    button.contentTintColor = .white
    button.toolTip = "发现 DeepSeek Harness 上游候选版本；点击进入隔离测试"
    button.setAccessibilityLabel("发现新版本，打开受控升级")
    button.isHidden = true
    container.addSubview(button)
    NSLayoutConstraint.activate([
      button.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 12),
      button.bottomAnchor.constraint(equalTo: container.bottomAnchor, constant: -12),
      button.heightAnchor.constraint(greaterThanOrEqualToConstant: 28),
    ])

    let window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 1440, height: 920),
      styleMask: [.titled, .closable, .miniaturizable, .resizable],
      backing: .buffered,
      defer: false,
    )
    window.title = "DeepSeek Harness"
    window.isReleasedWhenClosed = false
    window.contentView = container
    window.center()
    window.makeKeyAndOrderFront(nil)
    window.delegate = self
    self.window = window
    webView = view
    updateButton = button
    NSApp.activate(ignoringOtherApps: true)
  }

  private func presentMainWindow() {
    window?.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
  }

  @objc private func toggleCompanionOrb(_ sender: Any?) {
    companion?.toggleVisibility()
  }

  @objc private func startCompanionConversation(_ sender: Any?) {
    companion?.show(startListening: true)
  }

  func webView(
    _ webView: WKWebView,
    runOpenPanelWith parameters: WKOpenPanelParameters,
    initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping ([URL]?) -> Void
  ) {
    let panel = NSOpenPanel()
    panel.canChooseFiles = true
    panel.canChooseDirectories = parameters.allowsDirectories
    panel.allowsMultipleSelection = parameters.allowsMultipleSelection
    let finish: (NSApplication.ModalResponse) -> Void = { [weak self] response in
      let selectedURLs = response == .OK ? panel.urls : nil
      completionHandler(selectedURLs)
      guard selectedURLs?.isEmpty == false else { return }
      let notifyPage: () -> Void = {
        self?.webView?.evaluateJavaScript("window.__dshCompanion?.markAttachmentPending()")
      }
      notifyPage()
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.25, execute: notifyPage)
    }
    if let hostWindow = webView.window {
      panel.beginSheetModal(for: hostWindow, completionHandler: finish)
    } else {
      panel.begin(completionHandler: finish)
    }
  }

  private func installLocalBranding(in configuration: WKWebViewConfiguration) {
    let source = #"""
    (() => {
      const localTitle = 'DeepSeek Harness'
      const heroTitle = '简哥 · 探索未知之境'
      const revisionPattern = /^[0-9a-f]{7}$/i

      const hideRevision = group => {
        if (!group) return
        for (const child of group.children) {
          if (revisionPattern.test(child.textContent?.trim() ?? '')) child.style.display = 'none'
        }
      }

      const rewriteText = node => {
        const value = node.nodeValue?.trim()
        if (!value) return
        if (value === 'DSH Local Build') {
          node.nodeValue = node.nodeValue.replace('DSH Local Build', localTitle)
          hideRevision(node.parentElement?.parentElement)
          return
        }
        if (value === '探索未至之境' || value === 'Into the Unknown') {
          node.nodeValue = node.nodeValue.replace(value, heroTitle)
          return
        }
        if (value === '预览版' || value === 'Preview') {
          node.parentElement.style.display = 'none'
          return
        }
        if (revisionPattern.test(value)) {
          const brandButton = node.parentElement?.closest('button')
          if (brandButton?.textContent?.includes(localTitle)) node.parentElement.style.display = 'none'
        }
      }

      const rewriteTree = root => {
        if (root.nodeType === Node.TEXT_NODE) {
          rewriteText(root)
          return
        }
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
        while (walker.nextNode()) rewriteText(walker.currentNode)
      }

      rewriteTree(document.body)
      new MutationObserver(records => {
        for (const record of records) {
          if (record.type === 'characterData') rewriteText(record.target)
          for (const node of record.addedNodes) rewriteTree(node)
        }
      }).observe(document.documentElement, { childList: true, subtree: true, characterData: true })
    })()
    """#
    configuration.userContentController.addUserScript(WKUserScript(
      source: source,
      injectionTime: .atDocumentEnd,
      forMainFrameOnly: true
    ))
  }

  private func installCompanionBridge(in configuration: WKWebViewConfiguration) {
    configuration.userContentController.add(self, name: "companionOrb")
    let source = #"""
    (() => {
      if (window.__dshCompanionInstalled) return
      window.__dshCompanionInstalled = true
      const post = payload => window.webkit?.messageHandlers?.companionOrb?.postMessage(payload)
      const assistantSelector = '[data-chat-flow-kind="assistant-step"]'
      let pending = null
      let settleTimer = null
      let lastState = ''
      let inspectScheduled = false
      let nativeAttachmentPending = false
      let lastComposerVoicePress = 0

      const installStyles = () => {
        if (document.getElementById('dsh-native-voice-style')) return
        const style = document.createElement('style')
        style.id = 'dsh-native-voice-style'
        style.textContent = `
          #dsh-sidebar-voice {
            position: fixed; z-index: 2147483646; display: inline-flex; align-items: center;
            justify-content: center; gap: 8px; box-sizing: border-box; padding: 0 10px;
            border: 0; border-radius: 8px; color: inherit; background: transparent;
            font: inherit; line-height: 1; cursor: pointer; white-space: nowrap;
            transition: background-color 120ms ease, color 120ms ease, opacity 120ms ease;
          }
          #dsh-sidebar-voice:hover { background: rgba(0, 0, 0, .055); }
          #dsh-sidebar-voice svg { flex: none; }
          #dsh-composer-voice {
            position: absolute; right: 0; bottom: 0; z-index: 2147483647; display: grid; place-items: center;
            width: 34px; height: 34px; padding: 0; border: 0; border-radius: 999px;
            color: #fff; background: #090a0c; cursor: pointer;
            box-shadow: 0 3px 10px rgba(0, 0, 0, .18);
            pointer-events: auto !important; touch-action: none;
            transition: transform 120ms ease, background-color 120ms ease, opacity 120ms ease;
          }
          #dsh-composer-voice:hover { background: #1a1c20; transform: scale(1.035); }
          #dsh-composer-voice[hidden] { display: none !important; }
          [data-dsh-native-primary='true'][data-dsh-primary-hidden='true'] {
            opacity: 0 !important; pointer-events: none !important;
          }
          [data-dsh-native-primary='true'][data-dsh-send-ready='true'] {
            opacity: 1 !important; color: #fff !important; background: #090a0c !important;
          }
          [data-dsh-native-primary='true'][data-dsh-send-ready='true']:hover {
            background: #1a1c20 !important;
          }
          html[data-dsh-voice-turn='active'] [data-dsh-voice-response='true'] {
            opacity: 0 !important; user-select: none;
          }
          [data-dsh-voice-response='true'] { transition: opacity 220ms ease; }
        `
        document.head.appendChild(style)
      }

      const postState = state => {
        if (lastState === state) return
        lastState = state
        post({ type: 'state', state })
      }

      const activeComposerCard = () => {
        const focused = document.activeElement?.closest?.('[data-composer-card]')
        if (focused instanceof HTMLElement) return focused
        const visible = [...document.querySelectorAll('[data-composer-card]')]
          .filter(card => {
            const rect = card.getBoundingClientRect()
            return rect.width > 0 && rect.height > 0
          })
          .sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)
        return visible.find(card => hasComposerAttachment(card))
          ?? visible.find(card => card.querySelector('textarea')?.value.trim() !== '')
          ?? visible[0]
          ?? null
      }

      const sendButtonOf = card => [...(card?.querySelectorAll('button') ?? [])].find(button => {
        const label = (button.getAttribute('aria-label') ?? '').toLowerCase()
        return label.includes('发送') || label.includes('send')
      }) ?? null

      const controlLabel = element => [
        element?.getAttribute?.('aria-label'),
        element?.getAttribute?.('title'),
        element?.textContent,
      ].filter(Boolean).join(' ').trim().toLowerCase()

      const activeStopButton = () => {
        const card = activeComposerCard()
        const scopes = [card, card?.parentElement, card?.parentElement?.parentElement].filter(Boolean)
        for (const scope of scopes) {
          const match = [...scope.querySelectorAll('button')].find(button => {
            const rect = button.getBoundingClientRect()
            const label = controlLabel(button)
            return !button.disabled && rect.width > 0 && rect.height > 0
              && (label.includes('停止') || label.includes('stop'))
          })
          if (match) return match
        }
        return null
      }

      const hasComposerAttachment = card => {
        if (!card) return false
        const scopes = [card, card.parentElement, card.parentElement?.parentElement].filter(Boolean)
        for (const scope of scopes) {
          if (scope.querySelector('img, [data-composer-attachment]')) return true
          const text = scope.innerText ?? scope.textContent ?? ''
          if (text.includes('.dsh/uploads/')) return true
          const namedRemoval = [...scope.querySelectorAll('button, [role="button"]')].some(element => {
            const label = [
              element.getAttribute('aria-label'),
              element.getAttribute('title'),
              element.textContent,
            ].filter(Boolean).join(' ').toLowerCase()
            return label.includes('移除附件') || label.includes('删除附件') || label.includes('remove attachment')
          })
          if (namedRemoval) return true
        }
        const cardRect = card.getBoundingClientRect()
        const nearbyRemoval = [...document.querySelectorAll('button, [role="button"]')].some(element => {
          const label = [element.getAttribute('aria-label'), element.getAttribute('title'), element.textContent]
            .filter(Boolean).join(' ').toLowerCase()
          if (!label.includes('移除附件') && !label.includes('删除附件') && !label.includes('remove attachment')) return false
          const rect = element.getBoundingClientRect()
          return rect.bottom >= cardRect.top - 180 && rect.top <= cardRect.bottom
            && rect.right >= cardRect.left && rect.left <= cardRect.right
        })
        if (nearbyRemoval) return true
        const input = card.querySelector('textarea')
        if (!(input instanceof HTMLTextAreaElement)) return false
        return input.getBoundingClientRect().top - card.getBoundingClientRect().top > 46
      }

      const setTextareaValue = (input, value) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
        setter?.call(input, value)
        input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
      }

      const assistantRows = () => [...document.querySelectorAll(assistantSelector)]
      const agentBusy = () => activeStopButton() !== null

      const hasNewToolWork = () => {
        if (!pending) return false
        return [...document.querySelectorAll('[data-chat-flow-kind]')].some(row => {
          const key = row.getAttribute('data-chat-anchor-key') ?? ''
          const kind = row.getAttribute('data-chat-flow-kind') ?? ''
          return !pending.baseline.has(key) && (kind.includes('tool') || kind.includes('command'))
        })
      }

      const responseRow = () => {
        if (!pending) return ''
        const candidates = assistantRows().filter(row => {
          const key = row.getAttribute('data-chat-anchor-key') ?? ''
          return !pending.baseline.has(key)
        })
        return candidates.at(-1) ?? null
      }

      const responseText = row => {
        if (!row) return ''
        const readable = row.cloneNode(true)
        readable.querySelectorAll([
          '[data-variant="think"]', 'pre', 'code', 'button', 'svg', 'img',
          '[aria-hidden="true"]', '[data-context-text]', '[role="status"]',
        ].join(',')).forEach(element => element.remove())
        return (readable.innerText ?? readable.textContent ?? '').trim()
      }

      const nextSpeechUnit = (text, final) => {
        const leading = text.match(/^\s*/)?.[0].length ?? 0
        const source = text.slice(leading)
        if (!source) return null
        const strong = source.search(/[。！？!?；;\n]/)
        if (strong >= 3 && strong < 72) {
          return { text: source.slice(0, strong + 1), consumed: leading + strong + 1 }
        }
        const soft = [...source.matchAll(/[，,：:、]/g)].find(match => (match.index ?? 0) >= 18)
        if (soft && (soft.index ?? 0) < 54) {
          const end = (soft.index ?? 0) + 1
          return { text: source.slice(0, end), consumed: leading + end }
        }
        if (source.length >= 48) {
          return { text: source.slice(0, 42), consumed: leading + 42 }
        }
        if (final && source.trim()) return { text: source.trim(), consumed: text.length }
        return null
      }

      const startResponseIfNeeded = row => {
        if (!pending || pending.started || !row) return
        pending.started = true
        pending.responseRow = row
        row.setAttribute('data-dsh-voice-response', 'true')
        document.documentElement.setAttribute('data-dsh-voice-turn', 'active')
        post({ type: 'responseStart' })
      }

      const flushSpeechUnits = (row, final) => {
        if (!pending || !row) return
        const text = responseText(row)
        if (text.length < pending.consumed) return
        let remainder = text.slice(pending.consumed)
        while (true) {
          const unit = nextSpeechUnit(remainder, final)
          if (!unit) break
          pending.consumed += unit.consumed
          remainder = text.slice(pending.consumed)
          post({ type: 'responseChunk', text: unit.text })
        }
      }

      const inspectConversation = () => {
        if (!pending) return
        const row = responseRow()
        if (row) startResponseIfNeeded(row)
        if (agentBusy() || document.querySelector(`${assistantSelector} [data-streaming="true"]`)) {
          postState(hasNewToolWork() ? 'executing' : 'thinking')
          flushSpeechUnits(row, false)
          if (settleTimer) clearTimeout(settleTimer)
          settleTimer = null
          return
        }
        const text = responseText(row)
        if (!text) return
        startResponseIfNeeded(row)
        flushSpeechUnits(row, true)
        if (settleTimer) clearTimeout(settleTimer)
        settleTimer = setTimeout(() => {
          if (!pending || agentBusy()) return
          const finalRow = responseRow()
          const finalText = responseText(finalRow)
          if (!finalText) return
          flushSpeechUnits(finalRow, true)
          pending = null
          settleTimer = null
          post({ type: 'responseEnd' })
        }, 240)
      }

      const settingsControl = () => [...document.querySelectorAll('button, [role="button"]')]
        .filter(element => {
          const label = (element.getAttribute('aria-label') ?? element.textContent ?? '').trim()
          const rect = element.getBoundingClientRect()
          return (label === '设置' || label === 'Settings') && rect.width > 0 && rect.height > 0
        })
        .sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0] ?? null

      const ensureSidebarLauncher = () => {
        let button = document.getElementById('dsh-sidebar-voice')
        const settings = settingsControl()
        if (!settings) {
          if (button) button.hidden = true
          return
        }
        if (!button) {
          button = document.createElement('button')
          button.id = 'dsh-sidebar-voice'
          button.type = 'button'
          button.title = '开始实时语音对话（⌘⇧空格）'
          button.setAttribute('aria-label', '语音')
          button.innerHTML = `<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none">
            <path d="M4.5 10v4M7.5 7.5v9M10.5 5v14M13.5 8.5v7M16.5 6.5v11M19.5 10v4" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"/>
          </svg><span>语音</span>`
          button.addEventListener('click', () => post({ type: 'startListening' }))
          document.body.appendChild(button)
        }
        const rect = settings.getBoundingClientRect()
        const computed = getComputedStyle(settings)
        const hasWideSidebar = rect.width >= 120
        button.hidden = !hasWideSidebar
        if (!hasWideSidebar) return
        Object.assign(button.style, {
          left: `${Math.round(rect.left + rect.width * 0.53)}px`,
          top: `${Math.round(rect.top)}px`,
          width: `${Math.max(78, Math.round(rect.width * 0.42))}px`,
          height: `${Math.round(rect.height)}px`,
          fontFamily: computed.fontFamily,
          fontSize: computed.fontSize,
          fontWeight: computed.fontWeight,
          color: computed.color,
        })
      }

      const ensureComposerLauncher = () => {
        const card = activeComposerCard()
        const input = card?.querySelector('textarea')
        if (!(card instanceof HTMLElement) || !(input instanceof HTMLTextAreaElement)) return
        const primary = sendButtonOf(card)
        if (!(primary instanceof HTMLButtonElement) || !(primary.parentElement instanceof HTMLElement)) {
          document.getElementById('dsh-composer-voice')?.setAttribute('hidden', '')
          card.querySelectorAll('[data-dsh-native-primary="true"]').forEach(button => {
            button.removeAttribute('data-dsh-native-primary')
            button.removeAttribute('data-dsh-primary-hidden')
            button.removeAttribute('data-dsh-send-ready')
          })
          return
        }
        primary.setAttribute('data-dsh-native-primary', 'true')
        primary.parentElement.style.position = 'relative'
        let button = document.getElementById('dsh-composer-voice')
        if (!button || button.parentElement !== primary.parentElement) {
          button?.remove()
          button = document.createElement('button')
          button.id = 'dsh-composer-voice'
          button.type = 'button'
          button.title = '开始实时语音对话'
          button.setAttribute('aria-label', '开始实时语音对话')
          button.addEventListener('click', event => {
            if (button.dataset.mode !== 'send') {
              event.preventDefault()
              event.stopPropagation()
              if (Date.now() - lastComposerVoicePress >= 450) {
                lastComposerVoicePress = Date.now()
                post({ type: 'startListening' })
              }
              return
            }
            const currentCard = activeComposerCard()
            const currentInput = currentCard?.querySelector('textarea')
            const currentPrimary = sendButtonOf(currentCard)
            if (!(currentInput instanceof HTMLTextAreaElement) || !(currentPrimary instanceof HTMLButtonElement)) return
            if (!currentPrimary.disabled) {
              nativeAttachmentPending = false
              currentPrimary.click()
              return
            }
            if (currentInput.value.trim() === '' && (nativeAttachmentPending || hasComposerAttachment(currentCard))) {
              const fallbackPrompt = '请查看并处理我添加的附件。'
              setTextareaValue(currentInput, fallbackPrompt)
              nativeAttachmentPending = false
              requestAnimationFrame(() => requestAnimationFrame(() => {
                const ready = sendButtonOf(activeComposerCard())
                if (ready instanceof HTMLButtonElement && !ready.disabled) ready.click()
              }))
            }
          })
          primary.parentElement.appendChild(button)
        }
        const hasAttachment = hasComposerAttachment(card)
        const hasContent = input.value.trim() !== '' || nativeAttachmentPending || hasAttachment || !primary.disabled
        const canTalk = !input.disabled && !input.readOnly && !agentBusy()
        const mode = hasContent ? 'send' : 'voice'
        button.dataset.mode = mode
        button.title = mode === 'send' ? '发送消息' : '开始实时语音对话'
        button.setAttribute('aria-label', button.title)
        button.innerHTML = mode === 'send'
          ? `<svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18"><path d="M10.39 1.23c.44.09.83.28 1.18.56l6.2 6.2-1.78 1.78L11.25 5v13h-2.5V5L4.01 9.77 2.23 7.99l6.2-6.2c.56-.45 1.25-.65 1.96-.56Z" fill="currentColor"/></svg>`
          : `<svg aria-hidden="true" viewBox="0 0 20 20" width="19" height="19" fill="none"><path d="M4 8v4M7 5.75v8.5M10 3.5v13M13 6.5v7M16 8v4" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"/></svg>`
        button.hidden = !canTalk
        button.style.display = canTalk ? 'grid' : 'none'
        primary.setAttribute('data-dsh-primary-hidden', canTalk ? 'true' : 'false')
        primary.setAttribute('data-dsh-send-ready', 'false')
        if (input.dataset.dshVoiceBound !== 'true') {
          input.dataset.dshVoiceBound = 'true'
          input.addEventListener('input', () => scheduleInspect())
          input.addEventListener('change', () => scheduleInspect())
        }
      }

      const revealResponse = () => {
        document.documentElement.removeAttribute('data-dsh-voice-turn')
        document.querySelectorAll('[data-dsh-voice-response="true"]').forEach(row => {
          row.removeAttribute('data-dsh-voice-response')
        })
      }

      const scheduleInspect = () => {
        if (inspectScheduled) return
        inspectScheduled = true
        requestAnimationFrame(() => {
          inspectScheduled = false
          installStyles()
          ensureSidebarLauncher()
          ensureComposerLauncher()
          inspectConversation()
        })
      }

      const removeLegacyLauncher = () => {
        document.getElementById('dsh-companion-launcher')?.remove()
      }

      const startVoiceTurn = () => {
        revealResponse()
        removeLegacyLauncher()
      }

      const preparePendingTurn = () => {
        const rows = [...document.querySelectorAll('[data-chat-flow-kind]')]
        pending = {
          baseline: new Set(rows.map(row => row.getAttribute('data-chat-anchor-key') ?? '')),
          started: false,
          consumed: 0,
          responseRow: null,
        }
      }

      window.__dshCompanion = {
        revealResponse,
        interruptActiveTurn() {
          revealResponse()
          pending = null
          const stop = activeStopButton()
          if (!(stop instanceof HTMLButtonElement)) return false
          stop.click()
          scheduleInspect()
          return true
        },
        canSubmitTranscript() {
          const input = activeComposerCard()?.querySelector('textarea')
          return input instanceof HTMLTextAreaElement
            && !input.disabled
            && !input.readOnly
            && !agentBusy()
        },
        markAttachmentPending() {
          nativeAttachmentPending = true
          scheduleInspect()
        },
        submitTranscript(text) {
          startVoiceTurn()
          const input = activeComposerCard()?.querySelector('textarea')
          if (!(input instanceof HTMLTextAreaElement) || input.disabled || input.readOnly) {
            post({ type: 'bridgeError', message: '请先在 DeepSeek Harness 中打开一个可以输入的新会话。' })
            return false
          }
          preparePendingTurn()
          setTextareaValue(input, text)
          input.focus()
          postState('thinking')
          requestAnimationFrame(() => requestAnimationFrame(() => {
            ensureComposerLauncher()
            const card = activeComposerCard()
            const primary = sendButtonOf(card)
            if (!(primary instanceof HTMLButtonElement) || primary.disabled) {
              pending = null
              post({ type: 'bridgeError', message: '语音文字已放入输入框，请检查后点发送。' })
              return
            }
            primary.click()
            inspectConversation()
          }))
          return true
        },
      }

      removeLegacyLauncher()
      installStyles()
      scheduleInspect()
      const observer = new MutationObserver(scheduleInspect)
      observer.observe(document.documentElement, {
        childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ['data-streaming', 'disabled', 'aria-label'],
      })
      for (const eventName of ['beforeinput', 'input', 'change', 'paste', 'drop']) {
        document.addEventListener(eventName, scheduleInspect, true)
      }
      document.addEventListener('change', event => {
        const input = event.target
        if (!(input instanceof HTMLInputElement) || input.type !== 'file' || !input.files?.length) return
        nativeAttachmentPending = true
        scheduleInspect()
      }, true)
      document.addEventListener('pointerdown', event => {
        const button = document.getElementById('dsh-composer-voice')
        if (!(button instanceof HTMLButtonElement) || button.dataset.mode !== 'voice' || button.hidden) return
        const rect = button.getBoundingClientRect()
        if (event.clientX < rect.left || event.clientX > rect.right
          || event.clientY < rect.top || event.clientY > rect.bottom) return
        event.preventDefault()
        event.stopPropagation()
        if (Date.now() - lastComposerVoicePress < 450) return
        lastComposerVoicePress = Date.now()
        post({ type: 'startListening' })
      }, true)
      document.addEventListener('click', event => {
        const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target]
        const removal = path.find(element => {
          if (!(element instanceof HTMLElement)) return false
          const label = [element.getAttribute('aria-label'), element.getAttribute('title'), element.textContent]
            .filter(Boolean).join(' ').toLowerCase()
          return label.includes('移除附件') || label.includes('删除附件') || label.includes('remove attachment')
        })
        if (!removal) return
        nativeAttachmentPending = false
        scheduleInspect()
      }, true)
      setInterval(scheduleInspect, 250)
      window.addEventListener('resize', scheduleInspect)
      post({ type: 'ready' })
    })()
    """#
    configuration.userContentController.addUserScript(WKUserScript(
      source: source,
      injectionTime: .atDocumentEnd,
      forMainFrameOnly: true
    ))
  }

  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    guard message.name == "companionOrb", let payload = message.body as? [String: Any], let type = payload["type"] as? String else { return }
    switch type {
    case "startListening":
      companion?.show(startListening: true)
    case "state":
      if payload["state"] as? String == "executing" { companion?.markExecuting() } else { companion?.markThinking() }
    case "responseStart":
      companion?.beginResponse()
    case "responseChunk":
      if let text = payload["text"] as? String { companion?.appendResponseChunk(text) }
    case "responseEnd":
      companion?.finishResponse()
    case "bridgeError":
      let detail = payload["message"] as? String ?? "语音会话暂时不可用。"
      companion?.reportBridgeError(detail)
      presentMainWindow()
    case "ready":
      break
    default:
      break
    }
  }

  private func submitVoiceTranscript(_ transcript: String) {
    guard webView != nil else {
      companion?.reportBridgeError("Harness 页面尚未准备好")
      return
    }
    pendingVoiceTranscript = transcript
    voiceSubmissionID = UUID()
    voiceSubmitAttempts = 0
    attemptVoiceTranscriptSubmission(id: voiceSubmissionID)
  }

  private func attemptVoiceTranscriptSubmission(id: UUID) {
    guard id == voiceSubmissionID, let transcript = pendingVoiceTranscript, let webView else { return }
    webView.evaluateJavaScript("window.__dshCompanion?.canSubmitTranscript() === true") { [weak self] value, error in
      DispatchQueue.main.async {
        guard let self, id == self.voiceSubmissionID else { return }
        guard error == nil, value as? Bool == true else {
          self.retryVoiceTranscriptSubmission(id: id)
          return
        }
        self.performVoiceTranscriptSubmission(transcript, id: id)
      }
    }
  }

  private func performVoiceTranscriptSubmission(_ transcript: String, id: UUID) {
    guard id == voiceSubmissionID, let webView else { return }
    guard let data = try? JSONSerialization.data(withJSONObject: transcript, options: [.fragmentsAllowed]),
          let encoded = String(data: data, encoding: .utf8) else {
      companion?.reportBridgeError("语音文字编码失败")
      return
    }
    webView.evaluateJavaScript("window.__dshCompanion?.submitTranscript(\(encoded))") { [weak self] value, error in
      DispatchQueue.main.async {
        guard let self, id == self.voiceSubmissionID else { return }
        if error == nil, value as? Bool == true {
          self.pendingVoiceTranscript = nil
          self.voiceSubmitAttempts = 0
        } else {
          self.retryVoiceTranscriptSubmission(id: id)
        }
      }
    }
  }

  private func retryVoiceTranscriptSubmission(id: UUID) {
    guard id == voiceSubmissionID, pendingVoiceTranscript != nil else { return }
    voiceSubmitAttempts += 1
    guard voiceSubmitAttempts < 50 else {
      pendingVoiceTranscript = nil
      companion?.reportBridgeError("已打断上一轮，但输入框没有及时恢复，请再说一次")
      presentMainWindow()
      return
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) { [weak self] in
      self?.attemptVoiceTranscriptSubmission(id: id)
    }
  }

  private func interruptActiveHarnessTurn(completion: @escaping () -> Void) {
    guard let webView else {
      completion()
      return
    }
    voiceSubmissionID = UUID()
    pendingVoiceTranscript = nil
    voiceSubmitAttempts = 0
    webView.evaluateJavaScript("window.__dshCompanion?.interruptActiveTurn()") { _, _ in
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.08, execute: completion)
    }
  }

  private func loadHarness(retriesRemaining: Int, completion: (() -> Void)? = nil) {
    URLSession.shared.dataTask(with: harnessURL) { [weak self] _, response, _ in
      let ready = (response as? HTTPURLResponse)?.statusCode == 200
      DispatchQueue.main.async {
        guard let self else { return }
        if ready {
          self.webView?.load(URLRequest(url: self.harnessURL))
          completion?()
        } else if retriesRemaining > 0 {
          DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            self.loadHarness(retriesRemaining: retriesRemaining - 1, completion: completion)
          }
        } else {
          self.showError("Harness 本地服务未能在 20 秒内启动。")
        }
      }
    }.resume()
  }

  private func checkForUpdate() {
    guard !checkingForUpdate, !updateInProgress else { return }
    checkingForUpdate = true
    runControlledUpdater(action: "detect") { [weak self] state, _ in
      guard let self else { return }
      self.checkingForUpdate = false
      guard let state else { return }
      self.applyControlledUpdateState(state)
    }
  }

  @objc private func openControlledUpdatePanel(_ sender: Any?) {
    if let state = controlledUpdateState {
      showControlledUpdatePanel(state)
      return
    }
    runControlledUpdater(action: "status") { [weak self] state, detail in
      guard let self else { return }
      if let state {
        self.applyControlledUpdateState(state)
        self.showControlledUpdatePanel(state)
      } else {
        self.showError("无法读取受控升级状态。\n\n\(detail)")
      }
    }
  }

  @objc private func testControlledCandidate(_ sender: NSButton) {
    guard !updateInProgress, var state = controlledUpdateState else { return }
    updateInProgress = true
    sender.isEnabled = false
    state = ControlledUpdateState(
      status: "testing",
      stableSHA: state.stableSHA,
      candidateSHA: state.candidateSHA,
      commitCount: state.commitCount,
      detectedAt: state.detectedAt,
      testedAt: state.testedAt,
      approvedAt: state.approvedAt,
      productionChanged: false,
      fixtureMode: state.fixtureMode,
      testRoot: state.testRoot,
      testDshRoot: state.testDshRoot,
      testPort: state.testPort,
      candidateRoot: state.candidateRoot,
      reportMarkdown: state.reportMarkdown,
      summary: "正在独立 Test 环境构建并验证候选版本。",
      failureReason: nil,
      tests: state.tests
    )
    applyControlledUpdateState(state)
    showControlledUpdatePanel(state)
    runControlledUpdater(action: "test") { [weak self] finished, detail in
      guard let self else { return }
      self.updateInProgress = false
      if let finished {
        self.applyControlledUpdateState(finished)
        self.showControlledUpdatePanel(finished)
      } else {
        self.showError("候选测试没有完成，Stable 未受影响。\n\n\(detail)")
        self.checkForUpdate()
      }
    }
  }

  @objc private func approveControlledCandidate(_ sender: NSButton) {
    guard controlledUpdateState?.status == "passed", !updateInProgress else { return }
    let alert = NSAlert()
    alert.alertStyle = .warning
    alert.messageText = "批准候选版本进入 Stable 升级队列？"
    alert.informativeText = "这一步只记录人工批准，不会修改生产仓库、Mac App 或 ~/.dsh。V0.1 尚未启用正式 promote。"
    alert.addButton(withTitle: "确认批准")
    alert.addButton(withTitle: "取消")
    guard alert.runModal() == .alertFirstButtonReturn else { return }
    updateInProgress = true
    sender.isEnabled = false
    runControlledUpdater(action: "approve") { [weak self] state, detail in
      guard let self else { return }
      self.updateInProgress = false
      if let state {
        self.applyControlledUpdateState(state)
        self.showControlledUpdatePanel(state)
      } else {
        self.showError("无法记录人工批准。\n\n\(detail)")
      }
    }
  }

  @objc private func openControlledUpdateReport(_ sender: NSButton) {
    guard let path = controlledUpdateState?.reportMarkdown,
          FileManager.default.fileExists(atPath: path) else {
      showError("当前候选版本还没有可查看的测试报告。")
      return
    }
    NSWorkspace.shared.open(URL(fileURLWithPath: path))
  }

  @objc private func closeControlledUpdatePanel(_ sender: Any?) {
    updatePanel?.close()
  }

  private func runControlledUpdater(
    action: String,
    completion: @escaping (ControlledUpdateState?, String) -> Void
  ) {
    guard let updaterURL = Bundle.main.url(forResource: "controlled-update", withExtension: "mjs") else {
      completion(nil, "客户端缺少 controlled-update.mjs。")
      return
    }
    let nodePaths = ["/usr/local/bin/node", "/opt/homebrew/bin/node"]
    guard let nodePath = nodePaths.first(where: { FileManager.default.isExecutableFile(atPath: $0) }) else {
      completion(nil, "找不到 Node.js。")
      return
    }
    runCommand(executable: nodePath, arguments: [updaterURL.path, action]) { result in
      let state = self.decodeControlledUpdateState(result.output)
      completion(state, String(result.output.suffix(4000)))
    }
  }

  private func decodeControlledUpdateState(_ output: String) -> ControlledUpdateState? {
    for line in output.split(separator: "\n", omittingEmptySubsequences: true).reversed() {
      guard let data = String(line).data(using: .utf8),
            let state = try? JSONDecoder().decode(ControlledUpdateState.self, from: data) else { continue }
      return state
    }
    return nil
  }

  private func applyControlledUpdateState(_ state: ControlledUpdateState) {
    controlledUpdateState = state
    guard let button = updateButton else { return }
    let hasCandidate = state.candidateSHA != nil && state.commitCount > 0
    button.isHidden = !hasCandidate
    button.isEnabled = state.status != "testing"
    switch state.status {
    case "testing": button.title = "Test 验证中…"
    case "passed": button.title = "候选已通过"
    case "failed": button.title = "候选测试失败"
    case "approved": button.title = "候选已批准"
    default: button.title = "测试新版本"
    }
  }

  private func showControlledUpdatePanel(_ state: ControlledUpdateState) {
    updatePanel?.close()
    let panel = NSPanel(
      contentRect: NSRect(x: 0, y: 0, width: 620, height: 500),
      styleMask: [.titled, .closable],
      backing: .buffered,
      defer: false
    )
    panel.title = "DeepSeek Harness 受控升级"
    panel.isReleasedWhenClosed = false

    let stack = NSStackView()
    stack.orientation = .vertical
    stack.alignment = .leading
    stack.spacing = 12
    stack.edgeInsets = NSEdgeInsets(top: 24, left: 28, bottom: 24, right: 28)
    stack.translatesAutoresizingMaskIntoConstraints = false

    let title = label("受控升级 V0.1", size: 22, weight: .semibold)
    let subtitle = label("发现更新 → 独立 Test Candidate → 兼容验证 → 人工批准", size: 13, color: .secondaryLabelColor)
    stack.addArrangedSubview(title)
    stack.addArrangedSubview(subtitle)
    if state.fixtureMode == true {
      stack.addArrangedSubview(label("Evolution 验证夹具 · 不代表官方候选", size: 12, weight: .medium, color: .systemOrange))
    }
    stack.addArrangedSubview(separator())
    stack.addArrangedSubview(label("当前 Stable\n\(shortSHA(state.stableSHA))", size: 15, weight: .medium))
    stack.addArrangedSubview(label("上游候选\n\(state.candidateSHA.map(shortSHA) ?? "尚未检测")", size: 15, weight: .medium))
    stack.addArrangedSubview(label("新增 commit：\(state.commitCount)    检测时间：\(displayDate(state.detectedAt))", size: 13, color: .secondaryLabelColor))
    stack.addArrangedSubview(separator())

    let passed = state.tests.filter { $0.status == "passed" }.count
    let compatibility: String
    switch state.status {
    case "testing": compatibility = "兼容性：测试中"
    case "passed": compatibility = "兼容性：通过    核心测试：\(passed)/\(state.tests.count)"
    case "approved": compatibility = "兼容性：通过    状态：已人工批准"
    case "failed": compatibility = "兼容性：失败"
    default: compatibility = "兼容性：等待 Test 验证"
    }
    stack.addArrangedSubview(label(compatibility, size: 17, weight: .semibold, color: statusColor(state.status)))
    stack.addArrangedSubview(label(state.summary, size: 13))
    if let failure = state.failureReason, !failure.isEmpty {
      stack.addArrangedSubview(label("原因：\(String(failure.prefix(700)))", size: 12, color: .systemRed))
    }
    stack.addArrangedSubview(label("生产环境：未改变", size: 14, weight: .medium, color: .systemGreen))
    stack.addArrangedSubview(label("Test：\(state.testRoot)\nDSH_HOME：\(state.testDshRoot)\nRuntime 端口：\(state.testPort)", size: 11, color: .secondaryLabelColor))

    let buttons = NSStackView()
    buttons.orientation = .horizontal
    buttons.spacing = 10
    if state.status != "testing" && state.status != "approved" {
      let testButton = NSButton(title: state.status == "failed" ? "重新测试新版本" : "测试新版本", target: self, action: #selector(testControlledCandidate(_:)))
      testButton.bezelStyle = .rounded
      testButton.bezelColor = .systemBlue
      testButton.contentTintColor = .white
      buttons.addArrangedSubview(testButton)
    }
    if state.status == "passed" {
      let approveButton = NSButton(title: "批准升级 Stable", target: self, action: #selector(approveControlledCandidate(_:)))
      approveButton.bezelStyle = .rounded
      buttons.addArrangedSubview(approveButton)
    }
    if state.reportMarkdown != nil {
      buttons.addArrangedSubview(NSButton(title: "查看报告", target: self, action: #selector(openControlledUpdateReport(_:))))
    }
    buttons.addArrangedSubview(NSButton(title: "关闭", target: self, action: #selector(closeControlledUpdatePanel(_:))))
    stack.addArrangedSubview(buttons)

    let content = NSView()
    content.addSubview(stack)
    NSLayoutConstraint.activate([
      stack.leadingAnchor.constraint(equalTo: content.leadingAnchor),
      stack.trailingAnchor.constraint(equalTo: content.trailingAnchor),
      stack.topAnchor.constraint(equalTo: content.topAnchor),
      stack.bottomAnchor.constraint(lessThanOrEqualTo: content.bottomAnchor),
    ])
    panel.contentView = content
    panel.center()
    panel.makeKeyAndOrderFront(nil)
    updatePanel = panel
    NSApp.activate(ignoringOtherApps: true)
  }

  private func label(
    _ text: String,
    size: CGFloat,
    weight: NSFont.Weight = .regular,
    color: NSColor = .labelColor
  ) -> NSTextField {
    let field = NSTextField(wrappingLabelWithString: text)
    field.font = NSFont.systemFont(ofSize: size, weight: weight)
    field.textColor = color
    field.maximumNumberOfLines = 0
    return field
  }

  private func separator() -> NSBox {
    let box = NSBox()
    box.boxType = .separator
    return box
  }

  private func shortSHA(_ sha: String) -> String {
    String(sha.prefix(12))
  }

  private func displayDate(_ value: String?) -> String {
    guard let value else { return "—" }
    let precise = ISO8601DateFormatter()
    precise.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let fallback = ISO8601DateFormatter()
    guard let date = precise.date(from: value) ?? fallback.date(from: value) else { return "—" }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "zh_CN")
    formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
    return formatter.string(from: date)
  }

  private func statusColor(_ status: String) -> NSColor {
    switch status {
    case "passed", "approved": return .systemGreen
    case "failed": return .systemRed
    case "testing": return .systemBlue
    default: return .labelColor
    }
  }

  private func runCommand(
    executable: String,
    arguments: [String],
    completion: @escaping (CommandResult) -> Void
  ) {
    let logDirectory = FileManager.default.temporaryDirectory
      .appendingPathComponent("deepseek-harness-\(UUID().uuidString)", isDirectory: true)
    let logURL = logDirectory.appendingPathComponent("command.log")
    do {
      try FileManager.default.createDirectory(
        at: logDirectory,
        withIntermediateDirectories: false,
        attributes: [.posixPermissions: 0o700]
      )
    } catch {
      completion(CommandResult(status: -1, output: "无法创建命令日志目录。"))
      return
    }
    let descriptor = open(logURL.path, O_WRONLY | O_CREAT | O_EXCL, S_IRUSR | S_IWUSR)
    guard descriptor >= 0 else {
      try? FileManager.default.removeItem(at: logDirectory)
      completion(CommandResult(status: -1, output: "无法创建命令日志。"))
      return
    }
    let log = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
    let process = Process()
    process.executableURL = URL(fileURLWithPath: executable)
    process.arguments = arguments
    process.environment = commandEnvironment()
    process.standardOutput = log
    process.standardError = log
    process.terminationHandler = { endedProcess in
      try? log.close()
      let data = (try? Data(contentsOf: logURL)) ?? Data()
      try? FileManager.default.removeItem(at: logDirectory)
      let output = String(decoding: data, as: UTF8.self)
      DispatchQueue.main.async {
        completion(CommandResult(status: endedProcess.terminationStatus, output: output))
      }
    }
    do {
      try process.run()
    } catch {
      try? log.close()
      try? FileManager.default.removeItem(at: logDirectory)
      completion(CommandResult(status: -1, output: error.localizedDescription))
    }
  }

  private func showError(_ message: String) {
    let alert = NSAlert()
    alert.alertStyle = .warning
    alert.messageText = "DeepSeek Harness"
    alert.informativeText = message
    alert.addButton(withTitle: "好")
    alert.runModal()
  }

  private func commandEnvironment() -> [String: String] {
    var environment = ProcessInfo.processInfo.environment
    environment["PATH"] = commandSearchPath
    return environment
  }
}

@main
private enum DeepSeekHarnessApplication {
  static func main() {
    let app = NSApplication.shared
    let delegate = AppDelegate()
    app.delegate = delegate
    app.setActivationPolicy(.regular)
    app.run()
  }
}
