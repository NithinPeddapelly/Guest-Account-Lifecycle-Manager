Nextcloud Guest Lifecycle Manager

A small project exploring how external guest access in Nextcloud can be managed more effectively.

Nextcloud already lets users share files and collaborate with external users. But what happens when a guest no longer needs access? Who is responsible for reviewing that access? Should it expire automatically, or should someone approve an extension?

These are the problems we're exploring with this project.

The idea is to build a separate governance layer around Nextcloud guest access, with features for tracking ownership, setting expiry dates, reviewing inactive guests, renewing access and revoking permissions when they're no longer needed.

What we're building

The current plan is to develop a dashboard where guest access can be viewed and managed from one place.

Some of the things we're working towards:

- Viewing guest accounts and their access information.
- Recording who is responsible for each guest.
- Setting expiry dates for guest access.
- Identifying inactive guests who may need an access review.
- Supporting access renewal and revocation.
- Keeping a history of lifecycle management actions.

The focus is on making guest access easier to review and manage, rather than replacing the functionality Nextcloud already provides.

How we're approaching it

We're using Nextcloud's OCS API to retrieve guest and login information. PostgreSQL will store the additional information needed for lifecycle management, while an Express backend will handle the application logic.

The dashboard is being developed separately from the backend.

Current stack:

- Node.js 20 and Express
- PostgreSQL 16
- Nextcloud OCS API
- React (Vite) — frontend starts after the backend core works
- Docker Compose
- Hourly in-process scheduler (built-in `setInterval`)

## Local setup

1. Copy the root `.env.example` to `.env`.
2. Copy `backend/.env.example` to `backend/.env`.
3. Replace the placeholder `ADMIN_TOKEN` in `backend/.env` with a unique, long random token.
4. Set `NEXTCLOUD_ADMIN_USER` to the actual Nextcloud admin username and set `NEXTCLOUD_APP_PASSWORD` to that user's app password.
5. For `NEXTCLOUD_BASE_URL`, `http://nextcloud` is intended only for the internal Compose network and sends the app password unencrypted there. Use HTTPS for all other deployments; the HTTP exception is based on the hostname `nextcloud`, not the network.
6. Set `APP_DB_HOST=app-db` in the root `.env` for Compose. Keep `APP_DB_HOST=localhost` in `backend/.env` for direct runs outside Docker; the other database values do not need to be identical across both files.
7. Start the stack with `docker compose up -d`.

The environment files are local secrets and must not be committed.

Where things stand

We've already spent time testing the Nextcloud API locally to understand what information is available before building the main features.

One useful finding so far is that login timestamps can be retrieved and checked against actual login events. This gives us a starting point for inactivity-based access reviews.

We're now moving from feasibility testing towards building out the application and connecting the different parts.

This README will evolve as the project develops.




Project structure

nextcloud-guest-lifecycle-manager/
├── backend/
├── frontend/
├── docs/
├── docker-compose.yml
└── .gitignore
