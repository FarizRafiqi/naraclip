import fs from 'node:fs'
import path from 'node:path'
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import env from '#start/env'

export type StorageUploadInput = {
  key: string
  body: NonNullable<PutObjectCommandInput['Body']>
  contentType: string
  byteSize?: number
  checksumSha256?: string
  metadata?: Record<string, string>
}

export type StorageAssetHead = {
  key: string
  contentType: string | undefined
  byteSize: number | undefined
  etag: string | undefined
  metadata: Record<string, string>
}

export type S3StorageOptions = {
  client?: S3Client
  bucket?: string
  endpoint?: string
  region?: string
  accessKey?: string
  secretKey?: string
  signedUrlTtlSeconds?: number
  driver?: 's3' | 'local'
  localRoot?: string
}

const SAFE_KEY_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

function assertSafeStorageKey(key: string) {
  if (!key || key.split('/').some((seg) => seg && !SAFE_KEY_SEGMENT.test(seg))) {
    throw new Error(`Unsafe storage key: ${key}`)
  }
}

export default class S3Storage {
  private readonly client: S3Client
  private readonly bucket: string
  private readonly signedUrlTtlSeconds: number
  private readonly driver: 's3' | 'local'
  private readonly localRoot: string

  constructor(options: S3StorageOptions = {}) {
    this.driver = options.driver ?? env.get('STORAGE_DRIVER', 's3')
    this.localRoot = options.localRoot ?? path.resolve(process.cwd(), 'storage/drive')

    const endpoint = options.endpoint ?? env.get('S3_ENDPOINT') ?? env.get('MINIO_ENDPOINT')
    const region = options.region ?? env.get('S3_REGION') ?? env.get('MINIO_REGION', 'us-east-1')
    const accessKeyId = options.accessKey ?? env.get('S3_KEY') ?? env.get('MINIO_ACCESS_KEY')
    const secretAccessKey =
      options.secretKey ??
      env.get('S3_SECRET')?.release() ??
      env.get('MINIO_SECRET_KEY')?.release()

    this.client =
      options.client ??
      new S3Client({
        endpoint,
        region,
        credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
        forcePathStyle: true,
      })

    this.bucket = options.bucket ?? env.get('S3_BUCKET') ?? env.get('MINIO_BUCKET', 'naraclip')
    this.signedUrlTtlSeconds =
      options.signedUrlTtlSeconds ?? env.get('S3_SIGNED_URL_TTL_SECONDS', 900)
  }

  getDriver(): 's3' | 'local' {
    return this.driver
  }

  async ensureBucketExists(): Promise<void> {
    if (this.driver === 'local') {
      fs.mkdirSync(this.localRoot, { recursive: true })
      return
    }

    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }))
    } catch (error: any) {
      const isNotFound =
        error.name === 'NotFound' ||
        error.name === 'NoSuchBucket' ||
        error.$metadata?.httpStatusCode === 404
      if (isNotFound) {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }))
      } else {
        throw error
      }
    }
  }

  async upload(input: StorageUploadInput) {
    assertSafeStorageKey(input.key)

    if (this.driver === 'local') {
      const targetPath = path.join(this.localRoot, input.key)
      fs.mkdirSync(path.dirname(targetPath), { recursive: true })
      if (Buffer.isBuffer(input.body) || typeof input.body === 'string') {
        fs.writeFileSync(targetPath, input.body)
      } else {
        throw new Error('Streaming local upload not implemented for arbitrary streams')
      }
      return {
        key: input.key,
        contentType: input.contentType,
        byteSize: input.byteSize ?? fs.statSync(targetPath).size,
        checksumSha256: input.checksumSha256,
        driver: 'local',
      }
    }

    const sendPut = () =>
      this.client.send(
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

    try {
      await sendPut()
    } catch (error: any) {
      if (error.name === 'NoSuchBucket' || error.$metadata?.httpStatusCode === 404) {
        await this.ensureBucketExists()
        await sendPut()
      } else {
        throw error
      }
    }

    return {
      key: input.key,
      contentType: input.contentType,
      byteSize: input.byteSize,
      checksumSha256: input.checksumSha256,
      driver: 's3',
    }
  }

  async createDownloadUrl(key: string, expiresIn = this.signedUrlTtlSeconds): Promise<string> {
    assertSafeStorageKey(key)

    if (this.driver === 'local') {
      return `/api/v1/storage/drive/${key}`
    }

    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn,
    })
  }

  getPublicUrl(key: string): string {
    assertSafeStorageKey(key)

    if (this.driver === 'local') {
      return `/api/v1/storage/drive/${key}`
    }

    const endpoint = env.get('S3_ENDPOINT') ?? env.get('MINIO_ENDPOINT') ?? ''
    if (endpoint.includes(':8333')) {
      return `${endpoint.replace(':8333', ':8888/buckets')}/${this.bucket}/${key}`
    }
    return `${endpoint.replace(/\/$/, '')}/${this.bucket}/${key}`
  }

  async head(key: string): Promise<StorageAssetHead> {
    assertSafeStorageKey(key)

    if (this.driver === 'local') {
      const targetPath = path.join(this.localRoot, key)
      if (!fs.existsSync(targetPath)) {
        throw new Error(`File not found: ${key}`)
      }
      const stat = fs.statSync(targetPath)
      return {
        key,
        contentType: undefined,
        byteSize: stat.size,
        etag: undefined,
        metadata: {},
      }
    }

    const result = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))
    return {
      key,
      contentType: result.ContentType,
      byteSize: result.ContentLength,
      etag: result.ETag,
      metadata: result.Metadata ?? {},
    }
  }

  async delete(key: string): Promise<{ key: string }> {
    assertSafeStorageKey(key)

    if (this.driver === 'local') {
      const targetPath = path.join(this.localRoot, key)
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath)
      }
      return { key }
    }

    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
    return { key }
  }

  async list(prefix = ''): Promise<string[]> {
    if (this.driver === 'local') {
      const searchDir = path.join(this.localRoot, prefix)
      if (!fs.existsSync(searchDir)) return []
      const results: string[] = []
      const walk = (d: string) => {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
          const full = path.join(d, entry.name)
          if (entry.isDirectory()) walk(full)
          else results.push(path.relative(this.localRoot, full))
        }
      }
      walk(searchDir)
      return results
    }

    const res = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
      })
    )
    return (res.Contents || []).map((c) => c.Key!).filter(Boolean)
  }
}
