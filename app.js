(function () {
  "use strict";

  var CONFIG_KEY = "cow-web-dashboard-config-v1";
  var TOKEN_KEY = "cow-web-dashboard-token-v1";
  var FIRST_RUN_NOTICE_KEY = "cow-web-dashboard-first-run-notice-dismissed-v1";
  var ORG_OWNER = "cowprotocol";
  var REFRESH_INTERVAL_MINUTES = 15;
  var REFRESH_INTERVAL_MS = REFRESH_INTERVAL_MINUTES * 60 * 1000;
  var WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  var TWO_WEEKS_MS = 2 * WEEK_MS;
  var STALE_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

  var defaults = {
    repo: "cowswap",
    reviewerFilter: "all",
    statusFilter: "all",
    sortMode: "priority",
    hideDrafts: true
  };

  var state = {
    config: loadConfig(),
    repos: [],
    reposLoading: false,
    reposError: "",
    repoRequestId: 0,
    pulls: [],
    loading: false,
    lastUpdated: null,
    dashboardRequestId: 0
  };

  var els = {
    board: document.getElementById("board"),
    boardScrollTop: document.getElementById("boardScrollTop"),
    boardScrollTopInner: document.getElementById("boardScrollTopInner"),
    boardMeta: document.getElementById("boardMeta"),
    firstRunNotice: document.getElementById("firstRunNotice"),
    noticeSettingsButton: document.getElementById("noticeSettingsButton"),
    noticeDismissButton: document.getElementById("noticeDismissButton"),
    message: document.getElementById("message"),
    repoSelect: document.getElementById("repoSelect"),
    repoPickerHint: document.getElementById("repoPickerHint"),
    reviewerFilterSelect: document.getElementById("reviewerFilterSelect"),
    statusFilterSelect: document.getElementById("statusFilterSelect"),
    sortSelect: document.getElementById("sortSelect"),
    settingsMenu: document.getElementById("settingsMenu"),
    settingsCloseButton: document.getElementById("settingsCloseButton"),
    hideDraftsInput: document.getElementById("hideDraftsInput"),
    tokenInput: document.getElementById("tokenInput"),
    tokenVisibilityButton: document.getElementById("tokenVisibilityButton"),
    tokenSaveButton: document.getElementById("tokenSaveButton"),
    refreshButton: document.getElementById("refreshButton"),
    statusPill: document.getElementById("statusPill"),
    openPrCount: document.getElementById("openPrCount"),
    assignmentCount: document.getElementById("assignmentCount"),
    activeReviewerCount: document.getElementById("activeReviewerCount"),
    unassignedMetric: document.getElementById("unassignedMetric"),
    unassignedBadge: document.getElementById("unassignedBadge"),
    unassignedCount: document.getElementById("unassignedCount")
  };

  hydrateForm();
  bindEvents();
  bindBoardScroll();
  renderFirstRunNotice();
  renderRepoOptions();
  render();
  refreshRepositories();
  refreshDashboard();
  window.setInterval(refreshDashboard, REFRESH_INTERVAL_MS);

  function bindEvents() {
    els.refreshButton.addEventListener("click", function () {
      state.config = readForm();
      saveConfig(state.config);
      saveToken(els.tokenInput.value);
      updateTokenSaveState();
      refreshRepositories();
      refreshDashboard();
    });

    els.repoSelect.addEventListener("change", function () {
      state.config = readForm();
      state.config.reviewerFilter = "all";
      state.pulls = [];
      state.lastUpdated = null;
      saveConfig(state.config);
      render();
      refreshDashboard();
    });

    els.reviewerFilterSelect.addEventListener("change", function () {
      state.config.reviewerFilter = els.reviewerFilterSelect.value;
      saveConfig(state.config);
      render();
    });

    els.statusFilterSelect.addEventListener("change", function () {
      state.config.statusFilter = els.statusFilterSelect.value;
      saveConfig(state.config);
      render();
    });

    els.sortSelect.addEventListener("change", function () {
      state.config.sortMode = normalizeSortMode(els.sortSelect.value);
      saveConfig(state.config);
      render();
    });

    els.hideDraftsInput.addEventListener("change", function () {
      state.config.hideDrafts = els.hideDraftsInput.checked;
      if (state.config.hideDrafts && state.config.statusFilter === "draft") {
        state.config.statusFilter = "all";
      }
      saveConfig(state.config);
      render();
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

    els.noticeSettingsButton.addEventListener("click", function () {
      openSettings();
    });

    els.noticeDismissButton.addEventListener("click", function () {
      writeStorage(window.localStorage, FIRST_RUN_NOTICE_KEY, "1");
      renderFirstRunNotice();
    });
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
      return {
        repo: cleanRepoPart(config.repo || defaults.repo) || defaults.repo,
        reviewerFilter: normalizeFilterValue(config.reviewerFilter),
        statusFilter: normalizeStatusFilter(config.statusFilter),
        sortMode: normalizeSortMode(config.sortMode),
        hideDrafts: config.hideDrafts !== false
      };
    } catch (_error) {
      return Object.assign({}, defaults);
    }
  }

  function saveConfig(config) {
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
    els.hideDraftsInput.checked = state.config.hideDrafts;
    updateTokenSaveState();
  }

  function updateTokenSaveState() {
    var isDirty = els.tokenInput.value.trim() !== loadToken();
    els.tokenSaveButton.disabled = !isDirty;
    els.tokenSaveButton.textContent = isDirty ? "Save" : "Saved";
  }

  function readForm() {
    return {
      repo: cleanRepoPart(els.repoSelect.value) || defaults.repo,
      reviewerFilter: normalizeFilterValue(els.reviewerFilterSelect.value || state.config.reviewerFilter),
      statusFilter: normalizeStatusFilter(els.statusFilterSelect.value || state.config.statusFilter),
      sortMode: normalizeSortMode(els.sortSelect.value || state.config.sortMode),
      hideDrafts: els.hideDraftsInput.checked
    };
  }

  function cleanRepoPart(value) {
    return String(value || "").trim().replace(/^\/+|\/+$/g, "");
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

  function normalizeSortMode(value) {
    var key = String(value || "priority").trim().toLowerCase();
    return ["priority", "oldest", "recently-updated", "newest"].indexOf(key) >= 0 ? key : "priority";
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

    try {
      var pulls = await fetchOpenPulls(config, loadToken());
      if (requestId !== state.dashboardRequestId) {
        return;
      }
      state.pulls = pulls;
      state.lastUpdated = new Date();
      render();
      setStatus("Updated " + formatClock(state.lastUpdated), "ok");
    } catch (error) {
      if (requestId !== state.dashboardRequestId) {
        return;
      }
      var message = error.message || "GitHub request failed.";
      setMessage(message, shouldShowSettingsAction(message));
      setStatus("Error", "error");
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

  async function fetchOpenPulls(config, token) {
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

    return pulls;
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
    renderRepoOptions();
    renderReviewerFilterOptions(model);
    renderStatusFilterOptions(model);
    renderSortOptions(model);
    renderMetrics(model);
    renderBoard(model);

    if (state.lastUpdated) {
      els.boardMeta.textContent = formatBoardMeta(model);
    } else {
      els.boardMeta.textContent = "Waiting for GitHub";
    }
  }

  function formatBoardMeta(model) {
    var text = state.pulls.length + " open PRs fetched at " + formatClock(state.lastUpdated) + "; auto-refresh every " + REFRESH_INTERVAL_MINUTES + "m";
    if (model.selectedFilter !== "all") {
      text += "; filtered to " + getFilterLabel(model.selectedFilter, model);
    }
    if (model.selectedStatus !== "all") {
      text += "; " + model.selectedStatus;
    }
    if (model.hideDrafts && model.hiddenDraftCount) {
      text += "; " + model.hiddenDraftCount + " drafts hidden";
    }
    return text;
  }

  function renderRepoOptions() {
    var selected = cleanRepoPart(state.config.repo) || defaults.repo;
    var seen = new Set();
    var fragment = document.createDocumentFragment();

    addRepoOption({
      name: selected,
      current: true
    });

    state.repos.forEach(function (repo) {
      addRepoOption(repo);
    });

    els.repoSelect.replaceChildren(fragment);
    els.repoSelect.value = selected;

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

    function addRepoOption(repo) {
      var name = cleanRepoPart(repo.name || "");
      var key = name.toLowerCase();
      if (!name || seen.has(key)) {
        return;
      }
      seen.add(key);

      var option = document.createElement("option");
      option.value = name;
      option.textContent = formatRepoOption(repo);
      fragment.appendChild(option);
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
    var selectedSort = normalizeSortMode(config.sortMode);
    var modelPulls = hideDrafts ? pulls.filter(function (pull) {
      return !pull.draft;
    }) : pulls;
    if (hideDrafts && selectedStatus === "draft") {
      selectedStatus = "all";
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
    var visiblePulls = filterPullsByStatus(modelPulls, selectedStatus);
    var visibleNoTeamReviewer = filterPullsByStatus(noTeamReviewer, selectedStatus);
    var lanes = buildLanesForFilter(selectedFilter, visiblePulls, reviewerOptions, reviewerByLogin, teamOptions, pullTeamMatches, visibleNoTeamReviewer, selectedSort);

    var assignmentCount = modelPulls.reduce(function (total, pull) {
      return total + getReviewers(pull).length + pullTeamMatches.get(pull.number).length;
    }, 0);

    return {
      lanes: lanes,
      reviewerOptions: reviewerOptions,
      reviewerCounts: reviewerCounts,
      teamOptions: teamOptions,
      teamCounts: teamCounts,
      selectedFilter: selectedFilter,
      selectedStatus: selectedStatus,
      selectedSort: selectedSort,
      hideDrafts: hideDrafts,
      hiddenDraftCount: pulls.length - modelPulls.length,
      statusCounts: buildStatusCounts(modelPulls),
      openPrCount: modelPulls.length,
      assignmentCount: assignmentCount,
      activeReviewerCount: reviewerOptions.length,
      unassignedCount: noTeamReviewer.length,
      teamMatches: pullTeamMatches
    };
  }

  function buildLanesForFilter(selectedFilter, pulls, reviewerOptions, reviewerByLogin, teamOptions, pullTeamMatches, noTeamReviewer, sortMode) {
    if (selectedFilter === "all") {
      var lanes = reviewerOptions.map(function (reviewer) {
        return createPersonLane(reviewer.login.toLowerCase(), pulls, reviewerByLogin, sortMode);
      });

      lanes.sort(sortLanesByCount);

      var teamItems = pulls.filter(function (pull) {
        return pullTeamMatches.get(pull.number).length > 0;
      });

      if (teamItems.length) {
        lanes.push({
          type: "team",
          title: "Team requests",
          subtitle: "requested teams",
          avatarUrl: "",
          count: teamItems.length,
          items: sortPulls(teamItems, sortMode)
        });
      }

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

    return {
      type: "person",
      title: reviewer ? reviewer.login : handle,
      subtitle: reviewer ? "@" + reviewer.login : "@" + handle,
      avatarUrl: reviewer ? reviewer.avatar_url : "",
      count: items.length,
      items: sortPulls(items, sortMode)
    };
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

    return {
      type: "team",
      title: team && team.name ? team.name : slug,
      subtitle: "@" + ORG_OWNER + "/" + (team && team.slug ? team.slug : slug),
      avatarUrl: "",
      count: items.length,
      items: sortPulls(items, sortMode)
    };
  }

  function createUnassignedLane(items, sortMode) {
    return {
      type: "unassigned",
      title: "No reviewer requested",
      subtitle: "needs assignment",
      avatarUrl: "",
      count: items.length,
      items: sortPulls(items, sortMode)
    };
  }

  function sortLanesByCount(a, b) {
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
      return "No reviewer requested";
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
    var fragment = document.createDocumentFragment();
    var allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "All open PRs (" + model.openPrCount + ")";
    fragment.appendChild(allOption);

    if (model.reviewerOptions.length) {
      var peopleGroup = document.createElement("optgroup");
      peopleGroup.label = "People";
      model.reviewerOptions.forEach(function (reviewer) {
        var key = reviewer.login.toLowerCase();
        var option = document.createElement("option");
        option.value = "user:" + key;
        option.textContent = "@" + reviewer.login + " (" + (model.reviewerCounts.get(key) || 0) + ")";
        peopleGroup.appendChild(option);
      });
      fragment.appendChild(peopleGroup);
    }

    if (model.teamOptions.length) {
      var teamsGroup = document.createElement("optgroup");
      teamsGroup.label = "Teams";
      model.teamOptions.forEach(function (team) {
        var key = String(team.slug || "").toLowerCase();
        var option = document.createElement("option");
        option.value = "team:" + key;
        option.textContent = "@" + ORG_OWNER + "/" + team.slug + " (" + (model.teamCounts.get(key) || 0) + ")";
        teamsGroup.appendChild(option);
      });
      fragment.appendChild(teamsGroup);
    }

    if (model.unassignedCount > 0) {
      var option = document.createElement("option");
      option.value = "unassigned";
      option.textContent = "No reviewer requested (" + model.unassignedCount + ")";
      fragment.appendChild(option);
    }

    els.reviewerFilterSelect.replaceChildren(fragment);
    els.reviewerFilterSelect.value = model.selectedFilter;
    els.reviewerFilterSelect.disabled = !model.openPrCount;
  }

  function renderStatusFilterOptions(model) {
    setStatusOptionText("all", "All statuses (" + model.openPrCount + ")");
    setStatusOptionText("ready", "Ready (" + model.statusCounts.ready + ")");
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

  function renderSortOptions(model) {
    els.sortSelect.value = model.selectedSort;
    els.sortSelect.disabled = !model.openPrCount;
    els.hideDraftsInput.checked = model.hideDrafts;
  }

  function renderMetrics(model) {
    els.openPrCount.textContent = String(model.openPrCount);
    els.assignmentCount.textContent = String(model.assignmentCount);
    els.activeReviewerCount.textContent = String(model.activeReviewerCount);
    els.unassignedCount.textContent = String(model.unassignedCount);
    els.unassignedMetric.classList.toggle("is-attention", model.unassignedCount > 0);
    els.unassignedBadge.textContent = model.unassignedCount > 0 ? "Needs reviewer" : "Clear";
  }

  function renderBoard(model) {
    els.board.replaceChildren();

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
    person.appendChild(titleWrap);

    var count = document.createElement("span");
    count.className = "lane-count";
    count.textContent = String(lane.count);

    header.append(person, count);
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
    } else if (isStale) {
      card.classList.add("is-stale");
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
      button.addEventListener("click", openSettings);
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
