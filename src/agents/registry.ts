import { OpenCodeAdapter } from "./adapters/opencode"
import type { AgentAdapter } from "./base/adapter"

class AgentRegistry {
  private readonly adapters = new Map<string, AgentAdapter>()

  register(adapter: AgentAdapter): void {
    if (this.adapters.has(adapter.id)) {
      throw new Error(`Agent adapter already registered: ${adapter.id}`)
    }
    this.adapters.set(adapter.id, adapter)
  }

  get(id: string): AgentAdapter | undefined {
    return this.adapters.get(id)
  }

  list(): AgentAdapter[] {
    return Array.from(this.adapters.values())
  }

  preferred(defaultId?: string): AgentAdapter | undefined {
    if (defaultId) {
      const adapter = this.adapters.get(defaultId)
      if (adapter) return adapter
    }
    return this.list()[0]
  }
}

export const agentRegistry = new AgentRegistry()

/** Bootstrap: register the adapters available in this release. */
export function bootstrapAgentRegistry(): void {
  agentRegistry.register(new OpenCodeAdapter())
}
