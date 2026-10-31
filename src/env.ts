import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().default(3333),
  DATABASE_URL: z.string().min(1),
  ADMIN_CODE: z.string().min(1),
  JWT_SECRET: z.string().min(1),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error(parsed.error.format())
  throw new Error('Variáveis de ambiente inválidas.')
}

export const env = parsed.data
