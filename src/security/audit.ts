import { openDatabase } from "../storage/database/client"
import { auditLog } from "../storage/database/schema"

export function writeAudit(entry: {
  action: string
  resourceType?: string
  resourceId?: string
  actor?: string
  detail?: unknown
}): void {
  const db = openDatabase()
  db.insert(auditLog)
    .values({
      action: entry.action,
      resourceType: entry.resourceType ?? null,
      resourceId: entry.resourceId ?? null,
      actor: entry.actor ?? "system",
      detail: entry.detail ?? null,
    })
    .run()
  db.close()
}
