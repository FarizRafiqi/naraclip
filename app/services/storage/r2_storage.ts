import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import env from '#start/env'

export type R2UploadInput = {
  key: string
  body: NonNullable<PutObjectCommandInput['Body']>
  contentType: string
  byteSize?: number
  checksumSha256?: string
  metadata?: Record<string, string>
}

export type R2AssetHead = {
  key: string
  contentType: string | undefined
  byteSize: number | undefined
  etag: string | undefined
  metadata: Record<string, string>
}

type R2StorageOptions = {
  client?: S3Client
  bucket?: string
  signedUrlTtlSeconds?: number
}

const SAFE_KEY_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const SUPPORTED_MIME_TYPE =
  /^(?:image\/[A-Za-z0-9.+-]+|audio\/[A-Za-z0-9.+-]+|video\/(?:mp4|webm))$/i
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

export default class R2Storage {
  private readonly client: S3Client
  private readonly bucket: string
  private readonly signedUrlTtlSeconds: number

  constructor(options: R2StorageOptions = {}) {
    const endpoint = env.get('R2_ENDPOINT')
    const accessKeyId = env.get('R2_ACCESS_KEY_ID')
    const secretAccessKey = env.get('R2_SECRET_ACCESS_KEY')?.release()

    this.client =
      options.client ??
      new S3Client({
        endpoint,
        region: env.get('R2_REGION', 'auto'),
        credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
        forcePathStyle: true,
      })
    this.bucket = options.bucket ?? env.get('R2_BUCKET', '')
    this.signedUrlTtlSeconds =
      options.signedUrlTtlSeconds ?? env.get('R2_SIGNED_URL_TTL_SECONDS', 900)
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

  async upload(input: R2UploadInput) {
    this.assertConfigured()
    assertSafeStorageKey(input.key)
    assertSupportedMimeType(input.contentType)

    if (input.checksumSha256 && !SHA256_HEX.test(input.checksumSha256)) {
      throw new Error('checksumSha256 must be a 64-character hexadecimal SHA-256 digest')
    }

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
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
    }
  }

  async createDownloadUrl(key: string, expiresIn = this.signedUrlTtlSeconds) {
    this.assertConfigured()
    assertSafeStorageKey(key)

    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn,
    })
  }

  async createUploadUrl(input: {
    key: string
    contentType: string
    byteSize?: number
    expiresIn?: number
  }) {
    this.assertConfigured()
    assertSafeStorageKey(input.key)
    assertSupportedMimeType(input.contentType)

    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        ContentType: input.contentType,
        ContentLength: input.byteSize,
      }),
      { expiresIn: input.expiresIn ?? this.signedUrlTtlSeconds }
    )
  }

  async head(key: string): Promise<R2AssetHead> {
    this.assertConfigured()
    assertSafeStorageKey(key)

    const result = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))

    return {
      key,
      contentType: result.ContentType,
      byteSize: result.ContentLength,
      etag: result.ETag,
      metadata: result.Metadata ?? {},
    }
  }

  async delete(key: string) {
    this.assertConfigured()
    assertSafeStorageKey(key)

    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))

    return { key }
  }

  private assertConfigured() {
    if (!this.bucket) {
      throw new Error('R2 storage is not configured: R2_BUCKET is missing')
    }
  }
}
