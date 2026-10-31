import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '../env'
import * as schema from './schema'

const sql = postgres(env.DATABASE_URL)

export const db = drizzle(sql, { schema })

export function closeDatabase(): Promise<void> {
  return sql.end({ timeout: 1 })
}
