# Contributing to OSSPilot

Thank you for your interest in contributing to OSSPilot!

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/osspilot.git`
3. Install dependencies: `bun install`
4. Create a branch: `git checkout -b feature/your-feature`

## Development

```bash
bun run typecheck    # TypeScript checks
bun run lint         # Biome linting
bun run test         # Vitest tests
bun run build        # Production build
```

## Guidelines

- Follow existing code style (Biome handles formatting)
- Add tests for new functionality
- Update documentation for new features
- Keep PRs focused and small
- One concern per PR

## Security

- Never commit secrets or API keys
- Report security issues privately
- Follow the security policy in SECURITY.md

## Code of Conduct

Be respectful and constructive. We welcome contributors of all skill levels.