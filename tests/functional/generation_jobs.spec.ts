import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import Project from '#models/project'
import User from '#models/user'
import Video from '#models/video'

test.group('Generation jobs API', (group) => {
  group.setup(async () => {
    await testUtils.db().migrate()
  })

  test('enqueues an owned job and returns the existing job for duplicate requests', async ({
    client,
    assert,
  }) => {
    const email = `jobs-${Date.now()}@example.com`
    const signup = await client
      .post('/api/v1/signup')
      .json({
        fullName: 'Jobs Test',
        email,
        password: 'secret123',
        passwordConfirmation: 'secret123',
      })
      .send()
    signup.assertStatus(200)

    const token = (signup.body() as { data: { token: string } }).data.token
    const owner = await User.findByOrFail('email', email)
    const project = await Project.create({
      ownerId: owner.id,
      title: 'Jobs project',
      sourcePrompt: 'A short explainer',
      status: 'draft',
    })
    const video = await Video.create({ projectId: project.id, status: 'draft' })

    const first = await client
      .post(`/api/v1/videos/${video.id}/jobs`)
      .bearerToken(token)
      .json({
        jobType: 'story',
        idempotencyKey: 'story-001',
        input: { prompt: 'Explain why the sky is blue' },
      })
      .send()
    first.assertStatus(200)
    assert.equal(first.body().data.status, 'queued')
    assert.equal(first.body().data.queue, 'story')
    assert.isFalse(first.body().data.duplicate)

    const second = await client
      .post(`/api/v1/videos/${video.id}/jobs`)
      .bearerToken(token)
      .json({
        jobType: 'story',
        idempotencyKey: 'story-001',
        input: { prompt: 'The payload is ignored for the same idempotency key' },
      })
      .send()
    second.assertStatus(200)
    assert.equal(second.body().data.id, first.body().data.id)
    assert.isTrue(second.body().data.duplicate)

    const status = await client
      .get(`/api/v1/jobs/${first.body().data.id}`)
      .bearerToken(token)
      .send()
    status.assertStatus(200)
    assert.equal(status.body().data.status, 'queued')
    assert.equal(status.body().data.jobType, 'story')
  })
})
