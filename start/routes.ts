/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| Browser routes render Inertia pages. The versioned API stays available for
| integrations, automation, and future mobile clients.
|
*/

import { middleware } from '#start/kernel'
import { controllers } from '#generated/controllers'
import router from '@adonisjs/core/services/router'

router.on('/').renderInertia('home', {}).as('home')

router
  .group(() => {
    router.get('signup', [controllers.NewAccount, 'create'])
    router.post('signup', [controllers.NewAccount, 'store'])

    router.get('login', [controllers.Session, 'create'])
    router.post('login', [controllers.Session, 'store'])
  })
  .use(middleware.guest())

router
  .group(() => {
    router.post('logout', [controllers.Session, 'destroy'])
  })
  .use(middleware.auth())

router
  .group(() => {
    router.post('signup', [controllers.ApiNewAccount, 'store'])
    router.post('login', [controllers.AccessTokens, 'store'])

    router
      .group(() => {
        router.get('profile', [controllers.Profile, 'show'])
        router.post('logout', [controllers.AccessTokens, 'destroy'])
      })
      .prefix('account')
      .use(middleware.apiAuth())

    router.get('projects/:id', [controllers.Projects, 'show']).use(middleware.apiAuth())

    router
      .group(() => {
        router.post('videos/:videoId/jobs', [controllers.Jobs, 'store'])
        router.get('jobs/:id', [controllers.Jobs, 'show'])
      })
      .use(middleware.apiAuth())

    router
      .group(() => {
        router.get('ping', ({ auth }) => ({
          role: auth.getUserOrFail().role,
        }))
      })
      .prefix('admin')
      .use([middleware.apiAuth(), middleware.admin()])
  })
  .prefix('/api/v1')
