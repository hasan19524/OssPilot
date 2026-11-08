/**
 * LLM provider registry.
 *
 * Manages multiple providers. Users can add their own API keys.
 * Falls back gracefully when a provider is unavailable.
 */

import { AnthropicProvider } from "./anthropic"
import { OllamaProvider } from "./ollama"
import { OpenAICompatibleProvider } from "./openai"
import type { LLMProvider, LLMProviderConfig } from "./provider"

export class LLMProviderRegistry {
  private providers = new Map<string, LLMProvider>()

  register(provider: LLMProvider): void {
    this.providers.set(provider.id, provider)
  }

  get(id: string): LLMProvider | undefined {
    return this.providers.get(id)
  }

  list(): LLMProvider[] {
    return Array.from(this.providers.values())
  }

  async available(): Promise<LLMProvider[]> {
    const results: LLMProvider[] = []
    for (const p of this.providers.values()) {
      if (await p.isAvailable()) results.push(p)
    }
    return results
  }

  /** Create providers from config. */
  static fromConfigs(configs: LLMProviderConfig[]): LLMProviderRegistry {
    const registry = new LLMProviderRegistry()
    for (const config of configs) {
      if (!config.enabled) continue
      switch (config.id) {
        case "bharatcode":
          registry.register(
            new OpenAICompatibleProvider(config, "BharatCode", [
              "qwen-3.8-27b",
              "deepseek-v4.1-flash",
            ]),
          )
          break
        case "openai":
          registry.register(
            new OpenAICompatibleProvider(config, "OpenAI", [
              "gpt-4o",
              "gpt-4o-mini",
              "gpt-4-turbo",
            ]),
          )
          break
        case "anthropic":
          registry.register(new AnthropicProvider(config))
          break
        case "ollama":
          registry.register(new OllamaProvider(config))
          break
        default:
          // Generic OpenAI-compatible for any custom endpoint
          registry.register(
            new OpenAICompatibleProvider(config, config.id, config.model ? [config.model] : []),
          )
          break
      }
    }
    return registry
  }
}

export * from "./provider"
export { AnthropicProvider, OllamaProvider, OpenAICompatibleProvider }
