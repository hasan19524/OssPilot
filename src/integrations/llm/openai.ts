/**
 * OpenAI-compatible provider.
 *
 * Covers: OpenAI, BharatCode, Azure OpenAI, and any OpenAI-compatible endpoint.
 * Users set their own API key and base URL.
 */

import OpenAI from "openai"
import type { LLMMessage, LLMProvider, LLMProviderConfig, LLMResponse } from "./provider"

export class OpenAICompatibleProvider implements LLMProvider {
  readonly id: string
  readonly name: string
  readonly models: string[]
  readonly requiresApiKey: boolean
  private client: OpenAI | null = null
  private config: LLMProviderConfig

  constructor(config: LLMProviderConfig, name: string, models: string[]) {
    this.id = config.id
    this.name = name
    this.models = models
    this.requiresApiKey = true
    this.config = config
    if (config.apiKey) {
      this.client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl })
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.client) return false
    try {
      await this.client.models.list()
      return true
    } catch {
      return false
    }
  }

  async chat(
    messages: LLMMessage[],
    options?: { model?: string; temperature?: number; maxTokens?: number },
  ): Promise<LLMResponse> {
    if (!this.client) throw new Error(`${this.name} not configured: missing API key`)
    const model = options?.model ?? this.config.model ?? this.models[0] ?? "gpt-4o"
    const response = await this.client.chat.completions.create({
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options?.temperature ?? 0.2,
      max_tokens: options?.maxTokens ?? 2000,
    } as never)
    return {
      content: response.choices[0]?.message?.content ?? "",
      model,
      provider: this.id,
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
          }
        : undefined,
    }
  }

  async structuredOutput<T>(
    messages: LLMMessage[],
    _schema: object,
    options?: { model?: string },
  ): Promise<T | null> {
    if (!this.client) return null
    const model = options?.model ?? this.config.model ?? this.models[0] ?? "gpt-4o"
    try {
      const response = await this.client.chat.completions.create({
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 2000,
      } as never)
      const content = response.choices[0]?.message?.content
      if (!content) return null
      return JSON.parse(content) as T
    } catch {
      return null
    }
  }
}
