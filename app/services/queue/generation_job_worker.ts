import { DateTime } from 'luxon'
import GenerationJob from '#models/generation_job'
import { BullMqWorkerRegistry, type QueueProcessor } from './queue_adapter.js'
import type { QueueName } from './queue_types.js'

export default class GenerationJobWorkerRegistry {
  constructor(private readonly workers = new BullMqWorkerRegistry()) {}

  register(queue: QueueName, processor: QueueProcessor, concurrency = 1) {
    return this.workers.register(
      queue,
      async (payload) => {
        const job = await GenerationJob.find(payload.generationJobId)
        if (!job) throw new Error(`Generation job ${payload.generationJobId} not found`)

        await job
          .merge({
            status: 'running',
            attemptCount: job.attemptCount + 1,
            startedAt: DateTime.utc(),
          })
          .save()

        try {
          const result = await processor(payload)
          await job
            .merge({
              status: 'succeeded',
              completedAt: DateTime.utc(),
              errorCode: null,
              errorMessage: null,
            })
            .save()
          return result
        } catch (error) {
          await job
            .merge({
              status: 'failed',
              errorCode: 'WORKER_FAILED',
              errorMessage: error instanceof Error ? error.message : 'Worker failed',
            })
            .save()
          throw error
        }
      },
      concurrency
    )
  }

  close() {
    return this.workers.close()
  }
}
