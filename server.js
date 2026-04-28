const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const crypto = require("node:crypto");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(ROOT, "data", "gosom");
const JOBS_DIR = path.join(DATA_DIR, "jobs");
const TOOLS_DIR = path.join(ROOT, "tools", "gosom");
const MAX_BODY_BYTES = 1024 * 1024;

const OUTPUT_FIELDS = [
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
  "scraped_at"
];

const jobs = new Map();

ensureDir(JOBS_DIR);
loadExistingJobs();

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/api/health") {
      return sendJson(res, await getHealth());
    }

    if (req.method === "POST" && req.url === "/api/search") {
      const body = await readJsonBody(req);
      const job = await createJob(body);
      return sendJson(res, { jobId: job.id, status: job.status }, 202);
    }

    if (req.method === "GET" && req.url === "/api/jobs/latest") {
      const latest = getLatestJob();
      return sendJson(res, latest ? publicJob(latest) : { job: null });
    }

    const jobMatch = req.url.match(/^\/api\/jobs\/([^/?]+)(?:\?(.*))?$/);
    if (req.method === "GET" && jobMatch) {
      const id = decodeURIComponent(jobMatch[1]);
      const job = getJob(id);
      return sendJson(res, publicJob(job));
    }

    const downloadMatch = req.url.match(/^\/api\/jobs\/([^/]+)\/download(?:\?(.*))?$/);
    if (req.method === "GET" && downloadMatch) {
      const id = decodeURIComponent(downloadMatch[1]);
      const query = new URLSearchParams(downloadMatch[2] || "");
      return sendDownload(res, getJob(id), query.get("format") || "csv");
    }

    return serveStatic(req, res);
  } catch (error) {
    const status = Number(error.statusCode || 500);
    sendJson(res, { error: error.message || "Server error" }, status);
  }
});

server.listen(PORT, () => {
  console.log(`EECONNECT Maps Leads is running at http://localhost:${PORT}`);
});

async function getHealth() {
  const binary = findGosomBinary();
  const docker = commandAvailable("docker", ["--version"]);
  const runnerMode = binary.available ? "binary" : docker.available ? "docker" : "missing";

  return {
    ready: binary.available || docker.available,
    runnerMode,
    binary,
    docker,
    dataDir: DATA_DIR
  };
}

function findGosomBinary() {
  const envPath = process.env.GOSOM_BINARY;
  const candidates = [
    envPath,
    path.join(TOOLS_DIR, "google-maps-scraper.exe"),
    path.join(TOOLS_DIR, "google_maps_scraper.exe"),
    path.join(TOOLS_DIR, "google-maps-scraper"),
    path.join(TOOLS_DIR, "google_maps_scraper")
  ].filter(Boolean);

  if (fs.existsSync(TOOLS_DIR)) {
    for (const name of fs.readdirSync(TOOLS_DIR)) {
      if (/google[-_]maps[-_]scraper.*(\.exe)?$/i.test(name)) {
        candidates.push(path.join(TOOLS_DIR, name));
      }
    }
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const check = spawnSync(candidate, ["-h"], { encoding: "utf8", timeout: 20000 });
      return {
        available: check.status === 0 || check.status === 2,
        path: candidate,
        message: (check.stderr || check.stdout || "").split(/\r?\n/)[0] || "found"
      };
    }
  }

  return {
    available: false,
    path: path.join(TOOLS_DIR, "google-maps-scraper.exe"),
    message: "not installed"
  };
}

function commandAvailable(command, args) {
  try {
    const result = spawnSync(command, args, { encoding: "utf8", timeout: 10000 });
    return {
      available: result.status === 0,
      message: (result.stdout || result.stderr || "").trim().split(/\r?\n/)[0] || ""
    };
  } catch {
    return { available: false, message: "not installed" };
  }
}

async function createJob(payload) {
  const health = await getHealth();
  if (!health.ready) {
    const error = new Error("未检测到 gosom 二进制或 Docker。请先运行 scripts\\install-gosom.ps1，或安装 Docker。");
    error.statusCode = 409;
    throw error;
  }

  const cities = cleanLines(payload.cities);
  const keywords = cleanLines(payload.keywords);
  if (!cities.length || !keywords.length) {
    const error = new Error("城市和关键词不能为空。");
    error.statusCode = 400;
    throw error;
  }
  if (payload.fastMode && !validGeo(payload.geo)) {
    const error = new Error("快速模式需要填写中心点经纬度，例如 42.3601,-71.0589。普通城市搜索请关闭快速模式。");
    error.statusCode = 400;
    throw error;
  }

  const negativeKeywords = cleanNegativeKeywords(payload.negativeKeywords);

  const id = newJobId();
  const dir = path.join(JOBS_DIR, id);
  ensureDir(dir);

  const queries = buildQueries(cities, keywords);
  const inputPath = path.join(dir, "queries.txt");
  const rawPath = path.join(dir, "raw-results.json");
  const cleanJsonPath = path.join(dir, "google_maps_leads.json");
  const cleanCsvPath = path.join(dir, "google_maps_leads.csv");
  const logPath = path.join(dir, "run.log");

  fs.writeFileSync(inputPath, queries.map((item) => `${item.query} #!#${item.keyword}||${item.city}`).join("\n"), "utf8");
  fs.writeFileSync(logPath, "", "utf8");

  const job = {
    id,
    status: "queued",
    runnerMode: health.runnerMode,
    negativeKeywords,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    dir,
    inputPath,
    rawPath,
    cleanJsonPath,
    cleanCsvPath,
    logPath,
    queries,
    counts: { queries: queries.length, raw: 0, clean: 0 },
    preview: [],
    results: [],
    error: null
  };
  jobs.set(id, job);

  runJob(job, payload, health).catch((error) => {
    job.status = "failed";
    job.error = error.message;
    appendLog(job, `ERROR: ${error.stack || error.message}`);
    touch(job);
  });

  return job;
}

function runJob(job, options, health) {
  return new Promise((resolve) => {
    job.status = "running";
    touch(job);

    const command = health.runnerMode === "binary" ? health.binary.path : "docker";
    const args = health.runnerMode === "binary"
      ? buildBinaryArgs(job, options)
      : buildDockerArgs(job, options);

    appendLog(job, `Runner: ${health.runnerMode}`);
    appendLog(job, `Command: ${command} ${args.join(" ")}`);

    const child = spawn(command, args, {
      cwd: ROOT,
      windowsHide: true,
      env: { ...process.env, DISABLE_TELEMETRY: process.env.DISABLE_TELEMETRY || "1" }
    });

    child.stdout.on("data", (chunk) => appendLog(job, chunk.toString()));
    child.stderr.on("data", (chunk) => appendLog(job, chunk.toString()));

    child.on("error", (error) => {
      job.status = "failed";
      job.error = error.message;
      appendLog(job, `Process error: ${error.message}`);
      touch(job);
      resolve();
    });

    child.on("close", (code) => {
      appendLog(job, `Process exited with code ${code}`);
      if (code !== 0) {
        job.status = "failed";
        job.error = `gosom exited with code ${code}`;
        touch(job);
        return resolve();
      }

      try {
        finalizeJob(job);
        job.status = "completed";
      } catch (error) {
        job.status = "failed";
        job.error = error.message;
        appendLog(job, `Finalize error: ${error.stack || error.message}`);
      }
      touch(job);
      resolve();
    });
  });
}

function buildBinaryArgs(job, options) {
  const args = [
    "-input", job.inputPath,
    "-results", job.rawPath,
    "-json",
    "-depth", String(clampNumber(options.depth, 1, 20, 1)),
    "-c", String(clampNumber(options.concurrency, 1, 16, 2)),
    "-exit-on-inactivity", cleanDuration(options.exitOnInactivity),
    "-lang", "en"
  ];
  addOptionalArgs(args, options);
  return args;
}

function buildDockerArgs(job, options) {
  const args = [
    "run",
    "--rm",
    "-v", "gmaps-playwright-cache:/opt",
    "-v", `${job.inputPath}:/queries.txt:ro`,
    "-v", `${job.dir}:/out`,
    "gosom/google-maps-scraper",
    "-input", "/queries.txt",
    "-results", "/out/raw-results.json",
    "-json",
    "-depth", String(clampNumber(options.depth, 1, 20, 1)),
    "-c", String(clampNumber(options.concurrency, 1, 16, 2)),
    "-exit-on-inactivity", cleanDuration(options.exitOnInactivity),
    "-lang", "en"
  ];
  addOptionalArgs(args, options);
  return args;
}

function addOptionalArgs(args, options) {
  if (options.fastMode) args.push("-fast-mode");
  if (validGeo(options.geo)) {
    args.push("-geo", String(options.geo).trim());
    args.push("-radius", String(clampNumber(options.radius, 100, 50000, 10000)));
    args.push("-zoom", String(clampNumber(options.zoom, 1, 21, 15)));
  }
  if (options.email) args.push("-email");
  if (options.extraReviews) args.push("-extra-reviews");
  if (typeof options.proxies === "string" && options.proxies.trim()) {
    args.push("-proxies", options.proxies.trim());
  }
}

function finalizeJob(job) {
  if (!fs.existsSync(job.rawPath)) {
    throw new Error("gosom 没有生成 raw-results.json。请查看日志确认是否被 Google 阻挡或任务时间过短。");
  }

  const rawRecords = readResultFile(job.rawPath);
  const scrapedAt = new Date().toISOString();
  const normalized = rawRecords.map((record) => normalizeRecord(record, scrapedAt));
  const filtered = normalized
    .filter((row) => !isPermanentlyClosed(row))
    .filter((row) => !matchesNegativeKeyword(row, job.negativeKeywords));
  const deduped = deduplicate(filtered);

  fs.writeFileSync(job.cleanJsonPath, JSON.stringify(deduped, null, 2), "utf8");
  fs.writeFileSync(job.cleanCsvPath, toCsv(deduped), "utf8");

  job.counts.raw = rawRecords.length;
  job.counts.clean = deduped.length;
  job.preview = deduped.slice(0, 100);
  job.results = deduped;
  appendLog(job, `Raw records: ${rawRecords.length}`);
  appendLog(job, `Clean records: ${deduped.length}`);
}

function readResultFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8").trim();
  if (!content) return [];

  try {
    return flatten(JSON.parse(content));
  } catch {
    const rows = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    if (rows.length) return flatten(rows);
  }

  return parseCsv(content);
}

function flatten(value) {
  if (Array.isArray(value)) return value.flatMap(flatten);
  if (value && typeof value === "object") {
    if (Array.isArray(value.data)) return flatten(value.data);
    if (looksLikePlace(value)) return [value];
    return Object.values(value).flatMap(flatten);
  }
  return [];
}

function looksLikePlace(value) {
  return ["title", "name", "address", "phone", "website", "cid", "place_id", "link"].some((key) => key in value);
}

function normalizeRecord(record, scrapedAt) {
  const input = parseInputId(pick(record, ["input_id", "inputId", "query"]));
  const image = firstImage(record);
  return normalizeRow({
    store_name: pick(record, ["title", "name", "business_name"]),
    address: firstAddress(record),
    phone: pick(record, ["phone", "phone_number", "international_phone_number"]),
    image_url: image,
    website: pick(record, ["web_site", "website", "site"]),
    hours: serialize(pick(record, ["open_hours", "working_hours", "hours"])),
    rating: pick(record, ["review_rating", "rating", "reviews_rating"]),
    review_count: pick(record, ["review_count", "reviews", "reviews_count"]),
    google_maps_url: pick(record, ["link", "google_maps_url", "location_link"]),
    latitude: pick(record, ["latitude", "lat"]),
    longitude: pick(record, ["longitude", "longtitude", "lng", "lon"]),
    category: serialize(pick(record, ["category", "categories", "type", "types"])),
    city: input.city || pick(record, ["city"]),
    source_keyword: input.keyword || pick(record, ["source_keyword"]),
    place_id: pick(record, ["place_id", "data_id"]),
    cid: pick(record, ["cid"]),
    business_status: pick(record, ["status", "business_status", "place_status"]),
    source_tool: "gosom/google-maps-scraper",
    scraped_at: scrapedAt
  });
}

function normalizeRow(row) {
  const normalized = {};
  for (const field of OUTPUT_FIELDS) {
    normalized[field] = cleanCell(row[field]);
  }
  return normalized;
}

function parseInputId(value) {
  const text = String(value || "");
  if (!text.includes("||")) return { keyword: "", city: "" };
  const [keyword, city] = text.split("||");
  return { keyword: keyword || "", city: city || "" };
}

function pick(record, keys) {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return "";
}

function firstAddress(record) {
  for (const key of ["address", "complete_address", "full_address"]) {
    const value = record[key];
    const formatted = formatAddress(value);
    if (formatted) return formatted;
  }
  return "";
}

function formatAddress(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value !== "object") return String(value);
  const direct = pick(value, ["formatted", "full", "address"]);
  if (direct) return direct;
  const parts = [
    value.street,
    value.city,
    value.state,
    value.postal_code,
    value.country
  ].filter(Boolean);
  return parts.join(", ");
}

function firstImage(record) {
  const value = pick(record, ["thumbnail", "images", "image_url", "photo", "photos"]);
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "object" && first ? pick(first, ["image", "url", "src", "link"]) : first || "";
  }
  if (value && typeof value === "object") {
    return pick(value, ["image", "url", "src", "link"]);
  }
  return value;
}

function serialize(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join("; ");
  return JSON.stringify(value);
}

function cleanCell(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value) || typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function isPermanentlyClosed(row) {
  const status = String(row.business_status || "").toLowerCase();
  return status.includes("permanent") && status.includes("closed");
}

function cleanNegativeKeywords(value) {
  return cleanLines(value).map((kw) => kw.toLowerCase());
}

function matchesNegativeKeyword(row, negativeKeywords) {
  if (!negativeKeywords || !negativeKeywords.length) return false;
  const name = normalizeText(row.store_name);
  const category = normalizeText(row.category);
  return negativeKeywords.some((kw) => name.includes(kw) || category.includes(kw));
}

function deduplicate(rows) {
  const seen = new Set();
  const output = [];
  for (const row of rows) {
    const key = dedupeKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(row);
  }
  return output;
}

function dedupeKey(row) {
  if (row.place_id) return `place:${row.place_id}`;
  if (row.cid) return `cid:${row.cid}`;
  return ["store_name", "phone", "address"].map((field) => normalizeText(row[field])).join("|");
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function toCsv(rows) {
  const lines = [OUTPUT_FIELDS.join(",")];
  for (const row of rows) {
    lines.push(OUTPUT_FIELDS.map((field) => csvCell(row[field])).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function parseCsv(content) {
  const rows = [];
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return rows;
  const headers = splitCsvLine(lines[0]).map((header) => header.replace(/^\uFEFF/, ""));
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] || "";
    });
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function cleanLines(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function buildQueries(cities, keywords) {
  return cities.flatMap((city) => keywords.map((keyword) => ({
    city,
    keyword,
    query: `${keyword} in ${city}`
  })));
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Math.round(number), min), max);
}

function cleanDuration(value) {
  const text = String(value || "3m");
  return /^\d+[smh]$/.test(text) ? text : "3m";
}

function validGeo(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  const match = text.match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return false;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function newJobId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `${stamp}-${crypto.randomBytes(3).toString("hex")}`;
}

function appendLog(job, message) {
  const text = String(message).replace(/\r/g, "");
  fs.appendFileSync(job.logPath, text.endsWith("\n") ? text : `${text}\n`, "utf8");
  touch(job);
}

function touch(job) {
  job.updatedAt = new Date().toISOString();
}

function getJob(id) {
  const job = jobs.get(id);
  if (!job) {
    const error = new Error("任务不存在或服务已重启。");
    error.statusCode = 404;
    throw error;
  }
  return job;
}

function getLatestJob() {
  return Array.from(jobs.values())
    .filter((job) => job.status === "completed")
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0] || null;
}

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    runnerMode: job.runnerMode,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    counts: job.counts,
    preview: job.preview,
    results: job.results || job.preview || [],
    error: job.error,
    logs: fs.existsSync(job.logPath) ? tailFile(job.logPath, 30000) : ""
  };
}

function loadExistingJobs() {
  if (!fs.existsSync(JOBS_DIR)) return;

  for (const id of fs.readdirSync(JOBS_DIR)) {
    const dir = path.join(JOBS_DIR, id);
    if (!fs.statSync(dir).isDirectory()) continue;

    const cleanJsonPath = path.join(dir, "google_maps_leads.json");
    const cleanCsvPath = path.join(dir, "google_maps_leads.csv");
    if (!fs.existsSync(cleanJsonPath)) continue;

    let results = [];
    try {
      results = JSON.parse(fs.readFileSync(cleanJsonPath, "utf8"));
    } catch {
      results = [];
    }

    const inputPath = path.join(dir, "queries.txt");
    const rawPath = path.join(dir, "raw-results.json");
    const logPath = path.join(dir, "run.log");
    const queryCount = fs.existsSync(inputPath)
      ? fs.readFileSync(inputPath, "utf8").split(/\r?\n/).filter(Boolean).length
      : 0;
    const stat = fs.statSync(cleanJsonPath);

    jobs.set(id, {
      id,
      status: "completed",
      runnerMode: "binary",
      createdAt: stat.birthtime.toISOString(),
      updatedAt: stat.mtime.toISOString(),
      dir,
      inputPath,
      rawPath,
      cleanJsonPath,
      cleanCsvPath,
      logPath,
      queries: [],
      counts: { queries: queryCount, raw: results.length, clean: results.length },
      preview: results.slice(0, 100),
      results,
      error: null
    });
  }
}

function tailFile(filePath, maxChars) {
  const content = fs.readFileSync(filePath, "utf8");
  return content.length > maxChars ? content.slice(-maxChars) : content;
}

function sendDownload(res, job, format) {
  const filePath = format === "json" ? job.cleanJsonPath : job.cleanCsvPath;
  if (!fs.existsSync(filePath)) {
    const error = new Error("结果文件尚未生成。");
    error.statusCode = 404;
    throw error;
  }
  const filename = format === "json" ? "google_maps_leads.json" : "google_maps_leads.csv";
  res.writeHead(200, {
    "Content-Type": format === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`
  });
  fs.createReadStream(filePath).pipe(res);
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(ROOT, pathname));

  if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const type = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8"
  }[ext] || "application/octet-stream";

  res.writeHead(200, { "Content-Type": type });
  fs.createReadStream(filePath).pipe(res);
}

function sendJson(res, payload, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("请求体过大。"), { statusCode: 413 }));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(Object.assign(new Error("请求 JSON 无效。"), { statusCode: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}
