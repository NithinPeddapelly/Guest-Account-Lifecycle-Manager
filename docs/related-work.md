# Related Work & Novelty

Guest/external access exists in Nextcloud, Microsoft Teams, Google Workspace, and similar platforms. None of them govern it — none track ownership, enforce review, or audit the full lifecycle of that access.

This gap is confirmed, not assumed. See [nextcloud/server#61398](https://github.com/nextcloud/server/issues/61398) — "Add lifecycle controls for guest users (owner, expiration, renewal workflow)." Status at time of writing: open, labeled "0. Needs triage," no milestone, 7 community reactions. It was opened by a community member (`kaffeeringe`) and triaged/labeled by a Nextcloud contributor (`nfebe`) — it is a community-raised, maintainer-acknowledged gap, not a confirmed roadmap item.

## What Nextcloud already provides

- Guest account creation (via the Guests app)
- File sharing & permissions
- Authentication & login
- Login timestamps — `lastLogin`, `lastLoginTimestamp`, `firstLoginTimestamp` on the standard OCS user endpoint, confirmed via direct API testing (see `setup-log.md`)

## What this project adds

- Ownership — who is responsible for each guest's access
- Expiration & lifecycle status
- Inactivity-based review triggers (using Nextcloud's login timestamps as the signal)
- Renewal & revocation workflow
- Full auditable history

## Framing

Nextcloud has no native lifecycle governance for guest accounts. This system provides that as an external governance layer, sourcing guest identity, share data, and login activity from Nextcloud's API while managing lifecycle state (ownership, expiration, review status, history) independently in its own database.
