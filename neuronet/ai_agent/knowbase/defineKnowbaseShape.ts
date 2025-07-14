import { z } from "zod"

/**
 * Represents a single knowledge base entry
 */
export const knowledgeEntrySchema = z.object({
  /** Unique identifier for the entry */
  id: z.string().uuid(),
  /** Title or name of the concept (max 100 chars) */
  title: z.string().min(1).max(100),
  /** Detailed content or description (max 5000 chars) */
  content: z.string().min(1).max(5000),
  /** Tags for categorization and search */
  tags: z.array(z.string().min(1).max(30)).optional(),
  /** Who created the entry */
  createdBy: z.string().uuid(),
  /** When the entry was created */
  createdAt: z.date(),
  /** Who last updated the entry */
  updatedBy: z.string().uuid(),
  /** When the entry was last updated */
  updatedAt: z.date(),
})

export type KnowledgeEntry = z.infer<typeof knowledgeEntrySchema>

/**
 * Parameters for adding a new entry
 */
export const addEntryParamsSchema = z.object({
  title: z.string().min(1).max(100),
  content: z.string().min(1).max(5000),
  tags: z.array(z.string().min(1).max(30)).optional(),
})

export type AddEntryParams = z.infer<typeof addEntryParamsSchema>

/**
 * Parameters for updating an existing entry
 */
export const updateEntryParamsSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(100).optional(),
  content: z.string().min(1).max(5000).optional(),
  tags: z.array(z.string().min(1).max(30)).optional(),
})

export type UpdateEntryParams = z.infer<typeof updateEntryParamsSchema>

/**
 * Parameters for querying entries
 */
export const queryParamsSchema = z.object({
  /** Search term for title/content */
  search: z.string().min(1).optional(),
  /** Filter by one or more tags */
  tags: z.array(z.string().min(1).max(30)).optional(),
  /** Only entries created by a specific user */
  createdBy: z.string().uuid().optional(),
})

export type QueryParams = z.infer<typeof queryParamsSchema>

/**
 * Results for a query operation
 */
export interface QueryResult {
  entries: KnowledgeEntry[]
}
