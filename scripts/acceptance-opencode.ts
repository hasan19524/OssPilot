/**
 * ACCEPTANCE TEST: drive OSSPilot's own OpenCode adapter against a disposable
 * repository and require a real file modification.
 *
 * Nothing is pushed. The repo is deleted afterwards.
 */

import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { execFileSync } from "node:child_process"
import { ensureAgent, getAgent } from "../src/agents/registry"
import { WorktreeManager } from "../src/workspace/manager"

const home = mkdtempSync(join(tmpdir(), "at-accept-"))
// Point the app at the disposable sandbox so containment checks apply to it.
process.env.OSSPILOT_HOME = home
const repos = join(home, "repositories")
const worktrees = join(home, "worktrees")
mkdirSync(repos, { recursive: true })
mkdirSync(worktrees, { recursive: true })

const repo = join(repos, "fixture__demo")
mkdirSync(repo, { recursive: true })
execFileSync("git", ["init", "--initial-branch=main", repo], { stdio: "pipe" })
execFileSync("git", ["-C", repo, "config", "user.email", "test@test.com"], { stdio: "pipe" })
execFileSync("git", ["-C", repo, "config", "user.name", "T"], { stdio: "pipe" })
writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "demo", scripts: { test: "node test.js" } }, null, 2))
writeFileSync(
  join(repo, "math.js"),
  ["// deliberate bug: should ADD", "export function add(a, b) {", "  return a - b", "}", ""].join("\n"),
)
writeFileSync(
  join(repo, "test.js"),
  [
    "import { add } from './math.js'",
    "const got = add(2, 3)",
    "if (got !== 5) { console.error('FAIL add(2,3) =', got); process.exit(1) }",
    "console.log('tests pass')",
    "",
  ].join("\n"),
)
execFileSync("git", ["-C", repo, "add", "-A"], { stdio: "pipe" })
execFileSync("git", ["-C", repo, "commit", "-m", "initial"], { stdio: "pipe" })

console.log("== disposable repo created:", repo)

ensureAgent()
const adapter = getAgent("opencode")
if (!adapter) {
  console.log("RESULT: BLOCKED — no opencode adapter")
  process.exit(0)
}

const report = await adapter.getStatusReport({ worktreePath: repo })
console.log("== agent state:", report.state, report.version, report.executablePath)

// 1. Isolated worktree — created by OSSPILOT's own manager.
const wm = new WorktreeManager(worktrees)
const worktree = await wm.create("contrib-1729900000000-abcd1234", repo, "fix/add", "main")
console.log("== worktree:", worktree)

// 2. Real session through the adapter.
console.log("== starting OpenCode session...")
const session = await adapter.startSession({
  worktreePath: worktree,
  title: "Acceptance: fix add()",
})
console.log("== session:", session.externalSessionId)

// 3. Real coding task.
console.log("== submitting task...")
let received = ""
let toolCalls = 0
for await (const event of adapter.execute(session, {
  prompt:
    "Edit the file math.js in this repository. The file contains " +
    "`return a - b` inside `export function add(a, b)`. " +
    "Use the edit/write tool to change it to `return a + b`. " +
    "Perform exactly one file edit and then reply with DONE.",
})) {
  if (event.type === "message.delta") received += event.content
  if (event.type === "tool.started") toolCalls++
  if (event.type === "session.failed") {
    console.log("== SESSION FAILED:", event.error)
  }
}
console.log("== response tail:", received.slice(-300))
console.log("== tool calls observed:", toolCalls)

// 4. Real file modification?
const changed = await wm.changedFiles(worktree)
console.log("== changed files:", changed)

// 5. Real diff?
const diff = await wm.diff(worktree)
console.log("== diff stat:", diff.slice(0, 400))

// 6. Tests actually run by us, not by the agent.
let testOut = ""
try {
  testOut = execFileSync("node", ["test.js"], { cwd: worktree, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] })
} catch (error) {
  testOut = (error as { stdout?: string }).stdout ?? String(error)
}
console.log("== independent test run:", testOut.trim())

// 7. Cancellation works.
await adapter.cancel(session)
console.log("== cancelled OK")

// 8. Shutdown.
adapter.shutdown?.()
console.log("== server shut down")

const fileChanged = changed.some((f) => f.includes("math.js"))
const diffReal = diff.includes("a - b") || diff.includes("a + b")
const testPass = testOut.includes("tests pass")

console.log("\n== ACCEPTANCE SUMMARY")
console.log("   worktree created:     PASS")
console.log("   session created:      " + (session.externalSessionId ? "PASS" : "FAIL"))
console.log("   response received:    " + (received.length > 0 ? "PASS" : "FAIL"))
console.log("   file modified:        " + (fileChanged ? "PASS" : "FAIL"))
console.log("   real diff:            " + (diffReal ? "PASS" : "FAIL"))
console.log("   independent tests:    " + (testPass ? "PASS" : "FAIL"))

rmSync(home, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
console.log("== cleaned up")