import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import Project from '#models/project'
import User from '#models/user'

test.group('API authentication', (group) => {
  group.setup(async () => {
    await testUtils.db().migrate()
  })

  test('registers a user, authenticates the profile, and protects admin routes', async ({
    client,
    assert,
  }) => {
    const unauthorized = await client.get('/api/v1/account/profile').send()
    unauthorized.assertStatus(401)

    const email = `auth-${Date.now()}@example.com`
    const signup = await client
      .post('/api/v1/signup')
      .json({
        fullName: 'Nara Test',
        email,
        password: 'secret123',
        passwordConfirmation: 'secret123',
      })
      .send()

    signup.assertStatus(200)

    const signupBody = signup.body() as {
      data: { token: string; user: { email: string; role: string } }
    }
    assert.isString(signupBody.data.token)
    assert.equal(signupBody.data.user.email, email)
    assert.equal(signupBody.data.user.role, 'user')

    const profile = await client
      .get('/api/v1/account/profile')
      .bearerToken(signupBody.data.token)
      .send()
    profile.assertStatus(200)
    profile.assertBodyContains({ data: { email, role: 'user' } })

    const admin = await client.get('/api/v1/admin/ping').bearerToken(signupBody.data.token).send()
    admin.assertStatus(403)
    admin.assertBody({ error: 'forbidden', message: 'Admin role required' })

    const owner = await User.findByOrFail('email', email)
    const project = await Project.create({
      ownerId: owner.id,
      title: 'Private project',
      sourcePrompt: 'Private prompt',
      status: 'draft',
    })

    const ownerProject = await client
      .get(`/api/v1/projects/${project.id}`)
      .bearerToken(signupBody.data.token)
      .send()
    ownerProject.assertStatus(200)
    ownerProject.assertBodyContains({ data: { id: project.id, title: 'Private project' } })

    const otherSignup = await client
      .post('/api/v1/signup')
      .json({
        fullName: 'Other User',
        email: `other-${Date.now()}@example.com`,
        password: 'secret123',
        passwordConfirmation: 'secret123',
      })
      .send()
    otherSignup.assertStatus(200)

    const otherToken = (otherSignup.body() as { data: { token: string } }).data.token
    const forbiddenProject = await client
      .get(`/api/v1/projects/${project.id}`)
      .bearerToken(otherToken)
      .send()
    forbiddenProject.assertStatus(404)
    forbiddenProject.assertBody({ error: 'not_found', message: 'Project not found' })
  })
})
