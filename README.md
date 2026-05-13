# CoW Triage

A small static dashboard for current review workload on `cowprotocol` repositories. It defaults to `cowprotocol/cowswap`.

Open `index.html` in a browser. The app fetches open PRs from the GitHub REST API and groups them by requested reviewers. An optional GitHub token is kept in `sessionStorage` for the current browser session.

Use the controls at the top to set:

- `Repository`: defaults to `cowswap`; the dropdown is loaded from `cowprotocol`
- `Settings > GitHub token`: optional, useful for private access or higher API limits

Use the `Review target` dropdown above the board to filter cards to one person, one requested team, or PRs with no requested reviewer. Use `Status` to narrow cards to ready, draft, or stale PRs.

The dashboard refreshes every 15 minutes and can be refreshed manually.
