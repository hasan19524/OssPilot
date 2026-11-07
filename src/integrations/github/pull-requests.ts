/**
 * Pull requests and branch info.
 */

import { z } from "zod"
import type { GitHubClient } from "./client"

export const pullRequestSchema = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  state: z.string(),
  htmlUrl: z.string(),
  headBranch: z.string(),
  baseBranch: z.string(),
  author: z.string().nullable(),
  draft: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type PullRequest = z.infer<typeof pullRequestSchema>

export async function listPullRequests(
  client: GitHubClient,
  owner: string,
  name: string,
  state: "open" | "closed" | "all" = "open",
): Promise<PullRequest[]> {
  const response = await client.octokit.rest.pulls.list({
    owner,
    repo: name,
    state,
    per_page: 50,
  })
  return response.data.map((pr) =>
    pullRequestSchema.parse({
      number: pr.number,
      title: pr.title,
      body: pr.body ?? null,
      state: pr.state,
      htmlUrl: pr.html_url,
      headBranch: pr.head?.ref ?? "",
      baseBranch: pr.base?.ref ?? "",
      author: pr.user?.login ?? null,
      draft: pr.draft ?? false,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
    }),
  )
}

export async function getBranches(
  client: GitHubClient,
  owner: string,
  name: string,
): Promise<string[]> {
  const response = await client.octokit.rest.repos.listBranches({
    owner,
    repo: name,
    per_page: 100,
  })
  return response.data.map((b) => b.name)
}

export async function getDefaultBranch(
  client: GitHubClient,
  owner: string,
  name: string,
): Promise<string> {
  const repo = await client.octokit.rest.repos.get({ owner, repo: name })
  return repo.data.default_branch ?? "main"
}
