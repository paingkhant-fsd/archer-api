# Archer API

The backend service for Archer. It provides authentication, marketplace data, and the API consumed by the web and mobile clients.

## Prerequisites

- Node.js 24+
- npm 11+

## First-time setup

From this directory:

```powershell
npm install
Copy-Item .env.example .env
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run prisma:seed
```

The seed creates local demo users and marketplace data. It is safe to rerun for a fresh development dataset with `npm run db:reset`.

## Run locally

```powershell
npm run dev
```

The API runs at `http://localhost:4000`.

Health check:

```text
GET http://localhost:4000/api/v1/health
```

## Demo account

```text
Email: freelancer1@archer.local
Password: ArcherDemo123!
```

These credentials are for local development only.

## API surface

All routes are under `/api/v1`.

Current routes include:

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /me`
- `GET /projects`
- `GET /projects/:id`
- `GET /categories`
- `GET /skills`
- `GET /health`

Project discovery supports `search`, `categoryId`, `skillId`, `currency`, `minBudget`, `maxBudget`, `page`, and `pageSize` query parameters.

## Commands

- `npm run dev` - Run the development server with watch mode.
- `npm run build` - Compile the API.
- `npm run typecheck` - Check TypeScript without emitting files.
- `npm run lint` - Run ESLint.
- `npm test` - Run tests.
- `npm run prisma:generate` - Generate the Prisma client.
- `npm run prisma:migrate -- --name <name>` - Create and apply a migration.
- `npm run prisma:seed` - Seed local development data.
- `npm run db:reset` - Reset the local database and seed it again.

## Environment

Copy `.env.example` to `.env` and set local values for the port, SQLite database, JWT secrets, token lifetimes, and web-client CORS origin. Never commit `.env`.

## Troubleshooting

- If Prisma reports that its client is missing or stale, run `npm run prisma:generate`.
- If the local database schema is missing, run `npm run prisma:migrate -- --name init` and then `npm run prisma:seed`.
- If a browser client is blocked by CORS, verify that `CORS_ORIGIN` matches the client's exact local origin.

## License

Archer API is available under the [MIT License](./LICENSE).
