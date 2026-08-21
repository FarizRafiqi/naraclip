import { Queue, Worker, type JobsOptions, type Job } from 'bullmq'
import { Redis } from 'ioredis'
import env from '#start/env'
import type { QueueJobPayload, QueueJobStatus, QueueName, QueueState } from './queue_types.js'

export type EnqueueOptions = {
  attempts?: number
  delayMs?: number
}

export interface QueueAdapter {
  add(
    queue: QueueName,
    payload: QueueJobPayload,
    idempotencyKey: string,
    options?: EnqueueOptions
  ): Promise<QueueJobStatus>
  status(queue: QueueName, id: string): Promise<QueueJobStatus | null>
  close(): Promise<void>
}

function toQueueState(state: string): QueueState {
  if (state === 'active') return 'running'
  if (state === 'completed') return 'succeeded'
  if (state === 'failed') return 'failed'
  if (state === 'cancelled') return 'cancelled'
  return 'queued'
}

function statusFromJob(queue: QueueName, job: Job<QueueJobPayload>): QueueJobStatus {
  return {
    id: String(job.id),
    queue,
    state: 'queued',
    attemptsMade: job.attemptsMade,
    progress:
      typeof job.progress === 'object' && job.progress !== null
        ? (job.progress as Record<string, unknown>)
        : Number(job.progress ?? 0),
    failedReason: job.failedReason,
  }
}

export function makeQueueJobId(videoId: number, idempotencyKey: string) {
  return `${videoId}:${idempotencyKey}`
}

export class InMemoryQueueAdapter implements QueueAdapter {
  private jobs = new Map<string, QueueJobStatus>()

  async add(
    queue: QueueName,
    _payload: QueueJobPayload,
    idempotencyKey: string,
    _options: EnqueueOptions = {}
  ) {
    const id = `${queue}:${makeQueueJobId(_payload.videoId, idempotencyKey)}`
    const existing = this.jobs.get(id)
    if (existing) return existing

    const status: QueueJobStatus = {
      id,
      queue,
      state: 'queued',
      attemptsMade: 0,
      progress: 0,
    }
    this.jobs.set(id, status)
    return status
  }

  async status(queue: QueueName, id: string) {
    return this.jobs.get(id) ?? this.jobs.get(`${queue}:${id}`) ?? null
  }

  async close() {
    this.jobs.clear()
  }
}

export class BullMqQueueAdapter implements QueueAdapter {
  private readonly connection: Redis
  private readonly queues = new Map<QueueName, Queue<QueueJobPayload>>()
  private readonly prefix: string

  constructor(
    private readonly redisUrl = env.get('REDIS_URL', 'redis://127.0.0.1:6379'),
    prefix = env.get('QUEUE_PREFIX', 'naraclip')
  ) {
    this.prefix = prefix
    this.connection = new Redis(this.redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    })
  }

  private queue(name: QueueName) {
    const existing = this.queues.get(name)
    if (existing) return existing

    const queue = new Queue<QueueJobPayload>(name, {
      connection: this.connection,
      prefix: this.prefix,
      defaultJobOptions: {
        removeOnComplete: { age: 86400, count: 1000 },
        removeOnFail: { age: 604800, count: 1000 },
      },
    })
    this.queues.set(name, queue)
    return queue
  }

  async add(
    queue: QueueName,
    payload: QueueJobPayload,
    idempotencyKey: string,
    options: EnqueueOptions = {}
  ) {
    const jobOptions: JobsOptions = {
      jobId: makeQueueJobId(payload.videoId, idempotencyKey),
      attempts: options.attempts ?? 3,
      backoff: { type: 'exponential', delay: 1000 },
      ...(options.delayMs ? { delay: options.delayMs } : {}),
    }
    const job = await this.queue(queue).add(queue, payload, jobOptions)

    return {
      ...statusFromJob(queue, job),
      state: 'queued' as const,
    }
  }

  async status(queue: QueueName, id: string) {
    const job = await this.queue(queue).getJob(id)
    if (!job) return null

    const currentState = await job.getState()
    return {
      ...statusFromJob(queue, job),
      state: toQueueState(currentState),
    }
  }

  async close() {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()))
    await this.connection.quit()
  }
}

export type QueueProcessor = (payload: QueueJobPayload) => Promise<unknown>

export class BullMqWorkerRegistry {
  private readonly connection: Redis
  private readonly workers: Worker<QueueJobPayload>[] = []
  private readonly prefix: string

  constructor(
    redisUrl = env.get('REDIS_URL', 'redis://127.0.0.1:6379'),
    prefix = env.get('QUEUE_PREFIX', 'naraclip')
  ) {
    this.prefix = prefix
    this.connection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    })
  }

  register(queue: QueueName, processor: QueueProcessor, concurrency = 1) {
    const worker = new Worker<QueueJobPayload>(queue, async (job) => processor(job.data), {
      connection: this.connection,
      prefix: this.prefix,
      concurrency,
    })
    this.workers.push(worker)
    return worker
  }

  async close() {
    await Promise.all(this.workers.map((worker) => worker.close()))
    await this.connection.quit()
  }
}

export function createQueueAdapter(): QueueAdapter {
  return env.get('REDIS_URL') ? new BullMqQueueAdapter() : new InMemoryQueueAdapter()
}

let sharedQueueAdapter: QueueAdapter | undefined

export function getQueueAdapter() {
  sharedQueueAdapter ??= createQueueAdapter()
  return sharedQueueAdapter
}
