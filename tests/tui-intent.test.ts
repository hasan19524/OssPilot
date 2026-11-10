import { describe, expect, it } from "vitest"
import { detectLanguage, extractRef, recognizeIntent } from "../src/tui/intent"

const cmd = (input: string): { kind: string; command?: string; args: string[] } => {
  const intent = recognizeIntent(input)
  if (intent.kind !== "command") return { kind: intent.kind, command: undefined, args: [] }
  return { kind: intent.kind, command: intent.command, args: intent.args }
}

describe("conversational input", () => {
  it("answers a bare greeting instead of raising a routing error", () => {
    for (const greeting of ["hi", "hey", "hello", "Hi there!", "good morning"]) {
      const intent = recognizeIntent(greeting)
      expect(intent.kind, greeting).toBe("reply")
      if (intent.kind === "reply") {
        expect(intent.lines.join("\n")).toContain("OSSPilot")
        // A greeting must advertise what it can do, not just wave back.
        expect(intent.lines.join("\n")).toContain("/help")
      }
    }
  })

  it("answers small talk", () => {
    const intent = recognizeIntent("how are you")
    expect(intent.kind).toBe("reply")
    if (intent.kind === "reply") expect(intent.lines.join("\n")).not.toContain("could not map")
  })

  it("answers thanks and identity questions", () => {
    expect(recognizeIntent("thanks").kind).toBe("reply")
    const who = recognizeIntent("who are you")
    expect(who.kind).toBe("reply")
    if (who.kind === "reply") expect(who.lines.join("\n")).toContain("never push")
  })

  it("still refuses to fabricate for genuinely unmappable input", () => {
    expect(recognizeIntent("please write me a poem about kubernetes").kind).toBe("unmapped")
    expect(recognizeIntent("set my wallpaper to blue").kind).toBe("unmapped")
    expect(recognizeIntent("").kind).toBe("unmapped")
  })
})

describe("workflow intent routing", () => {
  it("routes 'find python repositories' to discover with a language filter", () => {
    const i = cmd("find python repositories")
    expect(i.command).toBe("discover")
    expect(i.args).toContain("--language")
    expect(i.args[i.args.indexOf("--language") + 1]).toBe("python")
    expect(i.args[0]).not.toContain("python python")
  })

  it("prefers issues when the sentence is about issues in a repository", () => {
    const i = cmd("find beginner-friendly issues in this repository")
    expect(i.command).toBe("issues")
    // The beginner-friendly wording must survive as a real label filter.
    expect(i.args).toContain("--beginner-friendly")
  })

  it("does not claim beginner-friendliness for a plain issue request", () => {
    const i = cmd("show open issues in octocat/Hello-World")
    expect(i.command).toBe("issues")
    expect(i.args).not.toContain("--beginner-friendly")
  })

  it("prefers discover when repositories come before issues", () => {
    const i = cmd("find repositories with good first issues")
    expect(i.command).toBe("discover")
  })

  it("extracts a reference from a research sentence", () => {
    const i = cmd("research octocat/Hello-World#1")
    expect(i.command).toBe("research")
    expect(i.args[0]).toBe("octocat/Hello-World#1")
  })

  it("routes 'explain this repository' to the repository inspector", () => {
    expect(cmd("explain this repository").command).toBe("explain")
    expect(cmd("walk me through this codebase").command).toBe("explain")
    expect(cmd("understand this repository").command).toBe("explain")
  })

  it("routes a contribution request to the planner", () => {
    const i = cmd("help me plan a contribution")
    expect(i.command).toBe("plan")
    // Without a concrete issue it must not pretend a plan exists.
    expect(i.args).toEqual([])
  })

  it("keeps status/diff/cancel/agents reachable in natural language", () => {
    expect(cmd("what is the status of my contributions?").command).toBe("status")
    expect(cmd("show me the diff").command).toBe("diff")
    expect(cmd("cancel the running contribution").command).toBe("cancel")
    expect(cmd("how is opencode doing").command).toBe("agents")
  })

  it("does not mistake a task sentence for a greeting", () => {
    expect(cmd("help me plan a contribution").command).toBe("plan")
    expect(cmd("hi, find python repositories").command).toBe("discover")
  })
})

describe("reference extraction", () => {
  it("pulls owner/repo#N out of a sentence", () => {
    expect(extractRef("research octocat/Hello-World#1")).toMatchObject({
      owner: "octocat",
      repo: "Hello-World",
      issueNumber: 1,
    })
  })

  it("returns null when there is no reference", () => {
    expect(extractRef("explain this repository")).toBeNull()
    expect(extractRef("find python repositories")).toBeNull()
  })
})

describe("language detection", () => {
  it("recognises common languages and aliases", () => {
    expect(detectLanguage("TypeScript")).toBe("typescript")
    expect(detectLanguage("ts")).toBe("typescript")
    expect(detectLanguage("golang")).toBe("go")
  })

  it("rejects unknown values", () => {
    expect(detectLanguage("kitchen sink")).toBeNull()
  })
})
