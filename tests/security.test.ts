import { describe, expect, it } from "vitest"
import { parseGitHubRef } from "../src/integrations/github/ref"
import { decryptSecret, encryptSecret } from "../src/security/crypto"
import { classifyCommand } from "../src/security/policy"
import {
  assertPathContainment,
  validateBranch,
  validateContributionId,
  validateOwner,
  validateRepo,
} from "../src/workspace/manager"

describe("security: git argument validation", () => {
  it("rejects owner starting with dash", () => {
    expect(() => validateOwner("--evil")).toThrow()
  })
  it("rejects owner with path traversal", () => {
    expect(() => validateOwner("../evil")).toThrow()
  })
  it("accepts valid owner", () => {
    expect(() => validateOwner("octocat")).not.toThrow()
  })
  it("rejects repo with special chars", () => {
    expect(() => validateRepo("repo;rm -rf /")).toThrow()
  })
  it("accepts valid repo", () => {
    expect(() => validateRepo("hello-world")).not.toThrow()
  })
  it("rejects branch with shell metacharacters", () => {
    expect(() => validateBranch("main; rm -rf /")).toThrow()
  })
  it("accepts valid branch", () => {
    expect(() => validateBranch("feature/fix-bug")).not.toThrow()
  })
  it("rejects invalid contribution ID", () => {
    expect(() => validateContributionId("../../etc/passwd")).toThrow()
    expect(() => validateContributionId("contrib-123-abc")).toThrow()
  })
  it("accepts valid contribution ID", () => {
    expect(() => validateContributionId("contrib-1794099390000-462c9206")).not.toThrow()
  })
})

describe("security: path containment", () => {
  it("allows paths within base dir", () => {
    expect(() =>
      assertPathContainment("/tmp/worktrees", "/tmp/worktrees/contrib-123"),
    ).not.toThrow()
  })
  it("rejects path traversal", () => {
    expect(() =>
      assertPathContainment("/tmp/worktrees", "/tmp/worktrees/../../etc/passwd"),
    ).toThrow()
  })
  it("rejects absolute path outside base", () => {
    expect(() => assertPathContainment("/tmp/worktrees", "/etc/passwd")).toThrow()
  })
})

describe("security: GitHub ref validation", () => {
  it("rejects flag injection", () => {
    expect(parseGitHubRef("--evil/repo#1")).toBeNull()
  })
  it("rejects path traversal", () => {
    expect(parseGitHubRef("../evil/repo#1")).toBeNull()
  })
  it("rejects invalid issue number", () => {
    expect(parseGitHubRef("owner/repo#0")).toBeNull()
    expect(parseGitHubRef("owner/repo#abc")).toBeNull()
  })
  it("accepts valid reference", () => {
    const ref = parseGitHubRef("octocat/Hello-World#123")
    expect(ref).not.toBeNull()
    expect(ref?.owner).toBe("octocat")
    expect(ref?.repo).toBe("Hello-World")
    expect(ref?.issueNumber).toBe(123)
  })
  it("rejects too-long owner", () => {
    expect(parseGitHubRef(`${"a".repeat(40)}/repo#1`)).toBeNull()
  })
  it("rejects too-long repo", () => {
    expect(parseGitHubRef(`owner/${"a".repeat(101)}#1`)).toBeNull()
  })
})

describe("security: command policy", () => {
  it("denies dangerous commands", () => {
    expect(classifyCommand("rm -rf /")).toBe("denied")
    expect(classifyCommand("rm -rf ~")).toBe("denied")
    expect(classifyCommand("mkfs.ext4 /dev/sda")).toBe("denied")
  })
  it("requires approval for destructive git", () => {
    expect(classifyCommand("git push origin main")).toBe("approval")
    expect(classifyCommand("git reset --hard HEAD")).toBe("approval")
    expect(classifyCommand("git clean -fd")).toBe("approval")
  })
  it("allows safe commands", () => {
    expect(classifyCommand("git status")).toBe("allowed")
    expect(classifyCommand("git diff")).toBe("allowed")
    expect(classifyCommand("git log")).toBe("allowed")
  })
  it("defaults unknown to approval", () => {
    expect(classifyCommand("some-unknown-command")).toBe("approval")
  })
})

describe("security: credential encryption", () => {
  it("round-trips with env key", async () => {
    process.env.OSSPILOT_CREDENTIAL_KEY = "a".repeat(32)
    const plaintext = "secret-token-123"
    const encrypted = await encryptSecret(plaintext)
    const decrypted = await decryptSecret(encrypted)
    expect(decrypted).toBe(plaintext)
    delete process.env.OSSPILOT_CREDENTIAL_KEY
  })
  it("fails decryption with wrong key", async () => {
    process.env.OSSPILOT_CREDENTIAL_KEY = "a".repeat(32)
    const encrypted = await encryptSecret("secret")
    process.env.OSSPILOT_CREDENTIAL_KEY = "b".repeat(32)
    await expect(decryptSecret(encrypted)).rejects.toThrow()
    delete process.env.OSSPILOT_CREDENTIAL_KEY
  })
})
