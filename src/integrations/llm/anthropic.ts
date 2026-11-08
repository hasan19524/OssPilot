/**
 * Anthropic provider (Claude models).
 */

import Anthropic from "@anthropic-ai/sdk"
import type { LLMMessage, LLMProvider, LLMProviderConfig, LLMResponse } from "./provider"

export class AnthropicProvider implements LLMProvider {
  readonly id: string
  readonly name: string
  readonly models: string[]
  readonly requiresApiKey: boolean
  private client: Anthropic | null = null
  private config: LLMProviderConfig

  constructor(config: LLMProviderConfig) {
    this.id = config.id
    this.name = "Anthropic"
    this.models = [
      "claude-sonnet-4-20250514",
      "claude-3-5-sonnet-20241022",
      "claude-3-haiku-20240307",
    ]
    this.requiresApiKey = true
    this.config = config
    if (config.apiKey) {
      this.client = new Anthropic({ apiKey: config.apiKey, baseURL: config.baseUrl })
    }
  }

  async isAvailable(): Promise<boolean> {
    return this.client !== null
  }

  async chat(
    messages: LLMMessage[],
    options?: { model?: string; temperature?: number; maxTokens?: number },
  ): Promise<LLMResponse> {
    if (!this.client) throw new Error("Anthropic not configured: missing API key")
    const model = options?.model ?? this.config.model ?? "claude-sonnet-4-20250514"
    const systemMsg = messages.find((m) => m.role === "system")
    const nonSystem = messages.filter((m) => m.role !== "system")
    const response = await this.client.messages.create({
      model,
      max_tokens: options?.maxTokens ?? 2000,
      temperature: options?.temperature ?? 0.2,
      system: systemMsg?.content,
      messages: nonSystem.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    } as never)
    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
    return {
      content: text,
      model,
      provider: this.id,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
      },
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
