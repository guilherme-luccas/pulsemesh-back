import { count, eq } from 'drizzle-orm'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import { z } from 'zod'
import { canJoinTopic } from './access'
import { readSession, signSession, type Session } from './auth'
import { db } from './db/client'
import { alerts, people, posts, situationEvents } from './db/schema'
import { env } from './env'
import { openApiDocument } from './openapi'

const severities = ['info', 'warning', 'critical'] as const
const situations = ['open', 'attending', 'closed'] as const

const personBody = z.object({
  id: z.string().min(1),
  shortCode: z.string().trim().min(4).max(8),
})

const coordinate = z.object({
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
})

const alertBody = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(2000).default(''),
  severity: z.enum(severities),
  createdAt: z.string().datetime(),
  coordinate: coordinate.optional(),
  reporterId: z.string().min(1),
})

const situationBody = z.object({
  id: z.string().min(1),
  situation: z.enum(situations),
  createdAt: z.string().datetime(),
})

const postBody = z.object({
  id: z.string().min(1),
  body: z.string().trim().min(1).max(500),
  createdAt: z.string().datetime(),
})

const listQuery = z.object({
  situation: z.enum(situations).optional(),
})

function sendError(reply: FastifyReply, status: number, message: string) {
  return reply.status(status).send({ message })
}

function sessionFrom(request: FastifyRequest): Session | null {
  const header = request.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return null
  }

  return readSession(header.slice('Bearer '.length), env.JWT_SECRET)
}

function requireSession(request: FastifyRequest, reply: FastifyReply): Session | null {
  const session = sessionFrom(request)
  if (!session) {
    sendError(reply, 401, 'Sessão inválida.')
    return null
  }

  return session
}

export const app = Fastify({ logger: true })
await app.register(swagger, {
  mode: 'static',
  specification: { document: openApiDocument },
})
await app.register(swaggerUi, { routePrefix: '/docs' })

function wantsHtml(request: FastifyRequest): boolean {
  return (request.headers.accept ?? '').includes('text/html')
}

async function statusHtml(): Promise<string> {
  const [peopleRow] = await db.select({ value: count() }).from(people)
  const [alertsRow] = await db.select({ value: count() }).from(alerts)
  const [postsRow] = await db.select({ value: count() }).from(posts)

  return `<!doctype html>
<html lang="pt-BR">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PulseMesh</title>
<body style="margin:0;font-family:system-ui,sans-serif;background:#101614;color:#F4F7F5">
<main style="max-width:28rem;margin:0 auto;padding:2rem">
<h1 style="margin:0 0 .5rem">PulseMesh</h1>
<p style="margin:0 0 1.5rem;color:#9AABA3">API no ar. <a href="/docs" style="color:#7DD3C7">Abrir a documentação</a></p>
<ul style="list-style:none;padding:0;margin:0;display:grid;gap:.75rem">
<li style="background:#1E3A34;border-radius:12px;padding:1rem">Pessoas: ${peopleRow?.value ?? 0}</li>
<li style="background:#1E3A34;border-radius:12px;padding:1rem">Alertas: ${alertsRow?.value ?? 0}</li>
<li style="background:#1E3A34;border-radius:12px;padding:1rem">Mensagens: ${postsRow?.value ?? 0}</li>
</ul>
</main>
</body>`
}

app.get('/', async (_request, reply) => reply.type('text/html').send(await statusHtml()))

app.get('/health', async (request, reply) => {
  if (!wantsHtml(request)) {
    return { ok: true }
  }

  return reply.type('text/html').send(await statusHtml())
})

app.post('/people', async (request, reply) => {
  const parsed = personBody.safeParse(request.body)
  if (!parsed.success) {
    return sendError(reply, 400, 'Pessoa inválida.')
  }

  const { id, shortCode } = parsed.data
  const [byId] = await db.select().from(people).where(eq(people.id, id))
  if (byId) {
    if (byId.shortCode !== shortCode) {
      return sendError(reply, 409, 'Este id já está em uso.')
    }

    return { id, shortCode, token: signSession({ sub: id, role: 'citizen' }, env.JWT_SECRET) }
  }

  const [byCode] = await db.select().from(people).where(eq(people.shortCode, shortCode))
  if (byCode) {
    return sendError(reply, 409, 'Este código já está em uso.')
  }

  await db.insert(people).values({ id, shortCode })
  return reply.status(201).send({
    id,
    shortCode,
    token: signSession({ sub: id, role: 'citizen' }, env.JWT_SECRET),
  })
})

app.post('/people/recover', async (request, reply) => {
  const parsed = z.object({ shortCode: z.string().trim().min(4).max(8) }).safeParse(request.body)
  if (!parsed.success) {
    return sendError(reply, 400, 'Código inválido.')
  }

  const shortCode = parsed.data.shortCode.toUpperCase()
  const [person] = await db.select().from(people).where(eq(people.shortCode, shortCode))
  if (!person) {
    return sendError(reply, 404, 'Código não encontrado.')
  }

  return { id: person.id, shortCode: person.shortCode, token: signSession({ sub: person.id, role: 'citizen' }, env.JWT_SECRET) }
})

app.post('/admin/session', async (request, reply) => {
  const parsed = z.object({ code: z.string() }).safeParse(request.body)
  if (!parsed.success || parsed.data.code.trim().toUpperCase() !== env.ADMIN_CODE.trim().toUpperCase()) {
    return sendError(reply, 401, 'Código inválido.')
  }

  return { token: signSession({ sub: 'operator', role: 'admin' }, env.JWT_SECRET) }
})

app.post('/alerts', async (request, reply) => {
  const session = requireSession(request, reply)
  if (!session || session.role !== 'citizen') {
    return session ? sendError(reply, 403, 'Só o morador cria alerta.') : undefined
  }

  const parsed = alertBody.safeParse(request.body)
  if (!parsed.success) {
    return sendError(reply, 400, 'Alerta inválido.')
  }

  if (parsed.data.reporterId !== session.sub) {
    return sendError(reply, 403, 'O alerta não pertence a esta sessão.')
  }

  const [existing] = await db.select().from(alerts).where(eq(alerts.id, parsed.data.id))
  if (existing) {
    return { id: existing.id, situation: existing.situation }
  }

  const [reporter] = await db.select().from(people).where(eq(people.id, parsed.data.reporterId))
  if (!reporter) {
    return sendError(reply, 400, 'Pessoa não encontrada.')
  }

  await db.insert(alerts).values({
    id: parsed.data.id,
    reporterId: parsed.data.reporterId,
    title: parsed.data.title,
    description: parsed.data.description,
    severity: parsed.data.severity,
    situation: 'open',
    situationAt: new Date(parsed.data.createdAt),
    latitude: parsed.data.coordinate?.latitude,
    longitude: parsed.data.coordinate?.longitude,
    createdAt: new Date(parsed.data.createdAt),
  })
  await db.insert(situationEvents).values({
    id: `${parsed.data.id}-open`,
    alertId: parsed.data.id,
    situation: 'open',
    createdAt: new Date(parsed.data.createdAt),
  })

  return reply.status(201).send({ id: parsed.data.id, situation: 'open' })
})

app.delete('/alerts/:id', async (request, reply) => {
  const session = requireSession(request, reply)
  if (!session || session.role !== 'citizen') {
    return session ? sendError(reply, 403, 'Só o morador apaga o alerta.') : undefined
  }

  const params = z.object({ id: z.string().min(1) }).safeParse(request.params)
  if (!params.success) {
    return sendError(reply, 400, 'Alerta inválido.')
  }

  const [alert] = await db.select().from(alerts).where(eq(alerts.id, params.data.id))
  if (!alert) {
    return sendError(reply, 404, 'Alerta não encontrado.')
  }

  if (alert.reporterId !== session.sub) {
    return sendError(reply, 403, 'Só quem criou este alerta pode apagar.')
  }

  await db.delete(situationEvents).where(eq(situationEvents.alertId, alert.id))
  await db.delete(posts).where(eq(posts.alertId, alert.id))
  await db.delete(alerts).where(eq(alerts.id, alert.id))
  return { id: alert.id }
})

app.get('/alerts', async (request, reply) => {
  const session = requireSession(request, reply)
  if (!session) {
    return undefined
  }

  const parsed = listQuery.safeParse(request.query)
  if (!parsed.success) {
    return sendError(reply, 400, 'Filtro inválido.')
  }

  const rows = await db
    .select({
      id: alerts.id,
      title: alerts.title,
      description: alerts.description,
      severity: alerts.severity,
      situation: alerts.situation,
      createdAt: alerts.createdAt,
      latitude: alerts.latitude,
      longitude: alerts.longitude,
      reporterId: alerts.reporterId,
      reporterCode: people.shortCode,
    })
    .from(alerts)
    .innerJoin(people, eq(alerts.reporterId, people.id))

  const filtered = parsed.data.situation
    ? rows.filter((row) => row.situation === parsed.data.situation)
    : rows

  return filtered
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      severity: row.severity,
      situation: row.situation,
      createdAt: row.createdAt.toISOString(),
      coordinate:
        row.latitude === null || row.longitude === null
          ? undefined
          : { latitude: row.latitude, longitude: row.longitude },
      ...(session.role === 'admin' || session.sub === row.reporterId
        ? { reporterId: row.reporterId, reporterCode: row.reporterCode }
        : {}),
    }))
})

app.patch('/alerts/:id', async (request, reply) => {
  const session = requireSession(request, reply)
  if (!session) {
    return undefined
  }

  if (session.role !== 'admin') {
    return sendError(reply, 403, 'Só a operação muda a situação.')
  }

  const params = z.object({ id: z.string().min(1) }).safeParse(request.params)
  const body = situationBody.safeParse(request.body)
  if (!params.success || !body.success) {
    return sendError(reply, 400, 'Situação inválida.')
  }

  const [alert] = await db.select().from(alerts).where(eq(alerts.id, params.data.id))
  if (!alert) {
    return sendError(reply, 404, 'Alerta não encontrado.')
  }

  const at = new Date(body.data.createdAt)
  const [existingEvent] = await db.select().from(situationEvents).where(eq(situationEvents.id, body.data.id))
  if (!existingEvent) {
    await db.insert(situationEvents).values({
      id: body.data.id,
      alertId: alert.id,
      situation: body.data.situation,
      createdAt: at,
    })
  }

  const baseline = alert.situationAt ?? alert.createdAt
  const nextSituation = at.getTime() >= baseline.getTime() ? body.data.situation : alert.situation
  if (nextSituation !== alert.situation || !alert.situationAt) {
    await db
      .update(alerts)
      .set({
        situation: nextSituation,
        situationAt: at.getTime() >= baseline.getTime() ? at : baseline,
      })
      .where(eq(alerts.id, alert.id))
  }

  return { id: alert.id, situation: nextSituation }
})

app.get('/alerts/:id/events', async (request, reply) => {
  const session = requireSession(request, reply)
  if (!session) {
    return undefined
  }

  const params = z.object({ id: z.string().min(1) }).safeParse(request.params)
  if (!params.success) {
    return sendError(reply, 400, 'Alerta inválido.')
  }

  const [alert] = await db.select().from(alerts).where(eq(alerts.id, params.data.id))
  if (!alert) {
    return sendError(reply, 404, 'Alerta não encontrado.')
  }

  if (!canJoinTopic({ role: session.role, personId: session.sub, reporterId: alert.reporterId })) {
    return sendError(reply, 403, 'Só quem criou este alerta pode ver o histórico.')
  }

  const rows = await db.select().from(situationEvents).where(eq(situationEvents.alertId, alert.id))
  return rows
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
    .map((row) => ({
      id: row.id,
      alertId: row.alertId,
      situation: row.situation,
      createdAt: row.createdAt.toISOString(),
    }))
})

app.get('/alerts/:id/posts', async (request, reply) => {
  const session = requireSession(request, reply)
  if (!session) {
    return undefined
  }

  const params = z.object({ id: z.string().min(1) }).safeParse(request.params)
  if (!params.success) {
    return sendError(reply, 400, 'Alerta inválido.')
  }

  const [alert] = await db.select().from(alerts).where(eq(alerts.id, params.data.id))
  if (!alert) {
    return sendError(reply, 404, 'Alerta não encontrado.')
  }

  if (!canJoinTopic({ role: session.role, personId: session.sub, reporterId: alert.reporterId })) {
    return sendError(reply, 403, 'Só quem criou este alerta pode ver a conversa.')
  }

  const rows = await db.select().from(posts).where(eq(posts.alertId, alert.id))
  return rows
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
    .map((row) => ({
      id: row.id,
      alertId: row.alertId,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      authorRole: row.authorRole,
      authorId: row.authorId,
    }))
})

app.post('/alerts/:id/posts', async (request, reply) => {
  const session = requireSession(request, reply)
  if (!session) {
    return undefined
  }

  const params = z.object({ id: z.string().min(1) }).safeParse(request.params)
  const body = postBody.safeParse(request.body)
  if (!params.success || !body.success) {
    return sendError(reply, 400, 'Mensagem inválida.')
  }

  const [alert] = await db.select().from(alerts).where(eq(alerts.id, params.data.id))
  if (!alert) {
    return sendError(reply, 404, 'Alerta não encontrado.')
  }

  if (!canJoinTopic({ role: session.role, personId: session.sub, reporterId: alert.reporterId })) {
    return sendError(reply, 403, 'Só quem criou este alerta pode escrever aqui.')
  }

  const [existing] = await db.select().from(posts).where(eq(posts.id, body.data.id))
  if (!existing) {
    await db.insert(posts).values({
      id: body.data.id,
      alertId: alert.id,
      authorId: session.role === 'admin' ? 'operator' : session.sub,
      authorRole: session.role,
      body: body.data.body,
      createdAt: new Date(body.data.createdAt),
    })
  }

  const rows = await db.select().from(posts).where(eq(posts.alertId, alert.id))
  return rows
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
    .map((row) => ({
      id: row.id,
      alertId: row.alertId,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      authorRole: row.authorRole,
      authorId: row.authorId,
    }))
})

const entry = process.argv[1] ?? ''
if (entry.endsWith('server.ts') || entry.endsWith('server.js')) {
  await app.listen({ port: env.PORT, host: '0.0.0.0' })
}
