# EECONNECT Maps Leads

Local Google Maps lead scraping dashboard powered by the open-source `gosom/google-maps-scraper` runner.

## Files

- `index.html` - lead search dashboard
- `styles.css` - dashboard styling and responsive layout
- `script.js` - browser-side task creation, polling, logs, and exports
- `server.js` - local API server that runs gosom jobs and normalizes results
- `scripts/install-gosom.ps1` - downloads the latest Windows gosom binary
- `scripts/start-server.ps1` - starts the local web server
- `lead_scraper/` - Google Maps local business lead scraper and cleaning workflow

## Preview locally

Install the gosom runner:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-gosom.ps1
```

Start the web tool:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-server.ps1
```

Then open:

```text
http://localhost:3000
```

The dashboard lets you enter cities and keywords, start a scraping job, monitor logs, preview results, and download CSV/JSON.

Expose the local dashboard publicly with a temporary Cloudflare Quick Tunnel:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-public-tunnel.ps1
```

The generated `trycloudflare.com` URL stays alive while the tunnel process and local server are running.

## Google Maps lead scraping

The default search list covers Los Angeles, New York, and Boston with wireless store, phone repair, computer repair, computer store, and electronics repair keywords.

Normalized fields:

`store_name`, `address`, `phone`, `image_url`, `website`, `hours`, `rating`, `review_count`, `google_maps_url`, `latitude`, `longitude`, `category`, `city`, `source_keyword`, `place_id`, `cid`, `business_status`, `source_tool`, `scraped_at`

## Sharing

This project now includes a local Node server, so run it on a machine where the gosom binary or Docker is available.
