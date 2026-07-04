# Deploy To A Domain With MySQL

This production setup runs:

- Node.js app
- MySQL 8.4
- Caddy reverse proxy with automatic HTTPS
- `gosom/google-maps-scraper` Linux binary inside the app container

## 1. Server Requirements

Use a VPS with:

- Ubuntu 22.04 or 24.04
- Docker and Docker Compose
- ports `80` and `443` open
- DNS `A` record pointing your domain/subdomain to the VPS IP

## 2. Configure Environment

Copy the template:

```bash
cp .env.production.example .env.production
```

Edit `.env.production`:

```bash
DOMAIN=your-domain.com
MYSQL_ROOT_PASSWORD=strong-root-password
MYSQL_DATABASE=maps_leads
MYSQL_USER=maps_leads
MYSQL_PASSWORD=strong-app-password
DATABASE_URL=mysql://maps_leads:strong-app-password@mysql:3306/maps_leads
```

For the current scraper domain, use:

```bash
DOMAIN=maplead.eeconnect.co
```

If you later prefer another scraper-only subdomain, use:

```bash
DOMAIN=leads.eeconnect.co
```

## Namecheap DNS

In Namecheap, open **Domain List > eeconnect.co > Manage > Advanced DNS**.

For root domain deployment:

```text
Type: A Record
Host: @
Value: YOUR_SERVER_PUBLIC_IP
TTL: Automatic
```

For `www`:

```text
Type: CNAME Record
Host: www
Value: eeconnect.co
TTL: Automatic
```

For `maplead.eeconnect.co` deployment:

```text
Type: A Record
Host: maplead
Value: YOUR_SERVER_PUBLIC_IP
TTL: Automatic
```

## GitHub + Render Public Web Deployment

GitHub Pages cannot run this scraper because the app needs a Node.js backend and the
`gosom/google-maps-scraper` binary. For a public web URL, connect this repository to a
Docker-capable web host such as Render.

This repo includes `render.yaml`, so the Render setup is:

1. Push this repository to GitHub.
2. In Render, create a new **Blueprint** from the GitHub repository.
3. Render reads `render.yaml`, builds the Docker image, and exposes the app as a web service.
4. Open the Render service URL, or add a custom domain such as `maplead.eeconnect.co`.

The default app health endpoint is:

```text
/api/health
```

## 3. Start

```bash
docker compose --env-file .env.production up -d --build
```

Open:

```text
https://your-domain.com
```

## 4. Check Logs

```bash
docker compose logs -f app
docker compose logs -f mysql
docker compose logs -f caddy
```

## 5. Database Tables

The app creates tables automatically:

- `jobs`
- `leads`

The dashboard still writes CSV/JSON files under `data/gosom/jobs/`, while MySQL stores job metadata and lead rows for durable query/storage.
