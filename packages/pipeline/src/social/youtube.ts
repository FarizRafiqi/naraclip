import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { REPO_ROOT } from '../workspace.js'

export type GoogleOAuthClientConfig = {
  clientId: string
  clientSecret: string
  authUri: string
  tokenUri: string
  redirectUris: string[]
  source: 'json' | 'env'
}

export type StoredYoutubeToken = {
  platform: 'youtube'
  accountId: string
  accountName: string
  accountHandle?: string
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  scopes: string[]
  updatedAt: string
  channelStats?: { subscriberCount?: string; videoCount?: string }
}

export type StoredSocialTokensFile = {
  schemaVersion: 1
  accounts: Record<string, any>
}

export const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/userinfo.profile',
] as const

export function getSocialTokenStorePath(): string {
  const secretsStore = path.join(REPO_ROOT, 'secrets', 'social-tokens.json')
  const legacyCacheStore = path.join(REPO_ROOT, '.cache', 'social-tokens.json')
  if (!fs.existsSync(secretsStore) && fs.existsSync(legacyCacheStore)) {
    return legacyCacheStore
  }
  return secretsStore
}

function readDotEnvMap(): Record<string, string> {
  const envPath = path.join(REPO_ROOT, '.env')
  const map: Record<string, string> = {}
  if (!fs.existsSync(envPath)) return map
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    map[key] = val
  }
  return map
}

export function getEnvOrDotEnv(key: string): string | undefined {
  if (process.env[key]) return process.env[key]
  const dot = readDotEnvMap()
  return dot[key] || undefined
}

export function loadGoogleOAuthConfig(): GoogleOAuthClientConfig {
  const searchDirs = [path.join(REPO_ROOT, 'secrets'), REPO_ROOT]
  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue
    const secretFile = fs
      .readdirSync(dir)
      .find(
        (f) =>
          (f.startsWith('client_secret_') && f.endsWith('.json')) ||
          f === 'google_client_secret.json'
      )
    if (secretFile) {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, secretFile), 'utf8'))
      const cfg = raw.installed ?? raw.web
      if (cfg?.client_id && cfg?.client_secret) {
        return {
          clientId: cfg.client_id,
          clientSecret: cfg.client_secret,
          authUri: cfg.auth_uri || 'https://accounts.google.com/o/oauth2/v2/auth',
          tokenUri: cfg.token_uri || 'https://oauth2.googleapis.com/token',
          redirectUris: cfg.redirect_uris || ['http://localhost'],
          source: 'json',
        }
      }
    }
  }

  const clientId = getEnvOrDotEnv('GOOGLE_CLIENT_ID')
  const clientSecret = getEnvOrDotEnv('GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    throw new Error(
      'Google OAuth credentials tidak ditemukan. Pastikan client_secret_*.json atau GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET terisi di .env.'
    )
  }

  return {
    clientId,
    clientSecret,
    authUri: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUri: 'https://oauth2.googleapis.com/token',
    redirectUris: [getEnvOrDotEnv('GOOGLE_REDIRECT_URI') || 'http://localhost'],
    source: 'env',
  }
}

export function readSocialTokens(): StoredSocialTokensFile {
  const storePath = getSocialTokenStorePath()
  if (!fs.existsSync(storePath)) {
    return { schemaVersion: 1, accounts: {} }
  }
  try {
    return JSON.parse(fs.readFileSync(storePath, 'utf8')) as StoredSocialTokensFile
  } catch {
    return { schemaVersion: 1, accounts: {} }
  }
}

export function writeSocialToken(platform: string, payload: unknown): void {
  const storePath = getSocialTokenStorePath()
  fs.mkdirSync(path.dirname(storePath), { recursive: true })
  const current = readSocialTokens()
  current.accounts[platform] = payload
  fs.writeFileSync(storePath, JSON.stringify(current, null, 2))
}

export function getStoredYoutubeToken(): StoredYoutubeToken | null {
  const store = readSocialTokens()
  return (store.accounts.youtube as StoredYoutubeToken | undefined) ?? null
}

function openBrowserBestEffort(url: string): boolean {
  try {
    if (process.platform === 'linux') {
      // On WSL2 Windows browser opens reliably via powershell.exe / cmd.exe; fallback xdg-open
      const ps = spawn('powershell.exe', ['-NoProfile', '-Command', `Start-Process '${url}'`], {
        stdio: 'ignore',
        detached: true,
      })
      ps.unref()
      return true
    }
  } catch {
    // ignore browser auto-launch errors
  }
  return false
}

async function exchangeCodeForGoogleTokens(
  cfg: GoogleOAuthClientConfig,
  code: string,
  redirectUri: string
): Promise<{
  access_token: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  token_type?: string
}> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })

  const res = await fetch(cfg.tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const json: any = await res.json()
  if (!res.ok || !json.access_token) {
    throw new Error(
      `Google token exchange gagal (${res.status}): ${json.error_description || json.error || JSON.stringify(json)}`
    )
  }
  return json
}

async function refreshYoutubeAccessToken(
  cfg: GoogleOAuthClientConfig,
  refreshToken: string
): Promise<{ access_token: string; expires_in?: number; scope?: string }> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })
  const res = await fetch(cfg.tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const json: any = await res.json()
  if (!res.ok || !json.access_token) {
    throw new Error(
      `Gagal refresh token YouTube (${res.status}): ${json.error_description || json.error || 'unknown'}`
    )
  }
  return json
}

async function fetchYoutubeChannelProfile(accessToken: string): Promise<{
  accountId: string
  accountName: string
  accountHandle?: string
  channelStats?: { subscriberCount?: string; videoCount?: string }
}> {
  const chRes = await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true',
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )
  const chJson: any = await chRes.json()
  const ch = chJson?.items?.[0]
  if (ch) {
    return {
      accountId: String(ch.id),
      accountName: String(ch.snippet?.title || 'YouTube Channel'),
      accountHandle: ch.snippet?.customUrl || undefined,
      channelStats: {
        subscriberCount: ch.statistics?.subscriberCount,
        videoCount: ch.statistics?.videoCount,
      },
    }
  }

  const profRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const prof: any = profRes.ok ? await profRes.json() : {}
  return {
    accountId: String(prof.sub || 'youtube-account'),
    accountName: String(prof.name || prof.email || 'YouTube Account'),
  }
}

export async function ensureValidYoutubeToken(): Promise<StoredYoutubeToken> {
  const stored = getStoredYoutubeToken()
  if (!stored?.accessToken) {
    throw new Error(
      'Akun YouTube belum terhubung. Jalankan otorisasi OAuth terlebih dahulu lewat "nc social auth youtube".'
    )
  }

  const needsRefresh = stored.expiresAt && stored.expiresAt < Date.now() + 60_000
  if (!needsRefresh) {
    return stored
  }

  if (!stored.refreshToken) {
    throw new Error(
      'Token YouTube sudah kedaluwarsa dan tidak memiliki refresh_token. Jalankan ulang "nc social auth youtube".'
    )
  }

  const cfg = loadGoogleOAuthConfig()
  const refreshed = await refreshYoutubeAccessToken(cfg, stored.refreshToken)
  const updated: StoredYoutubeToken = {
    ...stored,
    accessToken: refreshed.access_token,
    expiresAt: Date.now() + (refreshed.expires_in ?? 3600) * 1000,
    scopes: refreshed.scope ? refreshed.scope.split(/\s+/) : stored.scopes,
    updatedAt: new Date().toISOString(),
  }
  writeSocialToken('youtube', updated)
  return updated
}

export async function authorizeYoutubeOAuth(options: {
  codeOrUrl?: string
  redirectUriOverride?: string
  timeoutMs?: number
  openBrowser?: boolean
  onAuthUrl?: (url: string) => void
} = {}): Promise<StoredYoutubeToken> {
  const cfg = loadGoogleOAuthConfig()

  if (options.codeOrUrl) {
    let code = options.codeOrUrl.trim()
    let redirectUri = options.redirectUriOverride || cfg.redirectUris[0] || 'http://localhost'
    if (code.startsWith('http://') || code.startsWith('https://')) {
      const parsed = new URL(code)
      const qCode = parsed.searchParams.get('code')
      if (!qCode) throw new Error('Parameter ?code= tidak ditemukan di URL callback.')
      code = qCode
      if (!options.redirectUriOverride) {
        redirectUri = `${parsed.origin}${parsed.pathname === '/' ? '' : parsed.pathname}`
      }
    }
    const tokenRes = await exchangeCodeForGoogleTokens(cfg, code, redirectUri)
    const profile = await fetchYoutubeChannelProfile(tokenRes.access_token)
    const record: StoredYoutubeToken = {
      platform: 'youtube',
      ...profile,
      accessToken: tokenRes.access_token,
      refreshToken: tokenRes.refresh_token,
      expiresAt: Date.now() + (tokenRes.expires_in ?? 3600) * 1000,
      scopes: tokenRes.scope ? tokenRes.scope.split(/\s+/) : [...YOUTUBE_SCOPES],
      updatedAt: new Date().toISOString(),
    }
    writeSocialToken('youtube', record)
    return record
  }

  const timeoutMs = options.timeoutMs ?? 120_000
  const expectedState = crypto.randomBytes(16).toString('hex')

  return await new Promise<StoredYoutubeToken>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url || '/', `http://localhost`)
        const err = reqUrl.searchParams.get('error')
        const code = reqUrl.searchParams.get('code')
        const state = reqUrl.searchParams.get('state')

        if (reqUrl.pathname === '/favicon.ico') {
          res.statusCode = 204
          res.end()
          return
        }

        if (err) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(`<h2>Otorisasi ditolak: ${err}</h2><p>Silakan tutup tab ini.</p>`)
          cleanup()
          reject(new Error(`Google OAuth ditolak oleh user: ${err}`))
          return
        }

        if (!code || state !== expectedState) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end('<h2>State atau code OAuth tidak valid.</h2>')
          return
        }

        const addr = server.address()
        const port = typeof addr === 'object' && addr ? addr.port : 80
        const redirectUri = `http://localhost:${port}`
        const tokenRes = await exchangeCodeForGoogleTokens(cfg, code, redirectUri)
        const profile = await fetchYoutubeChannelProfile(tokenRes.access_token)
        const record: StoredYoutubeToken = {
          platform: 'youtube',
          ...profile,
          accessToken: tokenRes.access_token,
          refreshToken: tokenRes.refresh_token,
          expiresAt: Date.now() + (tokenRes.expires_in ?? 3600) * 1000,
          scopes: tokenRes.scope ? tokenRes.scope.split(/\s+/) : [...YOUTUBE_SCOPES],
          updatedAt: new Date().toISOString(),
        }
        writeSocialToken('youtube', record)

        res.statusCode = 200
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(
          `<!doctype html><html><body style="font-family:sans-serif;padding:40px;background:#121820;color:#F4EFE6">
          <h1 style="color:#34D399">✓ YouTube Terhubung ke NaraClip</h1>
          <p>Channel: <strong>${profile.accountName}</strong></p>
          <p>Kamu boleh menutup tab browser ini sekarang.</p>
          </body></html>`
        )
        cleanup()
        resolve(record)
      } catch (e: any) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end(`OAuth error: ${e.message}`)
        cleanup()
        reject(e)
      }
    })

    let timer: NodeJS.Timeout | null = null
    function cleanup() {
      if (timer) clearTimeout(timer)
      try {
        server.close()
      } catch {
        // ignore close error
      }
    }

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      const redirectUri = `http://localhost:${port}`
      const authParams = new URLSearchParams({
        client_id: cfg.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: YOUTUBE_SCOPES.join(' '),
        access_type: 'offline',
        prompt: 'consent',
        state: expectedState,
      })
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${authParams.toString()}`
      options.onAuthUrl?.(authUrl)
      if (options.openBrowser !== false) {
        openBrowserBestEffort(authUrl)
      }
      timer = setTimeout(() => {
        cleanup()
        reject(new Error(`OAuth timeout setelah ${Math.round(timeoutMs / 1000)} detik. Url auth: ${authUrl}`))
      }, timeoutMs)
    })
  })
}

export async function setYoutubeThumbnail(
  videoId: string,
  thumbnailPngPath: string,
  accessToken: string
): Promise<{ uploaded: boolean; warning?: string }> {
  if (!fs.existsSync(thumbnailPngPath)) {
    return { uploaded: false, warning: `Thumbnail file tidak ditemukan: ${thumbnailPngPath}` }
  }
  const pngBytes = fs.readFileSync(thumbnailPngPath)
  const res = await fetch(
    `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'image/png',
        'Content-Length': String(pngBytes.length),
      },
      body: pngBytes,
    }
  )

  if (res.ok) {
    return { uploaded: true }
  }

  const errText = await res.text()
  return {
    uploaded: false,
    warning: `Thumbnail custom gagal diunggah (${res.status}): ${errText.slice(0, 300)}`,
  }
}

export async function uploadYoutubeShort(input: {
  videoPath: string
  thumbnailPath?: string
  title: string
  description: string
  tags?: string[]
  privacyStatus?: 'public' | 'unlisted' | 'private'
}): Promise<{
  platform: 'youtube'
  videoId: string
  shortsUrl: string
  watchUrl: string
  studioUrl: string
  title: string
  privacyStatus: string
  thumbnailUploaded: boolean
  thumbnailWarning?: string
  channelName: string
}> {
  if (!fs.existsSync(input.videoPath)) {
    throw new Error(`Video MP4 tidak ditemukan: ${input.videoPath}`)
  }

  const token = await ensureValidYoutubeToken()
  const videoBytes = fs.readFileSync(input.videoPath)

  // Enforce YouTube Shorts rules: #Shorts in title/desc and <= 100 chars title
  let finalTitle = input.title.trim()
  if (!/#shorts/i.test(finalTitle) && finalTitle.length + 8 <= 100) {
    finalTitle = `${finalTitle} #Shorts`
  }
  if (finalTitle.length > 100) {
    finalTitle = finalTitle.slice(0, 91).trimEnd() + ' #Shorts'
  }

  let finalDescription = input.description.trim()
  if (!/#shorts/i.test(finalDescription)) {
    finalDescription = `${finalDescription}\n\n#Shorts`
  }

  const privacyStatus = input.privacyStatus ?? 'public'
  const metadata = {
    snippet: {
      title: finalTitle,
      description: finalDescription,
      tags: (input.tags ?? []).map((t) => t.replace(/^#/, '')).slice(0, 30),
      categoryId: '28', // Science & Technology
      defaultLanguage: 'id',
      defaultAudioLanguage: 'id',
    },
    status: {
      privacyStatus,
      selfDeclaredMadeForKids: false,
    },
  }

  const initRes = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(videoBytes.length),
        'X-Upload-Content-Type': 'video/mp4',
      },
      body: JSON.stringify(metadata),
    }
  )

  if (!initRes.ok) {
    const errBody = await initRes.text()
    const hint = errBody.includes('youtubeSignupRequired')
      ? '\nPastikan akun Google tersebut sudah membuat channel YouTube di https://www.youtube.com/create_channel (atau pilih sub-profil Brand Account channel YouTube saat login OAuth).'
      : ''
    throw new Error(`YouTube upload init gagal (${initRes.status}): ${errBody}${hint}`)
  }

  const uploadUrl = initRes.headers.get('location')
  if (!uploadUrl) {
    throw new Error('YouTube upload init tidak mengembalikan header Location.')
  }

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(videoBytes.length),
    },
    body: videoBytes,
  })

  if (!putRes.ok) {
    const errBody = await putRes.text()
    throw new Error(`YouTube video binary PUT gagal (${putRes.status}): ${errBody}`)
  }

  const uploadedJson: any = await putRes.json()
  const videoId = String(uploadedJson.id)

  let thumbResult: { uploaded: boolean; warning?: string } = { uploaded: false }
  if (input.thumbnailPath) {
    thumbResult = await setYoutubeThumbnail(videoId, input.thumbnailPath, token.accessToken)
  }

  return {
    platform: 'youtube',
    videoId,
    shortsUrl: `https://www.youtube.com/shorts/${videoId}`,
    watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
    studioUrl: `https://studio.youtube.com/video/${videoId}/edit`,
    title: finalTitle,
    privacyStatus,
    thumbnailUploaded: thumbResult.uploaded,
    ...(thumbResult.warning ? { thumbnailWarning: thumbResult.warning } : {}),
    channelName: token.accountName,
  }
}
