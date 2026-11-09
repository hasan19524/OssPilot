# TUI Guide

OSSPilot's TUI is the primary interface. It runs on OpenTUI + React and renders
directly to the terminal.

## Launch

```bash
osspilot
```

## Layout

```
+---------------------------------------------------------------+------------------+
| ACTIVITY                                                      | REPOSITORY       |
|  agent activity, conversation, plans, results                 |  owner/repo      |
|                                                               |  branch          |
|                                                               |                  |
|  [tool] read_file src/parser.ts                               | ISSUE            |
|  message deltas stream here                                   |  #123 title      |
|                                                               |  labels          |
|                                                               |                  |
+---------------------------------------------------------------+ AGENT             |
| TERMINAL (Ctrl+J)        expandable panels                    |  OpenCode status |
| GIT DIFF (Ctrl+D)        TESTS / LOGS / CHANGED FILES         |  model, session  |
|                                                               |                  |
+---------------------------------------------------------------+ WORKFLOW         |
| > composer prompt                                             |  stage / gates   |
+---------------------------------------------------------------+                  |
| status bar: contribution · agent · stage · connection         |                  |
+---------------------------------------------------------------+------------------+
```

**Left/middle**: the activity feed — user messages, agent responses, analysis results,
plans, execution summaries, verification results and errors.

**Right sidebar**: `REPOSITORY` (owner/name, branch, default branch), `ISSUE` (number,
title, labels, difficulty), `AGENT` (OpenCode connection, model, session, execution
mode), `WORKFLOW` (current stage, completed stages, pending approvals), `CONTEXT`
(relevant files, changed files, test status, workspace location).

**Composer**: natural language and `/commands`.

**Status bar**: current contribution, active agent, model, workflow stage, connection
status, execution status.

**Expandable panels**: terminal output, git diff, test results, execution logs and
changed files.

## Keyboard shortcuts

| Key | Action | Notes |
|---|---|---|
| `Ctrl+C` | Safe interrupt | Records intent in the activity feed and waits for approval hooks. Does not kill the process during execution. |
| `Ctrl+P` | Command palette | Shows available commands. |
| `Ctrl+J` | Toggle the terminal panel | |
| `Ctrl+D` | Toggle the git diff panel | |
| `Tab` | Cycle focus | main → sidebar → composer |
| `Esc` | Close a dialog, or quit | |
| `y` / `n` | Confirm or reject an approval gate | While a gate is open **all other keys are ignored** — there is no keystroke that bypasses a gate. |
| `q` | Quit | When not composing. |

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

`y` applies the decision and continues. `n` rejects and pauses the contribution. The
decision is written to the activity feed.

## Composer commands

| Command | What it does |
|---|---|
| `/help` | List every command |
| `/discover <query> [--language <lang>]` | Search GitHub repositories and list their open issues |
| `/issues owner/repo` | Browse open issues with labels and comment counts |
| `/research owner/repo#N` | Project health + issue intelligence + suitability |
| `/plan owner/repo#N` | Plan preview; creates the contribution record |
| `/contribute owner/repo#N` | The full workflow, with approval gates |
| `/diff` | Real `git diff --stat` and the changed-file list |
| `/cancel` | Cancel the active contribution (worktree preserved) |
| `/agents` | Coding agent detection and version |
| `/status` | Active contributions and their stage |

Natural language is routed to the same handlers: *"find beginner typescript issues"*,
*"research prettier/prettier#20408"*, *"show my diff"*. If a request cannot be mapped,
OSSPilot says so rather than producing a fabricated answer.

## Terminal compatibility

Verified: Windows Terminal 1.24, VS Code integrated terminal, PowerShell 7.

Behaviour in other terminals depends on their Unicode and colour support. If you see
layout breakage:

- Resize the terminal (layout is reactive).
- Try a larger terminal; below roughly 80x24 panels compress.
- On Windows, prefer Windows Terminal over the legacy console host.

Data is read every 3 seconds from the local database, so a live contribution started
from the CLI appears in the TUI without restarting it.

## Empty states

On first launch the activity panel shows `No activity yet. Discover an issue, then start
a contribution.` — never sample data.