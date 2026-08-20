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
})
