import fetch from "node-fetch"
import { EventEmitter } from "events"
import {
  logicShellConfigSchema,
  LogicShellConfig,
  workflowSchema,
  Workflow,
  TaskParams,
  TaskResult,
  WorkflowResult,
} from "./defineLogicShellShape"

/**
 * LogicShellService orchestrates workflows of module calls
 */
export class LogicShellService extends EventEmitter {
  private readonly orchestratorUrl: string
  private readonly modules: Map<string, string>
  private readonly concurrency: number

  constructor(rawConfig: unknown) {
    super()
    const { orchestratorUrl, modules, concurrency }: LogicShellConfig =
      logicShellConfigSchema.parse(rawConfig)
    this.orchestratorUrl = orchestratorUrl.replace(/\/+$/, "")
    this.modules = new Map(modules.map((m) => [m.name, m.endpoint]))
    this.concurrency = concurrency
  }

  /**
   * Execute a workflow: calls each task in order, respecting concurrency
   */
  public async executeWorkflow(raw: unknown): Promise<WorkflowResult> {
    const { tasks }: Workflow = workflowSchema.parse(raw)
    const results: TaskResult[] = []
    for (const task of tasks) {
      const result = await this.executeTask(task)
      results.push(result)
      this.emit("taskCompleted", result)
      if (!result.success) {
        // abort remaining tasks on error
        break
      }
    }
    const final: WorkflowResult = {
      results,
      completedAt: Date.now(),
    }
    this.emit("workflowCompleted", final)
    return final
  }

  /**
   * Internal helper: invoke a single module method
   */
  private async executeTask(task: TaskParams): Promise<TaskResult> {
    const { module, method, payload } = task
    const endpoint = this.modules.get(module)
    if (!endpoint) {
      return {
        module,
        method,
        response: null,
        success: false,
        errorMessage: `Unknown module "${module}"`,
      }
    }
    const url = `${endpoint.replace(/\/+$/, "")}/rpc/${method}`
    try {
      this.emit("taskStarted", { module, method, payload })
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        timeout: 10_000,
      })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`)
      }
      const data = await res.json()
      return { module, method, response: data, success: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { module, method, response: null, success: false, errorMessage: msg }
    }
  }
}
