/**
 * Repository search and details.
 */

import { z } from "zod"
import { cacheGet, cacheSet } from "../../storage/cache"
import type { GitHubClient } from "./client"

export const repositorySchema = z.object({
  id: z.number(),
  owner: z.string(),
  name: z.string(),
  fullName: z.string(),
  description: z.string().nullable(),
  htmlUrl: z.string(),
  defaultBranch: z.string(),
  language: z.string().nullable(),
  stars: z.number(),
  forks: z.number(),
  openIssues: z.number(),
  updatedAt: z.string(),
})

export type Repository = z.infer<typeof repositorySchema>

export async function searchRepositories(
  client: GitHubClient,
  query: string,
  options: { language?: string; sort?: "stars" | "forks" | "updated"; perPage?: number } = {},
): Promise<Repository[]> {
  const q = options.language ? `${query} language:${options.language}` : query
  const response = await client.octokit.rest.search.repos({
    q,
    sort: options.sort ?? "stars",
    order: "desc",
    per_page: options.perPage ?? 20,
  })
  return response.data.items.map((repo) =>
    repositorySchema.parse({
      id: repo.id,
      owner: repo.owner?.login ?? "",
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      htmlUrl: repo.html_url,
      defaultBranch: repo.default_branch ?? "main",
      language: repo.language,
      stars: repo.stargazers_count ?? 0,
      forks: repo.forks_count ?? 0,
      openIssues: repo.open_issues_count ?? 0,
      updatedAt: repo.updated_at ?? "",
    }),
  )
}

export async function getRepository(
  client: GitHubClient,
  owner: string,
  name: string,
): Promise<Repository> {
  const cacheKey = `repo:${owner}/${name}`
  const cached = cacheGet<Repository>(cacheKey)
  if (cached) return cached

  const response = await client.octokit.rest.repos.get({ owner, repo: name })
  const repo = response.data
  const result = repositorySchema.parse({
    id: repo.id,
    owner: repo.owner?.login ?? owner,
    name: repo.name,
    fullName: repo.full_name,
    description: repo.description,
    htmlUrl: repo.html_url,
    defaultBranch: repo.default_branch ?? "main",
    language: repo.language,
    stars: repo.stargazers_count ?? 0,
    forks: repo.forks_count ?? 0,
    openIssues: repo.open_issues_count ?? 0,
    updatedAt: repo.updated_at ?? "",
  })
  cacheSet(cacheKey, result)
  return result
}
