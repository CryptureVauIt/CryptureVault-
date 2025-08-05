import { ContainerClient, PublicAccessType } from "@azure/storage-blob"

/**
 * Ensures that the given container exists in storage.
 * Creates it if it does not, and applies the specified access level.
 *
 * @param containerClient  Azure ContainerClient instance
 * @param access           Public access level for blobs (default: "blob")
 */
export async function ensureContainerExists(
  containerClient: ContainerClient,
  access: PublicAccessType = "blob"
): Promise<void> {
  try {
    // createIfNotExists handles existence check internally
    const result = await containerClient.createIfNotExists({ access })
    if (result.succeeded) {
      console.info(`Container created: ${containerClient.containerName}`)
    } else {
      console.debug(`Container already exists: ${containerClient.containerName}`)
      // ensure the desired access policy is applied
      const acl = await containerClient.getAccessPolicy()
      if (acl.blobPublicAccess !== access) {
        await containerClient.setAccessPolicy(access)
        console.info(`Updated access policy to '${access}' on ${containerClient.containerName}`)
      }
    }
  } catch (err) {
    console.error(
      `ensureContainerExists: failed for ${containerClient.containerName}`,
      err
    )
    throw new Error(`Failed to ensure container exists: ${err}`)
  }
}

/**
 * Deletes the container if it exists.
 * WARNING: this removes all blobs inside.
 *
 * @param containerClient  Azure ContainerClient instance
 */
export async function removeContainer(
  containerClient: ContainerClient
): Promise<void> {
  try {
    const result = await containerClient.deleteIfExists()
    if (result.succeeded) {
      console.info(`Container deleted: ${containerClient.containerName}`)
    } else {
      console.debug(`Container not found (nothing to delete): ${containerClient.containerName}`)
    }
  } catch (err) {
    console.error(
      `removeContainer: failed for ${containerClient.containerName}`,
      err
    )
    throw new Error(`Failed to delete container: ${err}`)
  }
}

/**
 * Lists all blob names in the container.
 *
 * @param containerClient  Azure ContainerClient instance
 * @returns                Array of blob names
 */
export async function listBlobs(
  containerClient: ContainerClient
): Promise<string[]> {
  const names: string[] = []
  try {
    // iterate using async iterator
    for await (const blob of containerClient.listBlobsFlat()) {
      names.push(blob.name)
    }
    console.info(`Listed ${names.length} blobs in ${containerClient.containerName}`)
    return names
  } catch (err) {
    console.error(
      `listBlobs: failed for ${containerClient.containerName}`,
      err
    )
    throw new Error(`Failed to list blobs: ${err}`)
  }
}
