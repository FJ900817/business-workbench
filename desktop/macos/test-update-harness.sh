#!/bin/zsh

set -euo pipefail

source_root=${0:A:h:h:h}
fixture_root=$(mktemp -d)
trap 'rm -rf "$fixture_root"' EXIT

if "$source_root/desktop/macos/update-harness.sh" "$source_root" >"$fixture_root/legacy.log" 2>&1; then
  print -u2 "legacy production updater unexpectedly succeeded"
  exit 1
fi
grep -q '生产原地更新已禁用' "$fixture_root/legacy.log"

mkdir -p "$fixture_root/bin" "$fixture_root/stable/source" "$fixture_root/stable/profile"
cat > "$fixture_root/bin/corepack" <<'EOF'
#!/bin/zsh
exit 0
EOF
chmod +x "$fixture_root/bin/corepack"
export PATH="$fixture_root/bin:$PATH"

remote="$fixture_root/upstream.git"
seed="$fixture_root/seed"
stable_checkout="$fixture_root/stable-checkout"
git init --bare "$remote" >/dev/null
git init -b master "$seed" >/dev/null
git -C "$seed" config user.name "Controlled Update Test"
git -C "$seed" config user.email "controlled-update@example.invalid"
mkdir -p "$seed/apps/cli/lib" "$seed/apps/web/dist"
cat > "$seed/apps/cli/lib/bin.js" <<'EOF'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
const args = process.argv.slice(2)
const port = Number(args[args.indexOf('--port') + 1])
const server = createServer(async (request, response) => {
  if (request.url === '/') { response.writeHead(200); response.end('fixture'); return }
  let body = ''
  for await (const chunk of request) body += chunk
  const message = JSON.parse(body)
  let value = {}
  if (message.method === 'host.describe') value = { home: process.env.HOME, canOpenPath: false }
  if (message.method === 'workspace.create') value = { workspace: { workspaceId: 'fixture-workspace', title: 'fixture', path: message.payload.path, createdAt: new Date().toISOString() } }
  if (message.method === 'session.create') value = { sessionId: 'fixture-session' }
  if (message.method === 'skill.list') value = { skills: [{ name: 'fixture-skill', description: 'fixture' }] }
  response.setHeader('content-type', 'application/json')
  response.end(JSON.stringify({ type: 'server-response', rpcId: message.rpcId, result: { ok: true, value } }))
})
server.on('upgrade', (request, socket) => {
  const key = request.headers['sec-websocket-key']
  const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64')
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
})
server.listen(port, '127.0.0.1')
process.on('SIGTERM', () => server.close(() => process.exit(0)))
EOF
print '<!doctype html><title>fixture</title>' > "$seed/apps/web/dist/index.html"
print '{"name":"fixture"}' > "$seed/package.json"
print 'lockfileVersion: 9.0' > "$seed/pnpm-lock.yaml"
git -C "$seed" add .
git -C "$seed" commit -m initial >/dev/null
git -C "$seed" remote add origin "$remote"
git -C "$seed" push -u origin master >/dev/null
git --git-dir "$remote" symbolic-ref HEAD refs/heads/master
base_sha=$(git -C "$seed" rev-parse HEAD)

git clone "$remote" "$stable_checkout" >/dev/null
git -C "$stable_checkout" config user.name "Controlled Update Test"
git -C "$stable_checkout" config user.email "controlled-update@example.invalid"
print 'local customization' > "$stable_checkout/local.txt"
git -C "$stable_checkout" add local.txt
git -C "$stable_checkout" commit -m local-customization >/dev/null
stable_sha=$(git -C "$stable_checkout" rev-parse HEAD)
tar -czf "$fixture_root/stable/source/harness.tar.gz" -C "$fixture_root" stable-checkout

mkdir -p "$fixture_root/profile/web"
cat > "$fixture_root/profile/web/package.json" <<'EOF'
{
  "name": "fixture-profile",
  "dependencies": { "fixture-bundle": "1.0.0" },
  "dsh": { "profile": { "bundles": ["fixture-bundle"] } }
}
EOF
tar -czf "$fixture_root/stable/profile/web-profile.tar.gz" -C "$fixture_root/profile" web
source_hash=$(shasum -a 256 "$fixture_root/stable/source/harness.tar.gz" | awk '{print $1}')
profile_hash=$(shasum -a 256 "$fixture_root/stable/profile/web-profile.tar.gz" | awk '{print $1}')
mkdir -p "$fixture_root/stable/verification"
print "$source_hash  source/harness.tar.gz" > "$fixture_root/stable/verification/SHA256SUMS"
cat > "$fixture_root/stable/stable-v0-manifest.json" <<EOF
{
  "stableVersion": "stable-v0",
  "harness": {
    "headSHA": "$stable_sha",
    "upstreamBase": "$base_sha",
    "localCustomizationCommits": [{ "sha": "$stable_sha", "subject": "local-customization" }]
  },
  "profile": {
    "snapshot": "profile/web-profile.tar.gz",
    "snapshotHash": "$profile_hash",
    "directSources": { "fixture-bundle": "1.0.0" }
  },
  "recovery": {
    "sourceSnapshot": "source/harness.tar.gz",
    "sourceSnapshotHash": "$source_hash",
    "verificationManifest": "verification/SHA256SUMS"
  }
}
EOF

print 'upstream candidate' > "$seed/upstream.txt"
git -C "$seed" add upstream.txt
git -C "$seed" commit -m candidate >/dev/null
git -C "$seed" push origin master >/dev/null
candidate_sha=$(git -C "$seed" rev-parse HEAD)

export DSH_CONTROLLED_UPDATE_TEST_MODE=1
export DSH_CONTROLLED_UPDATE_FAST_FIXTURE=1
export DSH_CONTROLLED_UPDATE_STABLE_RELEASE="$fixture_root/stable"
export DSH_CONTROLLED_UPDATE_TEST_ROOT="$fixture_root/test-root"
export DSH_CONTROLLED_UPDATE_DSH_ROOT="$fixture_root/dsh-test"
export DSH_CONTROLLED_UPDATE_UPSTREAM="$remote"
export DSH_CONTROLLED_UPDATE_PORT=3199

node "$source_root/desktop/macos/controlled-update.mjs" detect > "$fixture_root/detect.json"
grep -q "$candidate_sha" "$fixture_root/detect.json"
if ! node "$source_root/desktop/macos/controlled-update.mjs" test > "$fixture_root/test.json"; then
  cat "$fixture_root/test.json"
  exit 1
fi
grep -q '"status":"passed"' "$fixture_root/test.json"
grep -q '"productionChanged":false' "$fixture_root/test.json"
[[ -f "$fixture_root/test-root/controlled-update-state.json" ]]
[[ -d "$fixture_root/dsh-test/candidates" ]]
[[ $(git -C "$stable_checkout" rev-parse HEAD) == "$stable_sha" ]]
[[ -z $(git -C "$stable_checkout" status --porcelain) ]]

node "$source_root/desktop/macos/controlled-update.mjs" approve > "$fixture_root/approve.json"
grep -q '"status":"approved"' "$fixture_root/approve.json"
grep -q '"productionChanged":false' "$fixture_root/approve.json"

print "macOS controlled updater tests passed"
