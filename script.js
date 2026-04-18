const countries = [
  { name: "Japan", zone: "Zone A" },
  { name: "Singapore", zone: "Zone A" },
  { name: "South Korea", zone: "Zone A" },
  { name: "France", zone: "Zone A" },
  { name: "Germany", zone: "Zone A" },
  { name: "United Kingdom", zone: "Zone A" },
  { name: "Italy", zone: "Zone A" },
  { name: "Spain", zone: "Zone A" },
  { name: "United States", zone: "Zone A" },
  { name: "Canada", zone: "Zone A" },
  { name: "Mexico", zone: "Zone A" },
  { name: "Thailand", zone: "Zone A" },
  { name: "Indonesia", zone: "Zone A" },
  { name: "Australia", zone: "Zone A" },
  { name: "New Zealand", zone: "Zone A" },
  { name: "UAE", zone: "Zone B" },
  { name: "Saudi Arabia", zone: "Zone B" },
  { name: "Qatar", zone: "Zone B" },
  { name: "Turkey", zone: "Zone B" },
  { name: "India", zone: "Zone B" },
  { name: "Vietnam", zone: "Zone B" },
  { name: "Philippines", zone: "Zone B" },
  { name: "Malaysia", zone: "Zone B" },
  { name: "South Africa", zone: "Zone B" },
  { name: "Egypt", zone: "Zone B" },
  { name: "Brazil", zone: "Global" },
  { name: "Argentina", zone: "Global" },
  { name: "Chile", zone: "Global" },
  { name: "Peru", zone: "Global" },
  { name: "Morocco", zone: "Global" },
  { name: "Kenya", zone: "Global" },
  { name: "Nigeria", zone: "Global" },
  { name: "Iceland", zone: "Global" },
  { name: "Greenland", zone: "Global" },
  { name: "Kazakhstan", zone: "Global" }
];

const planCatalog = [
  {
    zone: "Zone A",
    coverage: "70 countries",
    popular: "Top Destination",
    oneTime: [
      { size: "5GB", price: 24, validity: "30 days", speed: "5G / 4G" },
      { size: "10GB", price: 39, validity: "30 days", speed: "5G / 4G" },
      { size: "20GB", price: 69, validity: "30 days", speed: "5G / 4G" },
      { size: "50GB", price: 149, validity: "30 days", speed: "5G / 4G" },
      { size: "100GB", price: 249, validity: "30 days", speed: "5G / 4G" }
    ]
  },
  {
    zone: "Zone B",
    coverage: "105 countries",
    popular: "Extended Coverage",
    oneTime: [
      { size: "5GB", price: 29, validity: "30 days", speed: "5G / 4G" },
      { size: "10GB", price: 45, validity: "30 days", speed: "5G / 4G" },
      { size: "20GB", price: 79, validity: "30 days", speed: "5G / 4G" },
      { size: "50GB", price: 169, validity: "30 days", speed: "5G / 4G" },
      { size: "100GB", price: 279, validity: "30 days", speed: "5G / 4G" }
    ]
  },
  {
    zone: "Global",
    coverage: "170-200 countries",
    popular: "Worldwide Reach",
    oneTime: [
      { size: "5GB", price: 35, validity: "30 days", speed: "5G / 4G" },
      { size: "10GB", price: 55, validity: "30 days", speed: "5G / 4G" },
      { size: "20GB", price: 95, validity: "30 days", speed: "5G / 4G" },
      { size: "50GB", price: 199, validity: "30 days", speed: "5G / 4G" },
      { size: "100GB", price: 329, validity: "30 days", speed: "5G / 4G" }
    ]
  }
];

const zonePriority = { "Zone A": 1, "Zone B": 2, "Global": 3 };
const zoneCoverage = {
  "Zone A": ["Zone A"],
  "Zone B": ["Zone A", "Zone B"],
  "Global": ["Zone A", "Zone B", "Global"]
};

const selectedCountries = new Set(["Japan", "Singapore"]);
let currentMode = "continuous";
let showAllPlans = false;
let searchTerm = "";

const searchInput = document.getElementById("countrySearch");
const selectedTags = document.getElementById("selectedTags");
const searchResults = document.getElementById("searchResults");
const selectionGroups = document.getElementById("selectionGroups");
const matchSummary = document.getElementById("matchSummary");
const recommendedSlot = document.getElementById("recommendedSlot");
const morePlansList = document.getElementById("morePlansList");
const showMoreBtn = document.getElementById("showMoreBtn");
const clearSelectionBtn = document.getElementById("clearSelectionBtn");
const modeToggle = document.getElementById("modeToggle");
const zoneRail = document.getElementById("zoneRail");
const coverageModal = document.getElementById("coverageModal");
const closeCoverageModalBtn = document.getElementById("closeCoverageModalBtn");
const coverageModalTitle = document.getElementById("coverageModalTitle");
const coverageModalCopy = document.getElementById("coverageModalCopy");
const coverageCountryList = document.getElementById("coverageCountryList");
const howItWorksModal = document.getElementById("howItWorksModal");
const openHowItWorksBtn = document.getElementById("openHowItWorksBtn");
const closeHowItWorksModalBtn = document.getElementById("closeHowItWorksModalBtn");
const packageLogicModal = document.getElementById("packageLogicModal");
const openPackageLogicBtn = document.getElementById("openPackageLogicBtn");
const closePackageLogicModalBtn = document.getElementById("closePackageLogicModalBtn");

function buildSubscriptionPlans(oneTimePlans) {
  return oneTimePlans.map((plan) => ({
    ...plan,
    price: plan.price - 5,
    label: "Subscription",
    renewal: "Monthly auto-renew",
    savings: "10%"
  }));
}

const fullCatalog = planCatalog.map((zonePlan) => ({
  ...zonePlan,
  continuous: buildSubscriptionPlans(zonePlan.oneTime)
}));

function getCountryZone(name) {
  return countries.find((country) => country.name === name)?.zone;
}

function getRequiredZone() {
  if (!selectedCountries.size) return null;
  let highestZone = "Zone A";

  selectedCountries.forEach((country) => {
    const zone = getCountryZone(country);
    if (zone && zonePriority[zone] > zonePriority[highestZone]) {
      highestZone = zone;
    }
  });

  return highestZone;
}

function getEligibleZones(requiredZone) {
  if (!requiredZone) return [];
  return fullCatalog.filter((plan) => zoneCoverage[plan.zone].includes(requiredZone));
}

function getCountriesForCoverage(zoneName) {
  return countries
    .filter((country) => zoneCoverage[zoneName].includes(country.zone))
    .map((country) => country.name)
    .sort((a, b) => a.localeCompare(b));
}

function getRecommendedPlans() {
  const requiredZone = getRequiredZone();
  if (!requiredZone) {
    return { requiredZone: null, eligiblePlans: [] };
  }

  const eligibleZones = getEligibleZones(requiredZone).map((zonePlan) => {
    const plans = zonePlan[currentMode];
    const cheapest = plans[0];
    return {
      zone: zonePlan.zone,
      coverage: zonePlan.coverage,
      popular: zonePlan.popular,
      plan: cheapest
    };
  });

  eligibleZones.sort((a, b) => a.plan.price - b.plan.price || zonePriority[a.zone] - zonePriority[b.zone]);

  return {
    requiredZone,
    eligiblePlans: eligibleZones
  };
}

function renderSelectedTags() {
  const entries = [...selectedCountries];
  selectedTags.innerHTML = entries.length
    ? entries
        .map(
          (name) => `
            <div class="tag">
              <span>${name}</span>
              <button type="button" data-remove="${name}" aria-label="Remove ${name}">x</button>
            </div>
          `
        )
        .join("")
    : '<span class="mini-note">No destination selected yet. Start with search or quick picks below.</span>';
}

function renderSearchResults() {
  if (!searchTerm) {
    searchResults.classList.add("is-hidden");
    searchResults.innerHTML = "";
    return;
  }

  const filtered = countries
    .filter((country) => country.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .slice(0, 6);

  searchResults.classList.remove("is-hidden");
  searchResults.innerHTML = filtered.length
    ? filtered
        .map((country) => {
          const isSelected = selectedCountries.has(country.name);
          return `
            <button class="country-item ${isSelected ? "is-selected" : ""}" type="button" data-country-select="${country.name}">
              <span class="country-meta">
                <strong>${country.name}</strong>
                <small>Available in ${country.zone}</small>
              </span>
              <span class="pill">${isSelected ? "Selected" : country.zone}</span>
            </button>
          `;
        })
        .join("")
    : `
      <div class="empty-state">
        No matching country found in the demo dataset.
      </div>
    `;
}

function renderSelectionGroups() {
  if (!selectedCountries.size) {
    selectionGroups.innerHTML = `
      <div class="empty-state">
        Keep this area clean until the customer starts building a trip. Once countries are selected,
        they will be grouped here by zone.
      </div>
    `;
    return;
  }

  const grouped = {
    "Zone A": [],
    "Zone B": [],
    "Global": []
  };

  [...selectedCountries].forEach((countryName) => {
    const zone = getCountryZone(countryName);
    if (zone) grouped[zone].push(countryName);
  });

  selectionGroups.innerHTML = Object.entries(grouped)
    .filter(([, items]) => items.length)
    .map(
      ([zone, items]) => `
        <section class="selection-group">
          <div class="selection-group-header">
            <h4>${zone}</h4>
            <span class="pill">${items.length} selected</span>
          </div>
          <div class="selection-group-tags">
            ${items.map((item) => `<span class="selection-country-pill">${item}</span>`).join("")}
          </div>
        </section>
      `
    )
    .join("");
}

function renderZoneRail(requiredZone) {
  zoneRail.querySelectorAll("[data-zone-stop]").forEach((node) => {
    node.classList.toggle("is-active", node.dataset.zoneStop === requiredZone);
  });
}

function renderSummaryAndPlans() {
  const result = getRecommendedPlans();
  renderZoneRail(result.requiredZone);

  if (!result.requiredZone) {
    matchSummary.innerHTML = `
      <div class="empty-state">
        Select one or more destinations first. The portal will auto-match the right zone
        and recommend the lowest-priced eligible plan.
      </div>
    `;
    recommendedSlot.innerHTML = "";
    morePlansList.innerHTML = "";
    showMoreBtn.hidden = true;
    return;
  }

  const countriesText = [...selectedCountries].join(", ");
  const recommendation = result.eligiblePlans[0];
  const otherPlans = result.eligiblePlans.slice(1);
  const recurringCopy =
    currentMode === "continuous"
      ? "30-day subscription, renews monthly"
      : "30-day one-time package";

  matchSummary.innerHTML = `
    <strong>${countriesText}</strong><br>
    Based on the selected destinations, at least <strong>${result.requiredZone}</strong>
    is required for full coverage. The portal is showing the cheapest eligible
    ${currentMode === "continuous" ? "subscription" : "one-time"} option first,
    with the remaining eligible zones available below.
  `;

  recommendedSlot.innerHTML = `
    <article class="recommended-plan">
      <div class="recommended-top">
        <div>
          <span class="recommend-badge">Recommended</span>
          <h4 class="recommended-title">${recommendation.zone}</h4>
          <div class="recommended-meta-row">
            <p class="recommended-subtitle">${recommendation.popular}</p>
            <button class="coverage-link" type="button" data-open-coverage="${recommendation.zone}">
              Coverage
            </button>
          </div>
        </div>
        <div class="price-stack">
          <span>${currentMode === "continuous" ? "starting from / 30 days" : "starting from / 30 days"}</span>
          <strong>USD ${recommendation.plan.price}</strong>
          ${
            currentMode === "continuous"
              ? `<span class="save-badge">Save ${recommendation.plan.savings}</span>`
              : `<span>${recurringCopy}</span>`
          }
        </div>
      </div>

      <div class="size-grid">
        ${fullCatalog
          .find((item) => item.zone === recommendation.zone)
          [currentMode]
          .map(
            (plan) => `
              <article class="size-card">
                <strong>${plan.size}</strong>
                <span class="size-price">USD ${plan.price}</span>
              </article>
            `
          )
          .join("")}
      </div>
    </article>
  `;

  if (!otherPlans.length) {
    morePlansList.innerHTML = "";
    showMoreBtn.hidden = true;
    return;
  }

  showMoreBtn.hidden = false;
  showMoreBtn.textContent = showAllPlans ? "Hide more options" : `Show more options`;
  morePlansList.classList.toggle("is-collapsed", !showAllPlans);
  morePlansList.innerHTML = otherPlans
    .map(
      (item) => `
        <article class="plan-item">
          <div class="accordion-plan">
            <div class="accordion-plan-header">
              <div>
                <h4>${item.zone}</h4>
                <p>${item.coverage} coverage - higher-priced but broader option</p>
              </div>
              <div class="plan-price">
                <strong>USD ${item.plan.price}</strong>
                <span class="muted">30-day starting price</span>
              </div>
            </div>
            <div class="compact-size-row">
              ${fullCatalog
                .find((zonePlan) => zonePlan.zone === item.zone)
                [currentMode]
                .map((plan) => `<span class="compact-size-pill">${plan.size} - USD ${plan.price}</span>`)
                .join("")}
            </div>
          </div>
        </article>
      `
    )
    .join("");
}

function render() {
  renderSelectedTags();
  renderSearchResults();
  renderSelectionGroups();
  renderSummaryAndPlans();
}

function toggleCountry(countryName) {
  if (selectedCountries.has(countryName)) {
    selectedCountries.delete(countryName);
  } else {
    selectedCountries.add(countryName);
  }

  showAllPlans = false;
  searchInput.value = "";
  searchTerm = "";
  render();
}

searchInput.addEventListener("input", (event) => {
  searchTerm = event.target.value.trim();
  renderSearchResults();
});

document.addEventListener("click", (event) => {
  const removeTarget = event.target.closest("[data-remove]");
  if (removeTarget) {
    selectedCountries.delete(removeTarget.dataset.remove);
    showAllPlans = false;
    render();
    return;
  }

  const selectTarget = event.target.closest("[data-country-select]");
  if (selectTarget) {
    toggleCountry(selectTarget.dataset.countrySelect);
    return;
  }

  const chipTarget = event.target.closest("[data-country]");
  if (chipTarget) {
    toggleCountry(chipTarget.dataset.country);
  }
});

showMoreBtn.addEventListener("click", () => {
  showAllPlans = !showAllPlans;
  renderSummaryAndPlans();
});

clearSelectionBtn.addEventListener("click", () => {
  selectedCountries.clear();
  showAllPlans = false;
  render();
});

modeToggle.addEventListener("click", (event) => {
  const modeButton = event.target.closest("[data-mode]");
  if (!modeButton) return;

  currentMode = modeButton.dataset.mode;
  document.querySelectorAll(".mode-btn").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === currentMode);
  });
  showAllPlans = false;
  renderSummaryAndPlans();
});

document.addEventListener("click", (event) => {
  const coverageTrigger = event.target.closest("[data-open-coverage]");
  if (!coverageTrigger) return;

  const zoneName = coverageTrigger.dataset.openCoverage;
  const coverageCountries = getCountriesForCoverage(zoneName);
  coverageModalTitle.textContent = `${zoneName} coverage`;
  coverageModalCopy.textContent =
    zoneName === "Global"
      ? "Global includes every country shown in the demo dataset and represents the broadest worldwide package."
      : `${zoneName} includes the destinations below in the current demo dataset. Higher zones include lower-zone countries as well.`;
  coverageCountryList.innerHTML = coverageCountries
    .map((country) => `<span class="coverage-country-chip">${country}</span>`)
    .join("");
  coverageModal.showModal();
});

closeCoverageModalBtn.addEventListener("click", () => {
  coverageModal.close();
});

coverageModal.addEventListener("click", (event) => {
  const rect = coverageModal.getBoundingClientRect();
  const isBackdropClick =
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom;
  if (isBackdropClick) coverageModal.close();
});

openHowItWorksBtn.addEventListener("click", () => {
  howItWorksModal.showModal();
});

closeHowItWorksModalBtn.addEventListener("click", () => {
  howItWorksModal.close();
});

openPackageLogicBtn.addEventListener("click", () => {
  packageLogicModal.showModal();
});

closePackageLogicModalBtn.addEventListener("click", () => {
  packageLogicModal.close();
});

[howItWorksModal, packageLogicModal].forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    const rect = dialog.getBoundingClientRect();
    const isBackdropClick =
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom;
    if (isBackdropClick) dialog.close();
  });
});

render();
