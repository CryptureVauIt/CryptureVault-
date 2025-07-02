import { z } from "zod"
import { NeuralNetwork, LayerConfig } from "./defineNeuralNetworkShape"

/**
 * Training options schema
 */
const trainOptionsSchema = z.object({
  learningRate: z.number().positive().default(0.01),
  epochs: z.number().int().positive().default(100),
  batchSize: z.number().int().positive().default(1)
})

export type TrainOptions = z.infer<typeof trainOptionsSchema>

/**
 * Parses and validates training parameters
 */
export function parseTrainOptions(input: unknown): TrainOptions {
  const result = trainOptionsSchema.safeParse(input)
  if (!result.success) {
    const msgs = result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`)
    throw new Error(`Invalid training options: ${msgs.join("; ")}`)
  }
  return result.data
}

/**
 * Train the network on given data using vanilla SGD
 */
export async function trainNetwork(
  initialConfig: { layers: LayerConfig[] },
  trainingData: { inputs: number[]; targets: number[] }[],
  rawOptions: unknown
): Promise<{ layers: LayerConfig[] }> {
  const { learningRate, epochs, batchSize } = parseTrainOptions(rawOptions)
  let network = new NeuralNetwork({ layers: initialConfig.layers })

  for (let epoch = 0; epoch < epochs; epoch++) {
    for (let b = 0; b < trainingData.length; b += batchSize) {
      const batch = trainingData.slice(b, b + batchSize)
      const layerGrads: { weightGrads: number[][][]; biasGrads: number[] }[] =
        network.getLayerConfigs().map(lc => ({
          weightGrads: Array.from({ length: lc.inputSize }, () =>
            Array(lc.outputSize).fill(0)
          ),
          biasGrads: Array(lc.outputSize).fill(0)
        }))

      for (const sample of batch) {
        // forward pass
        const activations: number[][] = [sample.inputs]
        const preActivations: number[][] = []
        for (const layer of (network as any).layers) {
          const prev = activations[activations.length - 1]
          const pre = new Array(layer.outputSize)
          const post = new Array(layer.outputSize)
          for (let j = 0; j < layer.outputSize; j++) {
            let sum = 0
            for (let i = 0; i < layer.inputSize; i++) {
              sum += prev[i] * layer.weights[i][j]
            }
            sum += layer.biases[j]
            pre[j] = sum
            post[j] = Activations[layer.activation].fn(sum)
          }
          preActivations.push(pre)
          activations.push(post)
        }

        // backward pass
        let delta = activations[activations.length - 1].map((out, idx) =>
          out - sample.targets[idx]
        )
        for (let li = (network as any).layers.length - 1; li >= 0; li--) {
          const layer = (network as any).layers[li]
          const prevAct = activations[li]
          const derivs = layer.activationDerivative(preActivations[li])
          const grads = layerGrads[li]
          for (let j = 0; j < layer.outputSize; j++) {
            const d = delta[j] * derivs[j]
            grads.biasGrads[j] += d
            for (let i = 0; i < layer.inputSize; i++) {
              grads.weightGrads[i][j] += prevAct[i] * d
            }
          }
          const nextDelta = Array(layer.inputSize).fill(0)
          for (let i = 0; i < layer.inputSize; i++) {
            let sum = 0
            for (let j = 0; j < layer.outputSize; j++) {
              sum += layer.weights[i][j] * delta[j] * derivs[j]
            }
            nextDelta[i] = sum
          }
          delta = nextDelta
        }
      }

      // update weights & biases
      const configs = network.getLayerConfigs()
      configs.forEach((lc, idx) => {
        const grads = layerGrads[idx]
        for (let i = 0; i < lc.inputSize; i++) {
          for (let j = 0; j < lc.outputSize; j++) {
            lc.weights[i][j] -= (learningRate * grads.weightGrads[i][j]) / batch.length
          }
        }
        for (let j = 0; j < lc.outputSize; j++) {
          lc.biases[j] -= (learningRate * grads.biasGrads[j]) / batch.length
        }
      })
      network = new NeuralNetwork({ layers: configs })
    }
  }

  return { layers: network.getLayerConfigs() }
}
