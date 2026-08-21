import { test } from '@japa/runner'
import { InMemoryQueueAdapter } from '#services/queue/queue_adapter'

test.group('Queue adapter', () => {
  test('deduplicates queued jobs by idempotency key', async ({ assert }) => {
    const queue = new InMemoryQueueAdapter()
    const first = await queue.add('story', { videoId: 1, idempotencyKey: 'story-1' }, 'story-1')
    const second = await queue.add('story', { videoId: 1, idempotencyKey: 'story-1' }, 'story-1')

    assert.deepEqual(second, first)
    assert.equal((await queue.status('story', first.id))?.state, 'queued')
  })
})
