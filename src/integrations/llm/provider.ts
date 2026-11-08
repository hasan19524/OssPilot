/**
 * LLM Provider abstraction.
 *
 * Allows users to plug in their own API keys for multiple providers.
 * BharatCode is the default; OpenAI, Anthropic, Google, Ollama, etc. are supported.
 * Adding a new provider = implement LLMProvider and register it.
 */

export interface LLMMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export interface LLMResponse {
  content: string
  model: string
  provider: string
  usage?: { promptTokens: number; completionTokens: number }
}

export interface LLMProvider {
  readonly id: string
  readonly name: string
  readonly models: string[]
  readonly requiresApiKey: boolean

  isAvailable(): Promise<boolean>
  chat(
    messages: LLMMessage[],
    options?: { model?: string; temperature?: number; maxTokens?: number },
  ): Promise<LLMResponse>
  structuredOutput<T>(
    messages: LLMMessage[],
    schema: object,
    options?: { model?: string },
  ): Promise<T | null>
}

export interface LLMProviderConfig {
  id: string
  apiKey?: string
  baseUrl?: string
  model?: string
  enabled: boolean
}
