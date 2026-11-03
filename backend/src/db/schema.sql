-- Lifecycle state that Nextcloud does not provide natively.
-- See docs/related-work.md — confirmed gap, nextcloud/server #61398.

-- Required for gen_random_uuid() used below; must run before the tables.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS guests (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nextcloud_user_id TEXT NOT NULL UNIQUE,  -- the hashed guest ID from Nextcloud's OCS API
    email             TEXT NOT NULL,
    display_name      TEXT,
    owner             TEXT NOT NULL,          -- internal user responsible for this guest
    purpose           TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at        TIMESTAMPTZ,
    status            TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'review', 'renewed', 'revoked', 'disabled', 'expired')),
    last_reviewed_at  TIMESTAMPTZ,
    last_known_login  TIMESTAMPTZ             -- cached from Nextcloud's lastLogin field, refreshed by jobs/
);

CREATE TABLE IF NOT EXISTS lifecycle_history (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_id      UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
    action        TEXT NOT NULL,   -- e.g. 'created', 'reviewed', 'renewed', 'revoked', 'disabled'
    performed_by  TEXT NOT NULL,
    reason        TEXT,
    occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guests_status ON guests(status);
CREATE INDEX IF NOT EXISTS idx_guests_expires_at ON guests(expires_at);
CREATE INDEX IF NOT EXISTS idx_lifecycle_history_guest_id ON lifecycle_history(guest_id);
