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
    fn: x => (x > 0 ? x : 0),
    derivative: x => (x > 0 ? 1 : 0)
  },
  sigmoid: {
    fn: x => 1 / (1 + Math.exp(-x)),
    derivative: x => {
      const s = 1 / (1 + Math.exp(-x))
      return s * (1 - s)
    }
  },
  tanh: {
    fn: x => Math.tanh(x),
    derivative: x => 1 - Math.pow(Math.tanh(x), 2)
  }
}

/**
 * Layer configuration schema
 */
const layerSchema = z.object({
  inputSize: z.number().int().positive(),
  outputSize: z.number().int().positive(),
  activation: z.nativeEnum(Activations as any).default("relu"),
  weights: z.array(z.array(z.number())).refine(arr => {
    const rows = arr.length
    const cols = rows > 0 ? arr[0].length : 0
    return arr.every(row => row.length === cols)
  }, "Weights must be a rectangular matrix"),
  biases: z.array(z.number())
})

export type LayerConfig = z.infer<typeof layerSchema>

/**
 * Neural network configuration schema
 */
const networkConfigSchema = z.object({
  layers: z.array(layerSchema).min(1)
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
    if (this.weights.length !== this.inputSize || this.biases.length !== this.outputSize) {
      throw new Error("Weights or biases dimensions do not match layer size")
    }
  }

  /**
   * Perform forward pass for this layer
   */
  public forward(inputs: number[]): number[] {
    if (inputs.length !== this.inputSize) {
      throw new Error(`Expected ${this.inputSize} inputs, got ${inputs.length}`)
    }
    const outputs: number[] = new Array(this.outputSize)
    for (let j = 0; j < this.outputSize; j++) {
      let sum = 0
      for (let i = 0; i < this.inputSize; i++) {
        sum += inputs[i] * this.weights[i][j]
      }
      sum += this.biases[j]
      outputs[j] = Activations[this.activation].fn(sum)
    }
    return outputs
  }

  /**
   * Compute derivative of activation given pre-activation values
   */
  public activationDerivative(values: number[]): number[] {
    return values.map(v => Activations[this.activation].derivative(v))
  }
}

/**
 * Feedforward neural network composed of layers
 */
export class NeuralNetwork {
  private readonly layers: Layer[]

  constructor(config: NetworkConfig) {
    const parsed = networkConfigSchema.parse(config)
    this.layers = parsed.layers.map(lc => new Layer(lc))
  }

  /**
   * Compute a prediction for a single input vector
   */
  public predict(input: number[]): number[] {
    return this.layers.reduce<number[]>((acc, layer) => layer.forward(acc), input)
  }

  /**
   * Expose layer internals for training (weights & biases)
   */
  public getLayerConfigs(): LayerConfig[] {
    return this.layers.map(layer => ({
      inputSize: layer.inputSize,
      outputSize: layer.outputSize,
      activation: layer.activation,
      weights: JSON.parse(JSON.stringify((layer as any).weights)),
      biases: JSON.parse(JSON.stringify((layer as any).biases))
    }))
  }
}
