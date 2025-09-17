import { z } from "zod"


const shiftLogQueryRawSchema = z
  .object({
    userId: z.string().uuid("userId must be a valid UUID"),
    dateRange: z
      .object({
        from: z
          .string()
          .refine((s) => !isNaN(Date.parse(s)), "invalid from date")
          .transform((s) => new Date(s)),
        to: z
          .string()
          .refine((s) => !isNaN(Date.parse(s)), "invalid to date")
          .transform((s) => new Date(s)),
      })
      .refine(({ from, to }) => from <= to, {
        message: "from date must be before or equal to to date",
        path: ["dateRange"],
      }),
    pagination: z
      .object({
        page: z.number().int().positive().default(1),
        pageSize: z.number().int().positive().max(100).default(25),
      })
      .optional(),
    pageToken: z.string().optional(),
    taskFilter: z.string().min(1).max(50).optional(),
  })
  .refine(
    (data) => !(data.pageToken && data.pagination),
    "Provide either pageToken or pagination, not both"
  )

export type ShiftLogQueryRaw = z.infer<typeof shiftLogQueryRawSchema>

export interface ShiftLogQuery {
  userId: string
  dateRange: { from: Date; to: Date }
  page: number
  pageSize: number
  taskFilter?: string
}

export function parseShiftLogQuery(input: unknown): ShiftLogQuery {
  const result = shiftLogQueryRawSchema.safeParse(input)
  if (!result.success) {
    const messages = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ")
    throw new Error(`ShiftLogQuery validation error: ${messages}`)
  }
  const { userId, dateRange, pagination, pageToken, taskFilter } = result.data

  let page: number
  let pageSize: number

  if (pageToken) {
    ({ page, pageSize } = decodePageToken(pageToken))
  } else {
    const pag = pagination ?? { page: 1, pageSize: 25 }
    page = pag.page
    pageSize = pag.pageSize
  }

  return { userId, dateRange, page, pageSize, taskFilter }
}


export function encodePageToken(page: number, pageSize: number): string {
  return Buffer.from(JSON.stringify({ page, pageSize })).toString("base64")
}


export function decodePageToken(token: string): { page: number; pageSize: number } {
  try {
    const decoded = Buffer.from(token, "base64").toString("utf-8")
    const obj = JSON.parse(decoded)
    if (
      typeof obj.page !== "number" ||
      typeof obj.pageSize !== "number" ||
      obj.page < 1 ||
      obj.pageSize < 1
    ) {
      throw new Error("invalid structure")
    }
    return { page: obj.page, pageSize: obj.pageSize }
  } catch {
    throw new Error("Invalid page token provided")
  }
}


export interface ShiftLog {
  id: string
  userId: string
  shiftStart: Date
  shiftEnd: Date
  tasksPerformed: string[]
  notes?: string
}
