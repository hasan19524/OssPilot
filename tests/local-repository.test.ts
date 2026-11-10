import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { detectLocalRepository, refFromRemoteUrl } from "../src/workspace/local-repository"

let home: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "osspilot-localrepo-"))
})

afterEach(() => {
  try {
    rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  } catch {
    // Windows can hold locks; best effort.
  }
})

const git = (cwd: string, ...args: string[]): void => {
  execFileSync("git", args, { cwd, stdio: "pipe" })
}

describe("refFromRemoteUrl", () => {
  it("parses https remotes with and without .git", () => {
    expect(refFromRemoteUrl("https://github.com/octocat/Hello-World")).toEqual({
      owner: "octocat",
      repo: "Hello-World",
    })
    expect(refFromRemoteUrl("https://github.com/octocat/Hello-World.git")).toEqual({
      owner: "octocat",
      repo: "Hello-World",
    })
  })

  it("parses ssh and scp-like remotes", () => {
    expect(refFromRemoteUrl("ssh://git@github.com/owner/repo.git")).toEqual({
      owner: "owner",
      repo: "repo",
    })
    expect(refFromRemoteUrl("git@github.com:owner/repo.git")).toEqual({
      owner: "owner",
      repo: "repo",
    })
  })

  it("never guesses from non-GitHub or malformed remotes", () => {
    expect(refFromRemoteUrl("https://gitlab.com/group/project.git")).toBeNull()
    expect(refFromRemoteUrl("git@gitlab.com:group/project.git")).toBeNull()
    expect(refFromRemoteUrl("ssh://git@gitlab.example.com:22/group/project.git")).toBeNull()
    expect(refFromRemoteUrl("https://github.com/group/project/extra")).toBeNull()
    expect(refFromRemoteUrl("not a remote")).toBeNull()
    expect(refFromRemoteUrl("")).toBeNull()
  })

  it("accepts the GitHub port form and rejects local paths", () => {
    expect(refFromRemoteUrl("ssh://git@github.com:22/owner/repo.git")).toEqual({
      owner: "owner",
      repo: "repo",
    })
    expect(refFromRemoteUrl("C:\\Users\\dev\\projects\\repo")).toBeNull()
  })
})

describe("detectLocalRepository", () => {
  it("returns null outside a git repository", async () => {
    expect(await detectLocalRepository(home)).toBeNull()
  })

  it("returns null for a repository without a GitHub origin", async () => {
    const repo = join(home, "no-origin")
    mkdirSync(repo)
    git(repo, "init", "--initial-branch=main")
    expect(await detectLocalRepository(repo)).toBeNull()
  })

  it("resolves the repository from the terminal's origin remote", async () => {
    const repo = join(home, "with-origin")
    mkdirSync(repo)
    git(repo, "init", "--initial-branch=main")
    git(repo, "remote", "add", "origin", "https://github.com/hasan19524/OssPilot.git")
    expect(await detectLocalRepository(repo)).toEqual({
      owner: "hasan19524",
      repo: "OssPilot",
    })
  })
})
