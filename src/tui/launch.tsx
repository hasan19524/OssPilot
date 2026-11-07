import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { App } from "./app/App"

export async function launchTui(): Promise<void> {
  const renderer = await createCliRenderer()
  const root = createRoot(renderer)
  root.render(<App />)

  // Block until the renderer is destroyed (Ctrl+C / Esc / q in the TUI).
  await new Promise<void>((resolve) => {
    const interval = setInterval(() => {
      if (renderer.isDestroyed) {
        clearInterval(interval)
        resolve()
      }
    }, 100)
    const onSignal = () => {
      try {
        renderer.destroy()
      } catch {
        // ignore
      }
    }
    process.on("SIGINT", onSignal)
    process.on("SIGTERM", onSignal)
  })
}
