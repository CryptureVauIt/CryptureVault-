import { EventEmitter } from "events"
import {
  stackPushSchema,
  stackPopSchema,
  StackPushParams,
  StackPopParams,
  queueEnqueueSchema,
  queueDequeueSchema,
  QueueEnqueueParams,
  QueueDequeueParams,
  listInsertSchema,
  listRemoveSchema,
  listGetSchema,
  ListInsertParams,
  ListRemoveParams,
  ListGetParams,
  OperationResult,
} from "./defineDataStructShape"

/** Stack<T> implementation */
export class StackService<T> extends EventEmitter {
  private items: T[] = []

  /** Push value onto stack */
  public push(raw: unknown): OperationResult {
    try {
      const { value }: StackPushParams = stackPushSchema.parse(raw)
      this.items.push(value as T)
      this.emit("pushed", value)
      return { success: true, data: this.size() }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }

  /** Pop value from stack */
  public pop(raw: unknown): OperationResult {
    try {
      stackPopSchema.parse(raw)
      if (this.items.length === 0) {
        return { success: false, error: "Stack is empty" }
      }
      const value = this.items.pop()!
      this.emit("popped", value)
      return { success: true, data: value }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }

  /** Peek at top element */
  public peek(): OperationResult {
    if (this.items.length === 0) {
      return { success: false, error: "Stack is empty" }
    }
    return { success: true, data: this.items[this.items.length - 1] }
  }

  /** Get current stack size */
  public size(): number {
    return this.items.length
  }
}

/** Queue<T> implementation */
export class QueueService<T> extends EventEmitter {
  private items: T[] = []

  /** Enqueue value */
  public enqueue(raw: unknown): OperationResult {
    try {
      const { value }: QueueEnqueueParams = queueEnqueueSchema.parse(raw)
      this.items.push(value as T)
      this.emit("enqueued", value)
      return { success: true, data: this.size() }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }

  /** Dequeue value */
  public dequeue(raw: unknown): OperationResult {
    try {
      queueDequeueSchema.parse(raw)
      if (this.items.length === 0) {
        return { success: false, error: "Queue is empty" }
      }
      const value = this.items.shift()!
      this.emit("dequeued", value)
      return { success: true, data: value }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }

  /** Peek at front element */
  public peek(): OperationResult {
    if (this.items.length === 0) {
      return { success: false, error: "Queue is empty" }
    }
    return { success: true, data: this.items[0] }
  }

  /** Get current queue size */
  public size(): number {
    return this.items.length
  }
}

/** LinkedList node */
class ListNode<T> {
  constructor(public value: T, public next: ListNode<T> | null = null) {}
}

/** Singly linked list */
export class LinkedListService<T> extends EventEmitter {
  private head: ListNode<T> | null = null
  private length = 0

  /** Insert at index */
  public insert(raw: unknown): OperationResult {
    try {
      const { index, value }: ListInsertParams = listInsertSchema.parse(raw)
      if (index > this.length) {
        return { success: false, error: "Index out of bounds" }
      }
      const node = new ListNode(value as T)
      if (index === 0) {
        node.next = this.head
        this.head = node
      } else {
        let prev = this.head!
        for (let i = 1; i < index; i++) {
          prev = prev.next!
        }
        node.next = prev.next
        prev.next = node
      }
      this.length++
      this.emit("inserted", index, value)
      return { success: true, data: this.length }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }

  /** Remove at index */
  public remove(raw: unknown): OperationResult {
    try {
      const { index }: ListRemoveParams = listRemoveSchema.parse(raw)
      if (index >= this.length || this.head === null) {
        return { success: false, error: "Index out of bounds" }
      }
      let removedValue: T
      if (index === 0) {
        removedValue = this.head.value
        this.head = this.head.next
      } else {
        let prev = this.head
        for (let i = 1; i < index; i++) {
          prev = prev!.next!
        }
        removedValue = prev!.next!.value
        prev!.next = prev!.next!.next
      }
      this.length--
      this.emit("removed", index, removedValue)
      return { success: true, data: removedValue }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }

  /** Get value at index */
  public get(raw: unknown): OperationResult {
    try {
      const { index }: ListGetParams = listGetSchema.parse(raw)
      if (index >= this.length || this.head === null) {
        return { success: false, error: "Index out of bounds" }
      }
      let curr = this.head
      for (let i = 0; i < index; i++) {
        curr = curr.next!
      }
      return { success: true, data: curr.value }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }

  /** Get current length */
  public size(): number {
    return this.length
  }

  /** Convert list to array */
  public toArray(): T[] {
    const arr: T[] = []
    let curr = this.head
    while (curr) {
      arr.push(curr.value)
      curr = curr.next
    }
    return arr
  }
}
