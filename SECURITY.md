# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✅ |

## Reporting a Vulnerability

If you discover a security vulnerability in OSSPilot, please report it responsibly:

1. **Do NOT** open a public GitHub issue
2. Email the maintainer or use GitHub's private vulnerability reporting
3. Include: description, reproduction steps, impact assessment

## Security Features

- **Credential storage**: OS keyring (Windows Credential Manager, macOS Keychain, Linux Secret Service) with encrypted file fallback
- **Command policy**: Allow/approval/deny classification for all shell and git commands
- **Path containment**: Worktree paths validated to prevent traversal
- **Input validation**: GitHub refs, owner/repo names, branch names strictly validated
- **Log sanitization**: Tokens, API keys, passwords redacted from all logs
- **Prompt injection defense**: Issue content wrapped in untrusted data delimiters
- **Audit log**: All sensitive actions recorded
- **No arbitrary shell execution**: Commands classified before execution

## Security Limitations

- OpenCode server password is generated per-session but transmitted via HTTP (localhost only)
- Encrypted credential file uses AES-256-GCM but key storage depends on OS keyring availability
- Worktrees are not security sandboxes (Git worktrees isolate working directories, not OS permissions)
- Repository content is treated as untrusted but prompt injection defense is layered, not absolute

## Best Practices for Users

- Use OS keyring for credentials (default on Windows/macOS)
- Set `OSSPILOT_CREDENTIAL_KEY` env var for headless/CI environments
- Review all approval prompts before confirming
- Keep OpenCode and OSSPilot updated
- Don't run OSSPilot on untrusted/shared machines without proper user isolation