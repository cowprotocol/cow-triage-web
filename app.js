(function () {
  "use strict";

  var CONFIG_KEY = "cow-web-dashboard-config-v1";
  var TOKEN_KEY = "cow-web-dashboard-token-v1";
  var FIRST_RUN_NOTICE_KEY = "cow-web-dashboard-first-run-notice-dismissed-v1";
  var ORG_OWNER = "cowprotocol";
  var DEFAULT_AUTO_REFRESH_MINUTES = 15;
  var AUTO_REFRESH_MINUTE_OPTIONS = [0, 5, 10, 15, 30, 60];
  var WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  var TWO_WEEKS_MS = 2 * WEEK_MS;
  var STALE_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

  var defaults = {
    repo: "cowswap",
    reviewerFilter: "all",
    statusFilter: "all",
    reviewNeedFilter: "all",
    ageFilter: "all",
    sortMode: "priority",
    autoRefreshMinutes: DEFAULT_AUTO_REFRESH_MINUTES,
    cardGradients: true,
    hideDrafts: true
  };

  var state = {
    config: loadConfig(),
    repos: [],
    reposLoading: false,
    reposError: "",
    repoRequestId: 0,
    reviewerFilterOptions: [],
    boardSearch: "",
    viewer: null,
    pulls: [],
    loading: false,
    lastUpdated: null,
    dashboardRequestId: 0,
    refreshTimerId: null
  };

  var els = {
    brandMooButton: document.getElementById("brandMooButton"),
    mooSound: document.getElementById("mooSound"),
    board: document.getElementById("board"),
    boardScrollTop: document.getElementById("boardScrollTop"),
    boardScrollTopInner: document.getElementById("boardScrollTopInner"),
    boardMeta: document.getElementById("boardMeta"),
    ageFilterButtons: document.querySelectorAll("[data-age-filter]"),
    draftAgeLegend: document.getElementById("draftAgeLegend"),
    firstRunNotice: document.getElementById("firstRunNotice"),
    noticeSettingsButton: document.getElementById("noticeSettingsButton"),
    noticeDismissButton: document.getElementById("noticeDismissButton"),
    message: document.getElementById("message"),
    repoSelect: document.getElementById("repoSelect"),
    repoCombobox: document.getElementById("repoCombobox"),
    repoSelectButton: document.getElementById("repoSelectButton"),
    repoSelectLabel: document.getElementById("repoSelectLabel"),
    repoSelectMenu: document.getElementById("repoSelectMenu"),
    repoSearchInput: document.getElementById("repoSearchInput"),
    repoOptions: document.getElementById("repoOptions"),
    repoPickerHint: document.getElementById("repoPickerHint"),
    viewerBadge: document.getElementById("viewerBadge"),
    viewerAvatar: document.getElementById("viewerAvatar"),
    viewerLogin: document.getElementById("viewerLogin"),
    reviewerFilterSelect: document.getElementById("reviewerFilterSelect"),
    reviewerFilterCombobox: document.getElementById("reviewerFilterCombobox"),
    reviewerFilterButton: document.getElementById("reviewerFilterButton"),
    reviewerFilterLabel: document.getElementById("reviewerFilterLabel"),
    reviewerFilterMenu: document.getElementById("reviewerFilterMenu"),
    reviewerFilterSearchInput: document.getElementById("reviewerFilterSearchInput"),
    reviewerFilterOptions: document.getElementById("reviewerFilterOptions"),
    statusFilterSelect: document.getElementById("statusFilterSelect"),
    reviewNeedSelect: document.getElementById("reviewNeedSelect"),
    sortSelect: document.getElementById("sortSelect"),
    boardSearchInput: document.getElementById("boardSearchInput"),
    clearFiltersButton: document.getElementById("clearFiltersButton"),
    settingsMenu: document.getElementById("settingsMenu"),
    settingsCloseButton: document.getElementById("settingsCloseButton"),
    cardGradientsInput: document.getElementById("cardGradientsInput"),
    hideDraftsInput: document.getElementById("hideDraftsInput"),
    autoRefreshSelect: document.getElementById("autoRefreshSelect"),
    tokenInput: document.getElementById("tokenInput"),
    tokenVisibilityButton: document.getElementById("tokenVisibilityButton"),
    tokenSaveButton: document.getElementById("tokenSaveButton"),
    refreshButton: document.getElementById("refreshButton"),
    statusPill: document.getElementById("statusPill"),
    openPrCount: document.getElementById("openPrCount"),
    assignmentCount: document.getElementById("assignmentCount"),
    agingMetric: document.getElementById("agingMetric"),
    agingBadge: document.getElementById("agingBadge"),
    agingReviewCount: document.getElementById("agingReviewCount"),
    unassignedMetric: document.getElementById("unassignedMetric"),
    unassignedBadge: document.getElementById("unassignedBadge"),
    unassignedCount: document.getElementById("unassignedCount")
  };

  hydrateForm();
  bindEvents();
  bindBoardScroll();
  syncShareUrlParams(state.config);
  renderFirstRunNotice();
  renderRepoOptions();
  render();
  refreshRepositories();
  refreshDashboard();
  configureAutoRefresh();

  function bindEvents() {
    els.brandMooButton.addEventListener("click", triggerMooEasterEgg);

    els.refreshButton.addEventListener("click", function () {
      state.config = readForm();
      saveConfig(state.config);
      saveToken(els.tokenInput.value);
      updateTokenSaveState();
      configureAutoRefresh();
      refreshRepositories();
      refreshDashboard();
    });

    els.repoSelectButton.addEventListener("click", function () {
      toggleSearchSelect("repo");
    });
    els.repoSearchInput.addEventListener("input", renderRepoMenuOptions);
    els.repoSearchInput.addEventListener("keydown", function (event) {
      handleMenuSearchKeydown(event, "repo");
    });
    els.repoOptions.addEventListener("click", function (event) {
      var option = event.target.closest("[data-value]");
      if (option) {
        selectRepo(option.getAttribute("data-value"));
      }
    });

    els.reviewerFilterButton.addEventListener("click", function () {
      toggleSearchSelect("reviewer");
    });
    els.reviewerFilterSearchInput.addEventListener("input", renderReviewerFilterMenuOptions);
    els.reviewerFilterSearchInput.addEventListener("keydown", function (event) {
      handleMenuSearchKeydown(event, "reviewer");
    });
    els.reviewerFilterOptions.addEventListener("click", function (event) {
      var option = event.target.closest("[data-value]");
      if (option) {
        selectReviewerFilter(option.getAttribute("data-value"));
      }
    });

    document.addEventListener("click", function (event) {
      if (!els.repoCombobox.contains(event.target)) {
        closeSearchSelect("repo");
      }
      if (!els.reviewerFilterCombobox.contains(event.target)) {
        closeSearchSelect("reviewer");
      }
      if (els.settingsMenu.open && !els.settingsMenu.contains(event.target)) {
        els.settingsMenu.open = false;
      }
    });

    els.statusFilterSelect.addEventListener("change", function () {
      state.config.statusFilter = els.statusFilterSelect.value;
      saveConfig(state.config);
      render();
    });

    els.reviewNeedSelect.addEventListener("change", function () {
      state.config.reviewNeedFilter = normalizeReviewNeedFilter(els.reviewNeedSelect.value);
      saveConfig(state.config);
      render();
    });

    els.sortSelect.addEventListener("change", function () {
      state.config.sortMode = normalizeSortMode(els.sortSelect.value);
      saveConfig(state.config);
      render();
    });

    els.boardSearchInput.addEventListener("input", function () {
      state.boardSearch = els.boardSearchInput.value;
      render();
    });

    els.ageFilterButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        var nextFilter = normalizeAgeFilter(button.getAttribute("data-age-filter"));
        state.config.ageFilter = state.config.ageFilter === nextFilter ? "all" : nextFilter;
        saveConfig(state.config);
        render();
      });
    });

    els.clearFiltersButton.addEventListener("click", function () {
      state.config.reviewerFilter = "all";
      state.config.statusFilter = "all";
      state.config.reviewNeedFilter = "all";
      state.config.ageFilter = "all";
      state.boardSearch = "";
      els.boardSearchInput.value = "";
      saveConfig(state.config);
      render();
    });

    bindMetricShortcut(els.agingMetric, function () {
      state.config.ageFilter = "red";
      saveConfig(state.config);
      render();
    });

    bindMetricShortcut(els.unassignedMetric, function () {
      state.config.reviewerFilter = "unassigned";
      saveConfig(state.config);
      render();
    });

    els.cardGradientsInput.addEventListener("change", function () {
      state.config.cardGradients = els.cardGradientsInput.checked;
      saveConfig(state.config);
      applyCardGradientPreference(state.config.cardGradients);
    });

    els.hideDraftsInput.addEventListener("change", function () {
      state.config.hideDrafts = els.hideDraftsInput.checked;
      if (state.config.hideDrafts && state.config.statusFilter === "draft") {
        state.config.statusFilter = "all";
      }
      if (state.config.hideDrafts && state.config.ageFilter === "draft") {
        state.config.ageFilter = "all";
      }
      saveConfig(state.config);
      render();
    });

    els.autoRefreshSelect.addEventListener("change", function () {
      state.config.autoRefreshMinutes = normalizeAutoRefreshMinutes(els.autoRefreshSelect.value);
      saveConfig(state.config);
      configureAutoRefresh();
    });

    els.settingsCloseButton.addEventListener("click", function () {
      els.settingsMenu.open = false;
    });

    els.tokenInput.addEventListener("input", updateTokenSaveState);

    els.tokenVisibilityButton.addEventListener("click", function () {
      var shouldShow = els.tokenInput.type === "password";
      els.tokenInput.type = shouldShow ? "text" : "password";
      els.tokenVisibilityButton.textContent = shouldShow ? "Hide" : "Show";
      els.tokenVisibilityButton.setAttribute("aria-pressed", String(shouldShow));
    });

    els.tokenSaveButton.addEventListener("click", function () {
      saveToken(els.tokenInput.value);
      updateTokenSaveState();
      refreshRepositories();
      refreshDashboard();
    });

    els.noticeSettingsButton.addEventListener("click", function (event) {
      event.stopPropagation();
      openSettings();
    });

    els.noticeDismissButton.addEventListener("click", function () {
      writeStorage(window.localStorage, FIRST_RUN_NOTICE_KEY, "1");
      renderFirstRunNotice();
    });
  }

  function bindMetricShortcut(element, callback) {
    element.addEventListener("click", callback);
    element.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        callback();
      }
    });
  }

  function toggleSearchSelect(kind) {
    var parts = getSearchSelectParts(kind);
    if (parts.menu.hidden) {
      openSearchSelect(kind);
    } else {
      closeSearchSelect(kind);
    }
  }

  function openSearchSelect(kind) {
    var parts = getSearchSelectParts(kind);
    closeSearchSelect(kind === "repo" ? "reviewer" : "repo");
    parts.menu.hidden = false;
    parts.button.setAttribute("aria-expanded", "true");
    parts.combobox.classList.add("is-open");
    parts.search.value = "";
    if (kind === "repo") {
      renderRepoMenuOptions();
    } else {
      renderReviewerFilterMenuOptions();
    }
    window.setTimeout(function () {
      parts.search.focus();
    }, 0);
  }

  function closeSearchSelect(kind) {
    var parts = getSearchSelectParts(kind);
    if (parts.menu.hidden) {
      return;
    }
    parts.menu.hidden = true;
    parts.button.setAttribute("aria-expanded", "false");
    parts.combobox.classList.remove("is-open");
    parts.search.value = "";
  }

  function handleMenuSearchKeydown(event, kind) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeSearchSelect(kind);
      getSearchSelectParts(kind).button.focus();
      return;
    }

    if (event.key === "Enter") {
      var firstOption = getSearchSelectParts(kind).options.querySelector(".search-select-option");
      if (firstOption) {
        event.preventDefault();
        firstOption.click();
      }
    }
  }

  function getSearchSelectParts(kind) {
    if (kind === "repo") {
      return {
        combobox: els.repoCombobox,
        button: els.repoSelectButton,
        menu: els.repoSelectMenu,
        search: els.repoSearchInput,
        options: els.repoOptions
      };
    }

    return {
      combobox: els.reviewerFilterCombobox,
      button: els.reviewerFilterButton,
      menu: els.reviewerFilterMenu,
      search: els.reviewerFilterSearchInput,
      options: els.reviewerFilterOptions
    };
  }

  function selectRepo(value) {
    var nextRepo = resolveRepoValue(value);
    els.repoSelect.value = nextRepo;
    closeSearchSelect("repo");

    if (nextRepo === state.config.repo) {
      syncShareUrlParams(state.config);
      renderRepoOptions();
      return;
    }

    state.config = readForm();
    state.config.repo = nextRepo;
    state.config.reviewerFilter = "all";
    state.boardSearch = "";
    els.boardSearchInput.value = "";
    state.pulls = [];
    state.lastUpdated = null;
    saveConfig(state.config);
    render();
    refreshDashboard();
  }

  function selectReviewerFilter(value) {
    var nextFilter = normalizeFilterValue(value);
    els.reviewerFilterSelect.value = nextFilter;
    closeSearchSelect("reviewer");
    state.config.reviewerFilter = nextFilter;
    saveConfig(state.config);
    render();
  }

  function renderFirstRunNotice() {
    els.firstRunNotice.hidden = readStorage(window.localStorage, FIRST_RUN_NOTICE_KEY) === "1";
  }

  function bindBoardScroll() {
    var syncingTop = false;
    var syncingBoard = false;

    els.boardScrollTop.addEventListener("scroll", function () {
      if (syncingTop) {
        syncingTop = false;
        return;
      }
      syncingBoard = true;
      els.board.scrollLeft = els.boardScrollTop.scrollLeft;
    });

    els.board.addEventListener("scroll", function () {
      if (syncingBoard) {
        syncingBoard = false;
        return;
      }
      syncingTop = true;
      els.boardScrollTop.scrollLeft = els.board.scrollLeft;
    });

    window.addEventListener("resize", updateBoardScrollbar);
  }

  function loadConfig() {
    try {
      var saved = JSON.parse(readStorage(window.localStorage, CONFIG_KEY) || "{}");
      var config = Object.assign({}, defaults, saved);
      return applyUrlConfigOverrides(config);
    } catch (_error) {
      return applyUrlConfigOverrides(Object.assign({}, defaults));
    }
  }

  function applyUrlConfigOverrides(config) {
    var repoFromUrl = getRepoFromUrl();
    var targetFromUrl = getUrlParam("target");
    var statusFromUrl = getUrlParam("status");
    var reviewNeedFromUrl = getUrlParam("review");
    var ageFromUrl = getUrlParam("age");
    var sortFromUrl = getUrlParam("sort");
    var draftsFromUrl = getUrlParam("drafts");
    var hideDrafts = config.hideDrafts !== false;

    if (draftsFromUrl !== null) {
      var draftVisibility = normalizeDraftVisibility(draftsFromUrl);
      if (draftVisibility !== null) {
        hideDrafts = draftVisibility;
      }
    }
    var statusFilter = statusFromUrl !== null
      ? normalizeStatusFilter(statusFromUrl)
      : normalizeStatusFilter(config.statusFilter);
    var ageFilter = ageFromUrl !== null
      ? normalizeAgeFilter(ageFromUrl)
      : normalizeAgeFilter(config.ageFilter);
    if (hideDrafts && statusFilter === "draft") {
      statusFilter = "all";
    }
    if (hideDrafts && ageFilter === "draft") {
      ageFilter = "all";
    }

    return {
      repo: repoFromUrl || cleanRepoPart(config.repo || defaults.repo) || defaults.repo,
      reviewerFilter: targetFromUrl !== null ? normalizeFilterValue(targetFromUrl) : normalizeFilterValue(config.reviewerFilter),
      statusFilter: statusFilter,
      reviewNeedFilter: reviewNeedFromUrl !== null ? normalizeReviewNeedFilter(reviewNeedFromUrl) : normalizeReviewNeedFilter(config.reviewNeedFilter),
      ageFilter: ageFilter,
      sortMode: sortFromUrl !== null ? normalizeSortMode(sortFromUrl) : normalizeSortMode(config.sortMode),
      autoRefreshMinutes: normalizeAutoRefreshMinutes(config.autoRefreshMinutes),
      cardGradients: config.cardGradients !== false,
      hideDrafts: hideDrafts
    };
  }

  function getUrlParam(name) {
    try {
      var params = new URLSearchParams(window.location.search);
      return params.has(name) ? params.get(name) : null;
    } catch (_error) {
      return null;
    }
  }

  function getRepoFromUrl() {
    return cleanRepoPart(getUrlParam("repo") || getUrlParam("repository") || "");
  }

  function syncShareUrlParams(config) {
    try {
      var url = new URL(window.location.href);
      var cleanRepo = cleanRepoPart(config.repo) || defaults.repo;
      setOptionalUrlParam(url, "target", normalizeFilterValue(config.reviewerFilter), "all");
      setOptionalUrlParam(url, "status", normalizeStatusFilter(config.statusFilter), "all");
      setOptionalUrlParam(url, "review", normalizeReviewNeedFilter(config.reviewNeedFilter), "all");
      setOptionalUrlParam(url, "age", normalizeAgeFilter(config.ageFilter), "all");
      url.searchParams.set("repo", cleanRepo);
      url.searchParams.set("sort", normalizeSortMode(config.sortMode));
      url.searchParams.set("drafts", config.hideDrafts === false ? "show" : "hide");
      url.searchParams.delete("repository");
      if (url.href !== window.location.href) {
        window.history.replaceState({}, "", url);
      }
    } catch (_error) {
      return;
    }
  }

  function setOptionalUrlParam(url, name, value, defaultValue) {
    if (!value || value === defaultValue) {
      url.searchParams.delete(name);
      return;
    }
    url.searchParams.set(name, value);
  }

  function saveConfig(config) {
    syncShareUrlParams(config);
    writeStorage(window.localStorage, CONFIG_KEY, JSON.stringify(config));
  }

  function saveToken(token) {
    if (token.trim()) {
      writeStorage(window.sessionStorage, TOKEN_KEY, token.trim());
    } else {
      removeStorage(window.sessionStorage, TOKEN_KEY);
    }
  }

  function loadToken() {
    return readStorage(window.sessionStorage, TOKEN_KEY) || "";
  }

  function readStorage(storage, key) {
    try {
      return storage.getItem(key);
    } catch (_error) {
      return "";
    }
  }

  function writeStorage(storage, key, value) {
    try {
      storage.setItem(key, value);
    } catch (_error) {
      return false;
    }
    return true;
  }

  function removeStorage(storage, key) {
    try {
      storage.removeItem(key);
    } catch (_error) {
      return false;
    }
    return true;
  }

  function hydrateForm() {
    els.tokenInput.value = loadToken();
    els.cardGradientsInput.checked = state.config.cardGradients !== false;
    els.hideDraftsInput.checked = state.config.hideDrafts;
    els.autoRefreshSelect.value = String(state.config.autoRefreshMinutes);
    applyCardGradientPreference(state.config.cardGradients);
    updateTokenSaveState();
  }

  function updateTokenSaveState() {
    var isDirty = els.tokenInput.value.trim() !== loadToken();
    els.tokenSaveButton.disabled = !isDirty;
    els.tokenSaveButton.textContent = isDirty ? "Save" : "Saved";
  }

  function readForm() {
    return {
      repo: resolveRepoValue(els.repoSelect.value),
      reviewerFilter: normalizeFilterValue(els.reviewerFilterSelect.value || state.config.reviewerFilter),
      statusFilter: normalizeStatusFilter(els.statusFilterSelect.value || state.config.statusFilter),
      reviewNeedFilter: normalizeReviewNeedFilter(els.reviewNeedSelect.value || state.config.reviewNeedFilter),
      ageFilter: normalizeAgeFilter(state.config.ageFilter),
      sortMode: normalizeSortMode(els.sortSelect.value || state.config.sortMode),
      autoRefreshMinutes: normalizeAutoRefreshMinutes(els.autoRefreshSelect.value),
      cardGradients: els.cardGradientsInput.checked,
      hideDrafts: els.hideDraftsInput.checked
    };
  }

  function resolveRepoValue(value) {
    var cleaned = cleanRepoPart(value) || defaults.repo;
    var match = state.repos.find(function (repo) {
      return String(repo.name || "").toLowerCase() === cleaned.toLowerCase();
    });
    return match && match.name ? match.name : cleaned;
  }

  function cleanRepoPart(value) {
    var cleanValue = String(value || "").trim().replace(/^\/+|\/+$/g, "");
    var parts = cleanValue.split("/").filter(Boolean);
    if (parts.length >= 2) {
      if (parts[parts.length - 2].toLowerCase() === ORG_OWNER.toLowerCase()) {
        return parts[parts.length - 1];
      }
      return parts[parts.length - 1];
    }
    return cleanValue;
  }

  function normalizeFilterValue(value) {
    var key = String(value || "all").trim().replace(/^@/, "").toLowerCase();
    if (!key || key === "all") {
      return "all";
    }
    if (key === "unassigned") {
      return key;
    }
    if (key.indexOf("user:") === 0) {
      return "user:" + key.slice(5).replace(/^@/, "");
    }
    if (key.indexOf("team:") === 0) {
      return "team:" + key.slice(5).replace(/^@/, "");
    }
    return "user:" + key;
  }

  function normalizeStatusFilter(value) {
    var key = String(value || "all").trim().toLowerCase();
    return ["all", "ready", "draft", "stale"].indexOf(key) >= 0 ? key : "all";
  }

  function normalizeReviewNeedFilter(value) {
    var key = String(value || "all").trim().toLowerCase();
    return ["all", "needs-review", "needs-my-attention", "enough-approvals", "has-review-activity"].indexOf(key) >= 0 ? key : "all";
  }

  function normalizeAgeFilter(value) {
    var key = String(value || "all").trim().toLowerCase();
    return ["all", "green", "yellow", "red", "draft"].indexOf(key) >= 0 ? key : "all";
  }

  function normalizeBoardSearch(value) {
    return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  }

  function normalizeAutoRefreshMinutes(value) {
    var minutes = Number(value);
    return AUTO_REFRESH_MINUTE_OPTIONS.indexOf(minutes) >= 0 ? minutes : DEFAULT_AUTO_REFRESH_MINUTES;
  }

  function normalizeDraftVisibility(value) {
    var key = String(value || "").trim().toLowerCase();
    if (key === "show") {
      return false;
    }
    if (key === "hide") {
      return true;
    }
    return null;
  }

  function configureAutoRefresh() {
    if (state.refreshTimerId) {
      window.clearInterval(state.refreshTimerId);
      state.refreshTimerId = null;
    }

    var minutes = normalizeAutoRefreshMinutes(state.config.autoRefreshMinutes);
    if (!minutes) {
      return;
    }

    state.refreshTimerId = window.setInterval(refreshDashboard, minutes * 60 * 1000);
  }

  function normalizeSortMode(value) {
    var key = String(value || "priority").trim().toLowerCase();
    return ["priority", "oldest", "recently-updated", "newest"].indexOf(key) >= 0 ? key : "priority";
  }

  function applyCardGradientPreference(value) {
    var enabled = value !== false;
    document.body.classList.toggle("card-gradients-off", !enabled);
    els.cardGradientsInput.checked = enabled;
  }

  async function refreshRepositories() {
    var requestId = state.repoRequestId + 1;
    state.repoRequestId = requestId;
    state.reposLoading = true;
    state.reposError = "";
    renderRepoOptions();

    try {
      var repos = await fetchOrgRepos(loadToken());
      if (requestId !== state.repoRequestId) {
        return;
      }
      state.repos = repos;
    } catch (error) {
      if (requestId !== state.repoRequestId) {
        return;
      }
      state.repos = [];
      state.reposError = error.message || "Repository list unavailable.";
    } finally {
      if (requestId === state.repoRequestId) {
        state.reposLoading = false;
        renderRepoOptions();
      }
    }
  }

  async function refreshDashboard() {
    var requestId = state.dashboardRequestId + 1;
    var config = Object.assign({}, state.config);
    state.dashboardRequestId = requestId;
    state.loading = true;
    setMessage("");
    setStatus("Loading", "loading");
    els.refreshButton.disabled = true;
    render();

    try {
      var token = loadToken();
      var viewer = await fetchViewer(token);
      if (requestId !== state.dashboardRequestId) {
        return;
      }
      state.viewer = viewer;
      render();
      var pulls = await fetchOpenPulls(config, token, viewer);
      if (requestId !== state.dashboardRequestId) {
        return;
      }
      state.pulls = pulls;
      state.lastUpdated = new Date();
      state.loading = false;
      render();
      setStatus("Updated " + formatClock(state.lastUpdated), "ok");
      setUpdatedTooltip();
    } catch (error) {
      if (requestId !== state.dashboardRequestId) {
        return;
      }
      var message = error.message || "GitHub request failed.";
      setMessage(message, shouldShowSettingsAction(message));
      setStatus("Error", "error");
      state.loading = false;
      render();
    } finally {
      if (requestId === state.dashboardRequestId) {
        state.loading = false;
        els.refreshButton.disabled = false;
      }
    }
  }

  async function fetchOrgRepos(token) {
    var repos = [];
    var page = 1;
    var headers = buildGitHubHeaders(token);

    while (true) {
      var url = new URL("https://api.github.com/orgs/" + encodeURIComponent(ORG_OWNER) + "/repos");
      url.searchParams.set("type", "all");
      url.searchParams.set("sort", "full_name");
      url.searchParams.set("direction", "asc");
      url.searchParams.set("per_page", "100");
      url.searchParams.set("page", String(page));

      var response = await window.fetch(url.toString(), {
        headers: headers,
        cache: "no-store"
      });

      var payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(buildGitHubError(response, payload, "repository list"));
      }

      repos = repos.concat(payload);
      if (!Array.isArray(payload) || payload.length < 100) {
        break;
      }
      page += 1;
    }

    return repos
      .filter(function (repo) {
        return repo && repo.name;
      })
      .sort(function (a, b) {
        if (Boolean(a.archived) !== Boolean(b.archived)) {
          return a.archived ? 1 : -1;
        }
        return a.name.localeCompare(b.name);
      });
  }

  async function fetchViewer(token) {
    if (!token) {
      return null;
    }

    try {
      var response = await window.fetch("https://api.github.com/user", {
        headers: buildGitHubHeaders(token),
        cache: "no-store"
      });
      var payload = await parseResponse(response);
      if (!response.ok || !payload || !payload.login) {
        return null;
      }
      return {
        login: payload.login,
        avatar_url: payload.avatar_url || "",
        html_url: payload.html_url || "https://github.com/" + payload.login
      };
    } catch (_error) {
      return null;
    }
  }

  async function fetchOpenPulls(config, token, viewer) {
    var pulls = [];
    var page = 1;
    var headers = buildGitHubHeaders(token);

    while (true) {
      var url = new URL("https://api.github.com/repos/" + encodeURIComponent(ORG_OWNER) + "/" + encodeURIComponent(config.repo) + "/pulls");
      url.searchParams.set("state", "open");
      url.searchParams.set("per_page", "100");
      url.searchParams.set("page", String(page));

      var response = await window.fetch(url.toString(), {
        headers: headers,
        cache: "no-store"
      });

      var payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(buildGitHubError(response, payload, config.repo));
      }

      pulls = pulls.concat(payload);
      if (!Array.isArray(payload) || payload.length < 100) {
        break;
      }
      page += 1;
    }

    return hydratePullReviewState(pulls, config, token, viewer);
  }

  async function hydratePullReviewState(pulls, config, token, viewer) {
    var headers = buildGitHubHeaders(token);
    return mapWithConcurrency(pulls, 6, async function (pull) {
      var reviewData = await Promise.all([
        fetchPullReviews(config.repo, pull.number, headers),
        fetchPullIssue(config.repo, pull.number, headers).catch(function () {
          return {};
        })
      ]);
      var issueCommentCount = Number((reviewData[1] && reviewData[1].comments) || pull.comments || 0);
      var reviewCommentCount = Number(pull.review_comments || 0);
      var commentData = await Promise.all([
        viewer && issueCommentCount > 0 ? fetchIssueComments(config.repo, pull.number, headers).catch(function () {
          return [];
        }) : Promise.resolve([]),
        viewer && reviewCommentCount > 0 ? fetchPullReviewComments(config.repo, pull.number, headers).catch(function () {
          return [];
        }) : Promise.resolve([])
      ]);
      return Object.assign({}, pull, {
        review_state: buildPullReviewState(pull, reviewData[0], reviewData[1], commentData[0], commentData[1], viewer)
      });
    });
  }

  async function fetchPullReviews(repo, number, headers) {
    var reviews = [];
    var page = 1;

    while (true) {
      var url = new URL("https://api.github.com/repos/" + encodeURIComponent(ORG_OWNER) + "/" + encodeURIComponent(repo) + "/pulls/" + encodeURIComponent(number) + "/reviews");
      url.searchParams.set("per_page", "100");
      url.searchParams.set("page", String(page));

      var response = await window.fetch(url.toString(), {
        headers: headers,
        cache: "no-store"
      });

      var payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(buildGitHubError(response, payload, repo + "/pull/" + number + "/reviews"));
      }

      reviews = reviews.concat(Array.isArray(payload) ? payload : []);
      if (!Array.isArray(payload) || payload.length < 100) {
        break;
      }
      page += 1;
    }

    return reviews;
  }

  async function fetchPullIssue(repo, number, headers) {
    var url = new URL("https://api.github.com/repos/" + encodeURIComponent(ORG_OWNER) + "/" + encodeURIComponent(repo) + "/issues/" + encodeURIComponent(number));
    var response = await window.fetch(url.toString(), {
      headers: headers,
      cache: "no-store"
    });
    var payload = await parseResponse(response);
    if (!response.ok) {
      throw new Error(buildGitHubError(response, payload, repo + "/issues/" + number));
    }
    return payload || {};
  }

  async function fetchIssueComments(repo, number, headers) {
    var comments = [];
    var page = 1;

    while (true) {
      var url = new URL("https://api.github.com/repos/" + encodeURIComponent(ORG_OWNER) + "/" + encodeURIComponent(repo) + "/issues/" + encodeURIComponent(number) + "/comments");
      url.searchParams.set("per_page", "100");
      url.searchParams.set("page", String(page));
      var response = await window.fetch(url.toString(), {
        headers: headers,
        cache: "no-store"
      });
      var payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(buildGitHubError(response, payload, repo + "/issues/" + number + "/comments"));
      }
      comments = comments.concat(Array.isArray(payload) ? payload : []);
      if (!Array.isArray(payload) || payload.length < 100) {
        break;
      }
      page += 1;
    }

    return comments;
  }

  async function fetchPullReviewComments(repo, number, headers) {
    var comments = [];
    var page = 1;

    while (true) {
      var url = new URL("https://api.github.com/repos/" + encodeURIComponent(ORG_OWNER) + "/" + encodeURIComponent(repo) + "/pulls/" + encodeURIComponent(number) + "/comments");
      url.searchParams.set("per_page", "100");
      url.searchParams.set("page", String(page));
      var response = await window.fetch(url.toString(), {
        headers: headers,
        cache: "no-store"
      });
      var payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(buildGitHubError(response, payload, repo + "/pull/" + number + "/comments"));
      }
      comments = comments.concat(Array.isArray(payload) ? payload : []);
      if (!Array.isArray(payload) || payload.length < 100) {
        break;
      }
      page += 1;
    }

    return comments;
  }

  function buildPullReviewState(pull, reviews, issue, issueComments, reviewComments, viewer) {
    var latestByUser = new Map();
    var viewerLogin = viewer && viewer.login ? viewer.login.toLowerCase() : "";
    reviews.forEach(function (review) {
      var login = review.user && review.user.login ? review.user.login.toLowerCase() : "";
      if (!login) {
        return;
      }
      var previous = latestByUser.get(login);
      var reviewTime = new Date(review.submitted_at || review.updated_at || 0).getTime();
      var previousTime = previous ? new Date(previous.submitted_at || previous.updated_at || 0).getTime() : 0;
      if (!previous || reviewTime >= previousTime) {
        latestByUser.set(login, review);
      }
    });

    var latestReviews = Array.from(latestByUser.values());
    var approvalCount = latestReviews.filter(function (review) {
      return review.state === "APPROVED";
    }).length;
    var changesRequestedCount = latestReviews.filter(function (review) {
      return review.state === "CHANGES_REQUESTED";
    }).length;
    var issueCommentCount = Number((issue && issue.comments) || pull.comments || 0);
    var reviewCommentCount = Number(pull.review_comments || 0);
    var viewerLatestReview = viewerLogin ? latestByUser.get(viewerLogin) : null;
    var viewerCommented = Boolean(viewerLogin) && (
      commentsIncludeUser(issueComments, viewerLogin) ||
      commentsIncludeUser(reviewComments, viewerLogin) ||
      reviews.some(function (review) {
        return review.user && String(review.user.login || "").toLowerCase() === viewerLogin && Boolean(String(review.body || "").trim());
      })
    );
    var viewerReviewed = Boolean(viewerLatestReview);

    return {
      approvalCount: approvalCount,
      changesRequestedCount: changesRequestedCount,
      reviewCount: reviews.length,
      issueCommentCount: issueCommentCount,
      reviewCommentCount: reviewCommentCount,
      hasReviewActivity: reviews.length > 0 || issueCommentCount > 0 || reviewCommentCount > 0,
      viewerParticipated: viewerReviewed || viewerCommented,
      viewerReviewState: viewerLatestReview ? viewerLatestReview.state : ""
    };
  }

  function commentsIncludeUser(comments, login) {
    return Array.isArray(comments) && comments.some(function (comment) {
      return comment.user && String(comment.user.login || "").toLowerCase() === login;
    });
  }

  async function mapWithConcurrency(items, limit, mapper) {
    var results = new Array(items.length);
    var nextIndex = 0;
    var workers = Array.from({ length: Math.min(limit, items.length) }, async function () {
      while (nextIndex < items.length) {
        var index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(items[index], index);
      }
    });
    await Promise.all(workers);
    return results;
  }

  function buildGitHubHeaders(token) {
    var headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };

    if (token) {
      headers.Authorization = "Bearer " + token;
    }

    return headers;
  }

  async function parseResponse(response) {
    var text = await response.text();
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch (_error) {
      return text;
    }
  }

  function buildGitHubError(response, payload, target) {
    var message = payload && payload.message ? payload.message : "GitHub returned " + response.status + ".";
    var remaining = response.headers.get("x-ratelimit-remaining");
    var reset = response.headers.get("x-ratelimit-reset");

    if (response.status === 403 && remaining === "0" && reset) {
      var resetDate = new Date(Number(reset) * 1000);
      return "GitHub rate limit reached. Try a token or wait until " + formatClock(resetDate) + ".";
    }

    if (response.status === 404) {
      if (target === "repository list") {
        return "GitHub resource not found or token cannot access " + ORG_OWNER + " repositories.";
      }
      return "GitHub resource not found or token cannot access it: " + ORG_OWNER + "/" + target + ".";
    }

    return message;
  }

  function render() {
    var model = buildWorkloadModel(state.pulls, state.config);
    applyCardGradientPreference(state.config.cardGradients);
    renderViewer();
    renderRepoOptions();
    renderReviewerFilterOptions(model);
    renderStatusFilterOptions(model);
    renderReviewNeedOptions(model);
    renderSortOptions(model);
    renderAgeLegend(model);
    renderClearFilters(model);
    renderMetrics(model);
    renderBoard(model);

    renderBoardMeta(model);
  }

  function renderViewer() {
    if (!state.viewer || !state.viewer.login) {
      els.viewerBadge.hidden = true;
      els.viewerBadge.removeAttribute("href");
      els.viewerAvatar.removeAttribute("src");
      els.viewerLogin.textContent = "";
      return;
    }

    els.viewerBadge.hidden = false;
    els.viewerBadge.href = state.viewer.html_url || "https://github.com/" + state.viewer.login;
    els.viewerBadge.title = "GitHub token user: @" + state.viewer.login;
    els.viewerAvatar.src = state.viewer.avatar_url || "";
    els.viewerLogin.textContent = "@" + state.viewer.login;
  }

  function renderBoardMeta(model) {
    els.boardMeta.replaceChildren();

    if (state.loading && !state.lastUpdated) {
      els.boardMeta.textContent = "Fetching GitHub data";
      return;
    }

    if (!state.lastUpdated) {
      els.boardMeta.textContent = "Waiting for GitHub";
      return;
    }

    appendMetaPart("", state.pulls.length, " open PRs");
    appendMetaPart("Updated ", formatClock(state.lastUpdated), "");
    if (model.selectedFilter !== "all") {
      appendMetaPart("Filtered to ", getFilterLabel(model.selectedFilter, model), "");
    }
    if (model.selectedStatus !== "all") {
      appendMetaPart("Activity ", getActivityFilterLabel(model.selectedStatus), "");
    }
    if (model.selectedReviewNeed !== "all") {
      appendMetaPart("Review need ", getReviewNeedLabel(model.selectedReviewNeed), "");
    }
    if (model.selectedAge !== "all") {
      appendMetaPart("Age ", getAgeFilterLabel(model.selectedAge), "");
    }
    if (model.selectedSearch) {
      appendMetaPart("Search ", "\"" + model.selectedSearch + "\"", " · " + model.matchingPrCount + " matches");
    }
    if (model.hideDrafts && model.hiddenDraftCount) {
      appendMetaPart("", model.hiddenDraftCount, " drafts hidden");
    }
  }

  function setUpdatedTooltip() {
    if (!state.lastUpdated) {
      els.statusPill.title = "";
      return;
    }
    els.statusPill.title = "Last updated " + formatFullDateTime(state.lastUpdated);
  }

  function appendMetaPart(prefix, value, suffix) {
    var item = document.createElement("span");
    if (prefix) {
      item.appendChild(document.createTextNode(prefix));
    }
    var strong = document.createElement("strong");
    strong.textContent = String(value);
    item.appendChild(strong);
    if (suffix) {
      item.appendChild(document.createTextNode(suffix));
    }
    els.boardMeta.appendChild(item);
  }

  function getAgeFilterLabel(value) {
    if (value === "green") {
      return "< 7d";
    }
    if (value === "yellow") {
      return "7-14d";
    }
    if (value === "red") {
      return "> 14d";
    }
    if (value === "draft") {
      return "Draft";
    }
    return "All";
  }

  function getActivityFilterLabel(value) {
    if (value === "ready") {
      return "Recently updated";
    }
    if (value === "stale") {
      return "Stale";
    }
    if (value === "draft") {
      return "Draft";
    }
    return "All activity";
  }

  function getReviewNeedLabel(value) {
    if (value === "needs-review") {
      return "Needs review";
    }
    if (value === "needs-my-attention") {
      return "Needs my attention" + getViewerLabelSuffix();
    }
    if (value === "enough-approvals") {
      return "Has enough approvals";
    }
    if (value === "has-review-activity") {
      return "Has review activity";
    }
    return "All review states";
  }

  function getViewerLabelSuffix() {
    return state.viewer && state.viewer.login ? " (@" + state.viewer.login + ")" : "";
  }

  function renderRepoOptions() {
    var selected = cleanRepoPart(state.config.repo) || defaults.repo;
    els.repoSelect.value = selected;
    els.repoSelectLabel.textContent = selected;
    renderRepoMenuOptions();

    if (state.reposLoading) {
      els.repoPickerHint.textContent = "Loading " + ORG_OWNER + " repositories";
      els.repoPickerHint.title = "";
    } else if (state.reposError) {
      els.repoPickerHint.textContent = "Repository list unavailable";
      els.repoPickerHint.title = state.reposError;
    } else {
      els.repoPickerHint.textContent = state.repos.length
        ? String(state.repos.length) + " repos in " + ORG_OWNER
        : "";
      els.repoPickerHint.title = "";
    }
  }

  function renderRepoMenuOptions() {
    var options = getRepoMenuOptions();
    var query = els.repoSearchInput.value.trim().toLowerCase();
    var selected = cleanRepoPart(state.config.repo) || defaults.repo;
    var matches = options.filter(function (option) {
      return !query || option.value.toLowerCase().indexOf(query) >= 0 || option.label.toLowerCase().indexOf(query) >= 0;
    });
    var fragment = document.createDocumentFragment();

    matches.forEach(function (option) {
      fragment.appendChild(createSearchSelectOption(option.value, option.label, option.value === selected));
    });

    if (!matches.length) {
      fragment.appendChild(createSearchSelectEmpty("No repositories found"));
    }

    els.repoOptions.replaceChildren(fragment);
  }

  function getRepoMenuOptions() {
    var selected = cleanRepoPart(state.config.repo) || defaults.repo;
    var seen = new Set();
    var options = [];

    addRepoOption({ name: selected });
    state.repos.forEach(addRepoOption);
    return options;

    function addRepoOption(repo) {
      var name = cleanRepoPart(repo.name || "");
      var key = name.toLowerCase();
      if (!name || seen.has(key)) {
        return;
      }
      seen.add(key);
      options.push({
        value: name,
        label: formatRepoOption(repo)
      });
    }
  }

  function formatRepoOption(repo) {
    var label = repo.name || "";
    var flags = [];
    if (repo.private) {
      flags.push("private");
    }
    if (repo.archived) {
      flags.push("archived");
    }
    return flags.length ? label + " [" + flags.join(", ") + "]" : label;
  }

  function buildWorkloadModel(pulls, config) {
    var hideDrafts = config.hideDrafts !== false;
    var selectedStatus = normalizeStatusFilter(config.statusFilter);
    var selectedReviewNeed = normalizeReviewNeedFilter(config.reviewNeedFilter);
    if (selectedReviewNeed === "needs-my-attention" && !getViewerLogin()) {
      selectedReviewNeed = "all";
    }
    var selectedAge = normalizeAgeFilter(config.ageFilter);
    var selectedSort = normalizeSortMode(config.sortMode);
    var selectedSearch = normalizeBoardSearch(state.boardSearch);
    var modelPulls = hideDrafts ? pulls.filter(function (pull) {
      return !pull.draft;
    }) : pulls;
    if (hideDrafts && selectedStatus === "draft") {
      selectedStatus = "all";
    }
    if (hideDrafts && selectedAge === "draft") {
      selectedAge = "all";
    }

    var reviewerByLogin = new Map();
    var reviewerCounts = new Map();
    var teamBySlug = new Map();
    var teamCounts = new Map();
    var pullTeamMatches = new Map();

    modelPulls.forEach(function (pull) {
      getReviewers(pull).forEach(function (reviewer) {
        var reviewerKey = reviewer.login.toLowerCase();
        reviewerByLogin.set(reviewerKey, reviewer);
        reviewerCounts.set(reviewerKey, (reviewerCounts.get(reviewerKey) || 0) + 1);
      });

      var requestedTeams = getRequestedTeams(pull);
      requestedTeams.forEach(function (team) {
        var teamKey = String(team.slug || "").toLowerCase();
        if (!teamKey) {
          return;
        }
        teamBySlug.set(teamKey, team);
        teamCounts.set(teamKey, (teamCounts.get(teamKey) || 0) + 1);
      });
      pullTeamMatches.set(pull.number, requestedTeams);
    });

    var reviewerOptions = Array.from(reviewerByLogin.values()).sort(function (a, b) {
      return a.login.localeCompare(b.login);
    });
    var teamOptions = Array.from(teamBySlug.values()).sort(function (a, b) {
      return String(a.slug || "").localeCompare(String(b.slug || ""));
    });

    var noTeamReviewer = modelPulls.filter(function (pull) {
      var hasPerson = getReviewers(pull).length > 0;
      var hasTeam = pullTeamMatches.get(pull.number).length > 0;
      return !hasPerson && !hasTeam;
    });

    var selectedFilter = resolveReviewTargetFilter(config.reviewerFilter, reviewerByLogin, teamBySlug, noTeamReviewer.length);
    var visiblePulls = filterPullsBySearch(filterPullsByReviewNeed(filterPullsByAge(filterPullsByStatus(modelPulls, selectedStatus), selectedAge), selectedReviewNeed), selectedSearch, pullTeamMatches);
    var visibleNoTeamReviewer = filterPullsBySearch(filterPullsByReviewNeed(filterPullsByAge(filterPullsByStatus(noTeamReviewer, selectedStatus), selectedAge), selectedReviewNeed), selectedSearch, pullTeamMatches);
    var lanes = buildLanesForFilter(selectedFilter, visiblePulls, reviewerOptions, reviewerByLogin, teamOptions, pullTeamMatches, visibleNoTeamReviewer, selectedSort);

    var assignmentCount = modelPulls.reduce(function (total, pull) {
      return total + getReviewers(pull).length + pullTeamMatches.get(pull.number).length;
    }, 0);
    var agingPulls = modelPulls.filter(isAgingPull);
    var oldestAgingDays = getOldestPullAgeDays(agingPulls);

    return {
      lanes: lanes,
      reviewerOptions: reviewerOptions,
      reviewerCounts: reviewerCounts,
      teamOptions: teamOptions,
      teamCounts: teamCounts,
      selectedFilter: selectedFilter,
      selectedStatus: selectedStatus,
      selectedReviewNeed: selectedReviewNeed,
      selectedAge: selectedAge,
      selectedSort: selectedSort,
      selectedSearch: selectedSearch,
      hideDrafts: hideDrafts,
      hiddenDraftCount: pulls.length - modelPulls.length,
      statusCounts: buildStatusCounts(modelPulls),
      reviewNeedCounts: buildReviewNeedCounts(modelPulls),
      openPrCount: modelPulls.length,
      assignmentCount: assignmentCount,
      agingReviewCount: agingPulls.length,
      oldestAgingDays: oldestAgingDays,
      matchingPrCount: visiblePulls.length,
      unassignedCount: noTeamReviewer.length,
      teamMatches: pullTeamMatches
    };
  }

  function buildLanesForFilter(selectedFilter, pulls, reviewerOptions, reviewerByLogin, teamOptions, pullTeamMatches, noTeamReviewer, sortMode) {
    if (selectedFilter === "all") {
      var personLanes = reviewerOptions.map(function (reviewer) {
        return createPersonLane(reviewer.login.toLowerCase(), pulls, reviewerByLogin, sortMode);
      });
      personLanes.sort(sortLanesByUrgency);
      var knownTeamSlugs = new Set(teamOptions.map(function (team) {
        return String(team.slug || "").toLowerCase();
      }));

      var teamLanes = teamOptions.map(function (team) {
        return createTeamLane(String(team.slug || "").toLowerCase(), pulls, teamOptions, pullTeamMatches, sortMode);
      });
      teamLanes.sort(sortLanesByUrgency);
      var lanes = teamLanes.slice();

      var unknownTeamItems = pulls.filter(function (pull) {
        return pullTeamMatches.get(pull.number).some(function (team) {
          var slug = String(team.slug || "").toLowerCase();
          return !slug || !knownTeamSlugs.has(slug);
        });
      });

      if (unknownTeamItems.length) {
        lanes.push(createLaneModel({
          type: "team",
          title: "Team requests",
          subtitle: "unknown teams",
          avatarUrl: ""
        }, unknownTeamItems, sortMode));
      }

      lanes = lanes.concat(personLanes);
      lanes.push(createUnassignedLane(noTeamReviewer, sortMode));
      return lanes;
    }

    if (selectedFilter.indexOf("user:") === 0) {
      return [createPersonLane(selectedFilter.slice(5), pulls, reviewerByLogin, sortMode)];
    }

    if (selectedFilter.indexOf("team:") === 0) {
      return [createTeamLane(selectedFilter.slice(5), pulls, teamOptions, pullTeamMatches, sortMode)];
    }

    return [createUnassignedLane(noTeamReviewer, sortMode)];
  }

  function createPersonLane(handle, pulls, reviewerByLogin, sortMode) {
    var key = handle.toLowerCase();
    var reviewer = reviewerByLogin.get(key);
    var items = pulls.filter(function (pull) {
      return getReviewers(pull).some(function (candidate) {
        return candidate.login.toLowerCase() === key;
      });
    });

    return createLaneModel({
      type: "person",
      title: reviewer ? reviewer.login : handle,
      subtitle: reviewer ? "@" + reviewer.login : "@" + handle,
      avatarUrl: reviewer ? reviewer.avatar_url : ""
    }, items, sortMode);
  }

  function createTeamLane(slug, pulls, teams, pullTeamMatches, sortMode) {
    var key = slug.toLowerCase();
    var team = teams.find(function (candidate) {
      return String(candidate.slug || "").toLowerCase() === key;
    });
    var items = pulls.filter(function (pull) {
      return pullTeamMatches.get(pull.number).some(function (candidate) {
        return String(candidate.slug || "").toLowerCase() === key;
      });
    });

    return createLaneModel({
      type: "team",
      title: team && team.name ? team.name : slug,
      subtitle: "@" + ORG_OWNER + "/" + (team && team.slug ? team.slug : slug),
      avatarUrl: ""
    }, items, sortMode);
  }

  function createUnassignedLane(items, sortMode) {
    return createLaneModel({
      type: "unassigned",
      title: "No active review request",
      subtitle: "no current requested reviewer/team",
      avatarUrl: ""
    }, items, sortMode);
  }

  function createLaneModel(base, items, sortMode) {
    var sortedItems = sortPulls(items, sortMode);
    return Object.assign({}, base, {
      count: sortedItems.length,
      items: sortedItems,
      ageSummary: buildAgeSummary(sortedItems),
      oldestDays: getOldestPullAgeDays(sortedItems)
    });
  }

  function sortLanesByUrgency(a, b) {
    var redDelta = b.ageSummary.red - a.ageSummary.red;
    if (redDelta) {
      return redDelta;
    }
    var oldestDelta = b.oldestDays - a.oldestDays;
    if (oldestDelta) {
      return oldestDelta;
    }
    var yellowDelta = b.ageSummary.yellow - a.ageSummary.yellow;
    if (yellowDelta) {
      return yellowDelta;
    }
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    return a.title.localeCompare(b.title);
  }

  function resolveReviewTargetFilter(value, reviewerByLogin, teamBySlug, unassignedCount) {
    var key = normalizeFilterValue(value);
    if (key === "all") {
      return "all";
    }
    if (key === "unassigned") {
      return unassignedCount > 0 ? key : "all";
    }
    if (key.indexOf("user:") === 0 && reviewerByLogin.has(key.slice(5))) {
      return key;
    }
    if (key.indexOf("team:") === 0 && teamBySlug.has(key.slice(5))) {
      return key;
    }
    return "all";
  }

  function getFilterLabel(value, model) {
    if (value === "unassigned") {
      return "No active review request";
    }
    if (value.indexOf("user:") === 0) {
      return "@" + getReviewerLogin(value.slice(5), model.reviewerOptions);
    }
    if (value.indexOf("team:") === 0) {
      return "@" + ORG_OWNER + "/" + getTeamSlug(value.slice(5), model.teamOptions);
    }
    return value;
  }

  function getReviewerLogin(key, reviewers) {
    var match = reviewers.find(function (reviewer) {
      return reviewer.login.toLowerCase() === key;
    });
    return match ? match.login : key;
  }

  function getTeamSlug(key, teams) {
    var match = teams.find(function (team) {
      return String(team.slug || "").toLowerCase() === key;
    });
    return match && match.slug ? match.slug : key;
  }

  function renderReviewerFilterOptions(model) {
    var options = [];
    addReviewerFilterOption("all", "All open PRs (" + model.openPrCount + ")", "All");

    if (model.reviewerOptions.length) {
      model.reviewerOptions.forEach(function (reviewer) {
        var key = reviewer.login.toLowerCase();
        addReviewerFilterOption("user:" + key, "@" + reviewer.login + " (" + (model.reviewerCounts.get(key) || 0) + ")", "People");
      });
    }

    if (model.teamOptions.length) {
      model.teamOptions.forEach(function (team) {
        var key = String(team.slug || "").toLowerCase();
        addReviewerFilterOption("team:" + key, "@" + ORG_OWNER + "/" + team.slug + " (" + (model.teamCounts.get(key) || 0) + ")", "Teams");
      });
    }

    if (model.unassignedCount > 0) {
      addReviewerFilterOption("unassigned", "No active review request (" + model.unassignedCount + ")", "Other");
    }

    state.reviewerFilterOptions = options;
    els.reviewerFilterSelect.value = model.selectedFilter;
    els.reviewerFilterLabel.textContent = getSearchOptionLabel(options, model.selectedFilter) || "All open PRs";
    els.reviewerFilterButton.disabled = !model.openPrCount;
    renderReviewerFilterMenuOptions();

    function addReviewerFilterOption(value, label, group) {
      options.push({
        value: value,
        label: label,
        group: group
      });
    }
  }

  function renderReviewerFilterMenuOptions() {
    var query = els.reviewerFilterSearchInput.value.trim().toLowerCase();
    var selected = normalizeFilterValue(els.reviewerFilterSelect.value || state.config.reviewerFilter);
    var matches = state.reviewerFilterOptions.filter(function (option) {
      return !query || option.label.toLowerCase().indexOf(query) >= 0 || option.value.toLowerCase().indexOf(query) >= 0;
    });
    var fragment = document.createDocumentFragment();
    var lastGroup = "";

    matches.forEach(function (option) {
      if (option.group && option.group !== lastGroup) {
        fragment.appendChild(createSearchSelectGroup(option.group));
        lastGroup = option.group;
      }
      fragment.appendChild(createSearchSelectOption(option.value, option.label, option.value === selected));
    });

    if (!matches.length) {
      fragment.appendChild(createSearchSelectEmpty("No reviewers or teams found"));
    }

    els.reviewerFilterOptions.replaceChildren(fragment);
  }

  function createSearchSelectOption(value, label, selected) {
    var button = document.createElement("button");
    button.className = "search-select-option";
    button.type = "button";
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(Boolean(selected)));
    button.setAttribute("data-value", value);
    if (selected) {
      button.classList.add("is-selected");
    }

    var text = document.createElement("span");
    text.textContent = label;
    button.appendChild(text);
    return button;
  }

  function createSearchSelectGroup(label) {
    var group = document.createElement("div");
    group.className = "search-select-group";
    group.textContent = label;
    return group;
  }

  function createSearchSelectEmpty(text) {
    var empty = document.createElement("div");
    empty.className = "search-select-empty";
    empty.textContent = text;
    return empty;
  }

  function getSearchOptionLabel(options, value) {
    var match = options.find(function (option) {
      return option.value === value;
    });
    return match ? match.label : "";
  }

  function renderStatusFilterOptions(model) {
    setStatusOptionText("all", "All activity (" + model.openPrCount + ")");
    setStatusOptionText("ready", "Recently updated (" + model.statusCounts.ready + ")");
    setStatusOptionText("draft", model.hideDrafts ? "Draft (hidden)" : "Draft (" + model.statusCounts.draft + ")", model.hideDrafts);
    setStatusOptionText("stale", "Stale (" + model.statusCounts.stale + ")");
    els.statusFilterSelect.value = model.selectedStatus;
    els.statusFilterSelect.disabled = !model.openPrCount;
  }

  function setStatusOptionText(value, text, disabled) {
    var option = els.statusFilterSelect.querySelector("option[value=\"" + value + "\"]");
    if (option) {
      option.textContent = text;
      option.disabled = Boolean(disabled);
    }
  }

  function renderReviewNeedOptions(model) {
    setReviewNeedOptionText("all", "All review states (" + model.openPrCount + ")");
    setReviewNeedOptionText("needs-review", "Needs review (" + model.reviewNeedCounts.needsReview + ")");
    setReviewNeedOptionText(
      "needs-my-attention",
      state.viewer && state.viewer.login
        ? "Needs my attention (@" + state.viewer.login + ") (" + model.reviewNeedCounts.needsMyAttention + ")"
        : "Needs my attention (token required)",
      !state.viewer || !state.viewer.login
    );
    setReviewNeedOptionText("enough-approvals", "Has enough approvals (" + model.reviewNeedCounts.enoughApprovals + ")");
    setReviewNeedOptionText("has-review-activity", "Has review activity (" + model.reviewNeedCounts.hasReviewActivity + ")");
    els.reviewNeedSelect.value = model.selectedReviewNeed;
    els.reviewNeedSelect.disabled = !model.openPrCount;
  }

  function setReviewNeedOptionText(value, text, disabled) {
    var option = els.reviewNeedSelect.querySelector("option[value=\"" + value + "\"]");
    if (option) {
      option.textContent = text;
      option.disabled = Boolean(disabled);
    }
  }

  function renderSortOptions(model) {
    els.sortSelect.value = model.selectedSort;
    els.sortSelect.disabled = !model.openPrCount;
    els.boardSearchInput.disabled = !model.openPrCount;
    els.cardGradientsInput.checked = state.config.cardGradients !== false;
    els.hideDraftsInput.checked = model.hideDrafts;
  }

  function renderAgeLegend(model) {
    els.draftAgeLegend.hidden = model.hideDrafts;
    els.ageFilterButtons.forEach(function (button) {
      var value = normalizeAgeFilter(button.getAttribute("data-age-filter"));
      var isActive = model.selectedAge === value;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
      button.title = isActive ? "Clear age filter" : "Show " + getAgeFilterLabel(value) + " PRs";
    });
  }

  function renderClearFilters(model) {
    els.clearFiltersButton.hidden = !hasActiveFilters(model);
  }

  function hasActiveFilters(model) {
    return model.selectedFilter !== "all" || model.selectedStatus !== "all" || model.selectedReviewNeed !== "all" || model.selectedAge !== "all" || Boolean(model.selectedSearch);
  }

  function renderMetrics(model) {
    els.openPrCount.textContent = String(model.openPrCount);
    els.assignmentCount.textContent = String(model.assignmentCount);
    els.agingReviewCount.textContent = String(model.agingReviewCount);
    els.agingMetric.classList.toggle("is-attention", model.agingReviewCount > 0);
    els.agingBadge.textContent = model.agingReviewCount > 0 ? "Oldest " + model.oldestAgingDays + "d" : "Clear";
    els.unassignedCount.textContent = String(model.unassignedCount);
    els.unassignedMetric.classList.toggle("is-attention", model.unassignedCount > 0);
    els.unassignedBadge.textContent = model.unassignedCount > 0 ? "Needs request" : "Clear";
  }

  function renderBoard(model) {
    els.board.replaceChildren();

    if (state.loading && !state.pulls.length) {
      els.board.appendChild(createBoardLoader());
      updateBoardScrollbar();
      return;
    }

    if (model.selectedSearch && !model.lanes.some(function (lane) {
      return lane.items.length > 0;
    })) {
      var noMatch = document.createElement("div");
      noMatch.className = "empty-state";
      noMatch.textContent = "No matching PRs";
      els.board.appendChild(noMatch);
      updateBoardScrollbar();
      return;
    }

    if (!model.lanes.length) {
      var empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No open review requests";
      els.board.appendChild(empty);
      updateBoardScrollbar();
      return;
    }

    model.lanes.forEach(function (lane) {
      els.board.appendChild(createLane(lane, model.teamMatches));
    });

    updateBoardScrollbar();
  }

  function createBoardLoader() {
    var loader = document.createElement("div");
    loader.className = "board-loader";

    var spinner = document.createElement("span");
    spinner.className = "board-loader-spinner";
    spinner.setAttribute("aria-hidden", "true");

    var copy = document.createElement("div");
    var title = document.createElement("strong");
    title.textContent = "Loading review workload";
    var detail = document.createElement("span");
    detail.textContent = "Fetching open PRs, requested reviewers, review states, approvals, and comments from GitHub.";
    copy.append(title, detail);
    if (loadToken()) {
      copy.appendChild(createLoaderViewer());
    }
    loader.append(spinner, copy);
    return loader;
  }

  function createLoaderViewer() {
    var viewer = document.createElement("span");
    viewer.className = "board-loader-viewer";

    if (state.viewer && state.viewer.login) {
      var avatar = document.createElement("img");
      avatar.alt = "";
      avatar.src = state.viewer.avatar_url || "";
      viewer.appendChild(avatar);
      viewer.appendChild(document.createTextNode("Using GitHub token as @" + state.viewer.login));
      return viewer;
    }

    viewer.textContent = "Checking GitHub token user...";
    return viewer;
  }

  function updateBoardScrollbar() {
    window.requestAnimationFrame(function () {
      var scrollWidth = els.board.scrollWidth;
      var clientWidth = els.board.clientWidth;
      els.boardScrollTopInner.style.width = scrollWidth + "px";
      els.boardScrollTop.hidden = scrollWidth <= clientWidth + 1;
      els.boardScrollTop.scrollLeft = els.board.scrollLeft;
    });
  }

  function createLane(lane, teamMatches) {
    var section = document.createElement("article");
    section.className = "lane";
    if (lane.type === "unassigned") {
      section.classList.add("is-unassigned");
    }
    if (lane.ageSummary.red > 0) {
      section.classList.add("has-aging");
    }

    var header = document.createElement("header");
    header.className = "lane-header";

    var person = document.createElement("div");
    person.className = "lane-person";
    person.appendChild(createAvatar(lane));

    var titleWrap = document.createElement("div");
    var title = document.createElement("span");
    title.className = "lane-title";
    title.textContent = lane.title;
    var subtitle = document.createElement("span");
    subtitle.className = "lane-subtitle";
    subtitle.textContent = lane.subtitle;
    titleWrap.append(title, subtitle);
    var breakdown = createLaneAgeBreakdown(lane.ageSummary);
    if (breakdown) {
      titleWrap.appendChild(breakdown);
    }
    person.appendChild(titleWrap);

    var stats = document.createElement("div");
    stats.className = "lane-stats";
    if (lane.oldestDays > 0) {
      var oldest = document.createElement("span");
      oldest.className = "lane-oldest";
      oldest.textContent = "oldest " + lane.oldestDays + "d";
      stats.appendChild(oldest);
    }
    var count = document.createElement("span");
    count.className = "lane-count";
    count.textContent = String(lane.count);
    stats.appendChild(count);

    header.append(person, stats);
    section.appendChild(header);

    var body = document.createElement("div");
    body.className = "lane-body";
    if (!lane.items.length) {
      var empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "Clear";
      body.appendChild(empty);
    } else {
      lane.items.forEach(function (pull) {
        body.appendChild(createPullCard(pull, teamMatches.get(pull.number) || []));
      });
    }
    section.appendChild(body);

    return section;
  }

  function createLaneAgeBreakdown(summary) {
    var entries = [
      { key: "red", label: ">14d", count: summary.red },
      { key: "yellow", label: "7-14d", count: summary.yellow },
      { key: "green", label: "<7d", count: summary.green },
      { key: "draft", label: "draft", count: summary.draft }
    ].filter(function (entry) {
      return entry.count > 0;
    });

    if (!entries.length) {
      return null;
    }

    var wrap = document.createElement("div");
    wrap.className = "lane-age-breakdown";
    entries.forEach(function (entry) {
      var chip = document.createElement("span");
      chip.className = "lane-age-chip lane-age-" + entry.key;
      chip.textContent = entry.count + " " + entry.label;
      wrap.appendChild(chip);
    });
    return wrap;
  }

  function createAvatar(lane) {
    if (lane.avatarUrl) {
      var image = document.createElement("img");
      image.className = "avatar";
      image.alt = "";
      image.loading = "lazy";
      image.src = lane.avatarUrl;
      return image;
    }

    var fallback = document.createElement("div");
    fallback.className = "avatar avatar-fallback";
    fallback.textContent = lane.type === "team" ? "T" : "!";
    return fallback;
  }

  function createPullCard(pull, teamMatches) {
    var card = document.createElement("a");
    card.className = "pr-card";
    card.href = pull.html_url;
    card.target = "_blank";
    card.rel = "noreferrer";

    var isStale = getPullStatus(pull) === "stale";
    if (pull.draft) {
      card.classList.add("is-draft");
    } else {
      card.classList.add("pr-age-" + getPullAgeLevel(pull));
      if (isStale) {
        card.classList.add("is-stale");
      }
    }

    var meta = document.createElement("div");
    meta.className = "pr-meta";
    var number = document.createElement("span");
    number.textContent = "#" + pull.number;
    var updated = document.createElement("span");
    updated.textContent = formatRelative(pull.updated_at);
    meta.append(number, updated);

    var title = document.createElement("div");
    title.className = "pr-title";
    title.textContent = pull.title;

    var tags = document.createElement("div");
    tags.className = "tag-row";
    if (pull.draft) {
      tags.appendChild(createTag("Draft", "tag-draft"));
    } else if (isStale) {
      tags.appendChild(createTag("Stale", "tag-stale"));
    }

    appendReviewStateTags(tags, pull);

    teamMatches.forEach(function (team) {
      tags.appendChild(createTag(team.slug, "tag-team"));
    });

    getLabels(pull).slice(0, 4).forEach(function (label) {
      tags.appendChild(createLabelTag(label));
    });

    var footer = document.createElement("div");
    footer.className = "pr-footer";
    var author = document.createElement("span");
    author.textContent = "by @" + (pull.user && pull.user.login ? pull.user.login : "unknown");
    var created = document.createElement("span");
    if (!pull.draft) {
      created.className = "age-chip age-" + getPullAgeLevel(pull);
    }
    created.textContent = "opened " + formatRelative(pull.created_at);
    footer.append(author, created);

    card.append(meta, title);
    if (tags.childElementCount) {
      card.appendChild(tags);
    }
    card.appendChild(footer);

    return card;
  }

  function createTag(text, className) {
    var tag = document.createElement("span");
    tag.className = "tag " + className;
    tag.textContent = text;
    return tag;
  }

  function appendReviewStateTags(tags, pull) {
    var reviewState = getPullReviewState(pull);
    if (reviewState.approvalCount > 0) {
      tags.appendChild(createTag(reviewState.approvalCount + " " + pluralize("approval", reviewState.approvalCount), reviewState.approvalCount >= 2 ? "tag-approval" : "tag-review"));
    }
    if (reviewState.changesRequestedCount > 0) {
      tags.appendChild(createTag("changes requested", "tag-changes"));
    } else if (reviewState.approvalCount === 0 && reviewState.hasReviewActivity) {
      tags.appendChild(createTag("review activity", "tag-review"));
    }
  }

  function createLabelTag(label) {
    var tag = createTag(label.name || "label", "");
    var color = String(label.color || "").replace(/[^a-fA-F0-9]/g, "").slice(0, 6);
    if (color.length === 6) {
      tag.style.borderColor = "rgba(" + hexToRgb(color).join(", ") + ", 0.34)";
      tag.style.backgroundColor = "rgba(" + hexToRgb(color).join(", ") + ", 0.12)";
    }
    return tag;
  }

  function hexToRgb(hex) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16)
    ];
  }

  function sortPulls(items, sortMode) {
    var mode = normalizeSortMode(sortMode);
    return items.slice().sort(function (a, b) {
      if (mode === "priority") {
        return compareByPriority(a, b);
      }
      if (mode === "oldest") {
        return compareDatesAsc(a.created_at, b.created_at) || compareNumbersDesc(a.number, b.number);
      }
      if (mode === "recently-updated") {
        return compareDatesDesc(a.updated_at, b.updated_at) || compareNumbersDesc(a.number, b.number);
      }
      return compareDatesDesc(a.created_at, b.created_at) || compareNumbersDesc(a.number, b.number);
    });
  }

  function compareByPriority(a, b) {
    if (Boolean(a.draft) !== Boolean(b.draft)) {
      return a.draft ? 1 : -1;
    }

    var ageDelta = getPullAgePriority(b) - getPullAgePriority(a);
    if (ageDelta) {
      return ageDelta;
    }

    return compareDatesAsc(a.created_at, b.created_at) || compareNumbersDesc(a.number, b.number);
  }

  function compareDatesAsc(a, b) {
    return new Date(a).getTime() - new Date(b).getTime();
  }

  function compareDatesDesc(a, b) {
    return new Date(b).getTime() - new Date(a).getTime();
  }

  function compareNumbersDesc(a, b) {
    return Number(b || 0) - Number(a || 0);
  }

  function filterPullsByStatus(pulls, status) {
    if (status === "all") {
      return pulls;
    }
    return pulls.filter(function (pull) {
      return getPullStatus(pull) === status;
    });
  }

  function filterPullsByAge(pulls, ageFilter) {
    if (ageFilter === "all") {
      return pulls;
    }
    return pulls.filter(function (pull) {
      return getPullAgeCategory(pull) === ageFilter;
    });
  }

  function filterPullsByReviewNeed(pulls, reviewNeed) {
    if (reviewNeed === "all") {
      return pulls;
    }
    return pulls.filter(function (pull) {
      if (reviewNeed === "needs-review") {
        return isPullNeedingReview(pull);
      }
      if (reviewNeed === "needs-my-attention") {
        return isPullNeedingMyAttention(pull);
      }
      if (reviewNeed === "enough-approvals") {
        return hasEnoughApprovals(pull);
      }
      if (reviewNeed === "has-review-activity") {
        return hasReviewActivity(pull);
      }
      return true;
    });
  }

  function filterPullsBySearch(pulls, query, pullTeamMatches) {
    var cleanQuery = normalizeBoardSearch(query);
    if (!cleanQuery) {
      return pulls;
    }
    var terms = cleanQuery.split(" ").filter(Boolean);
    return pulls.filter(function (pull) {
      var haystack = getPullSearchText(pull, pullTeamMatches.get(pull.number) || []);
      return terms.every(function (term) {
        return haystack.indexOf(term) >= 0;
      });
    });
  }

  function getPullSearchText(pull, teamMatches) {
    var parts = [
      String(pull.number || ""),
      "#" + String(pull.number || ""),
      pull.title || "",
      pull.body || "",
      pull.user && pull.user.login ? pull.user.login : "",
      pull.head && pull.head.ref ? pull.head.ref : "",
      pull.base && pull.base.ref ? pull.base.ref : ""
    ];

    getReviewers(pull).forEach(function (reviewer) {
      parts.push(reviewer.login || "");
    });
    teamMatches.forEach(function (team) {
      parts.push(team.slug || "", team.name || "", ORG_OWNER + "/" + (team.slug || ""));
    });
    getLabels(pull).forEach(function (label) {
      parts.push(label.name || "");
    });
    var reviewState = getPullReviewState(pull);
    if (reviewState.approvalCount > 0) {
      parts.push(String(reviewState.approvalCount) + " approvals");
    }
    if (reviewState.changesRequestedCount > 0) {
      parts.push("changes requested");
    }
    if (reviewState.hasReviewActivity) {
      parts.push("review activity");
    }
    if (reviewState.viewerParticipated) {
      parts.push("reviewed by me");
    }
    if (isPullNeedingMyAttention(pull)) {
      parts.push("needs my attention");
    }

    return parts.join(" ").toLowerCase();
  }

  function buildStatusCounts(pulls) {
    return pulls.reduce(function (counts, pull) {
      counts[getPullStatus(pull)] += 1;
      return counts;
    }, {
      ready: 0,
      draft: 0,
      stale: 0
    });
  }

  function buildReviewNeedCounts(pulls) {
    return pulls.reduce(function (counts, pull) {
      if (isPullNeedingReview(pull)) {
        counts.needsReview += 1;
      }
      if (isPullNeedingMyAttention(pull)) {
        counts.needsMyAttention += 1;
      }
      if (hasEnoughApprovals(pull)) {
        counts.enoughApprovals += 1;
      }
      if (hasReviewActivity(pull)) {
        counts.hasReviewActivity += 1;
      }
      return counts;
    }, {
      needsReview: 0,
      needsMyAttention: 0,
      enoughApprovals: 0,
      hasReviewActivity: 0
    });
  }

  function buildAgeSummary(pulls) {
    return pulls.reduce(function (summary, pull) {
      summary[getPullAgeCategory(pull)] += 1;
      return summary;
    }, {
      green: 0,
      yellow: 0,
      red: 0,
      draft: 0
    });
  }

  function getOldestPullAgeDays(pulls) {
    var oldest = pulls.reduce(function (max, pull) {
      if (pull.draft) {
        return max;
      }
      return Math.max(max, Date.now() - new Date(pull.created_at).getTime());
    }, 0);
    return oldest ? Math.max(1, Math.round(oldest / (24 * 60 * 60 * 1000))) : 0;
  }

  function getPullStatus(pull) {
    if (pull.draft) {
      return "draft";
    }
    if (new Date(pull.updated_at).getTime() < Date.now() - STALE_AFTER_MS) {
      return "stale";
    }
    return "ready";
  }

  function getPullAgeLevel(pull) {
    var age = Date.now() - new Date(pull.created_at).getTime();
    if (age >= TWO_WEEKS_MS) {
      return "red";
    }
    if (age >= WEEK_MS) {
      return "yellow";
    }
    return "green";
  }

  function getPullAgeCategory(pull) {
    return pull.draft ? "draft" : getPullAgeLevel(pull);
  }

  function isAgingPull(pull) {
    return !pull.draft && getPullAgeLevel(pull) === "red";
  }

  function getPullReviewState(pull) {
    return pull.review_state || {
      approvalCount: 0,
      changesRequestedCount: 0,
      reviewCount: 0,
      issueCommentCount: 0,
      reviewCommentCount: 0,
      hasReviewActivity: false,
      viewerParticipated: false,
      viewerReviewState: ""
    };
  }

  function hasEnoughApprovals(pull) {
    return getPullReviewState(pull).approvalCount >= 2;
  }

  function hasReviewActivity(pull) {
    return getPullReviewState(pull).hasReviewActivity;
  }

  function isPullNeedingReview(pull) {
    return !pull.draft && !hasEnoughApprovals(pull);
  }

  function isPullNeedingMyAttention(pull) {
    return isPullNeedingReview(pull) && Boolean(getViewerLogin()) && !isViewerAuthor(pull) && hasActiveReviewRequest(pull) && !getPullReviewState(pull).viewerParticipated;
  }

  function getViewerLogin() {
    return state.viewer && state.viewer.login ? state.viewer.login.toLowerCase() : "";
  }

  function hasActiveReviewRequest(pull) {
    return getReviewers(pull).length > 0 || getRequestedTeams(pull).length > 0;
  }

  function isViewerAuthor(pull) {
    var viewerLogin = getViewerLogin();
    return Boolean(viewerLogin) && pull.user && String(pull.user.login || "").toLowerCase() === viewerLogin;
  }

  function pluralize(word, count) {
    return count === 1 ? word : word + "s";
  }

  function triggerMooEasterEgg() {
    playMooSound();
    explodeCowIcons();
  }

  function playMooSound() {
    if (!els.mooSound) {
      return;
    }

    try {
      els.mooSound.pause();
      els.mooSound.currentTime = 0;
      var playPromise = els.mooSound.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(function () {});
      }
    } catch (_error) {
      return;
    }
  }

  function explodeCowIcons() {
    var rect = els.brandMooButton.getBoundingClientRect();
    var originX = rect.left + rect.width / 2;
    var originY = rect.top + rect.height / 2;
    var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var count = reducedMotion ? 12 : 42;
    var viewportWidth = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
    var viewportHeight = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);

    for (var index = 0; index < count; index += 1) {
      var particle = document.createElement("span");
      var targetX = randomBetween(18, Math.max(18, viewportWidth - 18));
      var targetY = randomBetween(18, Math.max(18, viewportHeight - 18));
      var duration = reducedMotion ? 700 : randomBetween(950, 1650);
      var delay = reducedMotion ? 0 : randomBetween(0, 130);

      particle.className = "cow-particle";
      particle.setAttribute("aria-hidden", "true");
      particle.textContent = index % 8 === 0 ? "🐄" : "🐮";
      particle.style.left = originX + "px";
      particle.style.top = originY + "px";
      particle.style.setProperty("--tx", targetX - originX + "px");
      particle.style.setProperty("--ty", targetY - originY + "px");
      particle.style.setProperty("--rot", randomBetween(-540, 540) + "deg");
      particle.style.setProperty("--scale", randomBetween(0.78, 1.42).toFixed(2));
      particle.style.setProperty("--size", randomBetween(20, 42) + "px");
      particle.style.setProperty("--duration", duration + "ms");
      particle.style.setProperty("--delay", delay + "ms");

      document.body.appendChild(particle);
      removeElementAfter(particle, duration + delay + 120);
    }
  }

  function randomBetween(min, max) {
    return Math.random() * (max - min) + min;
  }

  function removeElementAfter(element, delay) {
    window.setTimeout(function () {
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
    }, delay);
  }

  function getPullAgePriority(pull) {
    if (pull.draft) {
      return 0;
    }
    var level = getPullAgeLevel(pull);
    if (level === "red") {
      return 3;
    }
    if (level === "yellow") {
      return 2;
    }
    return 1;
  }

  function getReviewers(pull) {
    return Array.isArray(pull.requested_reviewers) ? pull.requested_reviewers : [];
  }

  function getLabels(pull) {
    return Array.isArray(pull.labels) ? pull.labels : [];
  }

  function getRequestedTeams(pull) {
    return Array.isArray(pull.requested_teams) ? pull.requested_teams : [];
  }

  function setStatus(text, mode) {
    els.statusPill.textContent = text;
    els.statusPill.classList.toggle("is-loading", mode === "loading");
    els.statusPill.classList.toggle("is-error", mode === "error");
    if (mode !== "ok") {
      els.statusPill.title = "";
    }
  }

  function setMessage(text, showSettingsAction) {
    els.message.replaceChildren();
    els.message.hidden = !text;
    if (!text) {
      return;
    }

    var copy = document.createElement("span");
    copy.textContent = text;
    els.message.appendChild(copy);

    if (showSettingsAction) {
      var button = document.createElement("button");
      button.className = "message-action";
      button.type = "button";
      button.textContent = "Open Settings";
      button.addEventListener("click", function (event) {
        event.stopPropagation();
        openSettings();
      });
      els.message.appendChild(button);
    }
  }

  function shouldShowSettingsAction(message) {
    return /rate limit|token/i.test(message);
  }

  function openSettings() {
    els.settingsMenu.open = true;
    window.setTimeout(function () {
      els.tokenInput.focus();
    }, 0);
  }

  function formatClock(date) {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function formatFullDateTime(date) {
    return date.toLocaleString([], {
      dateStyle: "medium",
      timeStyle: "medium"
    });
  }

  function formatRelative(value) {
    var timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) {
      return "";
    }

    var diff = Date.now() - timestamp;
    if (diff < 0) {
      return "now";
    }
    var minute = 60 * 1000;
    var hour = 60 * minute;
    var day = 24 * hour;

    if (diff < hour) {
      return Math.max(1, Math.round(diff / minute)) + "m ago";
    }
    if (diff < day) {
      return Math.round(diff / hour) + "h ago";
    }
    return Math.round(diff / day) + "d ago";
  }
}());
