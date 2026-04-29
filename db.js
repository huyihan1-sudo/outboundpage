let mysqlPromise = null;

function createDatabase() {
  const enabled = Boolean(process.env.DATABASE_URL || process.env.MYSQL_HOST);
  if (!enabled) {
    return new NullDatabase();
  }

  try {
    mysqlPromise = require("mysql2/promise");
  } catch (error) {
    console.warn("MySQL is configured, but mysql2 is not installed. Falling back to file storage.");
    console.warn(error.message);
    return new NullDatabase();
  }

  return new MySqlDatabase();
}

class NullDatabase {
  constructor() {
    this.enabled = false;
  }

  async init() {}
  async saveJob() {}
  async saveResults() {}
  async loadJobs() {
    return [];
  }
}

class MySqlDatabase {
  constructor() {
    this.enabled = true;
    this.pool = null;
  }

  async init() {
    this.pool = process.env.DATABASE_URL
      ? mysqlPromise.createPool(process.env.DATABASE_URL)
      : mysqlPromise.createPool({
          host: process.env.MYSQL_HOST || "127.0.0.1",
          port: Number(process.env.MYSQL_PORT || 3306),
          user: process.env.MYSQL_USER || "maps_leads",
          password: process.env.MYSQL_PASSWORD || "",
          database: process.env.MYSQL_DATABASE || "maps_leads",
          waitForConnections: true,
          connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
          charset: "utf8mb4"
        });

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id VARCHAR(80) PRIMARY KEY,
        status VARCHAR(32) NOT NULL,
        runner_mode VARCHAR(32) NOT NULL,
        created_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        counts_json TEXT NOT NULL,
        error_text TEXT NULL,
        log_text LONGTEXT NULL,
        clean_json_path VARCHAR(768) NULL,
        clean_csv_path VARCHAR(768) NULL
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        job_id VARCHAR(80) NOT NULL,
        store_name TEXT NULL,
        address TEXT NULL,
        phone VARCHAR(120) NULL,
        image_url TEXT NULL,
        website TEXT NULL,
        hours TEXT NULL,
        rating VARCHAR(64) NULL,
        review_count VARCHAR(64) NULL,
        google_maps_url TEXT NULL,
        latitude VARCHAR(64) NULL,
        longitude VARCHAR(64) NULL,
        category TEXT NULL,
        city VARCHAR(180) NULL,
        source_keyword VARCHAR(255) NULL,
        place_id VARCHAR(255) NULL,
        cid VARCHAR(255) NULL,
        business_status VARCHAR(120) NULL,
        source_tool VARCHAR(255) NULL,
        scraped_at VARCHAR(80) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_leads_job_id (job_id),
        INDEX idx_leads_city (city),
        INDEX idx_leads_phone (phone),
        INDEX idx_leads_place_id (place_id),
        CONSTRAINT fk_leads_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
  }

  async saveJob(job) {
    await this.pool.execute(
      `
        INSERT INTO jobs (
          id, status, runner_mode, created_at, updated_at, counts_json,
          error_text, log_text, clean_json_path, clean_csv_path
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          status = VALUES(status),
          runner_mode = VALUES(runner_mode),
          updated_at = VALUES(updated_at),
          counts_json = VALUES(counts_json),
          error_text = VALUES(error_text),
          log_text = VALUES(log_text),
          clean_json_path = VALUES(clean_json_path),
          clean_csv_path = VALUES(clean_csv_path)
      `,
      [
        job.id,
        job.status,
        job.runnerMode || "binary",
        mysqlDate(job.createdAt),
        mysqlDate(job.updatedAt),
        JSON.stringify(job.counts || {}),
        job.error || null,
        job.logsText || null,
        job.cleanJsonPath || null,
        job.cleanCsvPath || null
      ]
    );
  }

  async saveResults(jobId, rows) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute("DELETE FROM leads WHERE job_id = ?", [jobId]);

      if (rows.length) {
        const values = rows.map((row) => [
          jobId,
          row.store_name || null,
          row.address || null,
          row.phone || null,
          row.image_url || null,
          row.website || null,
          row.hours || null,
          row.rating || null,
          row.review_count || null,
          row.google_maps_url || null,
          row.latitude || null,
          row.longitude || null,
          row.category || null,
          row.city || null,
          row.source_keyword || null,
          row.place_id || null,
          row.cid || null,
          row.business_status || null,
          row.source_tool || null,
          row.scraped_at || null
        ]);
        await connection.query(
          `
            INSERT INTO leads (
              job_id, store_name, address, phone, image_url, website, hours,
              rating, review_count, google_maps_url, latitude, longitude,
              category, city, source_keyword, place_id, cid, business_status,
              source_tool, scraped_at
            )
            VALUES ?
          `,
          [values]
        );
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async loadJobs() {
    const [jobRows] = await this.pool.query("SELECT * FROM jobs ORDER BY updated_at DESC LIMIT 20");
    if (!jobRows.length) return [];

    const jobIds = jobRows.map((row) => row.id);
    const [leadRows] = await this.pool.query(
      "SELECT * FROM leads WHERE job_id IN (?) ORDER BY id ASC",
      [jobIds]
    );
    const grouped = new Map();
    for (const row of leadRows) {
      const list = grouped.get(row.job_id) || [];
      list.push(normalizeLeadRow(row));
      grouped.set(row.job_id, list);
    }

    return jobRows.map((row) => {
      const results = grouped.get(row.id) || [];
      return {
        id: row.id,
        status: row.status,
        runnerMode: row.runner_mode,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
        counts: safeJson(row.counts_json, { queries: 0, raw: results.length, clean: results.length }),
        error: row.error_text || null,
        logsText: row.log_text || "",
        cleanJsonPath: row.clean_json_path || "",
        cleanCsvPath: row.clean_csv_path || "",
        preview: results.slice(0, 100),
        results
      };
    });
  }
}

function normalizeLeadRow(row) {
  const output = {};
  for (const field of [
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
  ]) {
    output[field] = row[field] || "";
  }
  return output;
}

function mysqlDate(value) {
  const date = value ? new Date(value) : new Date();
  return date.toISOString().slice(0, 23).replace("T", " ");
}

function safeJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

module.exports = { createDatabase };
