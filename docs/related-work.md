# Related Work & Novelty

Guest/external access exists in Nextcloud, Microsoft Teams, Google Workspace, and similar platforms. This project focuses on a specific gap in Nextcloud: the Guests app and standard OCS user API provide guest accounts, sharing, authentication and login data, but not an external owner, guest-level expiry policy, review decision workflow or lifecycle history.

This is not a claim that other platforms lack governance. Microsoft Entra supports [recurring guest access reviews](https://learn.microsoft.com/en-us/entra/id-governance/manage-guest-access-with-access-reviews) for Microsoft 365 groups and applications, and [entitlement management](https://learn.microsoft.com/en-us/entra/architecture/6-secure-access-entitlement-managment) supports time-limited access with expiration. Those capabilities provide useful comparison points; this project adds a similar governance layer for the Nextcloud data and workflow that the project owns.

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
