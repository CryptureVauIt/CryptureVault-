import { ContainerClient, BlockBlobClient } from "@azure/storage-blob"
import { ensureContainerExists } from "./ensureContainerShape"
import { z } from "zod"

/**
 * Schema for upload parameters
 */
const uploadParamsSchema = z.object({
  containerName: z.string().min(1),
  blobName: z.string().min(1),
  data: z.union([z.instanceof(Uint8Array), z.string()]),
  contentType: z.string().min(1),
})

export type UploadParams = z.infer<typeof uploadParamsSchema>

/**
 * Schema for download parameters
 */
const downloadParamsSchema = z.object({
  containerName: z.string().min(1),
  blobName: z.string().min(1),
})

export type DownloadParams = z.infer<typeof downloadParamsSchema>

/**
 * Uploads data to blob storage under a specified container and blob name
 */
export async function uploadBlob(
  clientFactory: () => ContainerClient,
  rawParams: unknown
): Promise<string> {
  const params = uploadParamsSchema.parse(rawParams)
  const containerClient = clientFactory()
  await ensureContainerExists(containerClient)

  const blockBlobClient: BlockBlobClient = containerClient.getBlockBlobClient(
    params.blobName
  )
  try {
    const options = { blobHTTPHeaders: { blobContentType: params.contentType } }
    const uploadResponse = await blockBlobClient.uploadData(
      params.data,
      options
    )
    return uploadResponse.requestId
  } catch (err) {
    throw new Error(`Failed to upload blob: ${String(err)}`)
  }
}

/**
 * Downloads a blob’s content as a Buffer
 */
export async function downloadBlob(
  clientFactory: () => ContainerClient,
  rawParams: unknown
): Promise<Buffer> {
  const params = downloadParamsSchema.parse(rawParams)
  const containerClient = clientFactory()
  await ensureContainerExists(containerClient)

  const blockBlobClient = containerClient.getBlockBlobClient(params.blobName)
  try {
    const downloadResponse = await blockBlobClient.download()
    const chunks: Buffer[] = []
    for await (const chunk of downloadResponse.readableStreamBody!) {
      chunks.push(chunk as Buffer)
    }
    return Buffer.concat(chunks)
  } catch (err) {
    throw new Error(`Failed to download blob: ${String(err)}`)
  }
}

/**
 * Deletes a blob from the container
 */
export async function deleteBlob(
  clientFactory: () => ContainerClient,
  rawParams: unknown
): Promise<boolean> {
  const params = downloadParamsSchema.parse(rawParams)
  const containerClient = clientFactory()
  const blockBlobClient = containerClient.getBlockBlobClient(params.blobName)
  try {
    const response = await blockBlobClient.deleteIfExists()
    return response.succeeded
  } catch (err) {
    throw new Error(`Failed to delete blob: ${String(err)}`)
  }
}
