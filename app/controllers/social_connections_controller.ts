import fs from 'node:fs'
import path from 'node:path'
import app from '@adonisjs/core/services/app'
import env from '#start/env'
import SocialAccount, { type SocialPlatform } from '#models/social_account'
import SocialPublisherRegistry from '#services/social/social_publisher_registry'
import { socialPublishValidator } from '#validators/social'
import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'

type AllySupportedProvider = 'google' | 'facebook' | 'twitter'

function toSocialPlatform(provider: string): SocialPlatform {
  if (provider === 'google' || provider === 'youtube') return 'youtube'
  if (provider === 'twitter' || provider === 'x') return 'x'
  if (provider === 'tiktok' || provider === 'instagram' || provider === 'facebook') return provider
  throw new Error(`Unsupported social provider: ${provider}`)
}

function toAllyDriver(provider: string): AllySupportedProvider | null {
  if (provider === 'google' || provider === 'youtube') return 'google'
  if (provider === 'facebook') return 'facebook'
  if (provider === 'twitter' || provider === 'x') return 'twitter'
  return null
}

export default class SocialConnectionsController {
  async providers({ response }: HttpContext) {
    const registry = new SocialPublisherRegistry()
    const descriptors = registry.listDescriptors()
    const connected = await registry.listConnectedAccounts()

    return response.ok({
      data: {
        providers: descriptors.map((d) => {
          const account = connected.find((a) => a.platform === d.platform)
          return {
            ...d,
            connected: Boolean(account),
            account: account
              ? {
                  id: account.id,
                  accountId: account.accountId,
                  accountName: account.accountName,
                  accountHandle: account.accountHandle,
                  expiresAt: account.expiresAt,
                }
              : null,
          }
        }),
      },
    })
  }

  async redirect({ ally, params, response }: HttpContext) {
    const provider = String(params.provider || '').toLowerCase()
    const driver = toAllyDriver(provider)

    if (driver) {
      return ally.use(driver).redirect()
    }

    if (provider === 'tiktok') {
      const clientKey = env.get('TIKTOK_CLIENT_KEY')
      if (!clientKey) {
        return response.badRequest({ error: 'oauth_not_configured', message: 'TIKTOK_CLIENT_KEY belum disetel.' })
      }
      const redirectUri = env.get('TIKTOK_REDIRECT_URI', 'http://localhost:3333/social/tiktok/callback')
      const url = new URL('https://www.tiktok.com/v2/auth/authorize/')
      url.searchParams.set('client_key', clientKey)
      url.searchParams.set('scope', 'user.info.basic,video.publish,video.upload')
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('redirect_uri', redirectUri)
      return response.redirect(url.toString())
    }

    if (provider === 'instagram') {
      const clientId = env.get('INSTAGRAM_CLIENT_ID')
      if (!clientId) {
        return response.badRequest({ error: 'oauth_not_configured', message: 'INSTAGRAM_CLIENT_ID belum disetel.' })
      }
      const redirectUri = env.get('INSTAGRAM_REDIRECT_URI', 'http://localhost:3333/social/instagram/callback')
      const url = new URL('https://api.instagram.com/oauth/authorize')
      url.searchParams.set('client_id', clientId)
      url.searchParams.set('redirect_uri', redirectUri)
      url.searchParams.set('scope', 'instagram_basic,instagram_content_publish')
      url.searchParams.set('response_type', 'code')
      return response.redirect(url.toString())
    }

    return response.notFound({ error: 'unknown_provider', message: `Provider "${provider}" tidak dikenal.` })
  }

  async callback({ ally, params, response }: HttpContext) {
    const provider = String(params.provider || '').toLowerCase()
    const driver = toAllyDriver(provider)
    const platform = toSocialPlatform(provider)

    if (!driver) {
      return response.badRequest({
        error: 'callback_pending_implementation',
        message: `OAuth web callback untuk "${provider}" menunggu konfigurasi API keys di .env.`,
      })
    }

    const social = ally.use(driver)
    if (social.accessDenied()) {
      return response.unauthorized({ error: 'access_denied', message: 'Akses OAuth ditolak oleh pengguna.' })
    }
    if (social.stateMisMatch()) {
      return response.badRequest({ error: 'state_mismatch', message: 'State OAuth tidak cocok.' })
    }
    if (social.hasError()) {
      return response.badRequest({ error: 'oauth_error', message: social.getError() || 'Gagal OAuth.' })
    }

    const user = await social.user()
    const tokenInfo = user.token as {
      token: string
      refreshToken?: string
      expiresIn?: number
      expiresAt?: Date
    }

    let accountId = user.id
    let accountName = user.name || user.nickName || user.email || platform
    let accountHandle: string | null = user.nickName || null
    const metadata: Record<string, unknown> = { email: user.email }

    if (platform === 'youtube') {
      const chRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', {
        headers: { Authorization: `Bearer ${tokenInfo.token}` },
      })
      if (chRes.ok) {
        const chJson: any = await chRes.json()
        const ch = chJson?.items?.[0]
        if (ch) {
          accountId = String(ch.id)
          accountName = String(ch.snippet?.title || accountName)
          accountHandle = ch.snippet?.customUrl ?? null
          metadata.channelStatistics = ch.statistics
        }
      }
    }

    const expiresAt = tokenInfo.expiresAt
      ? DateTime.fromJSDate(new Date(tokenInfo.expiresAt))
      : tokenInfo.expiresIn
        ? DateTime.now().plus({ seconds: tokenInfo.expiresIn })
        : null

    const saved = await SocialAccount.updateOrCreate(
      { platform, accountId },
      {
        accountName,
        accountHandle,
        accessToken: tokenInfo.token,
        refreshToken: tokenInfo.refreshToken ?? null,
        expiresAt,
        scopes: [],
        metadata,
        enabled: true,
      }
    )

    if (platform === 'youtube') {
      const cacheFile = app.makePath('.cache', 'social-tokens.json')
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true })
      const current = fs.existsSync(cacheFile)
        ? JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
        : { schemaVersion: 1, accounts: {} }
      current.accounts.youtube = {
        platform: 'youtube',
        accountId,
        accountName,
        accountHandle,
        accessToken: tokenInfo.token,
        refreshToken: tokenInfo.refreshToken ?? current.accounts.youtube?.refreshToken,
        expiresAt: expiresAt ? expiresAt.toMillis() : undefined,
        scopes: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube'],
        updatedAt: new Date().toISOString(),
      }
      fs.writeFileSync(cacheFile, JSON.stringify(current, null, 2))
    }

    return response.ok({
      data: {
        id: saved.id,
        platform: saved.platform,
        accountId: saved.accountId,
        accountName: saved.accountName,
        accountHandle: saved.accountHandle,
        expiresAt: saved.expiresAt,
      },
    })
  }

  async publish({ request, response }: HttpContext) {
    const payload = await request.validateUsing(socialPublishValidator)
    const registry = new SocialPublisherRegistry()
    const result = await registry.publish({
      slug: payload.slug,
      platform: payload.platform ?? 'youtube',
      privacy: payload.privacy,
      title: payload.title,
      description: payload.description,
    })

    return response.ok({ data: result })
  }
}
