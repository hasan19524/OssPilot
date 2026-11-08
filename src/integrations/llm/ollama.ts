/**
 * Ollama provider (local models, no API key needed).
 */

import type { LLMMessage, LLMProvider, LLMProviderConfig, LLMResponse } from "./provider"

export class OllamaProvider implements LLMProvider {
  readonly id: string
  readonly name: string
  readonly models: string[]
  readonly requiresApiKey: boolean
  private baseUrl: string
  private config: LLMProviderConfig

  constructor(config: LLMProviderConfig) {
    this.id = config.id
    this.name = "Ollama"
    this.models = ["llama3.2", "codellama", "mistral", "phi3"]
    this.requiresApiKey = false
    this.config = config
    this.baseUrl = config.baseUrl ?? "http://localhost:11434"
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`)
      return res.ok
    } catch {
      return false
    }
  }

  async chat(
    messages: LLMMessage[],
    options?: { model?: string; temperature?: number; maxTokens?: number },
  ): Promise<LLMResponse> {
    const model = options?.model ?? this.config.model ?? "llama3.2"
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: false,
        options: {
          temperature: options?.temperature ?? 0.2,
          num_predict: options?.maxTokens ?? 2000,
        },
      }),
    })
    if (!res.ok) throw new Error(`Ollama error: ${res.status}`)
    const data = (await res.json()) as { message?: { content?: string } }
    return {
      content: data.message?.content ?? "",
      model,
      provider: this.id,
    }
  }

  async structuredOutput<T>(
    messages: LLMMessage[],
    _schema: object,
    options?: { model?: string },
  ): Promise<T | null> {
    const result = await this.chat(messages, options)
    try {
      return JSON.parse(result.content) as T
    } catch {
      return null
    }
  }
}
