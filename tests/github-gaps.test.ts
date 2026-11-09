import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import type { GitHubClient } from "../src/integrations/github/client"
import { listOpenIssues } from "../src/integrations/github/issues"
import { listPullRequests } from "../src/integrations/github/pull-requests"
import { parseGitHubRef } from "../src/integrations/github/ref"
import { cacheClear, cacheGet, cacheSet } from "../src/storage/cache"

/**
 * Controlled fixtures. No live GitHub calls, no upstream PRs.
 */

let testHome: string

beforeAll(() => {
  testHome = mkdtempSync(join(tmpdir(), "osspilot-gh-"))
  process.env.OSSPILOT_HOME = testHome
})

afterEach(() => {
  delete process.env.OSSPILOT_HOME
  rmSync(testHome, { recursive: true, force: true })
  testHome = mkdtempSync(join(tmpdir(), "osspilot-gh-"))
  process.env.OSSPILOT_HOME = testHome
})

function issueFixture(number: number, title: string) {
  return {
    id: number,
    number,
    title,
    body: "body",
    state: "open",
    html_url: `https://github.com/o/r/issues/${number}`,
    user: { login: "someone" },
    labels: [{ name: "bug" }],
    comments: 0,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
  }
}

function makeClient(opts: { pages?: number[][]; failOn?: string } = {}): GitHubClient {
  const pages = opts.pages ?? [[1]]
  const octokit = {
    rest: {
      issues: {
        listForRepo: async (params: Record<string, unknown>) => {
          if (opts.failOn === "listForRepo") throw new Error("503 rate limit exceeded")
          const page = (params.page as number | undefined) ?? 1
          const numbers = pages[page - 1] ?? []
          return { data: numbers.map((n) => issueFixture(n, `Issue ${n}`)) }
        },
        listComments: async () => ({ data: [] }),
      },
      pulls: {
        list: async () => {
          if (opts.failOn === "pulls.list") throw new Error("403 Forbidden")
          return { data: [] }
        },
      },
    },
  }
  return { octokit, tokenSource: "explicit", anonymous: false } as unknown as GitHubClient
}

describe("pagination", () => {
  it("honours the page parameter", async () => {
    const client = makeClient({ pages: [[1], [2], []] })
    const first = await listOpenIssues(client, "o", "r", { page: 1 })
    const second = await listOpenIssues(client, "o", "r", { page: 2 })
    expect(first[0]?.number).toBe(1)
    expect(second[0]?.number).toBe(2)
  })

  it("returns an empty list past the last page", async () => {
    const client = makeClient({ pages: [[1]] })
    const issues = await listOpenIssues(client, "o", "r", { page: 99 })
    expect(issues).toEqual([])
  })

  it("supports the pull listing path", async () => {
    const client = makeClient()
    const prs = await listPullRequests(client, "o", "r", "open")
    expect(Array.isArray(prs)).toBe(true)
  })
})

describe("failure handling", () => {
  it("propagates a rate-limit error rather than returning fabricated data", async () => {
    const client = makeClient({ failOn: "listForRepo" })
    await expect(listOpenIssues(client, "o", "r", { page: 1 })).rejects.toThrow("503")
  })

  it("propagates a 403 from PR listing", async () => {
    const client = makeClient({ failOn: "pulls.list" })
    await expect(listPullRequests(client, "o", "r", "open")).rejects.toThrow("403")
  })
})

describe("caching of GitHub responses", () => {
  it("stores and clears cached values", () => {
    cacheClear()
    cacheSet("issue:o/r#1", { number: 1 })
    expect(cacheGet("issue:o/r#1")).toEqual({ number: 1 })
    cacheClear()
    expect(cacheGet("issue:o/r#1")).toBeNull()
  })

  it("expires entries on TTL", async () => {
    cacheClear()
    cacheSet("issue:o/r#2", { number: 2 }, 1)
    await new Promise((r) => setTimeout(r, 10))
    expect(cacheGet("issue:o/r#2")).toBeNull()
    cacheClear()
  })
})

describe("GitHub reference edge cases", () => {
  it("accepts org-style names with dots and dashes", () => {
    const ref = parseGitHubRef("fastify-org/fastify.v4#42")
    expect(ref).not.toBeNull()
    expect(ref?.owner).toBe("fastify-org")
  })

  it("rejects a URL with a leading dash", () => {
    expect(parseGitHubRef("-x/repo#1")).toBeNull()
  })

  it("rejects an empty owner segment", () => {
    expect(parseGitHubRef("/repo#1")).toBeNull()
  })

  it("rejects a path traversal in the repo segment", () => {
    expect(parseGitHubRef("o/../etc#1")).toBeNull()
  })
})
