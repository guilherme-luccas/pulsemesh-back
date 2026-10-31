import type { OpenAPIV3 } from 'openapi-types'

const message = {
  type: 'object',
  properties: { message: { type: 'string' } },
  required: ['message'],
} as const

const coordinate = {
  type: 'object',
  properties: {
    latitude: { type: 'number', minimum: -90, maximum: 90 },
    longitude: { type: 'number', minimum: -180, maximum: 180 },
  },
  required: ['latitude', 'longitude'],
} as const

const alert = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    description: { type: 'string' },
    severity: { type: 'string', enum: ['info', 'warning', 'critical'] },
    situation: { type: 'string', enum: ['open', 'attending', 'closed'] },
    createdAt: { type: 'string', format: 'date-time' },
    coordinate,
    reporterId: { type: 'string' },
    reporterCode: { type: 'string' },
  },
  required: ['id', 'title', 'description', 'severity', 'situation', 'createdAt'],
} as const

const post = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    alertId: { type: 'string' },
    body: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    authorRole: { type: 'string', enum: ['citizen', 'admin'] },
    authorId: { type: 'string' },
  },
  required: ['id', 'alertId', 'body', 'createdAt', 'authorRole', 'authorId'],
} as const

const bearer = [{ bearer: [] }]

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'PulseMesh',
    version: '0.1.0',
    description:
      'Alertas urbanos offline-first. O morador cria e apaga o próprio alerta. A operação muda a situação e entra em qualquer conversa. A lista exige sessão e não revela o autor dos alertas de outras pessoas.',
  },
  tags: [
    { name: 'status', description: 'Saúde da API' },
    { name: 'people', description: 'Identidade do aparelho' },
    { name: 'admin', description: 'Sessão da operação' },
    { name: 'alerts', description: 'Alertas' },
    { name: 'posts', description: 'Conversa do alerta' },
  ],
  components: {
    securitySchemes: {
      bearer: {
        type: 'http',
        scheme: 'bearer',
        description: 'Token devolvido por POST /people ou POST /admin/session. Não é um JWT de três partes.',
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['status'],
        summary: 'Saúde da API',
        responses: {
          '200': {
            description: 'API no ar. Navegador recebe HTML; outro cliente recebe JSON.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { ok: { type: 'boolean' } },
                  required: ['ok'],
                },
              },
            },
          },
        },
      },
    },
    '/people': {
      post: {
        tags: ['people'],
        summary: 'Registra o aparelho e devolve a sessão de morador',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  shortCode: { type: 'string', minLength: 4, maxLength: 8 },
                },
                required: ['id', 'shortCode'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Pessoa já existia com o mesmo código.' },
          '201': { description: 'Pessoa criada. A resposta inclui id, shortCode e token.' },
          '400': { description: 'Corpo inválido.', content: { 'application/json': { schema: message } } },
          '409': { description: 'Id ou código já usado por outra pessoa.', content: { 'application/json': { schema: message } } },
        },
      },
    },
    '/admin/session': {
      post: {
        tags: ['admin'],
        summary: 'Troca o código de operação por uma sessão de admin',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { code: { type: 'string' } },
                required: ['code'],
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Token de admin, válido por 12 horas.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { token: { type: 'string' } },
                  required: ['token'],
                },
              },
            },
          },
          '401': { description: 'Código inválido.', content: { 'application/json': { schema: message } } },
        },
      },
    },
    '/alerts': {
      get: {
        tags: ['alerts'],
        summary: 'Lista os alertas',
        security: bearer,
        parameters: [
          {
            name: 'situation',
            in: 'query',
            schema: { type: 'string', enum: ['open', 'attending', 'closed'] },
          },
        ],
        responses: {
          '200': {
            description: 'Alertas. reporterId e reporterCode só vêm para o autor ou para a operação.',
            content: { 'application/json': { schema: { type: 'array', items: alert } } },
          },
          '401': { description: 'Sessão ausente ou inválida.', content: { 'application/json': { schema: message } } },
        },
      },
      post: {
        tags: ['alerts'],
        summary: 'Cria um alerta do morador autenticado',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  title: { type: 'string', maxLength: 80 },
                  description: { type: 'string', maxLength: 2000 },
                  severity: { type: 'string', enum: ['info', 'warning', 'critical'] },
                  createdAt: { type: 'string', format: 'date-time' },
                  coordinate,
                  reporterId: { type: 'string' },
                },
                required: ['id', 'title', 'severity', 'createdAt', 'reporterId'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Alerta já existia. A situação gravada é mantida.' },
          '201': { description: 'Alerta criado, sempre aberto.' },
          '400': { description: 'Corpo inválido ou pessoa inexistente.', content: { 'application/json': { schema: message } } },
          '401': { description: 'Sessão ausente ou inválida.', content: { 'application/json': { schema: message } } },
          '403': { description: 'Sessão de admin, ou reporterId diferente da sessão.', content: { 'application/json': { schema: message } } },
        },
      },
    },
    '/alerts/{id}': {
      patch: {
        tags: ['alerts'],
        summary: 'Muda a situação. Só a operação.',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { situation: { type: 'string', enum: ['open', 'attending', 'closed'] } },
                required: ['situation'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Situação gravada.' },
          '400': { description: 'Situação inválida.', content: { 'application/json': { schema: message } } },
          '401': { description: 'Sessão ausente ou inválida.', content: { 'application/json': { schema: message } } },
          '403': { description: 'Sessão de morador.', content: { 'application/json': { schema: message } } },
          '404': { description: 'Alerta não encontrado.', content: { 'application/json': { schema: message } } },
        },
      },
      delete: {
        tags: ['alerts'],
        summary: 'Apaga o alerta e a conversa. Só o autor.',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Alerta apagado.' },
          '401': { description: 'Sessão ausente ou inválida.', content: { 'application/json': { schema: message } } },
          '403': { description: 'Sessão de admin, ou outro morador.', content: { 'application/json': { schema: message } } },
          '404': { description: 'Alerta não encontrado.', content: { 'application/json': { schema: message } } },
        },
      },
    },
    '/alerts/{id}/posts': {
      get: {
        tags: ['posts'],
        summary: 'Lê a conversa do autor ou da operação',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Mensagens em ordem cronológica.', content: { 'application/json': { schema: { type: 'array', items: post } } } },
          '401': { description: 'Sessão ausente ou inválida.', content: { 'application/json': { schema: message } } },
          '403': { description: 'Outro morador.', content: { 'application/json': { schema: message } } },
          '404': { description: 'Alerta não encontrado.', content: { 'application/json': { schema: message } } },
        },
      },
      post: {
        tags: ['posts'],
        summary: 'Publica uma mensagem',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  body: { type: 'string', maxLength: 500 },
                  createdAt: { type: 'string', format: 'date-time' },
                },
                required: ['id', 'body', 'createdAt'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Conversa atualizada. O mesmo id não grava de novo.' },
          '400': { description: 'Mensagem inválida.', content: { 'application/json': { schema: message } } },
          '401': { description: 'Sessão ausente ou inválida.', content: { 'application/json': { schema: message } } },
          '403': { description: 'Outro morador.', content: { 'application/json': { schema: message } } },
          '404': { description: 'Alerta não encontrado.', content: { 'application/json': { schema: message } } },
        },
      },
    },
  },
} as unknown as OpenAPIV3.Document
