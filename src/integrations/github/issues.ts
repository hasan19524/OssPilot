/**
 * Issue retrieval, comments, labels.
 */

import { z } from "zod"
import type { GitHubClient } from "./client"

export const issueSchema = z.object({
  id: z.number(),
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  state: z.string(),
  htmlUrl: z.string(),
  author: z.string().nullable(),
  labels: z.array(z.string()),
  commentsCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type Issue = z.infer<typeof issueSchema>

export const commentSchema = z.object({
  id: z.number(),
  author: z.string().nullable(),
  body: z.string(),
  createdAt: z.string(),
})

export type Comment = z.infer<typeof commentSchema>

export async function listOpenIssues(
  client: GitHubClient,
  owner: string,
  name: string,
  options: { labels?: string[]; perPage?: number; page?: number } = {},
): Promise<Issue[]> {
  const response = await client.octokit.rest.issues.listForRepo({
    owner,
    repo: name,
    state: "open",
    labels: options.labels?.join(","),
    per_page: options.perPage ?? 30,
    page: options.page ?? 1,
  })
  return response.data
    .filter((issue) => !issue.pull_request)
    .map((issue) =>
      issueSchema.parse({
        id: issue.id,
        number: issue.number,
        title: issue.title,
        body: issue.body ?? null,
        state: issue.state,
        htmlUrl: issue.html_url,
        author: issue.user?.login ?? null,
        labels: issue.labels
          .map((label) => (typeof label === "string" ? label : (label.name ?? "")))
          .filter(Boolean),
        commentsCount: issue.comments ?? 0,
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
      }),
    )
}

export async function getIssue(
  client: GitHubClient,
  owner: string,
  name: string,
  number: number,
): Promise<Issue> {
  const response = await client.octokit.rest.issues.get({ owner, repo: name, issue_number: number })
  const issue = response.data
  return issueSchema.parse({
    id: issue.id,
    number: issue.number,
    title: issue.title,
    body: issue.body ?? null,
    state: issue.state,
    htmlUrl: issue.html_url,
    author: issue.user?.login ?? null,
    labels: issue.labels
      .map((label) => (typeof label === "string" ? label : (label.name ?? "")))
      .filter(Boolean),
    commentsCount: issue.comments ?? 0,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
  })
}

export async function listIssueComments(
  client: GitHubClient,
  owner: string,
  name: string,
  number: number,
): Promise<Comment[]> {
  const response = await client.octokit.rest.issues.listComments({
    owner,
    repo: name,
    issue_number: number,
    per_page: 100,
  })
  return response.data.map((comment) =>
    commentSchema.parse({
      id: comment.id,
      author: comment.user?.login ?? null,
      body: comment.body ?? "",
      createdAt: comment.created_at,
    }),
  )
}

export async function listLabels(
  client: GitHubClient,
  owner: string,
  name: string,
): Promise<string[]> {
  const response = await client.octokit.rest.issues.listLabelsForRepo({
    owner,
    repo: name,
    per_page: 100,
  })
  return response.data.map((label) => label.name ?? "").filter(Boolean)
}
