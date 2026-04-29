# Namecheap cPanel Trial Deploy

Target domain:

```text
https://maplead.eeconnect.co
```

This is a trial path for Namecheap Shared Hosting. The Node.js dashboard and MySQL can work, but the Google Maps scraper may be blocked by shared-hosting resource rules because it launches a browser automation binary.

## 1. cPanel Checks

Open cPanel and confirm these tools exist:

- Domains or Subdomains
- Setup Node.js App
- MySQL Databases
- Terminal

## 2. Create Subdomain

Create:

```text
maplead.eeconnect.co
```

Use an app folder outside `public_html` if cPanel allows it, for example:

```text
mapleads_app
```

## 3. Create MySQL

Create a database and user, then grant all privileges.

Record these values:

```text
MYSQL_HOST=localhost
MYSQL_DATABASE=...
MYSQL_USER=...
MYSQL_PASSWORD=...
```

## 4. Upload App

Build the upload zip locally:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-cpanel-package.ps1
```

Upload and extract:

```text
dist/cpanel/mapleads-cpanel.zip
```

into the Node app root folder.

## 5. Setup Node.js App

In cPanel > Setup Node.js App:

```text
Node.js version: 24.x, 22.x, or 20.x
Application mode: Production
Application root: mapleads_app
Application URL: maplead.eeconnect.co
Application startup file: server.js
```

Add environment variables:

```text
NODE_ENV=production
DOMAIN=maplead.eeconnect.co
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_DATABASE=your_db
MYSQL_USER=your_user
MYSQL_PASSWORD=your_password
GOSOM_BINARY=/home/YOUR_CPANEL_USER/mapleads_app/tools/gosom/google-maps-scraper
```

If cPanel supports `DATABASE_URL`, you can also use:

```text
DATABASE_URL=mysql://user:password@localhost:3306/database
```

## 6. Install Dependencies

Inside the app virtual environment, run:

```bash
npm install --omit=dev
bash scripts/install-gosom-cpanel.sh
```

Then restart the Node.js app in cPanel.

## 7. Test

Open:

```text
https://maplead.eeconnect.co/api/health
```

Expected:

```json
{"ready":true,"runnerMode":"binary","database":"mysql"}
```

If `runnerMode` is `missing`, the gosom binary did not install or cannot execute.

If the page works but scraping fails, the shared host is likely blocking browser automation or long-running scraper processes. Move the app to a VPS in that case.
