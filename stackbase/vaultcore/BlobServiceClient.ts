import { BlobServiceClient, ContainerClient } from "@azure/storage-blob"
import { z } from "zod"

/**
 * Configuration schema for blob client
 */
const blobClientConfigSchema = z.object({
  connectionString: z.string().min(1),
  defaultContainer: z.string().min(1),
})

export type BlobClientConfig = z.infer<typeof blobClientConfigSchema>

/**
 * Validates and parses the raw configuration object
 */
export function parseBlobClientConfig(input: unknown): BlobClientConfig {
  const result = blobClientConfigSchema.safeParse(input)
  if (!result.success) {
    const messages = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ")
    throw new Error(`Invalid blob client config: ${messages}`)
  }
  return result.data
}

/**
 * Creates a BlobServiceClient from connection string
 */
export function createBlobServiceClient(config: BlobClientConfig): BlobServiceClient {
  return BlobServiceClient.fromConnectionString(config.connectionString)
}

/**
 * Retrieves a ContainerClient, optionally using the default container
 */
export function getContainerClient(
  serviceClient: BlobServiceClient,
  containerName?: string,
  config?: BlobClientConfig
): ContainerClient {
  const name = containerName || config?.defaultContainer
  if (!name) {
    throw new Error("Container name must be provided")
  }
  return serviceClient.getContainerClient(name)
}
