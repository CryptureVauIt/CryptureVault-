import { BlobServiceClient, ContainerClient } from "@azure/storage-blob"
import { z } from "zod"

const blobClientConfigSchema = z.object({
  connectionString: z.string().min(1, "connectionString must not be empty"),
  defaultContainer: z.string().min(1, "defaultContainer must not be empty"),
})

export type BlobClientConfig = z.infer<typeof blobClientConfigSchema>

/**
 * Parses and validates raw config input
 * @param input - raw configuration object
 * @returns strongly typed BlobClientConfig
 * @throws on validation failure
 */
export function parseBlobClientConfig(input: unknown): BlobClientConfig {
  const parsed = blobClientConfigSchema.safeParse(input)
  if (!parsed.success) {
    const messages = parsed.error.issues
      .map(issue => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ")
    throw new Error(`[BlobConfig] Invalid configuration: ${messages}`)
  }
  return parsed.data
}

/**
 * Instantiates the BlobServiceClient from config
 * @param config - parsed BlobClientConfig
 */
export function createBlobServiceClient(config: BlobClientConfig): BlobServiceClient {
  try {
    return BlobServiceClient.fromConnectionString(config.connectionString)
  } catch (err: any) {
    throw new Error(`[BlobServiceClient] Failed to create client: ${err.message}`)
  }
}

/**
 * Gets a container client from the service
 * Falls back to defaultContainer if none provided
 */
export function getContainerClient(
  serviceClient: BlobServiceClient,
  containerName?: string,
  config?: BlobClientConfig
): ContainerClient {
  const resolvedName = containerName || config?.defaultContainer
  if (!resolvedName) {
    throw new Error(`[BlobServiceClient] Container name is required`)
  }
  return serviceClient.getContainerClient(resolvedName)
}

/**
 * Checks if the container exists
 */
export async function containerExists(container: ContainerClient): Promise<boolean> {
  try {
    const result = await container.exists()
    return result
  } catch (err: any) {
    throw new Error(`[BlobServiceClient] Error checking container existence: ${err.message}`)
  }
}

/**
 * Ensures a container exists or creates it
 */
export async function ensureContainer(
  container: ContainerClient,
  publicAccess: "container" | "blob" | undefined = undefined
): Promise<void> {
  const exists = await container.exists()
  if (!exists) {
    await container.create({ access: publicAccess })
  }
}
