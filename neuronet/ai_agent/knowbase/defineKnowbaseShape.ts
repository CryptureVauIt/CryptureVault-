import { z } from "zod"

/**
 * Represents a single knowledge base entry
 */
export const knowledgeEntrySchema = z.object({
  /** Unique identifier for the entry */
  id: z.string().uuid(),
  /** Title or name of the concept */
  title: z.string().min(1),
  /** Detailed content or description */
  content: z.string().min(1),
  /** Tags for categorization and search */
  tags: z.array(z.string()).optional(),
  /** Timestamp when the entry was created (ms since epoch) */
  createdAt: z.number().int().positive(),
  /** Timestamp when entry was last updated */
  updatedAt: z.number().int().positive(),
})

export type KnowledgeEntry = z.infer<typeof knowledgeEntrySchema>

/**
 * Parameters for adding a new entry
 */
export const addEntryParamsSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  tags: z.array(z.string()).optional(),
})

export type AddEntryParams = z.infer<typeof addEntryParamsSchema>

/**
 * Parameters for updating an existing entry
 */
export const updateEntryParamsSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
})

export type UpdateEntryParams = z.infer<typeof updateEntryParamsSchema>

/**
 * Parameters for querying entries
 */
export const queryParamsSchema = z.object({
  /** Search term for title/content */
  search: z.string().min(1).optional(),
  /** Filter by one or more tags */
  tags: z.array(z.string()).optional(),
})

export type QueryParams = z.infer<typeof queryParamsSchema>

/**
 * Results for a query operation
 */
export interface QueryResult {
  entries: KnowledgeEntry[]
}
