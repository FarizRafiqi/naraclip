import env from '#start/env'
import { defineConfig, services } from '@adonisjs/ally'
import type { InferSocialProviders } from '@adonisjs/ally/types'

const allyConfig = defineConfig({
  google: services.google({
    clientId: env.get('GOOGLE_CLIENT_ID', ''),
    clientSecret: env.get('GOOGLE_CLIENT_SECRET')?.release() ?? '',
    callbackUrl: env.get('GOOGLE_REDIRECT_URI', 'http://localhost:3333/social/google/callback'),
    scopes: [
      'openid',
      'userinfo.email',
      'userinfo.profile',
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube',
    ],
    accessType: 'offline',
    prompt: 'consent',
  }),
  facebook: services.facebook({
    clientId: env.get('FACEBOOK_CLIENT_ID', ''),
    clientSecret: env.get('FACEBOOK_CLIENT_SECRET')?.release() ?? '',
    callbackUrl: env.get('FACEBOOK_REDIRECT_URI', 'http://localhost:3333/social/facebook/callback'),
    scopes: ['pages_show_list', 'pages_manage_posts', 'publish_video'],
  }),
  twitter: services.twitterX({
    clientId: env.get('TWITTER_CLIENT_ID', ''),
    clientSecret: env.get('TWITTER_CLIENT_SECRET')?.release() ?? '',
    callbackUrl: env.get('TWITTER_REDIRECT_URI', 'http://localhost:3333/social/twitter/callback'),
    scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
  }),
})

export default allyConfig

declare module '@adonisjs/ally/types' {
  interface SocialProviders extends InferSocialProviders<typeof allyConfig> {}
}
