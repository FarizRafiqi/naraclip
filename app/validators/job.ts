import vine from '@vinejs/vine'

export const enqueueJobValidator = vine.create({
  jobType: vine.enum(['story', 'image', 'tts', 'fact_check'] as const),
  idempotencyKey: vine.string().trim().minLength(1).maxLength(255),
  input: vine.any().optional(),
})
