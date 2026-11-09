/**
 * Debug the exact OpenCode API path the adapter uses.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { resolveCommand } from "../src/core/exec"

const home = mkdtempSync(join(tmpdir(), "at-dbg-"))
process.env.OSSPILOT_HOME = home

const repo = join(home, "repositories", "fixture__demo")
mkdirSync(repo, { recursive: true })
execFileSync("git", ["init", "--initial-branch=main", repo], { stdio: "pipe" })
execFileSync("git", ["-C", repo, "config", "user.email", "t@t"], { stdio: "pipe" })
execFileSync("git", ["-C", repo, "config", "user.name", "T"], { stdio: "pipe" })
writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "demo" }, null, 2))
writeFileSync(join(repo, "a.txt"), "a")
execFileSync("git", ["-C", repo, "add", "-A"], { stdio: "pipe" })
execFileSync("git", ["-C", repo, "commit", "-m", "init"], { stdio: "pipe" })

const bin = await resolveCommand("opencode")
const port = 47123

const child = Bun.spawn(["cmd.exe", "/c", `set "OPCODE_DEBUG=1" && "${bin}" serve --port ${port} --hostname 127.0.0.1`], {
  cwd: repo,
  stdio: ["ignore", "pipe", "pipe"],
})
let stdout = ""
const reader = child.stdout?.getReader()
if (reader) {
  const pump = (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        stdout += new TextDecoder().decode(value)
        console.log("STDOUT:", new TextDecoder().decode(value).trim())
      }
    } catch {}
  })()
  void pump
}
let password = ""
for (let i = 0; i < 60 && !password; i++) {
  await new Promise((r) => setTimeout(r, 250))
  const m = stdout.match(/server password\s+(\S+)/)
  if (m) password = m[1]
}
console.log("== password found:", password.length > 0)

const base = `http://127.0.0.1:${port}/api`
const auth = `Basic ${btoa(`opencode:${password}`)}`

// 1. server info
const info = await fetch(`${base}/info`).then((r) => r.text())
console.log("== /info:", info.slice(0, 300))

// 2. models available?
try {
  const models = await fetch(`${base}/model`, { headers: { Authorization: auth } }).then((r) => r.text())
  console.log("== /model (first 400):", models.slice(0, 400))
} catch (error) {
  console.log("== /model error:", String(error))
}

// 3. config (provider defaults)
try {
  const cfg = await fetch(`${base}/config`, { headers: { Authorization: auth } }).then((r) => r.text())
  console.log("== /config (first 400):", cfg.slice(0, 400))
} catch (error) {
  console.log("== /config error:", String(error))
}

// 4. create session
const createRes = await fetch(`${base}/session`, {
  method: "POST",
  headers: { Authorization: auth, "Content-Type": "application/json" },
  body: JSON.stringify({ title: "dbg" }),
})
const createBody = await createRes.text()
console.log("== POST /session:", createRes.status, createBody.slice(0, 200))
const sid = JSON.parse(createBody).data.id

// 5. prompt with text
const promptRes = await fetch(`${base}/session/${sid}/prompt`, {
  method: "POST",
  headers: { Authorization: auth, "Content-Type": "application/json" },
  body: JSON.stringify({ text: "Reply with the single word: PONG" }),
})
const promptBody = await promptRes.text()
console.log("== POST /prompt:", promptRes.status, promptBody.slice(0, 400))

// 6. poll messages
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 3000))
  const msgRes = await fetch(`${base}/session/${sid}/message`, { headers: { Authorization: auth } })
  const body = await msgRes.text()
  console.log(`== GET /message [${i}]:`, body.slice(0, 500))
  if (i > 2 && body && !body.startsWith('{"data":[]')) break
}

child.kill("SIGTERM")
import("node:fs").then((fs) => fs.rmSync(home, { recursive: true, force: true, maxRetries: 3 }))