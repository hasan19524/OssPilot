<div align="center">

<img src="assets/logo.svg" alt="OSSPilot Logo" width="120" height="120" />

# OSSPilot

### The AI-Powered Terminal for Open Source Contribution

**Discover issues. Understand codebases. Delegate to AI agents. Verify. Submit PRs.**

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://github.com/hasan19524/osspilot)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/runtime-Bun_1.4+-orange.svg)](https://bun.sh)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)]()
[![OpenCode](https://img.shields.io/badge/agent-OpenCode-purple.svg)](https://opencode.ai)
[![Tests](https://img.shields.io/badge/tests-10%2F10_passing-brightgreen.svg)]()

</div>

---

## 🎯 What is OSSPilot?

OSSPilot is a **CLI-first, terminal-native platform** that takes developers through the complete open-source contribution lifecycle — from discovering issues to submitting pull requests. It combines GitHub integration, AI-powered issue analysis, and coding agent delegation into a single, cohesive terminal experience.

**It is NOT:**
- A web application or dashboard
- A generic AI chatbot
- A replacement for your coding agent

**It IS:**
- A contribution orchestration tool that manages the entire workflow
- A terminal UI that feels like a native developer tool
- A bridge between you, GitHub, and AI coding agents

### Core Principle

> **OSSPilot manages contributions. OpenCode implements code. LLMs provide intelligence. You retain control.**

---

## ✨ Key Features

### 🔍 Issue Discovery
- Search GitHub repositories by language, topic, or keyword
- Filter by labels: `good first issue`, `help wanted`, `hacktoberfest`
- Suitability scoring based on your declared skills
- Pre-flight checks: detects existing PRs, already-fixed issues, repo health

### 🧠 AI-Powered Analysis
- **Issue explanation** — converts technical descriptions into plain language
- **Difficulty estimation** — beginner/intermediate/advanced with time estimates
- **Skill matching** — compares issue requirements against your skills
- **Contribution briefs** — structured implementation plans with risks and tests
- **Multi-LLM support** — BharatCode, OpenAI, Anthropic, Google AI Studio, NVIDIA, OpenRouter, Ollama (local)

### 🤖 Coding Agent Integration
- **OpenCode** (v1) — full programmatic integration via server API
- Spawns dedicated server per worktree (isolated, secure)
- Streams real-time events: tool calls, file changes, permissions
- Permission dialogs route to TUI for approval
- Session persistence and recovery

### 📁 Workspace Management
- Automatic repository cloning and caching
- Isolated Git worktrees per contribution (never touches your working directory)
- Branch management with clean base branch enforcement
- Dirty worktree detection and protection

### ✅ Independent Verification
- Git diff analysis (changed/added/deleted files)
- Unintended modification detection
- Test execution with pass/fail parsing
- Lint and format checks
- Honest status reporting: `ok` / `needs_attention` / `failed`
- **AI agents never approve their own changes**

### 📝 Pull Request Management
- Auto-generated PR titles and descriptions
- Changed files summary, implementation details, tests performed
- Explicit approval gates: commit → push → PR (each requires confirmation)
- **Never merges automatically**

### 🔄 Contribution Lifecycle
```
DISCOVER → ANALYSE → CLONE → WORKSPACE → INVESTIGATE → PLAN → APPROVE
  → IMPLEMENT → TEST → VERIFY → REVIEW → PR PREP → APPROVE → SUBMIT → MONITOR
```
Every stage persisted. Pause, resume, cancel, retry at any point.

### 🛡️ Security
- Credentials stored in OS keyring (Windows Credential Manager, macOS Keychain, Linux Secret Service)
- Encrypted file fallback for headless/CI
- Command policy: allow-list, approval gates, deny-list
- Prompt injection defense (repo content treated as untrusted)
- Audit log for all sensitive actions
- No arbitrary shell execution from frontend requests

---

## 🚀 Quick Start

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Bun | ≥ 1.4.0 | `npm i -g bun` |
| Git | ≥ 2.40 | https://git-scm.com |
| OpenCode | ≥ 2.0 | https://opencode.ai |

### Install

```bash
# Clone and build
git clone https://github.com/hasan19524/osspilot.git
cd osspilot
bun install
bun run build

# Or install globally (coming soon)
# bun install -g osspilot
```

### Configure

```bash
# Authenticate with GitHub (device flow)
osspilot config auth github

# Set up an LLM provider (optional but recommended)
osspilot config auth bharatcode    # BharatCode (OpenAI-compatible)
# or set env vars:
# setx OSSPILOT_OPENAI_API_KEY "sk-..."
# setx OSSPILOT_ANTHROPIC_API_KEY "sk-ant-..."

# Set your skills for issue matching
osspilot config

# Verify everything works
osspilot doctor
```

### First Contribution

```bash
# 1. Discover issues
osspilot discover --language typescript --limit 5

# 2. Analyse an issue
osspilot issue prettier/prettier#20408

# 3. Start contributing (full workflow)
osspilot contribute prettier/prettier#20408

# 4. Check status
osspilot status

# 5. Launch TUI
osspilot
```

---

## 📸 Terminal Interface

```
┌─────────────────────────────────────────────────────────────────────────┐
│  OSSPilot — open source contribution platform (terminal)                │
├──────────────────────────────────────────────┬──────────────────────────┤
│                                              │  REPOSITORY              │
│  ACTIVITY                                    │  prettier/prettier       │
│  ─────────────────────────────────────────   │  branch: fix/issue-20408 │
│  [10:00] system: Contribution created        │  default: main           │
│  [10:02] system: Issue fetched               │                          │
│  [10:04] system: Worktree created            │  ISSUE                   │
│  [10:07] agent: Investigation started        │  #20408 JSX whitespace   │
│  [10:12] agent: Found relevant files         │  labels: bug, help wanted│
│  [10:15] agent: Plan ready for review        │  difficulty: intermediate│
│                                              │                          │
│  ─────────────────────────────────────────   │  AGENT                   │
│  TERMINAL (Ctrl+J)                           │  status: running         │
│  $ npm test                                  │  model: claude-sonnet    │
│  ✓ 24 passed, 0 failed                       │  session: active         │
│                                              │                          │
│  ─────────────────────────────────────────   │  WORKFLOW                │
│  GIT DIFF (Ctrl+D)                           │  stage: IMPLEMENTATION   │
│  + added regression test                     │                          │
│  ~ modified printer.js                       │  CONTEXT                 │
│                                              │  contribution: contrib-… │
├──────────────────────────────────────────────┴──────────────────────────┤
│  › Send instructions to the agent, or /help for commands                │
├─────────────────────────────────────────────────────────────────────────┤
│  contrib-abc123 · OpenCode · IMPLEMENTATION · connected                 │
└─────────────────────────────────────────────────────────────────────────┘
```

**Keyboard shortcuts:**
| Key | Action |
|-----|--------|
| `Ctrl+C` | Safe interrupt (never kills abruptly) |
| `Ctrl+P` | Command palette |
| `Ctrl+J` | Toggle terminal panel |
| `Ctrl+D` | Toggle git diff panel |
| `Tab` | Cycle focus between panels |
| `Esc` | Close dialogs / quit |

---

## 🏗️ Architecture

```
osspilot (CLI, Bun/TypeScript)
│
├── cli/          Commander entrypoints → same core as TUI
├── tui/          OpenTUI React app (components only, no business logic)
├── core/         ContributionManager, workflow state machine, doctor
├── agents/       Provider-independent AgentAdapter interface
│   └── adapters/opencode/   OpenCode SDK integration
├── integrations/
│   ├── github/   Octokit (REST + GraphQL), device flow, preflight
│   ├── bharatcode/  Intelligence service (LLM-powered)
│   └── llm/      Multi-provider LLM registry (OpenAI, Anthropic, etc.)
├── workspace/    RepositoryManager, WorktreeManager
├── storage/      SQLite + Drizzle ORM (embedded, no server needed)
├── security/     Credentials (keyring), command policy, audit log, crypto
└── verification/ Independent verification engine
```

### Design Principles

1. **CLI and TUI share the same core** — no duplicated business logic
2. **No business logic in TUI components** — they call application services
3. **Agents are provider-independent** — OpenCode now, Claude Code/Codex/Antigravity later
4. **LLMs are pluggable** — bring your own API key, any OpenAI-compatible endpoint
5. **Every stage is persisted** — SQLite, survives restarts
6. **No automatic destructive operations** — explicit approval for commit/push/PR
7. **Honest reporting** — AI assessments labeled as such, never claims guaranteed merge

---

## 🔧 Configuration

### Config file: `~/.osspilot/config/config.json`

```json
{
  "skills": ["typescript", "python", "react"],
  "preferredAgent": "opencode",
  "bharatcodeBaseUrl": "https://bharatcode.ai/api/model/v1",
  "bharatcodeModel": "qwen-3.8-27b",
  "logLevel": "info",
  "logSink": "file"
}
```

### Environment variables

| Variable | Purpose |
|----------|---------|
| `OSSPILOT_GITHUB_TOKEN` | GitHub personal access token |
| `OSSPILOT_BHARATCODE_API_KEY` | BharatCode API key |
| `OSSPILOT_OPENAI_API_KEY` | OpenAI API key |
| `OSSPILOT_ANTHROPIC_API_KEY` | Anthropic API key |
| `OSSPILOT_GOOGLE_API_KEY` | Google AI Studio key |
| `OSSPILOT_NVIDIA_API_KEY` | NVIDIA API key |
| `OSSPILOT_OPENROUTER_API_KEY` | OpenRouter API key |
| `OSSPILOT_HOME` | Override data directory (default: `~/.osspilot`) |

### Supported LLM Providers

| Provider | Setup | Models |
|----------|-------|--------|
| **BharatCode** | `osspilot config auth bharatcode` | qwen-3.8-27b, deepseek-v4.1-flash |
| **OpenAI** | Set `OSSPILOT_OPENAI_API_KEY` | gpt-4o, gpt-4o-mini, gpt-4-turbo |
| **Anthropic** | Set `OSSPILOT_ANTHROPIC_API_KEY` | claude-sonnet-4, claude-3.5-sonnet |
| **Google AI Studio** | Set `OSSPILOT_GOOGLE_API_KEY` | gemini-2.0-flash, gemini-1.5-pro |
| **NVIDIA** | Set `OSSPILOT_NVIDIA_API_KEY` | llama-3.1-405b, llama-3.3-70b |
| **OpenRouter** | Set `OSSPILOT_OPENROUTER_API_KEY` | Any OpenRouter model |
| **Ollama** | Install locally, run `ollama serve` | Any local model |

---

## 📊 Open Source Contribution Workflow

OSSPilot implements a proven contribution workflow based on real-world experience:

### Before You Start
1. **Search first** — OSSPilot checks for existing PRs and closed issues
2. **Check repo health** — maintainer engagement, external PR acceptance
3. **Verify not already fixed** — checks default branch for related commits

### During Contribution
4. **Clean base branch** — always branches from upstream default (never stacks)
5. **Reproduce first** — investigation phase before any code changes
6. **Minimal fix** — smallest correct change, no unrelated refactors
7. **Regression tests** — every new code path gets a test
8. **Independent verification** — diff analysis, test execution, lint checks

### After Implementation
9. **Bot review handling** — Greptile, CodeQL, cubic findings addressed
10. **Clean diff** — only your changes, no stacked commits
11. **Explicit approval gates** — commit → push → PR (each requires confirmation)
12. **Never auto-merge** — developer retains full control

### Lessons Encoded
- Don't duplicate existing work (search PRs first)
- Don't stack PRs (clean base branch per PR)
- Don't spam repos (one PR at a time)
- Accept maintainer decisions gracefully
- Bot reviews count — address every finding
- Byte length, not char count, for buffer estimates
- JSDoc directly above functions
- Every new branch needs its own test

---

## 🛠️ Development

### Build from source

```bash
git clone https://github.com/hasan19524/osspilot.git
cd osspilot
bun install
bun run typecheck    # TypeScript
bun run lint         # Biome
bun run test         # Vitest
bun run build        # Single binary → dist/osspilot.exe
```

### Project structure

```
osspilot/
├── src/
│   ├── cli/          # Commander commands
│   ├── tui/          # OpenTUI React components
│   ├── core/         # Business logic, state machine
│   ├── agents/       # Agent adapter interface + OpenCode
│   ├── integrations/ # GitHub, BharatCode, LLM providers
│   ├── workspace/    # Git clone, worktrees
│   ├── storage/      # SQLite + Drizzle ORM
│   ├── security/     # Credentials, policy, audit, crypto
│   ├── config/       # Paths, settings
│   ├── logging/      # Structured logger
│   └── verification/ # Independent verification engine
├── tests/            # Vitest tests
├── docs/             # Architecture, audit, setup guides
└── assets/           # Logo, icons
```

### Tech stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun 1.4+ |
| Language | TypeScript (strict) |
| Terminal UI | OpenTUI (React 19.2+) |
| CLI | Commander.js |
| Validation | Zod |
| Database | SQLite + Drizzle ORM |
| GitHub | Octokit (REST + GraphQL) |
| LLM | OpenAI SDK (multi-provider) |
| Testing | Vitest |
| Linting | Biome |
| Packaging | `bun build --compile` |

---

## 🤝 Contributing

We welcome contributions! Please read our [Contributing Guide](CONTRIBUTING.md).

### Quick contribution checklist
- [ ] Fork and clone
- [ ] Create a clean branch from upstream default
- [ ] Write tests for your changes
- [ ] Run `bun run typecheck && bun run lint && bun run test`
- [ ] Submit a PR with a clear description

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- [OpenCode](https://opencode.ai) — coding agent integration
- [OpenTUI](https://opentui.com) — terminal UI framework
- [BharatCode](https://bharatcode.ai) — LLM API provider
- [Octokit](https://github.com/octokit/octokit.js) — GitHub API client
- The open source community — for the issues and lessons that shaped this tool

---

<div align="center">

**Built with ❤️ for open source contributors**

*OSSPilot — Because every developer deserves to contribute.*

</div>
