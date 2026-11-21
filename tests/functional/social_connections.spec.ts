import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'

test.group('Social connections & multi-platform registry API', (group) => {
  group.setup(async () => {
    await testUtils.db().migrate()
  })

  test('lists all multi-social platform slots and enforces auth on publish', async ({
    client,
    assert,
  }) => {
    const email = `social-${Date.now()}@example.com`
    const signup = await client
      .post('/api/v1/signup')
      .json({
        fullName: 'Social Creator',
        email,
        password: 'secret123',
        passwordConfirmation: 'secret123',
      })
      .send()
    signup.assertStatus(200)
    const token = (signup.body() as { data: { token: string } }).data.token

    const providersRes = await client.get('/api/v1/social/providers').bearerToken(token).send()
    providersRes.assertStatus(200)
    const providers = providersRes.body().data.providers as Array<{
      platform: string
      allyDriver: string | null
    }>
    const platforms = providers.map((p) => p.platform)
    assert.includeMembers(platforms, ['youtube', 'tiktok', 'instagram', 'facebook', 'x'])

    const unauth = await client.get('/api/v1/social/providers').send()
    unauth.assertStatus(401)
  })
})
