import { z } from "zod"

/**
 * Schema for validating a shift log query request
 */
export const shiftLogQuerySchema = z.object({
  /**
   * ID of the user whose shift logs are requested
   */
  userId: z
    .string()
    .uuid("userId must be a valid UUID"),

  /**
   * Date range for filtering shift logs
   */
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
    .refine(
      ({ from, to }) => from <= to,
      "from date must be before or equal to to date"
    ),

  /**
   * Pagination options
   */
  pagination: z
    .object({
      page: z.number().int().positive().default(1),
      pageSize: z.number().int().positive().max(100).default(25),
    })
    .optional(),

  /**
   * Optional filter for specific tasks performed during the shift
   */
  taskFilter: z
    .string()
    .min(1)
    .max(50)
    .optional(),
})

export type ShiftLogQuery = z.infer<typeof shiftLogQuerySchema>

/**
 * Parses and validates user input into a ShiftLogQuery
 */
export function parseShiftLogQuery(input: unknown): ShiftLogQuery {
  const result = shiftLogQuerySchema.safeParse(input)
  if (!result.success) {
    const messages = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ")
    throw new Error(`ShiftLogQuery validation error: ${messages}`)
  }
  return result.data
}

/**
 * Creates an opaque page token from page and pageSize
 */
export function encodePageToken(page: number, pageSize: number): string {
  return Buffer.from(JSON.stringify({ page, pageSize })).toString("base64")
}

/**
 * Decodes an opaque page token back into page and pageSize
 */
export function decodePageToken(token: string): { page: number; pageSize: number } {
  try {
    const decoded = Buffer.from(token, "base64").toString()
    const obj = JSON.parse(decoded)
    if (
      typeof obj.page !== "number" ||
      typeof obj.pageSize !== "number"
    ) {
      throw new Error("invalid structure")
    }
    return { page: obj.page, pageSize: obj.pageSize }
  } catch {
    throw new Error("Invalid page token provided")
  }
}

/**
 * Represents a single shift log entry
 */
export interface ShiftLog {
  id: string
  userId: string
  shiftStart: Date
  shiftEnd: Date
  tasksPerformed: string[]
  notes?: string
}
