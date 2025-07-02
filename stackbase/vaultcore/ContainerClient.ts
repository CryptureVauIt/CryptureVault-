import { ContainerClient } from "@azure/storage-blob"

/**
 * Ensures that the given container exists in storage.
 * Creates it if it does not.
 */
export async function ensureContainerExists(
  containerClient: ContainerClient
): Promise<void> {
  try {
    const exists = await containerClient.exists()
    if (!exists) {
      await containerClient.create()
      await containerClient.setAccessPolicy("blob") // public read access for blobs
    }
  } catch (err) {
    throw new Error(`Failed to ensure container exists: ${String(err)}`)
  }
}

/**
 * Deletes the container if it exists.
 * Use with caution: this will remove all blobs inside.
 */
export async function removeContainer(
  containerClient: ContainerClient
): Promise<void> {
  try {
    const exists = await containerClient.exists()
    if (exists) {
      await containerClient.delete()
    }
  } catch (err) {
    throw new Error(`Failed to delete container: ${String(err)}`)
  }
}

/**
 * Lists all blob names in the container
 */
export async function listBlobs(
  containerClient: ContainerClient
): Promise<string[]> {
  const names: string[] = []
  try {
    for await (const blob of containerClient.listBlobsFlat()) {
      names.push(blob.name)
    }
  } catch (err) {
    throw new Error(`Failed to list blobs: ${String(err)}`)
  }
  return names
}
