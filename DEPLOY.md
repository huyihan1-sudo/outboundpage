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
Host: mapleads
Value: YOUR_SERVER_PUBLIC_IP
TTL: Automatic
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
