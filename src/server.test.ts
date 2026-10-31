import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { eq } from 'drizzle-orm'
import { app } from './server.ts'
import { db, closeDatabase } from './db/client.ts'
import { alerts, people, posts, situationEvents } from './db/schema.ts'
import { env } from './env.ts'

const stamp = Date.now().toString(36)
const personId = `person-${stamp}`
const otherId = `other-${stamp}`
const alertId = `alert-${stamp}`

async function json(path: string, options: { method?: string; token?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = {}
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json'
  }
  if (options.token) {
    headers.authorization = `Bearer ${options.token}`
  }

  const response = await app.inject({
    method: options.method ?? 'GET',
    url: path,
    headers,
    payload: options.body,
  })

  let body: unknown = null
  try {
    body = response.json()
  } catch {
    body = response.body
  }

  return { status: response.statusCode, body }
}

function tokenFrom(body: unknown): string {
  assert.ok(body && typeof body === 'object' && 'token' in body && typeof body.token === 'string')
  return body.token
}

describe('rotas do PulseMesh', { concurrency: 1 }, () => {
  after(async () => {
    await db.delete(situationEvents).where(eq(situationEvents.alertId, alertId))
    await db.delete(posts).where(eq(posts.alertId, alertId))
    await db.delete(alerts).where(eq(alerts.id, alertId))
    await db.delete(people).where(eq(people.id, personId))
    await db.delete(people).where(eq(people.id, otherId))
    await app.close()
    await closeDatabase()
  })

  it('esconde o autor de quem não criou o alerta e recupera a pessoa pelo código', async () => {
    const created = await json('/people', {
      method: 'POST',
      body: { id: personId, shortCode: stamp.slice(-4).toUpperCase().padEnd(4, 'A') },
    })
    assert.equal(created.status, 201)
    const token = tokenFrom(created.body)

    const other = await json('/people', {
      method: 'POST',
      body: { id: otherId, shortCode: `Z${stamp.slice(-3).toUpperCase()}` },
    })
    assert.equal(other.status, 201)

    const alert = await json('/alerts', {
      method: 'POST',
      token,
      body: {
        id: alertId,
        title: 'Teste',
        description: '',
        severity: 'info',
        createdAt: new Date().toISOString(),
        reporterId: personId,
      },
    })
    assert.equal(alert.status, 201)

    const hidden = await json('/alerts', { token: tokenFrom(other.body) })
    assert.equal(hidden.status, 200)
    assert.ok(Array.isArray(hidden.body))
    const row = hidden.body.find((item) => item && typeof item === 'object' && 'id' in item && item.id === alertId)
    assert.ok(row && typeof row === 'object')
    assert.equal('reporterId' in row, false)

    const recovered = await json('/people/recover', {
      method: 'POST',
      body: { shortCode: stamp.slice(-4).toUpperCase().padEnd(4, 'A') },
    })
    assert.equal(recovered.status, 200)
    assert.ok(recovered.body && typeof recovered.body === 'object' && 'id' in recovered.body)
    assert.equal(recovered.body.id, personId)
  })

  it('guarda o histórico e não deixa um evento antigo vencer', async () => {
    const admin = await json('/admin/session', { method: 'POST', body: { code: env.ADMIN_CODE } })
    assert.equal(admin.status, 200)
    const adminToken = tokenFrom(admin.body)
    const later = new Date(Date.now() + 60_000).toISOString()
    const earlier = new Date(Date.now() - 60_000).toISOString()

    const attending = await json(`/alerts/${alertId}`, {
      method: 'PATCH',
      token: adminToken,
      body: { id: `evt-later-${stamp}`, situation: 'attending', createdAt: later },
    })
    assert.equal(attending.status, 200)

    const closed = await json(`/alerts/${alertId}`, {
      method: 'PATCH',
      token: adminToken,
      body: { id: `evt-early-${stamp}`, situation: 'closed', createdAt: earlier },
    })
    assert.equal(closed.status, 200)
    assert.ok(closed.body && typeof closed.body === 'object' && 'situation' in closed.body)
    assert.equal(closed.body.situation, 'attending')

    const owner = await json('/people/recover', {
      method: 'POST',
      body: { shortCode: stamp.slice(-4).toUpperCase().padEnd(4, 'A') },
    })
    const events = await json(`/alerts/${alertId}/events`, { token: tokenFrom(owner.body) })
    assert.equal(events.status, 200)
    assert.ok(Array.isArray(events.body))
    assert.ok(events.body.length >= 2)
  })

  it('publica a documentação', async () => {
    const docs = await json('/docs')
    assert.equal(docs.status, 200)
  })
})
