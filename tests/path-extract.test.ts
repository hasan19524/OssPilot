import { describe, expect, it } from "vitest"
import { extractAffectedPath } from "../src/agents/adapters/opencode/path-extract"

// Real captured tool states from the OpenCode adapter runs.
const cases = [
  {
    name: "glob result",
    state: {
      status: "completed",
      input: { pattern: "math.js" },
      content: [
        {
          type: "text",
          text: "C:\\Users\\Hasan\\AppData\\Local\\Temp\\at-accept-5gWm6h\\worktrees\\contrib-1729900000000-abcd1234\\math.js",
        },
      ],
    },
    expected: "math.js",
  },
  {
    name: "edit tool with input path",
    state: {
      status: "completed",
      input: { path: "C:\\repo\\src\\parser.ts" },
      content: [{ type: "text", text: "Patched successfully" }],
    },
    expected: "parser.ts",
  },
  {
    name: "write tool unix path",
    state: {
      status: "completed",
      input: {},
      content: [{ type: "text", text: "Wrote file /home/user/project/main.py" }],
    },
    expected: "main.py",
  },
  {
    name: "no path info",
    state: {
      status: "completed",
      input: { command: "ls" },
      content: [{ type: "text", text: "total 3" }],
    },
    expected: null,
  },
  {
    name: "read tool windows path",
    state: {
      status: "completed",
      input: {},
      content: [{ type: "text", text: "Read file D:\\work\\app\\index.ts, lines 1-5" }],
    },
    expected: "index.ts",
  },
]

describe("extractAffectedPath", () => {
  for (const c of cases) {
    it(c.name, () => {
      expect(extractAffectedPath(c.state)).toBe(c.expected)
    })
  }
})
