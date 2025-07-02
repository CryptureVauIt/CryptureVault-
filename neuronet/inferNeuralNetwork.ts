import { NeuralNetwork, LayerConfig } from "./defineNeuralNetworkShape"
import { z } from "zod"

/**
 * Inference schema for a batch of inputs
 */
const inferSchema = z.object({
  networkConfig: z.object({
    layers: z.array(
      z.object({
        inputSize: z.number(),
        outputSize: z.number(),
        activation: z.string(),
        weights: z.array(z.array(z.number())),
        biases: z.array(z.number())
      })
    )
  }),
  inputs: z.array(z.array(z.number())).min(1)
})

export type InferInput = z.infer<typeof inferSchema>

/**
 * Parse and validate inference input
 */
export function parseInferInput(input: unknown): InferInput {
  const result = inferSchema.safeParse(input)
  if (!result.success) {
    const msgs = result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`)
    throw new Error(`Invalid inference input: ${msgs.join("; ")}`)
  }
  return result.data
}

/**
 * Run inference on a batch of inputs
 */
export function inferBatch(raw: unknown): number[][] {
  const { networkConfig, inputs } = parseInferInput(raw)
  const net = new NeuralNetwork(networkConfig as { layers: LayerConfig[] })
  return inputs.map(input => net.predict(input))
}
