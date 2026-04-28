#!/usr/bin/env python3
"""Collect and normalize Google Maps local business leads via Outscraper."""

from __future__ import annotations

import argparse
import csv
import json
import os
import random
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


OUTPUT_FIELDS = [
    "store_name",
    "address",
    "phone",
    "image_url",
    "website",
    "hours",
    "rating",
    "review_count",
    "google_maps_url",
    "latitude",
    "longitude",
    "category",
    "city",
    "source_keyword",
    "place_id",
    "cid",
    "business_status",
    "source_tool",
    "scraped_at",
]

DEFAULT_CONFIG = {
    "provider": "outscraper",
    "language": "en",
    "region": "US",
    "limit_per_query": 500,
    "qa_sample_per_city": 50,
    "output_dir": "lead_scraper/output",
    "cities": ["Los Angeles, CA", "New York, NY", "Boston, MA"],
    "keywords": [
        "wireless store",
        "cell phone store",
        "mobile phone repair",
        "phone repair",
        "iPhone repair",
        "computer repair",
        "computer store",
        "electronics repair",
    ],
}


@dataclass(frozen=True)
class QueryJob:
    keyword: str
    city: str

    @property
    def query(self) -> str:
        return f"{self.keyword}, {self.city}"

    @property
    def slug(self) -> str:
        return slugify(self.query)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Scrape and normalize Google Maps lead data for US wireless/repair/computer stores."
    )
    parser.add_argument(
        "--config",
        default="lead_scraper/config.example.json",
        help="Path to a JSON config with cities, keywords, output_dir, and limits.",
    )
    parser.add_argument(
        "--api-key",
        default=os.environ.get("OUTSCRAPER_API_KEY"),
        help="Outscraper API key. Defaults to OUTSCRAPER_API_KEY.",
    )
    parser.add_argument(
        "--limit-per-query",
        type=int,
        help="Override organizations per keyword/city query.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print planned queries without calling Outscraper.",
    )
    parser.add_argument(
        "--input-json",
        help="Normalize an existing Outscraper JSON export instead of calling the API.",
    )
    parser.add_argument(
        "--no-xlsx",
        action="store_true",
        help="Skip Excel output even if openpyxl is available.",
    )
    args = parser.parse_args()

    config = load_config(Path(args.config))
    if args.limit_per_query is not None:
        config["limit_per_query"] = args.limit_per_query

    jobs = build_jobs(config)
    if args.dry_run:
        print_plan(config, jobs)
        return 0

    scraped_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    output_dir = Path(config["output_dir"])
    output_dir.mkdir(parents=True, exist_ok=True)

    if args.input_json:
        raw_records = load_existing_json(Path(args.input_json))
    else:
        if not args.api_key:
            print(
                "Missing Outscraper API key. Set OUTSCRAPER_API_KEY or pass --api-key.",
                file=sys.stderr,
            )
            return 2
        raw_records = scrape_outscraper(args.api_key, config, jobs, output_dir)

    normalized = [
        normalize_record(item, scraped_at=scraped_at)
        for item in raw_records
        if isinstance(item, dict)
    ]
    filtered = [row for row in normalized if not is_permanently_closed(row)]
    deduped = deduplicate(filtered)
    qa_rows = sample_for_qa(deduped, int(config.get("qa_sample_per_city", 50)))

    write_csv(output_dir / "google_maps_leads.csv", deduped)
    write_json(output_dir / "google_maps_leads.json", deduped)
    write_csv(output_dir / "qa_sample.csv", qa_rows)

    if not args.no_xlsx:
        maybe_write_xlsx(output_dir / "google_maps_leads.xlsx", deduped)

    print(f"Raw records: {len(raw_records)}")
    print(f"After permanently-closed filter: {len(filtered)}")
    print(f"After dedupe: {len(deduped)}")
    print(f"QA sample rows: {len(qa_rows)}")
    print(f"Output directory: {output_dir.resolve()}")
    return 0


def load_config(path: Path) -> dict[str, Any]:
    config = DEFAULT_CONFIG.copy()
    if path.exists():
        with path.open("r", encoding="utf-8-sig") as handle:
            user_config = json.load(handle)
        config.update(user_config)
    required = ["cities", "keywords", "output_dir", "limit_per_query"]
    missing = [key for key in required if not config.get(key)]
    if missing:
        raise ValueError(f"Missing required config keys: {', '.join(missing)}")
    return config


def build_jobs(config: dict[str, Any]) -> list[QueryJob]:
    return [
        QueryJob(keyword=str(keyword), city=str(city))
        for city in config["cities"]
        for keyword in config["keywords"]
    ]


def print_plan(config: dict[str, Any], jobs: list[QueryJob]) -> None:
    print(f"Provider: {config.get('provider', 'outscraper')}")
    print(f"Cities: {', '.join(config['cities'])}")
    print(f"Keywords: {', '.join(config['keywords'])}")
    print(f"Limit per query: {config['limit_per_query']}")
    print(f"Total query jobs: {len(jobs)}")
    for idx, job in enumerate(jobs, start=1):
        print(f"{idx:02d}. {job.query}")


def scrape_outscraper(
    api_key: str,
    config: dict[str, Any],
    jobs: list[QueryJob],
    output_dir: Path,
) -> list[dict[str, Any]]:
    all_records: list[dict[str, Any]] = []
    raw_dir = output_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)

    for index, job in enumerate(jobs, start=1):
        print(f"[{index}/{len(jobs)}] Outscraper search: {job.query}")
        data = outscraper_search(
            api_key=api_key,
            query=job.query,
            limit=int(config["limit_per_query"]),
            language=str(config.get("language", "en")),
            region=str(config.get("region", "US")),
        )
        records = flatten_records(data)
        for record in records:
            record.setdefault("source_keyword", job.keyword)
            record.setdefault("source_city", job.city)
            record.setdefault("_source_query", job.query)
        all_records.extend(records)
        write_json(raw_dir / f"{job.slug}.json", data)
        time.sleep(float(config.get("request_pause_seconds", 1)))

    return all_records


def outscraper_search(
    api_key: str,
    query: str,
    limit: int,
    language: str,
    region: str,
) -> Any:
    params = {
        "query": query,
        "language": language,
        "region": region,
        "organizationsPerQueryLimit": limit,
        "dropDuplicates": "false",
        "async": "false",
    }
    url = "https://api.app.outscraper.com/maps/search-v3?" + urllib.parse.urlencode(
        params
    )
    request = urllib.request.Request(
        url,
        headers={"X-API-KEY": api_key, "client": "EECONNECT Lead Scraper"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Outscraper HTTP {exc.code}: {body}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Outscraper request failed: {exc}") from exc

    if isinstance(payload, dict) and payload.get("errorMessage"):
        raise RuntimeError(f"Outscraper error: {payload['errorMessage']}")
    return payload.get("data", payload) if isinstance(payload, dict) else payload


def load_existing_json(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8-sig") as handle:
        payload = json.load(handle)
    return flatten_records(payload)


def flatten_records(payload: Any) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    if isinstance(payload, dict):
        if isinstance(payload.get("data"), list):
            return flatten_records(payload["data"])
        if looks_like_place(payload):
            return [payload]
        for value in payload.values():
            records.extend(flatten_records(value))
    elif isinstance(payload, list):
        for item in payload:
            records.extend(flatten_records(item))
    return records


def looks_like_place(item: dict[str, Any]) -> bool:
    place_keys = {
        "name",
        "business_name",
        "full_address",
        "address",
        "phone",
        "site",
        "rating",
        "reviews",
        "place_id",
        "google_id",
    }
    return bool(place_keys.intersection(item.keys()))


def normalize_record(item: dict[str, Any], scraped_at: str) -> dict[str, Any]:
    latitude, longitude = get_lat_lng(item)
    row = {
        "store_name": first(item, ["name", "business_name", "title", "place_name"]),
        "address": first(
            item,
            ["full_address", "address", "formatted_address", "street_address"],
        ),
        "phone": first(
            item,
            ["phone", "phone_number", "international_phone_number", "telephone"],
        ),
        "image_url": first_image(item),
        "website": first(item, ["site", "website", "url", "domain"]),
        "hours": serialize_hours(
            first(
                item,
                [
                    "working_hours",
                    "hours",
                    "opening_hours",
                    "business_hours",
                    "current_opening_hours",
                ],
            )
        ),
        "rating": first(item, ["rating", "reviews_rating", "stars"]),
        "review_count": first(item, ["reviews", "reviews_count", "review_count"]),
        "google_maps_url": first(
            item,
            ["location_link", "google_maps_url", "maps_url", "place_link", "url"],
        ),
        "latitude": latitude,
        "longitude": longitude,
        "category": normalize_category(item),
        "city": first(item, ["source_city", "city", "borough"]),
        "source_keyword": first(item, ["source_keyword", "keyword", "_source_query"]),
        "place_id": first(item, ["place_id", "google_id"]),
        "cid": first(item, ["cid", "google_mid", "data_id"]),
        "business_status": business_status(item),
        "source_tool": "outscraper",
        "scraped_at": scraped_at,
    }
    return {field: clean_value(row.get(field)) for field in OUTPUT_FIELDS}


def get_lat_lng(item: dict[str, Any]) -> tuple[Any, Any]:
    latitude = first(item, ["latitude", "lat"])
    longitude = first(item, ["longitude", "lng", "lon"])
    gps = item.get("gps_coordinates") or item.get("coordinates")
    if isinstance(gps, dict):
        latitude = latitude or first(gps, ["latitude", "lat"])
        longitude = longitude or first(gps, ["longitude", "lng", "lon"])
    return latitude, longitude


def normalize_category(item: dict[str, Any]) -> Any:
    value = first(item, ["category", "type", "types", "business_category"])
    if isinstance(value, list):
        return ", ".join(str(part) for part in value if part)
    return value


def first_image(item: dict[str, Any]) -> Any:
    value = first(
        item,
        ["photo", "photos", "image", "images", "thumbnail", "main_image", "photo_url"],
    )
    if isinstance(value, list):
        if not value:
            return ""
        first_item = value[0]
        if isinstance(first_item, dict):
            return first(first_item, ["url", "src", "link", "photo_url"])
        return first_item
    if isinstance(value, dict):
        return first(value, ["url", "src", "link", "photo_url"])
    return value


def first(item: dict[str, Any], keys: list[str]) -> Any:
    for key in keys:
        value = item.get(key)
        if value not in (None, "", [], {}):
            return value
    return ""


def business_status(item: dict[str, Any]) -> Any:
    if item.get("permanently_closed") is True:
        return "PERMANENTLY_CLOSED"
    if item.get("temporarily_closed") is True:
        return "TEMPORARILY_CLOSED"
    return first(
        item,
        [
            "business_status",
            "status",
            "place_status",
            "temporarily_closed",
            "permanently_closed",
        ],
    )


def serialize_hours(value: Any) -> str:
    if not value:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "; ".join(str(part) for part in value if part)
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def clean_value(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, bool):
        return str(value).lower()
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    return value


def is_permanently_closed(row: dict[str, Any]) -> bool:
    status = str(row.get("business_status", "")).lower()
    return "permanent" in status and "closed" in status


def deduplicate(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    deduped: list[dict[str, Any]] = []
    for row in rows:
        key = dedupe_key(row)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(row)
    return deduped


def dedupe_key(row: dict[str, Any]) -> str:
    place_id = str(row.get("place_id") or "").strip()
    cid = str(row.get("cid") or "").strip()
    if place_id:
        return f"place_id:{place_id}"
    if cid:
        return f"cid:{cid}"
    fallback = "|".join(
        normalize_text(row.get(field, ""))
        for field in ["store_name", "phone", "address"]
    )
    return f"fallback:{fallback}"


def normalize_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value).lower()).strip()


def sample_for_qa(rows: list[dict[str, Any]], per_city: int) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        grouped.setdefault(str(row.get("city") or "Unknown"), []).append(row)

    sample: list[dict[str, Any]] = []
    rng = random.Random(42)
    for city in sorted(grouped):
        city_rows = grouped[city]
        count = min(per_city, len(city_rows))
        sample.extend(rng.sample(city_rows, count))
    return sample


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUTPUT_FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)


def maybe_write_xlsx(path: Path, rows: list[dict[str, Any]]) -> None:
    try:
        from openpyxl import Workbook
    except ImportError:
        print("openpyxl is not installed; skipped XLSX output.", file=sys.stderr)
        return

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Google Maps Leads"
    sheet.append(OUTPUT_FIELDS)
    for row in rows:
        sheet.append([row.get(field, "") for field in OUTPUT_FIELDS])
    for column_cells in sheet.columns:
        max_length = max(len(str(cell.value or "")) for cell in column_cells)
        sheet.column_dimensions[column_cells[0].column_letter].width = min(
            max(max_length + 2, 12), 60
        )
    path.parent.mkdir(parents=True, exist_ok=True)
    workbook.save(path)


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug[:120] or "query"


if __name__ == "__main__":
    raise SystemExit(main())
