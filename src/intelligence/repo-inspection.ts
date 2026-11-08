/**
 * Repository Deep Inspection.
 *
 * Generates a Repository Understanding Report from an actual local checkout:
 * architecture signals, source structure, dependency manifests, test
 * infrastructure, CI workflows, recent commits, and historical PRs touching
 * the relevant area.
 *
 * Reads only. Executes nothing. All repository content is untrusted input.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { extname, join, relative } from "node:path"
import { git } from "../workspace/manager"

export interface DependencyManifest {
  path: string
  ecosystem: string
  name: string | null
  scripts: string[]
  dependencies: string[]
  devDependencies: string[]
}

export interface TestInfrastructure {
  frameworks: string[]
  testDirs: string[]
  testCommand: string | null
  configFiles: string[]
}

export interface CiWorkflow {
  path: string
  name: string | null
  triggers: string[]
}

export interface RepoStructure {
  entryPoints: string[]
  topLevelDirs: string[]
  sourceRoots: string[]
  configFiles: string[]
  fileCount: number
  languages: string[]
}

export interface RepoInspectionReport {
  repoPath: string
  structure: RepoStructure
  manifests: DependencyManifest[]
  tests: TestInfrastructure
  ci: CiWorkflow[]
  recentCommits: string[]
  docs: string[]
  evidence: string[]
  limitations: string[]
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".venv",
  "venv",
  "__pycache__",
  "target",
  "out",
  ".cache",
  ".turbo",
])

const MANIFEST_TYPES: Array<{ file: string; ecosystem: string }> = [
  { file: "package.json", ecosystem: "npm" },
  { file: "bun.lock", ecosystem: "bun" },
  { file: "pyproject.toml", ecosystem: "python" },
  { file: "requirements.txt", ecosystem: "python" },
  { file: "Cargo.toml", ecosystem: "rust" },
  { file: "go.mod", ecosystem: "go" },
  { file: "Gemfile", ecosystem: "ruby" },
  { file: "composer.json", ecosystem: "php" },
]

const TEST_FRAMEWORKS: Array<{ name: string; detect: RegExp }> = [
  { name: "vitest", detect: /\bvitest\b/ },
  { name: "jest", detect: /\bjest\b/ },
  { name: "mocha", detect: /\bmocha\b/ },
  { name: "pytest", detect: /\bpytest\b/ },
  { name: "unittest", detect: /\bunittest\b/ },
  { name: "cargo test", detect: /\bcargo test\b/ },
  { name: "go test", detect: /\bgo test\b/ },
]

function safeRead(path: string, maxBytes = 100000): string | null {
  try {
    if (!existsSync(path)) return null
    const content = readFileSync(path, "utf8")
    return content.length > maxBytes ? `${content.slice(0, maxBytes)}\n... (truncated)` : content
  } catch {
    return null
  }
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/** Walk the tree collecting structure data, skipping vendor/build dirs. */
function walkStructure(
  repoPath: string,
  maxFiles = 5000,
): {
  topLevelDirs: string[]
  fileCount: number
  languages: Set<string>
  sourceRoots: string[]
  configFiles: string[]
  entryPoints: string[]
} {
  const topLevelDirs: string[] = []
  const languages = new Set<string>()
  const sourceRoots: string[] = []
  const configFiles: string[] = []
  const entryPoints: string[] = []
  let fileCount = 0

  const stack: Array<{ path: string; depth: number }> = [{ path: repoPath, depth: 0 }]
  while (stack.length > 0 && fileCount < maxFiles) {
    const current = stack.pop()
    if (!current) break
    let entries: import("node:fs").Dirent[]
    try {
      entries = readdirSync(current.path, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const entryName = String(entry.name)
      if (entryName.startsWith(".") && entryName !== ".github") {
        if (!entryName.endsWith("rc") && !entryName.endsWith("rc.json")) continue
      }
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entryName)) continue
        if (current.depth === 0) {
          topLevelDirs.push(entryName)
          if (
            entryName === "src" ||
            entryName === "lib" ||
            entryName === "app" ||
            entryName === "pkg"
          ) {
            sourceRoots.push(entryName)
          }
        }
        stack.push({ path: join(current.path, entryName), depth: current.depth + 1 })
      } else {
        fileCount++
        const ext = extname(entryName)
        if (ext) languages.add(ext.slice(1))
        if (
          entryName === "package.json" ||
          entryName === "tsconfig.json" ||
          entryName === "index.ts" ||
          entryName === "index.js" ||
          entryName === "main.py" ||
          entryName === "main.go" ||
          entryName === "lib.rs" ||
          entryName === "mod.rs" ||
          entryName.endsWith(".config.js") ||
          entryName.endsWith(".config.ts")
        ) {
          configFiles.push(relative(repoPath, join(current.path, entryName)))
        }
        if (
          entryName === "index.ts" ||
          entryName === "index.js" ||
          entryName === "main.py" ||
          entryName === "lib.rs" ||
          entryName === "main.go"
        ) {
          if (current.depth <= 1)
            entryPoints.push(relative(repoPath, join(current.path, entryName)))
        }
      }
    }
  }

  return { topLevelDirs, fileCount, languages, sourceRoots, configFiles, entryPoints }
}

/** Parse a package.json manifest. */
function parsePackageJson(repoPath: string, rel: string): DependencyManifest | null {
  const raw = safeRead(join(repoPath, rel))
  if (!raw) return null
  try {
    const pkg = JSON.parse(raw) as {
      name?: string
      scripts?: Record<string, string>
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    return {
      path: rel,
      ecosystem: "npm",
      name: pkg.name ?? null,
      scripts: Object.keys(pkg.scripts ?? {}),
      dependencies: Object.keys(pkg.dependencies ?? {}),
      devDependencies: Object.keys(pkg.devDependencies ?? {}),
    }
  } catch {
    return null
  }
}

/** Parse a pyproject.toml manifest (lightweight). */
function parsePyProject(repoPath: string, rel: string): DependencyManifest | null {
  const raw = safeRead(join(repoPath, rel))
  if (!raw) return null
  const nameMatch = raw.match(/^\s*name\s*=\s*["']([^"']+)["']/m)
  const deps = raw.match(/^\s*["']?([A-Za-z0-9_.\-[\]]+)["']?\s*[><=]/gm)
  return {
    path: rel,
    ecosystem: "python",
    name: nameMatch?.[1] ?? null,
    scripts: raw.match(/^\s*\[tool\.poetry\.scripts\]/) ? ["poetry"] : [],
    dependencies: deps ? deps.map((d) => d.trim().replace(/["']/g, "")) : [],
    devDependencies: [],
  }
}

/** Detect test infrastructure. */
function detectTests(repoPath: string, manifests: DependencyManifest[]): TestInfrastructure {
  const frameworks = new Set<string>()
  const testDirs: string[] = []
  const configFiles: string[] = []
  let testCommand: string | null = null

  const allDeps = manifests.flatMap((m) => [...m.dependencies, ...m.devDependencies])
  const depText = allDeps.join(" ")
  for (const fw of TEST_FRAMEWORKS) {
    if (fw.detect.test(depText)) frameworks.add(fw.name)
  }

  const manifest = manifests.find((m) => m.ecosystem === "npm")
  if (manifest) {
    if (manifest.scripts.includes("test")) testCommand = "npm test"
    else if (manifest.scripts.includes("test:unit")) testCommand = "npm run test:unit"
    else if (manifest.scripts.includes("vitest")) testCommand = "npx vitest"
  }
  if (testCommand === null && frameworks.has("pytest")) testCommand = "pytest"

  for (const dir of ["test", "tests", "__tests__", "spec", "specs"]) {
    if (isDir(join(repoPath, dir))) testDirs.push(dir)
  }
  for (const cfg of [
    "vitest.config.ts",
    "jest.config.js",
    "jest.config.ts",
    "pytest.ini",
    "pyproject.toml",
    "setup.cfg",
  ]) {
    if (existsSync(join(repoPath, cfg))) configFiles.push(cfg)
  }

  return { frameworks: Array.from(frameworks), testDirs, testCommand, configFiles }
}

/** Detect CI workflows. */
function detectCi(repoPath: string): CiWorkflow[] {
  const workflows: CiWorkflow[] = []
  const wfDir = join(repoPath, ".github", "workflows")
  if (!isDir(wfDir)) return workflows
  try {
    for (const entry of readdirSync(wfDir)) {
      if (!entry.endsWith(".yml") && !entry.endsWith(".yaml")) continue
      const raw = safeRead(join(wfDir, entry), 20000)
      if (!raw) continue
      const nameMatch = raw.match(/^name:\s*(.+)$/m)
      const triggers: string[] = []
      if (/^on:/m.test(raw)) {
        if (/push:/m.test(raw)) triggers.push("push")
        if (/pull_request:/m.test(raw)) triggers.push("pull_request")
        if (/schedule:/m.test(raw)) triggers.push("schedule")
      }
      workflows.push({
        path: `.github/workflows/${entry}`,
        name: nameMatch?.[1]?.trim() ?? null,
        triggers,
      })
    }
  } catch {
    // ignore
  }
  return workflows
}

/** Gather recent commits. */
async function recentCommits(repoPath: string, count = 10): Promise<string[]> {
  const result = await git(["log", "--oneline", `-${count}`], repoPath)
  if (result.exitCode !== 0) return []
  return result.stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}

/** Find local documentation files. */
function findDocs(repoPath: string): string[] {
  const docs: string[] = []
  const candidates = [
    "README.md",
    "README",
    "CONTRIBUTING.md",
    "CODE_OF_CONDUCT.md",
    "SECURITY.md",
    "ARCHITECTURE.md",
    "AGENTS.md",
    "CLAUDE.md",
    "CHANGELOG.md",
    "LICENSE",
    "docs/ARCHITECTURE.md",
    "docs/CONTRIBUTING.md",
  ]
  for (const c of candidates) {
    if (existsSync(join(repoPath, c))) docs.push(c)
  }
  return docs
}

export async function inspectRepository(
  repoPath: string,
  options: { commitCount?: number } = {},
): Promise<RepoInspectionReport> {
  const evidence: string[] = []
  const limitations: string[] = []

  const structure = walkStructure(repoPath)
  if (structure.topLevelDirs.length > 0)
    evidence.push(`Top-level directories: ${structure.topLevelDirs.slice(0, 12).join(", ")}`)
  if (structure.entryPoints.length > 0)
    evidence.push(`Likely entry points: ${structure.entryPoints.slice(0, 8).join(", ")}`)
  evidence.push(`${structure.fileCount} files scanned (vendor/build dirs excluded)`)

  // Manifests
  const manifests: DependencyManifest[] = []
  for (const mt of MANIFEST_TYPES) {
    if (!existsSync(join(repoPath, mt.file))) continue
    const parsed =
      mt.ecosystem === "npm"
        ? parsePackageJson(repoPath, mt.file)
        : mt.ecosystem === "python" && mt.file === "pyproject.toml"
          ? parsePyProject(repoPath, mt.file)
          : {
              path: mt.file,
              ecosystem: mt.ecosystem,
              name: null,
              scripts: [],
              dependencies: [],
              devDependencies: [],
            }
    if (parsed) {
      manifests.push(parsed)
      evidence.push(`${mt.ecosystem} manifest: ${mt.file}${parsed.name ? ` (${parsed.name})` : ""}`)
    }
  }
  if (manifests.length === 0) limitations.push("No recognised dependency manifest found.")

  const tests = detectTests(repoPath, manifests)
  if (tests.frameworks.length > 0)
    evidence.push(`Test frameworks detected: ${tests.frameworks.join(", ")}`)
  else limitations.push("No test framework detected from manifests.")
  if (!tests.testCommand)
    limitations.push(
      "Test command could not be determined — verification will require manual specification.",
    )

  const ci = detectCi(repoPath)
  if (ci.length > 0) evidence.push(`CI workflows: ${ci.map((w) => w.name ?? w.path).join(", ")}`)
  else limitations.push("No GitHub Actions workflows found — CI enforcement unknown.")

  const commits = await recentCommits(repoPath, options.commitCount ?? 10)
  if (commits.length > 0) evidence.push(`Recent commits: ${commits.length} retrieved`)

  const docs = findDocs(repoPath)

  limitations.push(
    "Architecture understanding is heuristic (structure + manifests + CI signals). It is not a substitute for reading the code.",
  )
  limitations.push("File scanning is capped; very large repositories may be partially scanned.")

  return {
    repoPath,
    structure: {
      entryPoints: structure.entryPoints,
      topLevelDirs: structure.topLevelDirs,
      sourceRoots: structure.sourceRoots,
      configFiles: structure.configFiles,
      fileCount: structure.fileCount,
      languages: Array.from(structure.languages).sort(),
    },
    manifests,
    tests,
    ci,
    recentCommits: commits,
    docs,
    evidence,
    limitations,
  }
}

export function formatRepoInspection(report: RepoInspectionReport): string {
  const lines: string[] = []
  lines.push(`\nREPOSITORY UNDERSTANDING — ${report.repoPath}`)
  lines.push("")
  lines.push("STRUCTURE:")
  lines.push(`  Top-level dirs: ${report.structure.topLevelDirs.join(", ") || "none"}`)
  lines.push(`  Source roots: ${report.structure.sourceRoots.join(", ") || "not detected"}`)
  lines.push(`  Entry points: ${report.structure.entryPoints.join(", ") || "not detected"}`)
  lines.push(`  Files scanned: ${report.structure.fileCount}`)
  lines.push(`  Languages: ${report.structure.languages.join(", ") || "none"}`)
  lines.push("")
  lines.push("DEPENDENCY MANIFESTS:")
  if (report.manifests.length === 0) lines.push("  none found")
  for (const m of report.manifests) {
    lines.push(`  ${m.path} (${m.ecosystem})${m.name ? ` — ${m.name}` : ""}`)
    if (m.dependencies.length > 0)
      lines.push(
        `    deps: ${m.dependencies.slice(0, 20).join(", ")}${m.dependencies.length > 20 ? " …" : ""}`,
      )
    if (m.scripts.length > 0) lines.push(`    scripts: ${m.scripts.slice(0, 12).join(", ")}`)
  }
  lines.push("")
  lines.push("TESTS:")
  lines.push(`  Frameworks: ${report.tests.frameworks.join(", ") || "none detected"}`)
  lines.push(`  Test dirs: ${report.tests.testDirs.join(", ") || "none detected"}`)
  lines.push(
    `  Test command: ${report.tests.testCommand ?? "UNKNOWN — must be specified manually"}`,
  )
  lines.push("")
  lines.push("CI WORKFLOWS:")
  if (report.ci.length === 0) lines.push("  none found")
  for (const w of report.ci)
    lines.push(`  ${w.path} — ${w.name ?? "unnamed"} [${w.triggers.join(", ")}]`)
  lines.push("")
  lines.push("DOCUMENTATION PRESENT:")
  lines.push(`  ${report.docs.join(", ") || "none found"}`)
  lines.push("")
  if (report.recentCommits.length > 0) {
    lines.push(`RECENT COMMITS (last ${report.recentCommits.length}):`)
    for (const c of report.recentCommits) lines.push(`  ${c}`)
    lines.push("")
  }
  lines.push("EVIDENCE:")
  for (const e of report.evidence) lines.push(`  - ${e}`)
  lines.push("")
  lines.push("LIMITATIONS:")
  for (const l of report.limitations) lines.push(`  - ${l}`)
  return lines.join("\n")
}
