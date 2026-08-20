import Project from '#models/project'
import type { HttpContext } from '@adonisjs/core/http'

export default class ProjectsController {
  async show({ auth, params, response, serialize }: HttpContext) {
    const project = await Project.query()
      .where('id', params.id)
      .where('ownerId', auth.getUserOrFail().id)
      .first()

    if (!project) {
      return response.notFound({ error: 'not_found', message: 'Project not found' })
    }

    return serialize({
      id: project.id,
      ownerId: project.ownerId,
      title: project.title,
      sourcePrompt: project.sourcePrompt,
      status: project.status,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    })
  }
}
