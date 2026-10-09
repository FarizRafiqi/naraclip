import db from '@adonisjs/lucid/services/db'
import GenerationJob from '#models/generation_job'
import GenerationJobService, { parseSnapshot } from '#services/queue/generation_job_service'
import { enqueueJobValidator } from '#validators/job'
import type { HttpContext } from '@adonisjs/core/http'

export default class JobsController {
  async store({ auth, params, request, response, serialize }: HttpContext) {
    const owner = await db
      .query()
      .from('videos')
      .join('projects', 'projects.id', 'videos.project_id')
      .where('videos.id', params.videoId)
      .where('projects.owner_id', auth.getUserOrFail().id)
      .select('videos.id')
      .first()

    if (!owner) {
      return response.notFound({ error: 'not_found', message: 'Video not found' })
    }

    const payload = await request.validateUsing(enqueueJobValidator)
    const result = await new GenerationJobService().enqueue({
      videoId: Number(params.videoId),
      jobType: payload.jobType,
      idempotencyKey: payload.idempotencyKey,
      input: payload.input as Record<string, unknown> | undefined,
    })

    return serialize({
      id: result.job.id,
      jobType: result.job.jobType,
      status: result.job.status,
      queue: result.queue,
      duplicate: result.duplicate,
      providerConfigSnapshot: parseSnapshot(result.job.providerConfigSnapshot),
    })
  }

  async show({ auth, params, response, serialize }: HttpContext) {
    const job = await GenerationJob.find(params.id)
    if (!job) {
      return response.notFound({ error: 'not_found', message: 'Job not found' })
    }

    const owner = await db
      .query()
      .from('videos')
      .join('projects', 'projects.id', 'videos.project_id')
      .where('videos.id', job.videoId)
      .where('projects.owner_id', auth.getUserOrFail().id)
      .select('videos.id')
      .first()

    if (!owner) {
      return response.notFound({ error: 'not_found', message: 'Job not found' })
    }

    return serialize({
      id: job.id,
      videoId: job.videoId,
      jobType: job.jobType,
      status: job.status,
      attemptCount: job.attemptCount,
      errorCode: job.errorCode,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    })
  }
}
