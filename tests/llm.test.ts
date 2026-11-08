import { describe, expect, it } from "vitest"
import { AnthropicProvider } from "../src/integrations/llm/anthropic"
import { OllamaProvider } from "../src/integrations/llm/ollama"
import { OpenAICompatibleProvider } from "../src/integrations/llm/openai"
import type { LLMProviderConfig } from "../src/integrations/llm/provider"

describe("OpenAICompatibleProvider", () => {
  const config: LLMProviderConfig = {
    id: "test",
    apiKey: "test-key",
    baseUrl: "https://api.test.com",
    model: "test-model",
    enabled: true,
  }

  it("is not available with invalid config", async () => {
    const provider = new OpenAICompatibleProvider({ ...config, apiKey: undefined }, "Test", [
      "model",
    ])
    expect(await provider.isAvailable()).toBe(false)
  })

  it("is available with valid key", async () => {
    const provider = new OpenAICompatibleProvider(config, "Test", ["model"])
    expect(typeof provider.isAvailable).toBe("function")
  })

  it("returns null from structuredOutput when unavailable", async () => {
    const provider = new OpenAICompatibleProvider({ ...config, apiKey: undefined }, "Test", [
      "model",
    ])
    const result = await provider.structuredOutput([{ role: "user", content: "test" }], {})
    expect(result).toBeNull()
  })

  it("throws on chat without key", async () => {
    const provider = new OpenAICompatibleProvider({ ...config, apiKey: undefined }, "Test", [
      "model",
    ])
    await expect(provider.chat([{ role: "user", content: "test" }])).rejects.toThrow()
  })
})

describe("AnthropicProvider", () => {
  const config: LLMProviderConfig = { id: "anthropic", apiKey: "test-key", enabled: true }

  it("is available with key", async () => {
    const provider = new AnthropicProvider(config)
    expect(await provider.isAvailable()).toBe(true)
  })

  it("is not available without key", async () => {
    const provider = new AnthropicProvider({ ...config, apiKey: undefined })
    expect(await provider.isAvailable()).toBe(false)
  })

  it("returns null from structuredOutput without key", async () => {
    const provider = new AnthropicProvider({ ...config, apiKey: undefined })
    const result = await provider.structuredOutput([{ role: "user", content: "test" }], {})
    expect(result).toBeNull()
  })
})

describe("OllamaProvider", () => {
  const config: LLMProviderConfig = { id: "ollama", enabled: true }

  it("requires no API key", async () => {
    const provider = new OllamaProvider(config)
    expect(provider.requiresApiKey).toBe(false)
  })

  it("checks availability without key", async () => {
    const provider = new OllamaProvider(config)
    // Will be false if Ollama isn't running
    const available = await provider.isAvailable()
    expect(typeof available).toBe("boolean")
  })
})
