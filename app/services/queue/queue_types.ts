export const QUEUE_NAMES = ['story', 'asset', 'tts', 'composition', 'render'] as const
export type QueueName = (typeof QUEUE_NAMES)[number]

export const QUEUE_STATES = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const
export type QueueState = (typeof QUEUE_STATES)[number]

export type QueueJobPayload = {
  generationJobId?: number
  renderJobId?: number
  videoId: number
  projectId?: number
  idempotencyKey: string
  providerConfigSnapshot?: Record<string, unknown>
  input?: Record<string, unknown>
}

export type QueueJobStatus = {
  id: string
  queue: QueueName
  state: QueueState
  attemptsMade: number
  progress: number | Record<string, unknown>
  failedReason?: string
}
