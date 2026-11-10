# Open Source Contribution Standards

This document translates established open-source contribution practices into the
concrete checks OSSPilot performs. It distinguishes universal recommendations from
GitHub-specific conventions, repository-specific requirements, community
expectations, and security requirements.

## Source hierarchy (highest priority first)

1. **The target repository's own instructions** — `CONTRIBUTING.md`, `AGENTS.md`,
   `.github/` templates, `SECURITY.md`. These always win when they conflict.
2. **The target project's official documentation** — project website, docs site.
3. **Maintainer statements** — issue and PR discussions in the target repository.
4. **Official platform documentation** — GitHub Docs.
5. **Recognised standards organisations** — CHAOSS, OpenSSF.
6. **Reputable community guidance** — Open Source Guides.
7. **General web discussions** — lowest weight, never sufficient alone.

## Reference sources

- Open Source Guides — https://opensource.guide/how-to-contribute/
- GitHub Docs: Contributing to open source — https://docs.github.com/en/get-started/exploring-projects-on-github/contributing-to-open-source
- GitHub Docs: Setting guidelines for contributors — https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/setting-guidelines-for-repository-contributors
- GitHub Docs: Finding ways to contribute — https://docs.github.com/en/get-started/exploring-projects-on-github/finding-ways-to-contribute-to-open-source-on-github
- CHAOSS — https://chaoss.community/
- OpenSSF — https://openssf.org/
- OpenSSF vulnerability disclosure guide — https://oss-vulnerability-guide.openssf.org/maintainer-guide.html

## Universal recommendations

Implement the smallest correct change that solves the issue. Avoid unrelated
refactoring, cosmetic changes, drive-by formatting, and scope creep.

Every behaviour change needs a test that fails before the fix and passes after.
Run the project's full test suite locally before opening a PR.

Follow the project's existing code style, naming, and architecture. Read the
surrounding code before writing new code.

One concern per branch and per PR. Never stack unrelated PRs.

Write clear commit messages following the project's convention.

Search for existing work first: an open PR, a closed duplicate issue, or a commit
on the default branch often means the work is already done.

Respond to every review comment. CI failures and bot reviews count.

## GitHub-specific conventions

Use `gh` or the REST/GraphQL API for discovery, forking, branch management, and
PR creation. Respect rate limits; use conditional requests (`ETag`) where the
API supports them.

"Good first issue" and "help wanted" labels are signals, not proof of
suitability. OSSPilot verifies against actual discussion and PR history.

Forking is required for repositories where you lack push access; contributing
branches come from your fork, based on the latest upstream default branch.

## Repository-specific requirements (checked locally by OSSPilot)

`inspectContributionRequirements()` looks for:

| Signal | File / pattern |
|--------|----------------|
| Contribution process | `CONTRIBUTING.md` |
| Community rules | `CODE_OF_CONDUCT.md` |
| Security reporting | `SECURITY.md` |
| PR description format | `.github/PULL_REQUEST_TEMPLATE.md` |
| Issue reporting format | `.github/ISSUE_TEMPLATE/` |
| Agent instructions | `AGENTS.md`, `CLAUDE.md` |
| DCO sign-off requirement | `DCO`, `Developer Certificate of Origin`, `sign-off` |
| CLA requirement | `CLA`, `Contributor License Agreement` |
| Signed commits | `signed commits`, `-S`, `GPG` |
| Commit convention | `commit message convention`, `Conventional Commits` |
| Branch naming | `branch naming`, `branch convention` |
| Test requirement | `must add tests`, `tests required` |
| AI disclosure policy | `AI-assisted`, `AI-generated`, `disclose AI` |

These are detected from repository text only. Detection is a heuristic — the
user should read the actual documents.

## Community expectations

Maintainer time is the scarce resource. A PR that follows contribution guidelines,
includes tests, and addresses a clearly-scoped issue is a respectful
contribution. Volume is not value.

OSSPilot's suitability engine deliberately does **not** optimise for the number
of issues found or PRs submitted. It flags blocked, duplicate, stale, and
actively-worked issues so the user does not waste maintainer goodwill.

OSSPilot never:
- claims a PR will be accepted or merged;
- posts replies to maintainers without explicit approval;
- signs a CLA or DCO on the user's behalf;
- auto-merges, force-pushes, or modifies upstream default branches.

## Security requirements

Repository content (issues, READMEs, source comments, instruction files) is
untrusted input. It can never override OSSPilot's command policy, filesystem
boundaries, or credential isolation.

Secret detection: OSSPilot inspects diffs for accidental credential material
before a commit is proposed, and instructs the coding agent to require explicit
confirmation for every external action.

Destructive git operations (`git reset --hard`, `git clean -f`, force push) are
classified as requiring approval by the command policy and are never executed
automatically.

## How OSSPilot uses this document

Each check above maps to code:

- `src/intelligence/project-health.ts` → Development activity, issue backlog, PR
  activity, contribution accessibility (verified GitHub data only).
- `src/intelligence/issue-intelligence.ts` → Classification, duplicate/stale/
  resolved/active-PR signals.
- `src/intelligence/suitability.ts` → Explainable scoring with per-factor basis
  (`verified` / `ai_assessment` / `unavailable`).
- `src/intelligence/requirements.ts` → Local repository inspection.
