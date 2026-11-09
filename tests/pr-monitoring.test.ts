import { describe, expect, it } from "vitest"
import type { GitHubClient } from "../src/integrations/github/client"
import type { PrStatus } from "../src/integrations/github/pr-monitoring"
import {
  createPullRequest,
  getPrStatus,
  hasNewActivity,
  summarizePrStatus,
} from "../src/integrations/github/pr-monitoring"

/**
 * Controlled fixtures — no live GitHub calls, no upstream PRs.
 * Each test drives the real Octokit call paths of the monitoring module.
 */

interface Fixture {
  pr?: {
    number: number
    state: "open" | "closed"
    merged?: boolean
    mergeable?: boolean | null
    title: string
    html_url: string
    updated_at: string
    head: { ref: string }
  }
  comments?: Array<{ id: number; user?: { login: string }; body: string; created_at: string }>
  reviewComments?: Array<{ id: number; user?: { login: string }; body: string; created_at: string }>
  reviews?: Array<{
    id: number
    user?: { login: string }
    state: string
    body: string | null
    submitted_at: string
  }>
  checks?: { check_runs: Array<{ name: string; status: string; conclusion: string | null }> }
  /** Simulate an Octokit error. */
  throwsOn?: "pulls.get" | "comments" | "reviewComments" | "reviews" | "checks"
}

function makeClient(fixture: Fixture): GitHubClient {
  const err = (which: string) => {
    if (fixture.throwsOn !== which) return null
    const e = new Error("simulated GitHub API failure") as Error & { status: number }
    e.status = 403
    throw e
  }
  const octokit = {
    rest: {
      pulls: {
        get: async () => {
          const e = err("pulls.get")
          if (e) throw e
          return { data: fixture.pr }
        },
        listReviewComments: async () => {
          const e = err("reviewComments")
          if (e) throw e
          return { data: fixture.reviewComments ?? [] }
        },
        listReviews: async () => {
          const e = err("reviews")
          if (e) throw e
          return { data: fixture.reviews ?? [] }
        },
        create: async () => ({ data: { html_url: "https://github.com/o/r/pull/9", number: 9 } }),
      },
      issues: {
        listComments: async () => {
          const e = err("comments")
          if (e) throw e
          return { data: fixture.comments ?? [] }
        },
      },
      checks: {
        listForRef: async () => {
          const e = err("checks")
          if (e) throw e
          return { data: fixture.checks ?? { check_runs: [] } }
        },
      },
    },
  }
  return { octokit, tokenSource: "explicit", anonymous: false } as unknown as GitHubClient
}

const BASE_PR: NonNullable<Fixture["pr"]> = {
  number: 12,
  state: "open",
  mergeable: true,
  title: "Fix parser edge case",
  html_url: "https://github.com/o/r/pull/12",
  updated_at: "2026-11-08T00:00:00Z",
  head: { ref: "fix/edge-case" },
}

describe("PR monitoring — reviews, comments, CI", () => {
  it("collects conversation comments, inline comments, reviews and checks", async () => {
    const client = makeClient({
      pr: BASE_PR,
      comments: [
        {
          id: 1,
          user: { login: "maintainer" },
          body: "Please add a changelog entry.",
          created_at: "2026-11-02T00:00:00Z",
        },
      ],
      reviewComments: [
        {
          id: 2,
          user: { login: "reviewer" },
          body: "This line overflows.",
          created_at: "2026-11-03T00:00:00Z",
        },
      ],
      reviews: [
        {
          id: 3,
          user: { login: "maintainer" },
          state: "APPROVED",
          body: "LGTM",
          submitted_at: "2026-11-04T00:00:00Z",
        },
      ],
      checks: { check_runs: [{ name: "build", status: "completed", conclusion: "success" }] },
    })
    const status = await getPrStatus(client, "o", "r", 12)
    expect(status.state).toBe("open")
    expect(status.comments.length).toBe(2)
    expect(status.reviews.length).toBe(1)
    expect(status.reviews[0]?.state).toBe("APPROVED")
    expect(status.checks[0]?.conclusion).toBe("success")
  })

  it("reports merged status", async () => {
    const client = makeClient({ pr: { ...BASE_PR, state: "closed", merged: true } })
    const status = await getPrStatus(client, "o", "r", 12)
    expect(status.merged).toBe(true)
    expect(summarizePrStatus(status)).toContain("MERGED")
  })

  it("reports failing CI checks", async () => {
    const client = makeClient({
      pr: BASE_PR,
      checks: { check_runs: [{ name: "test", status: "completed", conclusion: "failure" }] },
    })
    const status = await getPrStatus(client, "o", "r", 12)
    expect(summarizePrStatus(status)).toContain("CI: 1 failed")
  })

  it("reports unmergeable PRs", async () => {
    const client = makeClient({ pr: { ...BASE_PR, mergeable: false } })
    const status = await getPrStatus(client, "o", "r", 12)
    expect(summarizePrStatus(status)).toContain("conflicts")
  })

  it("handles comment fetch failure gracefully (comments omitted, not fabricated)", async () => {
    const client = makeClient({ pr: BASE_PR, throwsOn: "comments" })
    const status = await getPrStatus(client, "o", "r", 12)
    expect(status.comments.length).toBe(0)
    expect(status.number).toBe(12) // PR data still available
  })

  it("handles check fetch failure without failing the whole report", async () => {
    const client = makeClient({ pr: BASE_PR, throwsOn: "checks" })
    const status = await getPrStatus(client, "o", "r", 12)
    expect(status.checks.length).toBe(0)
  })

  it("propagates PR fetch failure (cannot fabricate a PR)", async () => {
    const client = makeClient({ pr: undefined, throwsOn: "pulls.get" })
    await expect(getPrStatus(client, "o", "r", 404)).rejects.toThrow()
  })

  it("handles empty data without crashing", async () => {
    const client = makeClient({ pr: BASE_PR })
    const status = await getPrStatus(client, "o", "r", 12)
    expect(status.comments).toEqual([])
    expect(status.reviews).toEqual([])
    expect(status.checks).toEqual([])
  })
})

describe("PR creation", () => {
  it("returns the created PR url and number", async () => {
    const client = makeClient({ pr: BASE_PR })
    const result = await createPullRequest(client, "o", "r", {
      title: "t",
      body: "b",
      head: "fix/x",
      base: "main",
    })
    expect(result.ok).toBe(true)
    expect(result.number).toBe(9)
    expect(result.url).toContain("/pull/9")
  })
})

describe("activity detection", () => {
  it("detects new activity by timestamp", () => {
    const status: PrStatus = {
      number: 1,
      state: "open",
      merged: false,
      mergeable: true,
      title: "t",
      url: "u",
      comments: [],
      reviews: [],
      checks: [],
      partialFailures: [],
      lastUpdated: "2026-11-08T00:00:00Z",
    }
    expect(hasNewActivity(status, "2026-11-01T00:00:00Z")).toBe(true)
    expect(hasNewActivity(status, "2026-11-09T00:00:00Z")).toBe(false)
  })
})
