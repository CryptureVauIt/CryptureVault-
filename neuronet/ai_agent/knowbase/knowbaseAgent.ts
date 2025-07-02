import { EventEmitter } from "events"
import { v4 as uuidv4 } from "uuid"
import Fuse from "fuse.js"
import {
  KnowledgeEntry,
  knowledgeEntrySchema,
  AddEntryParams,
  addEntryParamsSchema,
  UpdateEntryParams,
  updateEntryParamsSchema,
  QueryParams,
  queryParamsSchema,
  QueryResult,
} from "./defineKnowbaseShape"

/**
 * In-memory Knowledge Base Agent for storing and searching entries
 */
export class KnowbaseAgent extends EventEmitter {
  private entries: Map<string, KnowledgeEntry> = new Map()
  private fuse: Fuse<KnowledgeEntry>

  constructor() {
    super()
    // Initialize Fuse for fuzzy search
    this.fuse = new Fuse([], {
      keys: ["title", "content", "tags"],
      threshold: 0.3,
    })
  }

  /**
   * Add a new knowledge entry
   */
  public addEntry(raw: unknown): KnowledgeEntry {
    const params: AddEntryParams = addEntryParamsSchema.parse(raw)
    const now = Date.now()
    const entry: KnowledgeEntry = {
      id: uuidv4(),
      title: params.title,
      content: params.content,
      tags: params.tags || [],
      createdAt: now,
      updatedAt: now,
    }
    knowledgeEntrySchema.parse(entry)
    this.entries.set(entry.id, entry)
    this.refreshIndex()
    this.emit("entryAdded", entry)
    return entry
  }

  /**
   * Update an existing entry
   */
  public updateEntry(raw: unknown): KnowledgeEntry {
    const params: UpdateEntryParams = updateEntryParamsSchema.parse(raw)
    const existing = this.entries.get(params.id)
    if (!existing) {
      throw new Error(`No entry found with id ${params.id}`)
    }
    const updated: KnowledgeEntry = {
      ...existing,
      title: params.title ?? existing.title,
      content: params.content ?? existing.content,
      tags: params.tags ?? existing.tags,
      updatedAt: Date.now(),
    }
    knowledgeEntrySchema.parse(updated)
    this.entries.set(updated.id, updated)
    this.refreshIndex()
    this.emit("entryUpdated", updated)
    return updated
  }

  /**
   * Remove an entry by id
   */
  public removeEntry(id: string): void {
    if (this.entries.delete(id)) {
      this.refreshIndex()
      this.emit("entryRemoved", id)
    } else {
      throw new Error(`No entry found with id ${id}`)
    }
  }

  /**
   * Query entries by search term and/or tags
   */
  public query(raw: unknown): QueryResult {
    const params: QueryParams = queryParamsSchema.parse(raw)
    let results: KnowledgeEntry[] = Array.from(this.entries.values())

    // filter by tags if provided
    if (params.tags && params.tags.length > 0) {
      results = results.filter((e) =>
        params.tags!.every((tag) => e.tags.includes(tag))
      )
    }

    // perform fuzzy search if search term provided
    if (params.search) {
      const fuseRes = this.fuse.search(params.search)
      results = fuseRes.map((r) => r.item)
    }

    this.emit("queried", params, results.length)
    return { entries: results }
  }

  /**
   * Retrieve a single entry by id
   */
  public getEntry(id: string): KnowledgeEntry {
    const entry = this.entries.get(id)
    if (!entry) {
      throw new Error(`No entry found with id ${id}`)
    }
    return entry
  }

  /**
   * Rebuild the Fuse index after any mutation
   */
  private refreshIndex(): void {
    const list = Array.from(this.entries.values())
    this.fuse.setCollection(list)
  }
}

