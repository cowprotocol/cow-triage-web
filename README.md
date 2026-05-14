# 🐮 CoW Triage

[![Live app](https://img.shields.io/badge/live-cow--triage--web.vercel.app-225ad6?style=flat-square)](https://cow-triage-web.vercel.app/)
[![GitHub API](https://img.shields.io/badge/data-GitHub%20REST%20API-162033?style=flat-square)](https://docs.github.com/en/rest)
[![Static app](https://img.shields.io/badge/app-static%20HTML%2FCSS%2FJS-12805c?style=flat-square)](./index.html)

> A compact review workload board for CoW Protocol PRs. See who is currently requested for review, which team queues are aging, and which PRs still need a reviewer.

**Open it:** https://cow-triage-web.vercel.app/

<img width="3323" height="1314" alt="Screenshot_20260513_153047" src="https://github.com/user-attachments/assets/a0f26461-9472-4369-b7f3-958dde699d5f" />

## ✨ What It Does

- 🧑‍💻 Groups open PRs by requested reviewer, requested GitHub team, or no reviewer requested.
- 🚦 Highlights PR age: green `<7d`, yellow `7-14d`, red `>14d`.
- 🔥 Surfaces aging reviews, oldest PRs per lane, and no-reviewer PRs.
- 🧭 Defaults to `cowprotocol/cowswap`, with searchable repo switching.
- 🔎 Filters by age, reviewer/team, status, and sort mode.
- 🔗 Keeps filters in the URL so views are easy to share.
- 💤 Hides draft PRs by default, including from counts and metrics.
- 🔁 Auto-refreshes on a configurable interval.

## 🎯 Why It Exists

CoW Triage shows **current requested-review load**, not historical reviewer output. It helps answer:

- Who currently has the most requested reviews?
- Which queue has the oldest waiting PR?
- Which PRs have no reviewer requested?
- Which team review requests are aging?

## 🕹️ How To Use

1. Pick a repo from the searchable repo selector.
2. Use the age, reviewer/team, status, and sort filters to narrow the board.
3. Click **Aging reviews** to jump to PRs open for more than 14 days.
4. Click **No reviewer requested** to focus unassigned PRs.
5. Use **Clear filters** to reset target/status/age while keeping the selected repo.
6. Open **Settings** to change card gradients, draft visibility, auto-refresh, or GitHub token.

## 🔐 GitHub Token Safety

A token is optional for public PRs, but useful to avoid rate limits and required to see org team review requests and private repos reliably.

Without a token, CoW Triage only sees public GitHub data. With a token, it can only show private repositories your GitHub account is already allowed to access.

Use a **fine-grained token** for `cowprotocol` with only:

- `Metadata: read`
- `Pull requests: read`

Avoid classic tokens. Do **not** grant write, admin, workflow, code, or organization-management permissions. The token is stored only in this browser session and is sent only to GitHub.

## 🔗 Shareable Views

Filters are reflected in the URL:

```text
?repo=cowswap&target=team:frontend&status=ready&age=red&sort=priority&drafts=hide
```

Supported params:

- `repo=cowswap`
- `target=all | user:<handle> | team:<slug> | unassigned`
- `status=all | ready | stale | draft`
- `age=all | green | yellow | red | draft`
- `sort=priority | oldest | recently-updated | newest`
- `drafts=hide | show`

GitHub tokens are never written to the URL.

## 🧱 Local Dev

No build step required:

```text
open index.html
```

The app is plain HTML, CSS, and JavaScript using the GitHub REST API.
