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
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { REPO_ROOT } from '../workspace.js'

export type S3StorageConfig = {
  endpoint?: string
  region?: string
  bucket?: string
  accessKey?: string
  secretKey?: string
  driver?: 's3' | 'local'
  localRoot?: string
}

export function loadStorageConfig(): S3StorageConfig {
  const envFile = path.join(REPO_ROOT, '.env')
  const env: Record<string, string> = {}
  if (fs.existsSync(envFile)) {
    const lines = fs.readFileSync(envFile, 'utf8').split('\n')
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
      if (match) {
        let val = match[2] || ''
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
        else if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1)
        env[match[1]] = val
      }
    }
  }

  return {
    endpoint: process.env.S3_ENDPOINT || env.S3_ENDPOINT || env.MINIO_ENDPOINT || 'http://192.168.1.7:8333',
    region: process.env.S3_REGION || env.S3_REGION || 'us-east-1',
    bucket: process.env.S3_BUCKET || env.S3_BUCKET || 'naraclip',
    accessKey: process.env.S3_KEY || env.S3_KEY || env.MINIO_ACCESS_KEY || 'naraclip_admin',
    secretKey: process.env.S3_SECRET || env.S3_SECRET || env.MINIO_SECRET_KEY || 'NaraclipSecretKey2026!',
    driver: (process.env.STORAGE_DRIVER || env.STORAGE_DRIVER || 's3') as 's3' | 'local',
    localRoot: path.join(REPO_ROOT, 'storage', 'drive'),
  }
}

export class PipelineStorageClient {
  private config: S3StorageConfig
  private client: S3Client

  constructor(customConfig?: Partial<S3StorageConfig>) {
    this.config = { ...loadStorageConfig(), ...customConfig }
    this.client = new S3Client({
      endpoint: this.config.endpoint,
      region: this.config.region,
      credentials: {
        accessKeyId: this.config.accessKey!,
        secretAccessKey: this.config.secretKey!,
      },
      forcePathStyle: true,
    })
  }

  get bucket(): string {
    return this.config.bucket!
  }

  get driver(): 's3' | 'local' {
    return this.config.driver!
  }

  async ensureBucket(): Promise<void> {
    if (this.driver === 'local') {
      fs.mkdirSync(this.config.localRoot!, { recursive: true })
      return
    }

    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }))
    } catch (err: any) {
      if (err.name === 'NotFound' || err.name === 'NoSuchBucket' || err.$metadata?.httpStatusCode === 404) {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }))
      } else {
        throw err
      }
    }
  }

  async put(key: string, body: Buffer | Uint8Array | string, contentType: string, metadata: Record<string, string> = {}): Promise<void> {
    if (this.driver === 'local') {
      const target = path.join(this.config.localRoot!, key)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, body)
      return
    }

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          Metadata: metadata,
        })
      )
    } catch (err: any) {
      if (err.name === 'NoSuchBucket' || err.$metadata?.httpStatusCode === 404) {
        await this.ensureBucket()
        await this.client.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
            Metadata: metadata,
          })
        )
      } else {
        throw err
      }
    }
  }

  async get(key: string): Promise<{ body: Buffer; contentType?: string }> {
    if (this.driver === 'local') {
      const target = path.join(this.config.localRoot!, key)
      return { body: fs.readFileSync(target) }
    }

    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
    const arr = await res.Body!.transformToByteArray()
    return { body: Buffer.from(arr), contentType: res.ContentType }
  }

  async head(key: string): Promise<{ size: number; contentType?: string; etag?: string } | null> {
    if (this.driver === 'local') {
      const target = path.join(this.config.localRoot!, key)
      if (!fs.existsSync(target)) return null
      return { size: fs.statSync(target).size }
    }

    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))
      return { size: res.ContentLength || 0, contentType: res.ContentType, etag: res.ETag }
    } catch (err: any) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) return null
      throw err
    }
  }

  async list(prefix = ''): Promise<string[]> {
    if (this.driver === 'local') {
      const target = path.join(this.config.localRoot!, prefix)
      if (!fs.existsSync(target)) return []
      const results: string[] = []
      const walk = (d: string) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const full = path.join(d, e.name)
          if (e.isDirectory()) walk(full)
          else results.push(path.relative(this.config.localRoot!, full))
        }
      }
      walk(target)
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

  async getSignedUrl(key: string, expiresIn = 900): Promise<string> {
    if (this.driver === 'local') {
      return `file://${path.join(this.config.localRoot!, key)}`
    }
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn })
  }

  getDirectUrl(key: string): string {
    if (this.driver === 'local') {
      return `file://${path.join(this.config.localRoot!, key)}`
    }
    const ep = (this.config.endpoint || '').replace(/\/$/, '')
    if (ep.includes(':8333')) {
      return `${ep.replace(':8333', ':8888/buckets')}/${this.bucket}/${key}`
    }
    return `${ep}/${this.bucket}/${key}`
  }
}
