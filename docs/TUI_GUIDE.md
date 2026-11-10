# TUI Guide

OSSPilot's TUI is the primary interface. It runs on OpenTUI + React and renders
directly to the terminal.

## Launch

```bash
osspilot
```

## Layout

```
+-------------------------------------------------------+------------------+
| osspilot                                              | REPOSITORY       |
| you        what you typed                             | owner/name       |
| osspilot   replies, results, progress lines           | branch           |
| PROGRESS   live workflow progress                     |                  |
| SYSTEM     cancellations, gate decisions              | ISSUE            |
| ERROR      specific, actionable failures             | #123 title       |
|            transcript scrolls; newest output is       |                  |
|            always brought into view                   | AGENT            |
|                                                       | state, providers |
|                                                       |                  |
|                                                       | WORKFLOW         |
|                                                       | stage            |
|                                                       |                  |
|                                                       | CHANGES          |
|                                                       | n file(s)        |
+-------------------------------------------------------+------------------+
| > Ask OSSPilot, or /help   (composer)                 |
| session-… - IDLE - DISCOVER - working   (status bar)  |
+-------------------------------------------------------+------------------+

  +----------------------------------------------+
  | APPROVAL REQUIRED                           |   overlays the top-left
  | prompt, details, y/n instruction            |   while a gate is open
  +----------------------------------------------+
```

**Main pane**: the conversation — user messages, OSSPilot replies, GitHub
results, workflow progress (`PROGRESS`), system notices (`SYSTEM`) and errors
(`ERROR`). The view follows new output: the newest reply is scrolled into view
automatically, including after a long history is restored from a previous run.

**Right sidebar**: `REPOSITORY` (owner/name, branch), `ISSUE` (number, title),
`AGENT` (coding-agent state and configured providers), `WORKFLOW` (stage:
DISCOVER / RESEARCH / INSPECT / WORKSPACE / …), `CHANGES` (changed-file count).
The sidebar is updated by the command that is running — starting
`/contribute owner/repo#1` retargets it immediately, before the workflow
finishes. On startup it shows a contribution that is actually in progress
(worktree on disk, activity within the last 30 minutes); otherwise it shows the
repository of the terminal's working directory (resolved from `git remote
origin`), never a stale record from an old run.

**Composer**: natural language and `/commands`.

**Status bar**: current session id, coding-agent state (`CHECKING`, `IDLE`,
`GENERATING`, `NOT_INSTALLED`, `NOT_AUTHENTICATED`, `DISCONNECTED`, `ERROR`),
workflow stage, and `working` while a task runs.

**Approval dialog**: an overlay that appears only when the workflow needs a
decision; see below.

### Views

| View | How to open | How to leave |
|---|---|---|
| Conversation | default; `Enter` from any other view | `Esc` quits the application |
| Agents (`/agents`, `Ctrl+P`) | command or shortcut | `Enter` or `Esc` back |
| History (`/history`, `/sessions`) | command; `Enter` picks a session | `Enter` or `Esc` back |

## Keyboard shortcuts

| Key | Action | Notes |
|---|---|---|
| `Ctrl+C` | Interrupt | While a task runs: requests a **cooperative cancel** — the activity feed records it and the operation stops at its next safe point (the process is not force-killed mid-write). When idle: quits. |
| `Ctrl+P` | Coding-agent status view | |
| `Esc` | Back, or quit | In a sub-view: return to the conversation. In the conversation: quit. |
| `Enter` | Submit (composer) / back (sub-view) | |
| `y` / `n` | Confirm or reject an approval gate | While a gate is open **the composer is blurred and all other keys are ignored** — there is no keystroke that bypasses a gate. |

## Approval dialogs

```
APPROVAL REQUIRED
Approve the implementation plan and let the agent implement?
  Repository: prettier/prettier
  Branch: osspilot/contrib-...
  The agent will modify files in the isolated worktree only.
  No commit, push or PR will happen without a separate approval.
Press y to "Approve plan", n to "Reject". Nothing happens until you choose.
```

`y` applies the decision and continues. `n` rejects and pauses the contribution.
Nothing is committed, pushed or opened as a PR without its own explicit
approval; the runner never confirms its own gates (enforced by
`tests/contribution-runner.test.ts`).

## Composer commands

The authoritative list is `/help` inside the app:

| Command | What it does |
|---|---|
| `/help` | List every command |
| `/discover <query> [--language <lang>]` | Search GitHub repositories and list their open issues |
| `/issues [owner/repo] [--beginner-friendly]` | Browse open issues; the beginner flag filters by the `good first issue` / `help wanted` labels and says so when it falls back |
| `/research <owner/repo\|owner/repo#N>` | Project health + issue intelligence + suitability |
| `/explain [owner/repo]` | Inspect and explain a codebase (local repository by default) |
| `/plan <owner/repo#N>` | Contribution plan preview |
| `/contribute <owner/repo#N>` | The full workflow, with approval gates |
| `/select <owner/repo[#N]>` | Put a repository/issue in the sidebar |
| `/agents` | Coding agent detection, state and version |
| `/status` | Active contributions, their stage and last activity |
| `/diff` | Real `git diff --stat` and the changed-file list |
| `/cancel` | Cancel the active contribution (worktree preserved) |
| `/history`, `/sessions` | List conversations |
| `/new` | Start a new conversation |
| `/resume <session-id>` | Reopen a conversation |

Natural language is routed to the same handlers without any model call:

- Greetings, thanks and "who are you" get a direct reply.
- *"find python repositories"*, *"find beginner-friendly issues in this
  repository"*, *"research octocat/Hello-World#1"*, *"explain this repository"*,
  *"help me plan a contribution"*, *"what is the status of my contributions?"*,
  *"cancel"* all map to their handlers.
- Placeholder references from the docs (`owner/repository#123`) are rejected
  explicitly instead of being sent to GitHub to fail.
- If a request cannot be mapped, OSSPilot says so and lists what it can run
  rather than fabricating an answer.

## Sessions and persistence

The transcript is written to the local database as you go, so history survives
restarting the application. `osspilot doctor` verifies the environment
(runtime, home, database, config, git, gh, opencode, token, providers).

## Terminal compatibility

Verified: Windows Terminal 1.24, VS Code integrated terminal, PowerShell 7,
plus headless pseudo-console runs of the compiled `dist/osspilot.exe` (see
`OSSPILOT_FUNCTIONAL_ACCEPTANCE_MATRIX.md`).

Behaviour in other terminals depends on their Unicode and colour support. If you see
layout breakage:

- Resize the terminal (layout is reactive).
- Try a larger terminal; below roughly 80x24 panels compress.
- On Windows, prefer Windows Terminal over the legacy console host.

The sidebar is updated by commands as they run (not by a background poller);
`/status` re-reads the database on demand, and a contribution started from the
CLI appears after restart or the next `/status`.

## Empty states

On first launch the transcript shows `Welcome to OSSPilot. Ask me to find an
issue, research a repository, plan a contribution, or explain a codebase. Type
/help for commands.` — never sample data.
