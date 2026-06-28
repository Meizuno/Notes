import { z } from 'zod'

// Required environment configuration, validated once at startup by
// server/plugins/validate-env. Kept in its own module (no Nitro
// auto-imports) so it can be unit-tested directly.
//
// Unknown keys are ignored — process.env carries hundreds of unrelated
// vars. Optional config (NUXT_PUBLIC_SITE_URL) is not listed here; absence
// disables the corresponding feature by design.
export const envSchema = z.object({
  NUXT_DATABASE_URL: z.string().min(1, 'NUXT_DATABASE_URL is required'),
  NUXT_AUTH_SERVICE_URL: z.string().url('NUXT_AUTH_SERVICE_URL must be a valid URL')
})

export type Env = z.infer<typeof envSchema>
