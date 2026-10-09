/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  // Node
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.string(),

  // App
  APP_KEY: Env.schema.secret(),
  APP_URL: Env.schema.string({ format: 'url', tld: false }),

  // Session
  SESSION_DRIVER: Env.schema.enum(['cookie', 'memory', 'database'] as const),

  // Database
  DB_CONNECTION: Env.schema.enum(['pg', 'sqlite'] as const),
  DB_HOST: Env.schema.string.optional(),
  DB_PORT: Env.schema.number.optional(),
  DB_USER: Env.schema.string.optional(),
  DB_PASSWORD: Env.schema.secret.optional(),
  DB_DATABASE: Env.schema.string.optional(),
  DB_POOL_MIN: Env.schema.number.optional(),
  DB_POOL_MAX: Env.schema.number.optional(),

  // Storage (MinIO S3)
  MINIO_ENDPOINT: Env.schema.string.optional(),
  MINIO_REGION: Env.schema.string.optional(),
  MINIO_BUCKET: Env.schema.string.optional(),
  MINIO_ACCESS_KEY: Env.schema.string.optional(),
  MINIO_SECRET_KEY: Env.schema.secret.optional(),
  MINIO_CONSOLE_PORT: Env.schema.number.optional(),
  MINIO_SIGNED_URL_TTL_SECONDS: Env.schema.number.optional(),

  // Queue
  REDIS_URL: Env.schema.string.optional(),
  QUEUE_PREFIX: Env.schema.string.optional(),

  // HTTP
  CORS_ORIGIN: Env.schema.string.optional(),

  // AI Gateways & Local Engines
  NINEROUTER_ENDPOINT: Env.schema.string.optional(),
  NINEROUTER_API_KEY: Env.schema.secret.optional(),
  COMFYUI_ENDPOINT: Env.schema.string.optional(),
})
