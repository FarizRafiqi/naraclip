import GenerationJob from '#models/generation_job'
import ProviderRegistry from '#services/providers/provider_registry'
import { getQueueAdapter, makeQueueJobId, type QueueAdapter } from './queue_adapter.js'
import type { QueueJobStatus, QueueName } from './queue_types.js'

export type GenerationJobType = 'story' | 'image' | 'tts' | 'fact_check'

export function parseSnapshot(value: unknown) {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

const QUEUE_BY_JOB_TYPE: Record<GenerationJobType, QueueName> = {
  story: 'story',
  image: 'asset',
  tts: 'tts',
  fact_check: 'story',
}

const CAPABILITY_BY_JOB_TYPE = {
  story: 'story',
  image: 'image',
  tts: 'tts',
  fact_check: 'fact-check',
} as const

export default class GenerationJobService {
  constructor(
    private readonly queue: QueueAdapter = getQueueAdapter(),
    private readonly providers = new ProviderRegistry()
  ) {}

  async enqueue(input: {
    videoId: number
    jobType: GenerationJobType
    idempotencyKey: string
    input?: Record<string, unknown>
  }) {
    const existing = await GenerationJob.query()
      .where('videoId', input.videoId)
      .where('jobType', input.jobType)
      .where('idempotencyKey', input.idempotencyKey)
      .first()

    if (existing) {
      return {
        job: existing,
        queue: QUEUE_BY_JOB_TYPE[input.jobType],
        queueStatus: await this.queue.status(
          QUEUE_BY_JOB_TYPE[input.jobType],
          makeQueueJobId(input.videoId, input.idempotencyKey)
        ),
        duplicate: true,
      }
    }

    const providerConfigSnapshot = await this.providers.snapshot(
      CAPABILITY_BY_JOB_TYPE[input.jobType]
    )
    const job = await GenerationJob.create({
      videoId: input.videoId,
      jobType: input.jobType,
      status: 'queued',
      idempotencyKey: input.idempotencyKey,
      attemptCount: 0,
      providerConfigSnapshot: JSON.stringify(providerConfigSnapshot),
      costMinor: 0,
    })
    const queueName = QUEUE_BY_JOB_TYPE[input.jobType]

    let queueStatus: QueueJobStatus
    try {
      queueStatus = await this.queue.add(
        queueName,
        {
          generationJobId: job.id,
          videoId: input.videoId,
          idempotencyKey: input.idempotencyKey,
          providerConfigSnapshot,
          input: input.input,
        },
        input.idempotencyKey
      )
    } catch (error) {
      await job
        .merge({
          status: 'failed',
          errorCode: 'QUEUE_UNAVAILABLE',
          errorMessage: error instanceof Error ? error.message : 'Queue unavailable',
        })
        .save()
      throw error
    }

    return { job, queue: queueName, queueStatus, duplicate: false }
  }

  static queueForJobType(jobType: GenerationJobType) {
    return QUEUE_BY_JOB_TYPE[jobType]
  }
}
