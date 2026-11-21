import path from 'node:path'
import { paths, readJson } from '../workspace.js'
import {
  authorizeYoutubeOAuth,
  getEnvOrDotEnv,
  getStoredYoutubeToken,
  readSocialTokens,
  uploadYoutubeShort,
} from './youtube.js'

export type SocialPlatformId = 'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'x'

export type SocialProviderStatus = {
  platform: SocialPlatformId
  label: string
  oauthConfigured: boolean
  connected: boolean
  accountName?: string
  accountHandle?: string
  uploadSupported: boolean
  notes?: string
}

export type SocialUploadInput = {
  slug: string
  platform?: SocialPlatformId
  privacy?: 'public' | 'unlisted' | 'private'
  title?: string
  description?: string
}

export type SocialUploadResult = {
  platform: SocialPlatformId
  videoId: string
  url: string
  title: string
  thumbnailUploaded: boolean
  thumbnailWarning?: string
  raw: Record<string, unknown>
}

export function listSocialProviders(): SocialProviderStatus[] {
  const tokens = readSocialTokens().accounts
  const yt = getStoredYoutubeToken()
  const hasGoogleEnv = Boolean(getEnvOrDotEnv('GOOGLE_CLIENT_ID') && getEnvOrDotEnv('GOOGLE_CLIENT_SECRET'))

  return [
    {
      platform: 'youtube',
      label: 'YouTube / Shorts (Google OAuth + Data API v3)',
      oauthConfigured: hasGoogleEnv,
      connected: Boolean(yt?.accessToken),
      accountName: yt?.accountName,
      accountHandle: yt?.accountHandle,
      uploadSupported: true,
    },
    {
      platform: 'tiktok',
      label: 'TikTok Content Posting API v2',
      oauthConfigured: Boolean(getEnvOrDotEnv('TIKTOK_CLIENT_KEY') && getEnvOrDotEnv('TIKTOK_CLIENT_SECRET')),
      connected: Boolean(tokens.tiktok?.accessToken),
      accountName: tokens.tiktok?.accountName,
      uploadSupported: false,
      notes: 'Konfigurasi TIKTOK_CLIENT_KEY & TIKTOK_CLIENT_SECRET di .env lalu hubungkan lewat /social/tiktok/redirect',
    },
    {
      platform: 'instagram',
      label: 'Instagram Reels (Meta Graph API)',
      oauthConfigured: Boolean(getEnvOrDotEnv('INSTAGRAM_CLIENT_ID') && getEnvOrDotEnv('INSTAGRAM_CLIENT_SECRET')),
      connected: Boolean(tokens.instagram?.accessToken),
      accountName: tokens.instagram?.accountName,
      uploadSupported: false,
      notes: 'Konfigurasi INSTAGRAM_CLIENT_ID & INSTAGRAM_CLIENT_SECRET di .env',
    },
    {
      platform: 'facebook',
      label: 'Facebook Reels & Page Video (@adonisjs/ally facebook)',
      oauthConfigured: Boolean(getEnvOrDotEnv('FACEBOOK_CLIENT_ID') && getEnvOrDotEnv('FACEBOOK_CLIENT_SECRET')),
      connected: Boolean(tokens.facebook?.accessToken),
      accountName: tokens.facebook?.accountName,
      uploadSupported: false,
      notes: 'Driver @adonisjs/ally siap, isi FACEBOOK_CLIENT_ID & FACEBOOK_CLIENT_SECRET di .env',
    },
    {
      platform: 'x',
      label: 'X / Twitter Video (@adonisjs/ally twitterX)',
      oauthConfigured: Boolean(getEnvOrDotEnv('TWITTER_CLIENT_ID') && getEnvOrDotEnv('TWITTER_CLIENT_SECRET')),
      connected: Boolean(tokens.x?.accessToken),
      accountName: tokens.x?.accountName,
      uploadSupported: false,
      notes: 'Driver @adonisjs/ally siap, isi TWITTER_CLIENT_ID & TWITTER_CLIENT_SECRET di .env',
    },
  ]
}

export async function authorizeSocialPlatform(
  platform: SocialPlatformId = 'youtube',
  options: {
    codeOrUrl?: string
    timeoutMs?: number
    openBrowser?: boolean
    onAuthUrl?: (url: string) => void
  } = {}
) {
  if (platform === 'youtube') {
    return authorizeYoutubeOAuth(options)
  }
  throw new Error(
    `CLI loopback auth untuk "${platform}" gunakan alur web AdonisJS GET /social/${platform}/redirect setelah mengisi credentials di .env.`
  )
}

export async function publishVideoToSocial(input: SocialUploadInput): Promise<SocialUploadResult> {
  const platform = input.platform ?? 'youtube'
  const p = paths(input.slug)
  const videoPath = path.join(p.exports, 'final.mp4')
  const publishPkg = readJson<any>(p.publishJson)

  const title = input.title || publishPkg?.youtubeShortsTitle || publishPkg?.titleVariants?.[0] || input.slug
  const description = input.description || publishPkg?.description || input.slug
  const tags: string[] = Array.isArray(publishPkg?.hashtags) ? publishPkg.hashtags : []
  const thumbRel = publishPkg?.thumbnailFile || 'exports/thumbnail.png'
  const thumbnailPath = path.join(p.dir, thumbRel)

  if (platform === 'youtube') {
    const res = await uploadYoutubeShort({
      videoPath,
      thumbnailPath,
      title,
      description,
      tags,
      privacyStatus: input.privacy ?? 'public',
    })
    return {
      platform: 'youtube',
      videoId: res.videoId,
      url: res.shortsUrl,
      title: res.title,
      thumbnailUploaded: res.thumbnailUploaded,
      thumbnailWarning: res.thumbnailWarning,
      raw: res,
    }
  }

  throw new Error(
    `Upload otomatis untuk platform "${platform}" memerlukan OAuth & kredensial API platform tersebut terlebih dahulu di .env (/social/${platform}/redirect).`
  )
}

export * from './youtube.js'
