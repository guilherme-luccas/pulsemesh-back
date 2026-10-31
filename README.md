# pulsemesh-back

API do PulseMesh. O app fica em outro repositório: [PulseMesh](https://github.com/guilherme-luccas/PulseMesh).

Postgres local. A API lê `DATABASE_URL`. O Git não leva os dados, só o formato das tabelas em `src/db/schema.ts`.

## Estrutura

```
src/server.ts       rotas
src/openapi.ts      Swagger
src/auth.ts         sessão de cidadão e de admin
src/access.ts       quem pode ver o autor e a conversa
src/env.ts          PORT, DATABASE_URL, ADMIN_CODE, JWT_SECRET
src/db/schema.ts    people, alerts, posts, situation_events
src/db/client.ts
src/server.test.ts
```

## Como rodar

Node 20 ou mais novo e Postgres 17. O exemplo abaixo é o Postgres do Homebrew no Mac, sem senha, usuário do sistema.

```bash
brew install postgresql@17
brew services start postgresql@17
createdb pulsemesh

npm install
cp .env.example .env
npm run db:push
npm run dev
```

`db:push` cria as tabelas. Rode de novo quando `src/db/schema.ts` mudar. Sem isso a API sobe e quebra na primeira gravação.

O servidor escuta em `0.0.0.0:3333`.

- Saúde: http://127.0.0.1:3333/health
- Swagger: http://127.0.0.1:3333/docs

No TablePlus: host `127.0.0.1`, porta `5432`, usuário do Mac, senha em branco, banco `pulsemesh`.

O `.env` não entra no Git. Troque `JWT_SECRET` fora da sua máquina. O app pede o `ADMIN_CODE` na tela de operação. O valor local do exemplo é `PULSE-OPS`.

## Verificação

O Postgres precisa estar no ar. Os testes apagam as linhas que criam.

```bash
npm test
npm run typecheck
```
