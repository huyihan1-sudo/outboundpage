const defaults = {
  cities: ["Los Angeles, CA", "New York, NY", "Boston, MA"],
  keywords: [
    "wireless store",
    "cell phone store",
    "mobile phone repair",
    "phone repair",
    "iPhone repair",
    "computer repair",
    "computer store",
    "electronics repair"
  ],
  negativeKeywords: [
    "T-Mobile",
    "Verizon",
    "AT&T",
    "Sprint",
    "Metro by T-Mobile",
    "Cricket Wireless",
    "Boost Mobile",
    "Best Buy",
    "Walmart",
    "Target",
    "Costco",
    "Apple Store"
  ]
};

const state = {
  currentJobId: null,
  pollTimer: null,
  results: [],
  filteredResults: [],
  page: 1,
  pageSize: 25
};

const els = {
  citiesInput: document.getElementById("citiesInput"),
  keywordsInput: document.getElementById("keywordsInput"),
  depthInput: document.getElementById("depthInput"),
  concurrencyInput: document.getElementById("concurrencyInput"),
  inactivityInput: document.getElementById("inactivityInput"),
  fastModeInput: document.getElementById("fastModeInput"),
  emailInput: document.getElementById("emailInput"),
  extraReviewsInput: document.getElementById("extraReviewsInput"),
  geoInput: document.getElementById("geoInput"),
  radiusInput: document.getElementById("radiusInput"),
  zoomInput: document.getElementById("zoomInput"),
  negativeKeywordsInput: document.getElementById("negativeKeywordsInput"),
  proxiesInput: document.getElementById("proxiesInput"),
  startBtn: document.getElementById("startBtn"),
  resetBtn: document.getElementById("resetBtn"),
  refreshHealthBtn: document.getElementById("refreshHealthBtn"),
  copyInstallBtn: document.getElementById("copyInstallBtn"),
  openRepoBtn: document.getElementById("openRepoBtn"),
  queryCount: document.getElementById("queryCount"),
  queryPreview: document.getElementById("queryPreview"),
  queryPreviewHint: document.getElementById("queryPreviewHint"),
  runtimeDot: document.getElementById("runtimeDot"),
  runtimeLabel: document.getElementById("runtimeLabel"),
  runtimeDetail: document.getElementById("runtimeDetail"),
  runnerMode: document.getElementById("runnerMode"),
  binaryStatus: document.getElementById("binaryStatus"),
  binaryPath: document.getElementById("binaryPath"),
  dockerStatus: document.getElementById("dockerStatus"),
  jobStatus: document.getElementById("jobStatus"),
  leadCount: document.getElementById("leadCount"),
  currentJobId: document.getElementById("currentJobId"),
  logBox: document.getElementById("logBox"),
  resultsBody: document.getElementById("resultsBody"),
  cityFilter: document.getElementById("cityFilter"),
  pageSizeSelect: document.getElementById("pageSizeSelect"),
  paginationSummary: document.getElementById("paginationSummary"),
  prevPageBtn: document.getElementById("prevPageBtn"),
  nextPageBtn: document.getElementById("nextPageBtn"),
  pageInfo: document.getElementById("pageInfo"),
  downloadCsvBtn: document.getElementById("downloadCsvBtn"),
  downloadJsonBtn: document.getElementById("downloadJsonBtn"),
  installCommand: document.getElementById("installCommand")
};

function linesFrom(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildQueries() {
  const cities = linesFrom(els.citiesInput.value);
  const keywords = linesFrom(els.keywordsInput.value);
  return cities.flatMap((city) => keywords.map((keyword) => ({
    city,
    keyword,
    query: `${keyword} in ${city}`
  })));
}

function updateQueryPreview() {
  const queries = buildQueries();
  els.queryCount.textContent = String(queries.length);
  els.queryPreviewHint.textContent = `将生成 ${queries.length} 个 Google Maps 查询`;
  els.queryPreview.innerHTML = queries
    .slice(0, 30)
    .map((item) => `<li>${escapeHtml(item.query)}</li>`)
    .join("");
  if (queries.length > 30) {
    const li = document.createElement("li");
    li.textContent = `还有 ${queries.length - 30} 个查询`;
    els.queryPreview.appendChild(li);
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }
  return payload;
}

async function refreshHealth() {
  try {
    const health = await fetchJson("/api/health");
    els.runnerMode.textContent = health.runnerMode || "未就绪";
    els.binaryStatus.textContent = health.binary.available ? "可用" : "未安装";
    els.binaryPath.textContent = health.binary.path || "tools/gosom/google-maps-scraper.exe";
    els.dockerStatus.textContent = health.docker.available ? "可用" : "未安装";
    els.runtimeDot.className = `status-dot ${health.ready ? "is-ok" : "is-bad"}`;
    els.runtimeLabel.textContent = health.ready ? "运行环境可用" : "需要安装运行器";
    els.runtimeDetail.textContent = health.ready
      ? `${health.runnerMode} 已就绪`
      : "请先运行安装命令或安装 Docker";
    els.startBtn.disabled = !health.ready;
    loadLatestJob();
  } catch (error) {
    els.runtimeDot.className = "status-dot is-bad";
    els.runtimeLabel.textContent = "环境检测失败";
    els.runtimeDetail.textContent = error.message;
    els.startBtn.disabled = true;
  }
}

async function loadLatestJob() {
  if (state.currentJobId) return;
  try {
    const latest = await fetchJson("/api/jobs/latest");
    if (!latest || latest.job === null || !latest.id) return;
    state.currentJobId = latest.id;
    renderJob(latest);
  } catch {
    // The latest job endpoint is a convenience only.
  }
}

async function startJob() {
  const cities = linesFrom(els.citiesInput.value);
  const keywords = linesFrom(els.keywordsInput.value);

  if (!cities.length || !keywords.length) {
    setLog("城市和关键词都不能为空。");
    return;
  }

  els.startBtn.disabled = true;
  setStatus("启动中");
  setLog("正在创建采集任务...");
  clearResults();

  try {
    const payload = await fetchJson("/api/search", {
      method: "POST",
      body: JSON.stringify({
        cities,
        keywords,
        depth: Number(els.depthInput.value || 1),
        concurrency: Number(els.concurrencyInput.value || 2),
        exitOnInactivity: els.inactivityInput.value,
        fastMode: els.fastModeInput.checked,
        geo: els.geoInput.value.trim(),
        radius: Number(els.radiusInput.value || 10000),
        zoom: Number(els.zoomInput.value || 15),
        email: els.emailInput.checked,
        extraReviews: els.extraReviewsInput.checked,
        negativeKeywords: linesFrom(els.negativeKeywordsInput.value),
        proxies: els.proxiesInput.value.trim()
      })
    });

    state.currentJobId = payload.jobId;
    els.currentJobId.textContent = payload.jobId;
    setStatus("运行中");
    startPolling();
  } catch (error) {
    setStatus("启动失败");
    setLog(error.message);
    els.startBtn.disabled = false;
  }
}

function startPolling() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
  }
  pollJob();
  state.pollTimer = setInterval(pollJob, 2500);
}

async function pollJob() {
  if (!state.currentJobId) return;

  try {
    const job = await fetchJson(`/api/jobs/${encodeURIComponent(state.currentJobId)}`);
    renderJob(job);
    if (["completed", "failed"].includes(job.status)) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
      els.startBtn.disabled = false;
    }
  } catch (error) {
    setLog(error.message);
  }
}

function renderJob(job) {
  const label = {
    queued: "排队中",
    running: "运行中",
    completed: "已完成",
    failed: "失败"
  }[job.status] || job.status;

  setStatus(label);
  els.currentJobId.textContent = job.id;
  els.leadCount.textContent = String(job.counts?.clean || 0);
  els.logBox.textContent = job.logs || "等待日志...";

  if (job.results?.length) {
    setResults(job.results);
  } else if (job.preview?.length) {
    setResults(job.preview);
  }

  const downloadable = job.status === "completed" && (job.counts?.clean || 0) > 0;
  els.downloadCsvBtn.disabled = !downloadable;
  els.downloadJsonBtn.disabled = !downloadable;
}

function setResults(rows) {
  const previousCity = els.cityFilter.value;
  state.results = rows || [];
  state.page = 1;
  updateCityFilter(previousCity);
  applyFilters();
}

function updateCityFilter(selectedValue = "") {
  const cities = Array.from(new Set(state.results.map((row) => row.city).filter(Boolean))).sort();
  els.cityFilter.innerHTML = '<option value="">全部城市</option>' + cities
    .map((city) => `<option value="${escapeAttr(city)}">${escapeHtml(city)}</option>`)
    .join("");

  if (cities.includes(selectedValue)) {
    els.cityFilter.value = selectedValue;
  }
}

function applyFilters() {
  const city = els.cityFilter.value;
  state.pageSize = Number(els.pageSizeSelect.value || 25);
  state.filteredResults = city
    ? state.results.filter((row) => row.city === city)
    : [...state.results];
  state.page = Math.min(state.page, totalPages());
  if (state.page < 1) state.page = 1;
  renderCurrentPage();
}

function totalPages() {
  return Math.max(1, Math.ceil(state.filteredResults.length / state.pageSize));
}

function renderCurrentPage() {
  const total = state.filteredResults.length;
  const pages = totalPages();
  const start = total ? (state.page - 1) * state.pageSize : 0;
  const end = Math.min(start + state.pageSize, total);
  const rows = state.filteredResults.slice(start, end);

  els.paginationSummary.textContent = total
    ? `显示 ${start + 1}-${end} / ${total} 条`
    : "暂无结果";
  els.pageInfo.textContent = total ? `第 ${state.page} / ${pages} 页` : "第 0 / 0 页";
  els.prevPageBtn.disabled = !total || state.page <= 1;
  els.nextPageBtn.disabled = !total || state.page >= pages;

  if (!rows.length) {
    els.resultsBody.innerHTML = '<tr><td colspan="6" class="empty-state">没有符合筛选条件的结果。</td></tr>';
    return;
  }

  els.resultsBody.innerHTML = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.store_name)}</td>
      <td>${escapeHtml(row.address)}</td>
      <td>${escapeHtml(row.phone)}</td>
      <td>${escapeHtml(row.city)}</td>
      <td>${row.image_url ? `<a href="${escapeAttr(row.image_url)}" target="_blank" rel="noreferrer">查看</a>` : ""}</td>
      <td>${row.google_maps_url ? `<a href="${escapeAttr(row.google_maps_url)}" target="_blank" rel="noreferrer">打开</a>` : ""}</td>
    </tr>
  `).join("");
}

function clearResults() {
  els.leadCount.textContent = "0";
  state.results = [];
  state.filteredResults = [];
  state.page = 1;
  updateCityFilter();
  els.paginationSummary.textContent = "暂无结果";
  els.pageInfo.textContent = "第 0 / 0 页";
  els.prevPageBtn.disabled = true;
  els.nextPageBtn.disabled = true;
  els.downloadCsvBtn.disabled = true;
  els.downloadJsonBtn.disabled = true;
  els.resultsBody.innerHTML = '<tr><td colspan="6" class="empty-state">任务运行中，结果会自动刷新。</td></tr>';
}

function setStatus(value) {
  els.jobStatus.textContent = value;
}

function setLog(value) {
  els.logBox.textContent = value;
}

function download(format) {
  if (!state.currentJobId) return;
  window.location.href = `/api/jobs/${encodeURIComponent(state.currentJobId)}/download?format=${format}`;
}

function resetDefaults() {
  els.citiesInput.value = defaults.cities.join("\n");
  els.keywordsInput.value = defaults.keywords.join("\n");
  els.negativeKeywordsInput.value = defaults.negativeKeywords.join("\n");
  els.depthInput.value = "1";
  els.concurrencyInput.value = "2";
  els.inactivityInput.value = "3m";
  els.fastModeInput.checked = false;
  els.geoInput.value = "";
  els.radiusInput.value = "10000";
  els.zoomInput.value = "15";
  els.emailInput.checked = false;
  els.extraReviewsInput.checked = false;
  els.proxiesInput.value = "";
  updateQueryPreview();
}

async function copyInstallCommand() {
  try {
    await navigator.clipboard.writeText(els.installCommand.textContent.trim());
    els.copyInstallBtn.textContent = "已复制";
    setTimeout(() => {
      els.copyInstallBtn.textContent = "复制安装命令";
    }, 1600);
  } catch {
    setLog("复制失败，请手动复制安装命令。");
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

[els.citiesInput, els.keywordsInput].forEach((input) => {
  input.addEventListener("input", updateQueryPreview);
});

els.startBtn.addEventListener("click", startJob);
els.resetBtn.addEventListener("click", resetDefaults);
els.refreshHealthBtn.addEventListener("click", refreshHealth);
els.copyInstallBtn.addEventListener("click", copyInstallCommand);
els.openRepoBtn.addEventListener("click", () => {
  window.open("https://github.com/gosom/google-maps-scraper", "_blank", "noreferrer");
});
els.downloadCsvBtn.addEventListener("click", () => download("csv"));
els.downloadJsonBtn.addEventListener("click", () => download("json"));
els.cityFilter.addEventListener("change", () => {
  state.page = 1;
  applyFilters();
});
els.pageSizeSelect.addEventListener("change", () => {
  state.page = 1;
  applyFilters();
});
els.prevPageBtn.addEventListener("click", () => {
  state.page = Math.max(1, state.page - 1);
  renderCurrentPage();
});
els.nextPageBtn.addEventListener("click", () => {
  state.page = Math.min(totalPages(), state.page + 1);
  renderCurrentPage();
});

updateQueryPreview();
refreshHealth();
