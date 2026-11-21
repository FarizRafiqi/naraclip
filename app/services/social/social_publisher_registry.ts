import fs from 'node:fs'
import path from 'node:path'
import app from '@adonisjs/core/services/app'
import env from '#start/env'
import SocialAccount, { type SocialPlatform } from '#models/social_account'

export type SocialProviderDescriptor = {
  platform: SocialPlatform
  displayName: string
  allyDriver: 'google' | 'facebook' | 'twitter' | null
  oauthConfigured: boolean
  publishSupported: boolean
}

export type MultiSocialPublishInput = {
  slug: string
  platform: SocialPlatform
  privacy?: 'public' | 'unlisted' | 'private'
  title?: string
  description?: string
}

export default class SocialPublisherRegistry {
  listDescriptors(): SocialProviderDescriptor[] {
    return [
      {
        platform: 'youtube',
        displayName: 'YouTube / YouTube Shorts',
        allyDriver: 'google',
        oauthConfigured: Boolean(env.get('GOOGLE_CLIENT_ID') && env.get('GOOGLE_CLIENT_SECRET')),
        publishSupported: true,
      },
      {
        platform: 'tiktok',
        displayName: 'TikTok Content Posting v2',
        allyDriver: null,
        oauthConfigured: Boolean(env.get('TIKTOK_CLIENT_KEY') && env.get('TIKTOK_CLIENT_SECRET')),
        publishSupported: false,
      },
      {
        platform: 'instagram',
        displayName: 'Instagram Reels (Meta Graph API)',
        allyDriver: null,
        oauthConfigured: Boolean(env.get('INSTAGRAM_CLIENT_ID') && env.get('INSTAGRAM_CLIENT_SECRET')),
        publishSupported: false,
      },
      {
        platform: 'facebook',
        displayName: 'Facebook Pages & Reels',
        allyDriver: 'facebook',
        oauthConfigured: Boolean(env.get('FACEBOOK_CLIENT_ID') && env.get('FACEBOOK_CLIENT_SECRET')),
        publishSupported: false,
      },
      {
        platform: 'x',
        displayName: 'X (Twitter OAuth2)',
        allyDriver: 'twitter',
        oauthConfigured: Boolean(env.get('TWITTER_CLIENT_ID') && env.get('TWITTER_CLIENT_SECRET')),
        publishSupported: false,
      },
    ]
  }

  async listConnectedAccounts(): Promise<SocialAccount[]> {
    return SocialAccount.query().where('enabled', true).orderBy('platform', 'asc')
  }

  async publish(input: MultiSocialPublishInput) {
    const account = await SocialAccount.query()
      .where('platform', input.platform)
      .where('enabled', true)
      .orderBy('updatedAt', 'desc')
      .first()

    if (!account) {
      throw new Error(`Akun sosial media untuk platform "${input.platform}" belum terhubung.`)
    }

    if (input.platform !== 'youtube') {
      throw new Error(
        `Adapter publish untuk "${input.platform}" terdaftar sebagai multi-social slot dan menunggu app verification / media container API key.`
      )
    }

    const contentDir = app.makePath('content', input.slug)
    const videoPath = path.join(contentDir, 'exports', 'final.mp4')
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video export tidak ditemukan: ${videoPath}`)
    }

    const publishJsonPath = path.join(contentDir, 'publish.json')
    const pkg = fs.existsSync(publishJsonPath)
      ? JSON.parse(fs.readFileSync(publishJsonPath, 'utf8'))
      : {}

    const rawTitle = input.title || pkg.youtubeShortsTitle || pkg.titleVariants?.[0] || input.slug
    const finalTitle = /#shorts/i.test(rawTitle) ? rawTitle.slice(0, 100) : `${rawTitle.slice(0, 91)} #Shorts`
    const rawDesc = input.description || pkg.description || finalTitle
    const finalDesc = /#shorts/i.test(rawDesc) ? rawDesc : `${rawDesc}\n\n#Shorts`
    const tags: string[] = Array.isArray(pkg.hashtags)
      ? pkg.hashtags.map((h: string) => h.replace(/^#/, ''))
      : ['shorts']

    const videoBytes = fs.readFileSync(videoPath)
    const initRes = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Length': String(videoBytes.length),
          'X-Upload-Content-Type': 'video/mp4',
        },
        body: JSON.stringify({
          snippet: {
            title: finalTitle,
            description: finalDesc,
            tags,
            categoryId: '28',
            defaultLanguage: 'id',
            defaultAudioLanguage: 'id',
          },
          status: {
            privacyStatus: input.privacy ?? 'public',
            selfDeclaredMadeForKids: false,
          },
        }),
      }
    )

    if (!initRes.ok) {
      throw new Error(`YouTube resumable init failed (${initRes.status}): ${await initRes.text()}`)
    }

    const location = initRes.headers.get('location')
    if (!location) {
      throw new Error('YouTube resumable init tidak mengembalikan header Location')
    }

    const putRes = await fetch(location, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(videoBytes.length),
      },
      body: videoBytes,
    })

    if (!putRes.ok) {
      throw new Error(`YouTube binary upload failed (${putRes.status}): ${await putRes.text()}`)
    }

    const uploaded: any = await putRes.json()
    const videoId = String(uploaded.id)
    return {
      platform: 'youtube' as const,
      videoId,
      shortsUrl: `https://www.youtube.com/shorts/${videoId}`,
      title: finalTitle,
    }
  }
}
