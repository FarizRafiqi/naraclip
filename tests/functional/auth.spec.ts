import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'

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
  })
})
