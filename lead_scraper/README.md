# Google Maps Lead Scraper

This folder implements the first-pass lead workflow for US local businesses in:

- Los Angeles, CA
- New York, NY
- Boston, MA

The default queries cover wireless stores, cell phone stores, phone repair, iPhone repair, computer repair, computer stores, and electronics repair.

## Output fields

The normalized output uses these columns:

`store_name`, `address`, `phone`, `image_url`, `website`, `hours`, `rating`, `review_count`, `google_maps_url`, `latitude`, `longitude`, `category`, `city`, `source_keyword`, `place_id`, `cid`, `business_status`, `source_tool`, `scraped_at`

## Quick start

Preview the query plan without spending credits:

```powershell
& "C:\Users\1\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" lead_scraper\google_maps_leads.py --dry-run
```

Run with Outscraper:

```powershell
$env:OUTSCRAPER_API_KEY="YOUR_API_KEY"
& "C:\Users\1\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" lead_scraper\google_maps_leads.py
```

The tool writes:

- `lead_scraper/output/google_maps_leads.csv`
- `lead_scraper/output/google_maps_leads.json`
- `lead_scraper/output/google_maps_leads.xlsx`
- `lead_scraper/output/qa_sample.csv`
- `lead_scraper/output/raw/*.json`

## Options

Use a smaller pilot batch:

```powershell
& "C:\Users\1\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" lead_scraper\google_maps_leads.py --limit-per-query 50
```

Normalize an existing Outscraper JSON export:

```powershell
& "C:\Users\1\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" lead_scraper\google_maps_leads.py --input-json path\to\outscraper-export.json
```

## Data handling notes

- Permanently closed businesses are filtered out.
- Temporarily closed businesses are retained and marked in `business_status`.
- Deduplication prefers `place_id`, then `cid`, then `store_name + phone + address`.
- Image URLs are preserved as URLs only; this tool does not download Google Maps photos.
- Before public display or resale, confirm provider terms, Google Maps content rules, and any photo attribution requirements.
