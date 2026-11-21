import vine from '@vinejs/vine'

export const socialPublishValidator = vine.create({
  slug: vine.string().trim().minLength(1).maxLength(120),
  platform: vine.enum(['youtube', 'tiktok', 'instagram', 'facebook', 'x'] as const).optional(),
  privacy: vine.enum(['public', 'unlisted', 'private'] as const).optional(),
  title: vine.string().trim().minLength(1).maxLength(120).optional(),
  description: vine.string().trim().maxLength(5000).optional(),
})
