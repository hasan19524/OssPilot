# Intelligence Providers

OSSPilot supports several LLM providers behind one interface. Providers are
interchangeable: the core services call the provider registry, never a vendor SDK
directly.

## Providers

| Provider | Model used by default | Configuration |
|---|---|---|
| **BharatCode** (primary) | `qwen-3.8-27b` | `osspilot config auth bharatcode` |
| OpenAI | `gpt-4o` | `OSSPILOT_OPENAI_API_KEY` |
| Anthropic | `claude-sonnet-4-20250514` | `OSSPILOT_ANTHROPIC_API_KEY` |
| Google AI Studio | `gemini-2.0-flash` | `OSSPILOT_GOOGLE_API_KEY` |
| NVIDIA | `meta/llama-3.3-70b-instruct` | `OSSPILOT_NVIDIA_API_KEY` |
| OpenRouter | provider-prefixed model ids | `OSSPILOT_OPENROUTER_API_KEY` |
| Ollama (local) | `llama3.2` | no key; run `ollama serve` |
| Any OpenAI-compatible endpoint | your model | provider id + api key + base URL |

`osspilot setup` shows which providers are configured and which are not.

## Configuring a provider

### BharatCode

```bash
osspilot config auth bharatcode
# paste the key from https://bharatcode.ai/account
```

Base URL and model:

```json
{
  "bharatcodeBaseUrl": "https://bharatcode.ai/api/model/v1",
  "bharatcodeModel": "qwen-3.8-27b"
}
```

### Alternatives

```powershell
setx OSSPILOT_OPENAI_API_KEY "sk-..."
setx OSSPILOT_ANTHROPIC_API_KEY "sk-ant-..."
```

Restart the terminal afterwards. The running application reads the environment at
startup.

### Ollama

No key required. Start Ollama and pull a model:

```bash
ollama pull llama3.2
```

OSSPilot probes `http://localhost:11434`.

## Behaviour without a provider

OSSPilot degrades gracefully:

- GitHub research, project health, issue intelligence, suitability scoring, repository
  deep inspection and contribution requirements **all work** — they use verified GitHub
  data only.
- Intelligence outputs that need an LLM return `null` and the display path hides them
  rather than showing an error or a fabricated answer.

## Behaviour without OpenCode

Implementation requires the OpenCode runtime. Without it:

- `contribute` stops at the coding stage with a clear message that implementation needs
  OpenCode.
- `setup` and `doctor` report it as missing and link the installer.
- Everything else continues to work.

## Notes

- The provider used is reported in `osspilot doctor` and in the TUI status bar.
- Keys are held in the OS keyring, never written to logs or config files.
- Logs redact `sk-`, `sk-ant-`, `bc_live_`, `nvapi-` and `ghp_` shaped strings.
- Provider failures are surfaced, never silently swallowed into a successful-looking
  result.