import { z } from "zod"

/** Generic element schema for any data structure operation */
export const elementSchema = z.unknown()

/** Stack operations */
export const stackPushSchema = z.object({
  value: elementSchema,
})

export const stackPopSchema = z.object({})

export type StackPushParams = z.infer<typeof stackPushSchema>
export type StackPopParams = z.infer<typeof stackPopSchema>

/** Queue operations */
export const queueEnqueueSchema = z.object({
  value: elementSchema,
})

export const queueDequeueSchema = z.object({})

export type QueueEnqueueParams = z.infer<typeof queueEnqueueSchema>
export type QueueDequeueParams = z.infer<typeof queueDequeueSchema>

/** LinkedList operations */
export const listInsertSchema = z.object({
  index: z.number().int().min(0),
  value: elementSchema,
})

export const listRemoveSchema = z.object({
  index: z.number().int().min(0),
})

export const listGetSchema = z.object({
  index: z.number().int().min(0),
})

export type ListInsertParams = z.infer<typeof listInsertSchema>
export type ListRemoveParams = z.infer<typeof listRemoveSchema>
export type ListGetParams = z.infer<typeof listGetSchema>

/** Results */
export interface OperationResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}
