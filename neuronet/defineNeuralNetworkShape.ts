import { z } from "zod"

/**
 * Supported activation functions and their derivatives
 */
export type Activation = "relu" | "sigmoid" | "tanh"

/**
 * Activation function implementations
 */
export const Activations: Record<Activation, {
  fn: (x: number) => number
  derivative: (x: number) => number
}> = {
  relu: {
    fn: x => Math.max(0, x),
    derivative: x => (x > 0 ? 1 : 0),
  },
  sigmoid: {
    fn: x => 1 / (1 + Math.exp(-x)),
    derivative: x => {
      const s = 1 / (1 + Math.exp(-x))
      return s * (1 - s)
    },
  },
  tanh: {
    fn: x => Math.tanh(x),
    derivative: x => 1 - Math.pow(Math.tanh(x), 2),
  },
}

/**
 * Layer configuration schema
 */
const layerSchema = z.object({
  inputSize: z.number().int().positive(),
  outputSize: z.number().int().positive(),
  activation: z.enum(["relu", "sigmoid", "tanh"]).default("relu"),
  weights: z.array(z.array(z.number())).refine(arr => {
    // must be inputSize x outputSize
    return arr.length > 0 && arr.every(row => row.length === arr[0].length)
  }, "Weights must be a rectangular matrix"),
  biases: z.array(z.number()),
})
  .refine(cfg => cfg.weights.length === cfg.inputSize, {
    message: "Weights row count must equal inputSize",
  })
  .refine(cfg => cfg.weights[0].length === cfg.outputSize, {
    message: "Weights column count must equal outputSize",
  })
  .refine(cfg => cfg.biases.length === cfg.outputSize, {
    message: "Biases length must equal outputSize",
  })

export type LayerConfig = z.infer<typeof layerSchema>

/**
 * Neural network configuration schema
 */
const networkConfigSchema = z.object({
  layers: z.array(layerSchema).min(1),
})

export type NetworkConfig = z.infer<typeof networkConfigSchema>

/**
 * Single fully-connected layer
 */
export class Layer {
  public readonly inputSize: number
  public readonly outputSize: number
  public readonly activation: Activation
  private readonly weights: number[][]
  private readonly biases: number[]

  constructor(config: LayerConfig) {
    const parsed = layerSchema.parse(config)
    this.inputSize = parsed.inputSize
    this.outputSize = parsed.outputSize
    this.activation = parsed.activation
    this.weights = parsed.weights
    this.biases = parsed.biases
  }

  /**
   * Perform forward pass for this layer
   */
  public forward(inputs: number[]): number[] {
    if (inputs.length !== this.inputSize) {
      throw new Error(`Expected ${this.inputSize} inputs, got ${inputs.length}`)
    }

    return this.weights[0].map((_, j) => {
      let sum = this.biases[j]
      for (let i = 0; i < this.inputSize; i++) {
        sum += inputs[i] * this.weights[i][j]
      }
      return Activations[this.activation].fn(sum)
    })
  }

  /**
   * Compute derivative of activation given pre-activation values
   */
  public activationDerivative(preActivations: number[]): number[] {
    if (preActivations.length !== this.outputSize) {
      throw new Error(
        `Expected ${this.outputSize} pre-activations, got ${preActivations.length}`
      )
    }
    return preActivations.map(v =>
      Activations[this.activation].derivative(v)
    )
  }
}

/**
 * Feedforward neural network composed of layers
 */
export class NeuralNetwork {
  private readonly layers: Layer[]

  constructor(config: NetworkConfig) {
    const parsed = networkConfigSchema.parse(config)
    this.layers = parsed.layers.map(layerCfg => new Layer(layerCfg))
  }

  /**
   * Compute a prediction for a single input vector
   */
  public predict(input: number[]): number[] {
    return this.layers.reduce<number[]>(
      (acc, layer) => layer.forward(acc),
      input
    )
  }

  /**
   * Safely predict, returns undefined on error
   */
  public tryPredict(input: number[]): number[] | undefined {
    try {
      return this.predict(input)
    } catch {
      return undefined
    }
  }

  /**
   * Expose layer configs for introspection or checkpointing
   */
  public getLayerConfigs(): LayerConfig[] {
    return this.layers.map(layer => ({
      inputSize: layer.inputSize,
      outputSize: layer.outputSize,
      activation: layer.activation,
      weights: layer["weights"].map(row => [...row]),
      biases: [...layer["biases"]],
    }))
  }
}
