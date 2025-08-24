import { NeuralNetwork, LayerConfig } from "./defineNeuralNetworkShape"
import { z } from "zod"

/**
 * Inference schema for a batch of inputs with more validation
 */
const inferSchema = z.object({
  networkConfig: z.object({
    layers: z.array(
      z.object({
        inputSize: z.number().positive("Input size must be positive"), // ensure positive sizes
        outputSize: z.number().positive("Output size must be positive"), // ensure positive sizes
        activation: z.string().min(1, "Activation function cannot be empty"), // simple check
        weights: z.array(z.array(z.number()).nonempty("Weight matrix cannot be empty")),
        biases: z.array(z.number()).nonempty("Biases cannot be empty")
      })
    ),
    // Optionally add more network-specific config (e.g., learning rate, optimization)
  }),
  inputs: z.array(z.array(z.number()).min(1, "Each input must be an array of numbers")).min(1, "At least one input is required")
})

export type InferInput = z.infer<typeof inferSchema>

/**
 * Parse and validate inference input
 * Improved error handling for invalid input format
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
 * Added better error logging and handling
 */
export function inferBatch(raw: unknown): number[][] {
  const { networkConfig, inputs } = parseInferInput(raw)

  try {
    const net = new NeuralNetwork(networkConfig as { layers: LayerConfig[] })
    // Check if network is initialized properly (for edge cases)
    if (!net) {
      throw new Error("Failed to initialize the neural network.")
    }

    return inputs.map(input => {
      // Validate input dimension
      if (input.length !== networkConfig.layers[0].inputSize) {
        throw new Error(`Input dimension mismatch: expected ${networkConfig.layers[0].inputSize}, got ${input.length}`)
      }
      return net.predict(input)
    })
  } catch (error: any) {
    // Log more detailed error information
    console.error("Inference error:", error)
    throw new Error(`Inference process failed: ${error.message}`)
  }
}
