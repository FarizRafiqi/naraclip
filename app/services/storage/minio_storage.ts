import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import S3Storage, {
  type S3StorageOptions,
  type StorageAssetHead,
  type StorageUploadInput,
} from './s3_storage.js'
import env from '#start/env'

export type { StorageUploadInput, StorageAssetHead }
export type MinioStorageOptions = S3StorageOptions

const SAFE_KEY_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const SUPPORTED_MIME_TYPE = /^(?:image\/[a-z0-9.+-]+|audio\/[a-z0-9.+-]+|video\/(?:mp4|webm))$/i
const SHA256_HEX = /^[A-Fa-f0-9]{64}$/

function assertSafeKeySegment(value: string, name: string) {
  if (!SAFE_KEY_SEGMENT.test(value) || value === '.' || value === '..') {
    throw new Error(`${name} contains an unsafe storage key segment`)
  }
}

function assertSafeStorageKey(key: string) {
  if (!key || key.split('/').some((segment) => !SAFE_KEY_SEGMENT.test(segment))) {
    throw new Error('key contains an unsafe storage path')
  }
}

function assertSupportedMimeType(contentType: string) {
  if (!SUPPORTED_MIME_TYPE.test(contentType)) {
    throw new Error(`Unsupported storage MIME type: ${contentType}`)
  }
}

/**
 * MinioStorage is maintained for backward compatibility.
 * It delegates to the generic S3Storage engine (SeaweedFS / Garage / S3 / Local Drive).
 */
export default class MinioStorage extends S3Storage {
  private readonly rawClient: S3Client
  private readonly rawBucket: string
  private readonly rawSignedUrlTtlSeconds: number

  constructor(options: MinioStorageOptions = {}) {
    super(options)
    const endpoint = env.get('S3_ENDPOINT') ?? env.get('MINIO_ENDPOINT')
    const accessKeyId = env.get('S3_KEY') ?? env.get('MINIO_ACCESS_KEY')
    const secretAccessKey =
      env.get('S3_SECRET')?.release() ?? env.get('MINIO_SECRET_KEY')?.release()
    const region = env.get('S3_REGION') ?? env.get('MINIO_REGION', 'us-east-1')

    this.rawClient =
      options.client ??
      new S3Client({
        endpoint,
        region,
        credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
        forcePathStyle: true,
      })

    this.rawBucket = options.bucket ?? env.get('S3_BUCKET') ?? env.get('MINIO_BUCKET', '')
    this.rawSignedUrlTtlSeconds =
      options.signedUrlTtlSeconds ??
      env.get('S3_SIGNED_URL_TTL_SECONDS') ??
      env.get('MINIO_SIGNED_URL_TTL_SECONDS', 900)
  }

  static buildKey(input: {
    userId: string | number
    projectId: string | number
    assetId: string | number
    kind: string
    filename: string
  }) {
    const segments = {
      userId: String(input.userId),
      projectId: String(input.projectId),
      assetId: String(input.assetId),
      kind: input.kind,
      filename: input.filename,
    }

    for (const [name, value] of Object.entries(segments)) {
      assertSafeKeySegment(value, name)
    }

    return `users/${segments.userId}/projects/${segments.projectId}/${segments.kind}/${segments.assetId}/${segments.filename}`
  }

  override async upload(input: StorageUploadInput) {
    this.assertConfigured()
    assertSafeStorageKey(input.key)
    assertSupportedMimeType(input.contentType)

    if (input.checksumSha256 && !SHA256_HEX.test(input.checksumSha256)) {
      throw new Error('checksumSha256 must be a 64-character hexadecimal SHA-256 digest')
    }

    await this.rawClient.send(
      new PutObjectCommand({
        Bucket: this.rawBucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        ContentLength: input.byteSize,
        Metadata: {
          ...input.metadata,
          ...(input.checksumSha256 ? { 'checksum-sha256': input.checksumSha256 } : {}),
        },
      })
    )

    return {
      key: input.key,
      contentType: input.contentType,
      byteSize: input.byteSize,
      checksumSha256: input.checksumSha256,
      driver: 's3',
    }
  }

  override async createDownloadUrl(key: string, expiresIn = this.rawSignedUrlTtlSeconds) {
    this.assertConfigured()
    assertSafeStorageKey(key)

    return getSignedUrl(
      this.rawClient,
      new GetObjectCommand({ Bucket: this.rawBucket, Key: key }),
      { expiresIn }
    )
  }

  override async head(key: string): Promise<StorageAssetHead> {
    this.assertConfigured()
    assertSafeStorageKey(key)

    const result = await this.rawClient.send(
      new HeadObjectCommand({ Bucket: this.rawBucket, Key: key })
    )

    return {
      key,
      contentType: result.ContentType,
      byteSize: result.ContentLength,
      etag: result.ETag,
      metadata: result.Metadata ?? {},
    }
  }

  override async delete(key: string) {
    this.assertConfigured()
    assertSafeStorageKey(key)

    await this.rawClient.send(new DeleteObjectCommand({ Bucket: this.rawBucket, Key: key }))

    return { key }
  }

  private assertConfigured() {
    if (!this.rawBucket) {
      throw new Error('Object storage is not configured: MINIO_BUCKET is missing')
    }
  }
}
