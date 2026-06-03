# {{APP_NAME}}

A Shopify Node/Express app that talks to the Admin GraphQL API via the Client
Credentials Grant.

## Setup

```bash
npm install
cp .env.example .env   # then fill in your credentials
npm run dev
```

## Environment

Set these in `.env` (see `.env.example`):

- `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` — from the Partner Dashboard
- `API_ACCESS_TOKEN` — Bearer token protecting authenticated routes
- `PORT` — defaults to 3000

## Endpoints

- `GET /health` — service + configuration status
- `POST /webhooks/products/create`, `POST /webhooks/products/update` — HMAC-verified Shopify webhooks

## Structure

```text
src/
  config/      Shopify Admin GraphQL client (Client Credentials Grant)
  middleware/  auth (Bearer) + Shopify webhook HMAC verification
  routes/      Express routers (health, webhooks)
  services/    business logic / GraphQL calls
  utils/       logger (pino) + helpers
scripts/       one-off scripts run manually (not part of the running app)
```
