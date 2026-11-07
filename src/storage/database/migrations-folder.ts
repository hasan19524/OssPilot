/**
 * Resolves the folder containing generated Drizzle migrations.
 *
 * - Source layout: src/storage/migrations
 * - Compiled/bundled layout: dist/storage/migrations (same relative position)
 * - Overridable with OSSPILOT_MIGRATIONS_DIR (packaging).
 */

import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

export function migrationsFolder(): string {
  if (process.env.OSSPILOT_MIGRATIONS_DIR) return process.env.OSSPILOT_MIGRATIONS_DIR
  const here = dirname(fileURLToPath(import.meta.url))
  return join(here, "..", "migrations")
}
