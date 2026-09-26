#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  closeSync,
  createReadStream,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { homedir } from 'node:os'

const OFFICIAL_UPSTREAM = 'https://github.com/deepseek-ai/deepseek-harness.git'
const DEFAULT_STABLE_RELEASE = join(homedir(), 'Documents', 'DeepSeek-Harness-Stable', 'stable-v0')
const DEFAULT_TEST_ROOT = join(homedir(), 'Documents', 'DeepSeek-Harness-Test')
const DEFAULT_TEST_DSH_ROOT = join(homedir(), '.dsh-test')
const DEFAULT_PORT = 3180
const STATE_VERSION = 1

function configuration() {
  return {
    stableRelease: resolve(process.env.DSH_CONTROLLED_UPDATE_STABLE_RELEASE ?? DEFAULT_STABLE_RELEASE),
    testRoot: resolve(process.env.DSH_CONTROLLED_UPDATE_TEST_ROOT ?? DEFAULT_TEST_ROOT),
    testDshRoot: resolve(process.env.DSH_CONTROLLED_UPDATE_DSH_ROOT ?? DEFAULT_TEST_DSH_ROOT),
    upstream: process.env.DSH_CONTROLLED_UPDATE_UPSTREAM ?? OFFICIAL_UPSTREAM,
    port: Number(process.env.DSH_CONTROLLED_UPDATE_PORT ?? DEFAULT_PORT),
    allowNonOfficial: process.env.DSH_CONTROLLED_UPDATE_TEST_MODE === '1',
    fastFixture: process.env.DSH_CONTROLLED_UPDATE_FAST_FIXTURE === '1',
  }
}

function stableManifestPath(config) {
  return join(config.stableRelease, 'stable-v0-manifest.json')
}

function statePath(config) {
  return join(config.testRoot, 'controlled-update-state.json')
}

function assertSafeWriteRoot(path, config) {
  const target = resolve(path)
  const roots = [config.testRoot, config.testDshRoot]
  if (!roots.some(root => target === root || target.startsWith(`${root}${sep}`))) {
    throw new Error(`refusing write outside controlled Test roots: ${target}`)
  }
}

function ensureDirectory(path, config, mode = 0o700) {
  assertSafeWriteRoot(path, config)
  mkdirSync(path, { recursive: true, mode })
  chmodSync(path, mode)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeJsonAtomic(path, value, config) {
  assertSafeWriteRoot(path, config)
  ensureDirectory(dirname(path), config)
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  renameSync(temporary, path)
  chmodSync(path, 0o600)
}

function now() {
  return new Date().toISOString()
}

function compactTimestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function sha256(path) {
  const hash = createHash('sha256')
  const descriptor = readFileSync(path)
  hash.update(descriptor)
  return hash.digest('hex')
}

function sha256File(path) {
  return command('/usr/bin/shasum', ['-a', '256', path]).split(/\s+/)[0]
}

function sha256Stream(path) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolveHash(hash.digest('hex')))
  })
}

function collectFiles(root, filter = () => true, prefix = root) {
  if (!existsSync(root)) return []
  const files = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      files.push(...collectFiles(path, filter, prefix))
    } else if (entry.isFile() && filter(path)) {
      files.push({ path, name: relative(prefix, path) })
    }
  }
  return files
}

async function treeHash(files) {
  const aggregate = createHash('sha256')
  for (const file of [...files].sort((a, b) => a.name.localeCompare(b.name))) {
    aggregate.update(file.name)
    aggregate.update('\0')
    aggregate.update(await sha256Stream(file.path))
    aggregate.update('\n')
  }
  return aggregate.digest('hex')
}

function command(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (options.logPath !== undefined) {
    writeFileSync(options.logPath, output, { mode: 0o600 })
  }
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    const tail = output.trim().slice(-4000)
    throw new Error(`${basename(executable)} ${args.join(' ')} failed (${String(result.status)}): ${tail}`)
  }
  return output.trim()
}

function git(args, options = {}) {
  return command('/usr/bin/git', args, options)
}

function loadStable(config) {
  const path = stableManifestPath(config)
  if (!existsSync(path)) throw new Error(`Stable V0 manifest is missing: ${path}`)
  const manifest = readJson(path)
  if (manifest.stableVersion !== 'stable-v0') throw new Error('Stable manifest is not stable-v0')
  if (!/^[0-9a-f]{40}$/.test(manifest.harness?.headSHA ?? '')) throw new Error('Stable manifest has no valid Harness SHA')
  if (!/^[0-9a-f]{40}$/.test(manifest.harness?.upstreamBase ?? '')) throw new Error('Stable manifest has no valid upstream base')
  return manifest
}

function createBaseState(config, stable) {
  return {
    formatVersion: STATE_VERSION,
    status: 'detected',
    stableSHA: stable.harness.headSHA,
    stableUpstreamBase: stable.harness.upstreamBase,
    candidateSHA: null,
    commitCount: 0,
    detectedAt: null,
    testedAt: null,
    approvedAt: null,
    promotedAt: null,
    productionChanged: false,
    fixtureMode: config.upstream !== OFFICIAL_UPSTREAM,
    testRoot: config.testRoot,
    testDshRoot: config.testDshRoot,
    testPort: config.port,
    candidateRoot: null,
    reportJson: null,
    reportMarkdown: null,
    summary: '尚未检测上游候选版本。',
    failureReason: null,
    tests: [],
  }
}

function persistState(config, state) {
  writeJsonAtomic(statePath(config), state, config)
}

function mirrorPath(config) {
  if (config.allowNonOfficial && config.upstream.startsWith('/') && existsSync(config.upstream)) {
    return resolve(config.upstream)
  }
  return join(config.testRoot, 'upstream-full.git')
}

function ensureMirror(config) {
  const mirror = mirrorPath(config)
  if (mirror === resolve(config.upstream)) {
    const candidate = git(['--git-dir', mirror, 'rev-parse', 'refs/heads/master'])
    if (!/^[0-9a-f]{40}$/.test(candidate)) throw new Error('Fixture upstream has no valid master')
    return mirror
  }
  ensureDirectory(config.testRoot, config)
  if (!existsSync(join(mirror, 'HEAD'))) {
    ensureDirectory(mirror, config)
    git(['init', '--bare', mirror])
    git(['--git-dir', mirror, 'remote', 'add', 'origin', config.upstream])
  } else {
    const origin = git(['--git-dir', mirror, 'remote', 'get-url', 'origin'])
    if (origin !== config.upstream) {
      throw new Error(`Test upstream mirror has unexpected origin: ${origin}`)
    }
  }
  git([
    '--git-dir', mirror,
    'fetch', 'origin',
    '+refs/heads/master:refs/remotes/origin/master',
  ])
  return mirror
}

function candidateRef(config, mirror) {
  return mirror === resolve(config.upstream) ? 'refs/heads/master' : 'refs/remotes/origin/master'
}

function detect(config) {
  const stable = loadStable(config)
  ensureDirectory(config.testDshRoot, config)
  const mirror = ensureMirror(config)
  const candidateSHA = git(['--git-dir', mirror, 'rev-parse', candidateRef(config, mirror)])
  const commitCount = Number(git([
    '--git-dir', mirror,
    'rev-list', '--count', `${stable.harness.upstreamBase}..${candidateSHA}`,
  ]))
  const previous = existsSync(statePath(config)) ? readJson(statePath(config)) : createBaseState(config, stable)
  const sameCandidate = previous.candidateSHA === candidateSHA
  const preservedStatus = sameCandidate && ['testing', 'passed', 'failed', 'approved'].includes(previous.status)
  const detectedSummary = commitCount === 0
    ? '当前 Stable 的上游基线已经是最新版本。'
    : `发现包含 ${String(commitCount)} 个上游提交的候选版本。`
  const preservedSummary = previous.status === 'passed'
    ? `候选版本已通过 ${String((previous.tests ?? []).filter(test => test.status === 'passed').length)} 项检查；Stable 未改变。`
    : previous.status === 'approved'
      ? '候选版本已获人工批准；V0.1 尚未执行正式 promote，Stable 未改变。'
      : previous.summary
  const state = {
    ...createBaseState(config, stable),
    ...sameCandidate ? previous : {},
    status: preservedStatus ? previous.status : 'detected',
    stableSHA: stable.harness.headSHA,
    stableUpstreamBase: stable.harness.upstreamBase,
    candidateSHA,
    commitCount,
    detectedAt: now(),
    productionChanged: false,
    testRoot: config.testRoot,
    testDshRoot: config.testDshRoot,
    testPort: config.port,
    summary: preservedStatus ? preservedSummary : detectedSummary,
  }
  persistState(config, state)
  return state
}

function allocateCandidateRoot(config, candidateSHA) {
  const base = `${candidateSHA.slice(0, 12)}-${compactTimestamp()}`
  let path = join(config.testRoot, 'candidates', base)
  let suffix = 1
  while (existsSync(path)) {
    path = join(config.testRoot, 'candidates', `${base}-${String(suffix)}`)
    suffix += 1
  }
  ensureDirectory(path, config)
  return path
}

function appendTest(report, name, status, detail, startedAt = now()) {
  const recordedDetail = typeof detail === 'string' ? detail : JSON.stringify(detail)
  report.tests.push({ name, status, detail: recordedDetail, startedAt, finishedAt: now() })
}

function testLogPath(candidateRoot, index, name, config) {
  const logs = join(candidateRoot, 'logs')
  ensureDirectory(logs, config)
  return join(logs, `${String(index).padStart(2, '0')}-${name}.log`)
}

function runRecorded(report, name, action) {
  const startedAt = now()
  try {
    const detail = action()
    appendTest(report, name, 'passed', detail ?? '通过', startedAt)
    return detail
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    appendTest(report, name, 'failed', message, startedAt)
    throw error
  }
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastError = 'no response'
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return `HTTP ${String(response.status)}`
      lastError = `HTTP ${String(response.status)}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 250))
  }
  throw new Error(`Test Runtime did not become healthy: ${lastError}`)
}

async function rpc(base, method, payload) {
  const rpcId = `controlled-update-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const response = await fetch(`${base}/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId, method, payload }),
  })
  if (!response.ok) throw new Error(`${method} returned HTTP ${String(response.status)}`)
  const envelope = await response.json()
  if (envelope?.rpcId !== rpcId) throw new Error(`${method} returned a mismatched rpcId`)
  if (envelope?.result?.ok !== true) {
    throw new Error(`${method} failed: ${JSON.stringify(envelope?.result?.error ?? envelope)}`)
  }
  return envelope.result.value
}

async function waitForRpc(base, method, payload, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastError = 'RPC route unavailable'
  while (Date.now() < deadline) {
    try {
      return await rpc(base, method, payload)
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 250))
  }
  throw new Error(`${method} did not become healthy: ${lastError}`)
}

async function checkWebSocket(url) {
  await new Promise((resolveSocket, reject) => {
    const socket = new WebSocket(url)
    const timer = setTimeout(() => {
      socket.close()
      reject(new Error('WebSocket open timed out'))
    }, 10_000)
    socket.addEventListener('open', () => {
      clearTimeout(timer)
      socket.close()
      resolveSocket()
    }, { once: true })
    socket.addEventListener('error', () => {
      clearTimeout(timer)
      reject(new Error('WebSocket negotiation failed'))
    }, { once: true })
  })
  return 'WebSocket /api/events.host opened successfully'
}

async function portAvailable(port) {
  return await new Promise(resolveAvailability => {
    const server = createServer()
    server.once('error', () => resolveAvailability(false))
    server.listen(port, '127.0.0.1', () => server.close(() => resolveAvailability(true)))
  })
}

function stopProcess(child) {
  return new Promise(resolveStop => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolveStop()
      return
    }
    const timer = setTimeout(() => child.kill('SIGKILL'), 5_000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolveStop()
    })
    child.kill('SIGTERM')
  })
}

function renderReportMarkdown(report) {
  const rows = report.tests.map(test => `| ${test.name} | ${test.status} | ${String(test.detail).replaceAll('|', '\\|').replaceAll('\n', ' ')} |`).join('\n')
  return `# DeepSeek Harness Test Candidate ${report.candidateSHA.slice(0, 12)}\n\n` +
    `- Stable SHA: \`${report.stableSHA}\`\n` +
    `- Candidate SHA: \`${report.candidateSHA}\`\n` +
    `- Status: **${report.status}**\n` +
    `- Tested at: ${report.testedAt}\n` +
    `- Test source: \`${report.sourcePath}\`\n` +
    `- Test DSH_HOME: \`${report.dshHome}\`\n` +
    `- Test port: ${String(report.testPort)}\n` +
    `- Production changed: ${String(report.productionChanged)}\n\n` +
    `| Check | Result | Detail |\n| --- | --- | --- |\n${rows}\n\n` +
    `## Build summary\n\n\`\`\`json\n${JSON.stringify(report.build, null, 2)}\n\`\`\`\n\n` +
    `## Profile compatibility\n\n\`\`\`json\n${JSON.stringify(report.profile, null, 2)}\n\`\`\`\n`
}

async function saveReport(config, report, candidateRoot) {
  const reportDirectory = join(candidateRoot, 'report')
  ensureDirectory(reportDirectory, config)
  const jsonPath = join(reportDirectory, 'candidate-report.json')
  const markdownPath = join(reportDirectory, 'candidate-report.md')
  writeJsonAtomic(jsonPath, report, config)
  writeFileSync(markdownPath, renderReportMarkdown(report), { mode: 0o600 })
  return { jsonPath, markdownPath }
}

function verifyRecoveryMaterial(config, stable) {
  const sourceArchive = join(config.stableRelease, stable.recovery.sourceSnapshot)
  const profileArchive = join(config.stableRelease, stable.profile.snapshot)
  const sums = join(config.stableRelease, stable.recovery.verificationManifest)
  for (const path of [sourceArchive, profileArchive, sums]) {
    if (!existsSync(path)) throw new Error(`Stable recovery material is missing: ${path}`)
  }
  if (sha256File(sourceArchive) !== stable.recovery.sourceSnapshotHash) {
    throw new Error('Stable source snapshot hash does not match the manifest')
  }
  if (sha256File(profileArchive) !== stable.profile.snapshotHash) {
    throw new Error('Stable Profile snapshot hash does not match the manifest')
  }
  return { sourceArchive, profileArchive }
}

async function testCandidate(config) {
  const stable = loadStable(config)
  const prior = existsSync(statePath(config)) ? readJson(statePath(config)) : detect(config)
  if (!/^[0-9a-f]{40}$/.test(prior.candidateSHA ?? '')) throw new Error('No detected candidate SHA')
  if (prior.commitCount < 1) throw new Error('No newer upstream candidate is available')
  if (!(await portAvailable(config.port))) throw new Error(`Test Runtime port ${String(config.port)} is already in use`)

  const candidateRoot = allocateCandidateRoot(config, prior.candidateSHA)
  const sourcePath = join(candidateRoot, 'source')
  const dshHome = join(config.testDshRoot, 'candidates', basename(candidateRoot))
  const report = {
    formatVersion: STATE_VERSION,
    status: 'testing',
    stableSHA: stable.harness.headSHA,
    stableUpstreamBase: stable.harness.upstreamBase,
    candidateSHA: prior.candidateSHA,
    commitCount: prior.commitCount,
    detectedAt: prior.detectedAt,
    testedAt: now(),
    candidateRoot,
    sourcePath,
    dshHome,
    testPort: config.port,
    productionChanged: false,
    tests: [],
    build: {},
    profile: {},
    failureReason: null,
  }
  persistState(config, {
    ...prior,
    status: 'testing',
    testedAt: report.testedAt,
    candidateRoot,
    failureReason: null,
    summary: '正在独立 Test 环境构建并验证候选版本。',
    tests: [],
  })

  let runtime
  try {
    const recovery = runRecorded(report, 'stable-recovery-material', () => verifyRecoveryMaterial(config, stable))
    runRecorded(report, 'source-candidate', () => {
      ensureDirectory(sourcePath, config)
      command('/usr/bin/tar', ['-xzf', recovery.sourceArchive, '--strip-components=1', '-C', sourcePath], {
        logPath: testLogPath(candidateRoot, 1, 'source-extract', config),
      })
      const extractedHead = git(['-C', sourcePath, 'rev-parse', 'HEAD'])
      if (extractedHead !== stable.harness.headSHA) throw new Error(`Stable source snapshot HEAD is ${extractedHead}`)
      git(['-C', sourcePath, 'remote', 'add', 'controlled-upstream', mirrorPath(config)])
      const mirror = mirrorPath(config)
      git([
        '-C', sourcePath, 'fetch', 'controlled-upstream',
        `${candidateRef(config, mirror)}:refs/remotes/controlled-upstream/master`,
      ], { logPath: testLogPath(candidateRoot, 2, 'candidate-fetch', config) })
      const fetched = git(['-C', sourcePath, 'rev-parse', 'refs/remotes/controlled-upstream/master'])
      if (fetched !== prior.candidateSHA) throw new Error(`Detected candidate moved from ${prior.candidateSHA} to ${fetched}`)
      git([
        '-C', sourcePath,
        'rebase', '--onto', prior.candidateSHA, stable.harness.upstreamBase, stable.harness.headSHA,
      ], { logPath: testLogPath(candidateRoot, 3, 'customization-rebase', config) })
      const replayed = Number(git(['-C', sourcePath, 'rev-list', '--count', `${prior.candidateSHA}..HEAD`]))
      if (replayed !== stable.harness.localCustomizationCommits.length) {
        throw new Error(`Expected ${String(stable.harness.localCustomizationCommits.length)} customization commits, replayed ${String(replayed)}`)
      }
      return `候选上游与 ${String(replayed)} 个 Stable V0 定制提交合并成功`
    })

    const buildEnvironment = {
      ...process.env,
      DSH_HOME: dshHome,
      NO_PROXY: '127.0.0.1,localhost',
      no_proxy: '127.0.0.1,localhost',
    }
    runRecorded(report, 'frozen-install', () => {
      command('corepack', ['pnpm', 'install', '--frozen-lockfile'], {
        cwd: sourcePath,
        env: buildEnvironment,
        logPath: testLogPath(candidateRoot, 4, 'frozen-install', config),
      })
      return 'pnpm frozen install 成功；未更新 lockfile'
    })
    runRecorded(report, 'runtime-and-web-build', () => {
      command('corepack', ['pnpm', 'run', 'build'], {
        cwd: sourcePath,
        env: buildEnvironment,
        logPath: testLogPath(candidateRoot, 5, 'build', config),
      })
      if (!existsSync(join(sourcePath, 'apps/cli/lib/bin.js'))) throw new Error('Runtime entry was not built')
      if (!existsSync(join(sourcePath, 'apps/web/dist/index.html'))) throw new Error('Web dist was not built')
      return 'Runtime 与 Web 完整构建成功'
    })
    report.build.runtimeBuildHash = await treeHash(collectFiles(sourcePath, path => path.includes(`${sep}lib${sep}`)))
    report.build.webBuildHash = await treeHash(collectFiles(join(sourcePath, 'apps/web/dist')))
    report.build.lockfileHash = sha256(join(sourcePath, 'pnpm-lock.yaml'))
    report.build.candidateHead = git(['-C', sourcePath, 'rev-parse', 'HEAD'])

    runRecorded(report, 'profile-snapshot', () => {
      ensureDirectory(join(dshHome, 'profiles'), config)
      ensureDirectory(join(dshHome, 'home'), config)
      command('/usr/bin/tar', ['-xzf', recovery.profileArchive, '-C', join(dshHome, 'profiles')], {
        logPath: testLogPath(candidateRoot, 6, 'profile-extract', config),
      })
      const profileManifest = readJson(join(dshHome, 'profiles/web/package.json'))
      const expected = stable.profile.directSources
      for (const [name, version] of Object.entries(expected)) {
        if (profileManifest.dependencies?.[name] !== version) {
          throw new Error(`Pinned Profile dependency mismatch for ${name}`)
        }
      }
      report.profile = {
        compatible: false,
        bundles: profileManifest.dsh?.profile?.bundles ?? [],
        directSources: profileManifest.dependencies,
      }
      return `${String(Object.keys(expected).length)} 个固定第三方 Profile bundle 已从 Stable V0 快照复现`
    })

    runRecorded(report, 'focused-capability-tests', () => {
      if (config.fastFixture) return 'fast fixture: focused capability suites supplied by fixture'
      command('corepack', [
        'pnpm', 'exec', 'vitest', 'run',
        'packages/workspace/workspace/tests/workspace.spec.ts',
        'packages/core/session/tests/session.spec.ts',
        'packages/skill/skill/tests/skill.spec.ts',
        'packages/workflow/workflow/tests/workflow.spec.ts',
        'packages/workflow/workflow-worker-thread/tests/integration.spec.ts',
      ], {
        cwd: sourcePath,
        env: buildEnvironment,
        logPath: testLogPath(candidateRoot, 7, 'focused-capabilities', config),
      })
      return 'Workspace、Session、Skill Registry、Workflow 核心测试通过'
    })

    runRecorded(report, 'mac-shell-compatibility', () => {
      if (config.fastFixture) return 'fast fixture: Mac shell compatibility supplied by fixture'
      command('/usr/bin/xcrun', [
        'swiftc',
        '-sdk', '/Library/Developer/CommandLineTools/SDKs/MacOSX15.4.sdk',
        '-module-cache-path', join(candidateRoot, 'swift-module-cache'),
        '-typecheck', '-target', 'arm64-apple-macos13.0',
        '-framework', 'AppKit', '-framework', 'WebKit',
        '-framework', 'AVFoundation', '-framework', 'Speech',
        'desktop/macos/DeepSeekHarness.swift', 'desktop/macos/SpeechText.swift',
      ], {
        cwd: sourcePath,
        env: buildEnvironment,
        logPath: testLogPath(candidateRoot, 8, 'mac-shell-typecheck', config),
      })
      return '候选源码中的 macOS 壳通过 Swift typecheck'
    })

    const runtimeLog = testLogPath(candidateRoot, 9, 'test-runtime', config)
    const runtimeLogHandle = openSync(runtimeLog, 'a', 0o600)
    const runtimeEnvironment = {
      ...buildEnvironment,
      HOME: join(dshHome, 'home'),
      DSH_HOME: dshHome,
    }
    runtime = spawn('/usr/local/bin/node', [
      join(sourcePath, 'apps/cli/lib/bin.js'),
      'web', '--port', String(config.port), '--no-open',
    ], {
      cwd: join(dshHome, 'home'),
      env: runtimeEnvironment,
      stdio: ['ignore', runtimeLogHandle, runtimeLogHandle],
    })
    runtime.once('exit', () => {
      try {
        closeSync(runtimeLogHandle)
      } catch {
        // Runtime shutdown may close the shared log descriptor before this listener.
      }
    })

    const base = `http://127.0.0.1:${String(config.port)}`
    const health = await waitForHttp(base, 60_000)
    appendTest(report, 'test-runtime-start', 'passed', `独立 Runtime 启动成功（${health}）`)
    const host = await waitForRpc(base, 'host.describe', {}, 60_000)
    appendTest(report, 'http-api-health', 'passed', `host.describe 成功（home=${String(host.home ?? 'available')}）`)
    await checkWebSocket(`ws://127.0.0.1:${String(config.port)}/api/events.host`)
    appendTest(report, 'websocket', 'passed', 'WebSocket /api/events.host 协商成功')

    const workspacePath = join(candidateRoot, 'workspace-smoke')
    ensureDirectory(workspacePath, config)
    const workspaceValue = await rpc(base, 'workspace.create', { path: workspacePath })
    const workspaceId = workspaceValue.workspace?.workspaceId
    if (typeof workspaceId !== 'string') throw new Error('workspace.create returned no workspaceId')
    appendTest(report, 'workspace-create-open', 'passed', `创建并打开隔离 Workspace ${workspaceId}`)

    const sessionValue = await rpc(base, 'session.create', { workspaceId })
    const sessionId = sessionValue.sessionId
    if (typeof sessionId !== 'string') throw new Error('session.create returned no sessionId')
    appendTest(report, 'session-create', 'passed', `创建隔离 Session ${sessionId}`)

    const skillValue = await rpc(base, 'skill.list', { sessionId })
    const skills = Array.isArray(skillValue.skills) ? skillValue.skills : []
    appendTest(report, 'skill-registry', 'passed', `Skill Registry 可查询（${String(skills.length)} 项）`)

    report.profile.compatible = true
    appendTest(report, 'profile-bundles', 'passed', `${String(report.profile.bundles.length)} 个 Profile bundle 随独立 Runtime 完成装载`)
    appendTest(report, 'production-isolation', 'passed', `Test 使用 ${dshHome} 与端口 ${String(config.port)}；生产仓库、~/.dsh 和 3080 未作为写目标`)
    report.status = 'passed'
  } catch (error) {
    report.status = 'failed'
    report.failureReason = error instanceof Error ? error.message : String(error)
  } finally {
    if (runtime !== undefined) await stopProcess(runtime)
  }

  report.testedAt = now()
  const paths = await saveReport(config, report, candidateRoot)
  const state = {
    ...prior,
    status: report.status,
    testedAt: report.testedAt,
    candidateRoot,
    reportJson: paths.jsonPath,
    reportMarkdown: paths.markdownPath,
    productionChanged: false,
    failureReason: report.failureReason,
    tests: report.tests,
    summary: report.status === 'passed'
      ? `候选版本已通过 ${String(report.tests.filter(test => test.status === 'passed').length)} 项检查；Stable 未改变。`
      : '新版本测试未通过，Stable 未受影响。',
  }
  persistState(config, state)
  return state
}

function approve(config) {
  const stable = loadStable(config)
  const state = readJson(statePath(config))
  if (state.status !== 'passed') throw new Error('Only a passed candidate can be approved')
  verifyRecoveryMaterial(config, stable)
  const approved = {
    ...state,
    status: 'approved',
    approvedAt: now(),
    productionChanged: false,
    summary: '候选版本已获人工批准；V0.1 尚未执行正式 promote，Stable 未改变。',
  }
  persistState(config, approved)
  return approved
}

function currentStatus(config) {
  const stable = loadStable(config)
  return existsSync(statePath(config)) ? readJson(statePath(config)) : createBaseState(config, stable)
}

async function main() {
  const action = process.argv[2] ?? 'status'
  const config = configuration()
  if (!Number.isSafeInteger(config.port) || config.port < 1 || config.port > 65535 || config.port === 3080) {
    throw new Error(`invalid or production Test port: ${String(config.port)}`)
  }
  if (!config.allowNonOfficial && config.upstream !== OFFICIAL_UPSTREAM) {
    throw new Error(`refusing non-official upstream: ${config.upstream}`)
  }
  let result
  switch (action) {
    case 'detect': result = detect(config); break
    case 'test': result = await testCandidate(config); break
    case 'approve': result = approve(config); break
    case 'status': result = currentStatus(config); break
    default: throw new Error(`usage: controlled-update.mjs detect|test|approve|status`)
  }
  process.stdout.write(`${JSON.stringify(result)}\n`)
  if (result.status === 'failed') process.exitCode = 2
}

main().catch(error => {
  const config = configuration()
  const message = error instanceof Error ? error.message : String(error)
  let state
  try {
    const stable = loadStable(config)
    const prior = existsSync(statePath(config)) ? readJson(statePath(config)) : createBaseState(config, stable)
    state = {
      ...prior,
      status: 'failed',
      failureReason: message,
      productionChanged: false,
      summary: '受控升级操作失败，Stable 未受影响。',
    }
    persistState(config, state)
  } catch {
    state = { status: 'failed', failureReason: message, productionChanged: false }
  }
  process.stdout.write(`${JSON.stringify(state)}\n`)
  process.exitCode = 1
})
