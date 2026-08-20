import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3'
import { test } from '@japa/runner'
import R2Storage from '#services/storage/r2_storage'

test.group('R2Storage', () => {
  test('builds a scoped key with predictable segments', ({ assert }) => {
    assert.equal(
      R2Storage.buildKey({
        userId: 7,
        projectId: 12,
        assetId: 44,
        kind: 'image',
        filename: 'hero.png',
      }),
      'users/7/projects/12/image/44/hero.png'
    )
  })

  test('rejects path traversal in key segments', ({ assert }) => {
    assert.throws(() =>
      R2Storage.buildKey({
        userId: 7,
        projectId: 12,
        assetId: 44,
        kind: 'image',
        filename: '../secret.txt',
      })
    )
  })

  test('uploads supported media through the S3 client', async ({ assert }) => {
    const calls: unknown[] = []
    const client = {
      send: async (command: unknown) => {
        calls.push(command)
        return {}
      },
    } as unknown as S3Client
    const storage = new R2Storage({ client, bucket: 'naraclip-test' })

    const result = await storage.upload({
      key: 'users/7/projects/12/image/44/hero.png',
      body: new Uint8Array([1, 2, 3]),
      contentType: 'image/png',
      byteSize: 3,
      checksumSha256: 'a'.repeat(64),
    })

    assert.deepEqual(result, {
      key: 'users/7/projects/12/image/44/hero.png',
      contentType: 'image/png',
      byteSize: 3,
      checksumSha256: 'a'.repeat(64),
    })
    assert.lengthOf(calls, 1)
    assert.instanceOf(calls[0], PutObjectCommand)
    assert.equal((calls[0] as PutObjectCommand).input.Bucket, 'naraclip-test')
  })

  test('reads and deletes an object through the S3 client', async ({ assert }) => {
    const calls: unknown[] = []
    const client = {
      send: async (command: unknown) => {
        calls.push(command)
        if (command instanceof HeadObjectCommand) {
          return {
            ContentType: 'video/mp4',
            ContentLength: 128,
            ETag: 'etag',
            Metadata: { source: 'test' },
          }
        }
        return {}
      },
    } as unknown as S3Client
    const storage = new R2Storage({ client, bucket: 'naraclip-test' })
    const key = 'users/7/projects/12/video/44/final.mp4'

    assert.deepEqual(await storage.head(key), {
      key,
      contentType: 'video/mp4',
      byteSize: 128,
      etag: 'etag',
      metadata: { source: 'test' },
    })
    assert.deepEqual(await storage.delete(key), { key })
    assert.instanceOf(calls[1], DeleteObjectCommand)
  })

  test('rejects unsupported MIME types before upload', async ({ assert }) => {
    const client = { send: async () => ({}) } as unknown as S3Client
    const storage = new R2Storage({ client, bucket: 'naraclip-test' })

    await assert.rejects(
      () =>
        storage.upload({
          key: 'users/7/projects/12/file/44/data.bin',
          body: new Uint8Array([1]),
          contentType: 'application/octet-stream',
        }),
      'Unsupported storage MIME type: application/octet-stream'
    )
  })
})
