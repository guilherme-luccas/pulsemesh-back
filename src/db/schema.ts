import { doublePrecision, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const people = pgTable('people', {
  id: text('id').primaryKey(),
  shortCode: text('short_code').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const alerts = pgTable('alerts', {
  id: text('id').primaryKey(),
  reporterId: text('reporter_id')
    .notNull()
    .references(() => people.id),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  severity: text('severity').notNull(),
  situation: text('situation').notNull().default('open'),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})

export const posts = pgTable('posts', {
  id: text('id').primaryKey(),
  alertId: text('alert_id')
    .notNull()
    .references(() => alerts.id),
  authorId: text('author_id').notNull(),
  authorRole: text('author_role').notNull(),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
