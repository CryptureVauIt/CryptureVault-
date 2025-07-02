import { parseShiftLogQuery, ShiftLogQuery, ShiftLog } from "./defineShiftLogShape"
import type { DatabaseClient } from "./databaseClient" // assume this is provided

/**
 * Retrieves shift logs for a given query
 */
export async function retrieveShiftLogs(
  rawInput: unknown,
  db: DatabaseClient
): Promise<{ logs: ShiftLog[]; nextPageToken?: string }> {
  const { userId, dateRange, pagination, taskFilter } = parseShiftLogQuery(rawInput)

  const filters: Record<string, unknown> = {
    userId,
    shiftStart_gte: dateRange.from.toISOString(),
    shiftEnd_lte: dateRange.to.toISOString(),
  }

  if (taskFilter) {
    filters.tasksPerformed_contains = taskFilter
  }

  // determine pagination
  const page = pagination?.page ?? 1
  const pageSize = pagination?.pageSize ?? 25
  const offset = (page - 1) * pageSize

  // perform the database query
  const rows = await db.query("shift_logs", {
    filters,
    limit: pageSize + 1,
    offset,
    orderBy: { shiftStart: "desc" },
  })

  // map raw rows into ShiftLog objects
  const mapped: ShiftLog[] = rows.slice(0, pageSize).map((r: any) => ({
    id: r.id,
    userId: r.user_id,
    shiftStart: new Date(r.shift_start),
    shiftEnd: new Date(r.shift_end),
    tasksPerformed: Array.isArray(r.tasks_performed) ? r.tasks_performed : [],
    notes: typeof r.notes === "string" ? r.notes : undefined,
  }))

  // prepare nextPageToken if more rows exist
  let nextPageToken: string | undefined
  if (rows.length > pageSize) {
    nextPageToken = encodePageToken(page + 1, pageSize)
  }

  return { logs: mapped, nextPageToken }
}

