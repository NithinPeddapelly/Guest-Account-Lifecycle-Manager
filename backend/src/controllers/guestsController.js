const { pool } = require("../config/db");
const nextcloud = require("../services/nextcloud");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isValidDate(value) {
  return typeof value === "string" && value.trim() !== "" && !Number.isNaN(Date.parse(value));
}

/**
 * GET /api/guests
 * Combines our own lifecycle state with live data from Nextcloud
 * (display name, email, lastLogin) for every tracked guest.
 */
async function listGuests(req, res) {
  try {
    const { rows } = await pool.query("SELECT * FROM guests ORDER BY created_at DESC");

    const enriched = await Promise.all(
      rows.map(async (guest) => {
        try {
          const live = await nextcloud.getUser(guest.nextcloud_user_id);
          return {
            ...guest,
            live_last_login: live?.lastLogin ? new Date(Number(live.lastLogin)) : null,
            live_email: live?.email,
            live_display_name: live?.displayname,
          };
        } catch (err) {
          // Guest may have been deleted in Nextcloud directly — surface the
          // DB record anyway, flagged, rather than dropping it silently.
          return { ...guest, nextcloud_lookup_failed: true };
        }
      })
    );

    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list guests" });
  }
}

/**
 * POST /api/guests
 * Registers lifecycle tracking for a guest that already exists in Nextcloud.
 * This does NOT create the Nextcloud guest account itself — that still
 * happens via the Share dialog in Nextcloud, as confirmed in setup-log.md.
 */
async function registerGuest(req, res) {
  const { nextcloud_user_id, email, display_name, owner, purpose, expires_at } = req.body;

  if (!nextcloud_user_id || !email || !owner) {
    return res.status(400).json({ error: "nextcloud_user_id, email, and owner are required" });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const { rows } = await client.query(
      `INSERT INTO guests (nextcloud_user_id, email, display_name, owner, purpose, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [nextcloud_user_id, email, display_name || null, owner, purpose || null, expires_at || null]
    );

    await client.query(
      `INSERT INTO lifecycle_history (guest_id, action, performed_by, reason)
       VALUES ($1, 'created', $2, $3)`,
      [rows[0].id, req.adminUser, purpose || null]
    );

    await client.query("COMMIT");
    res.status(201).json(rows[0]);
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    if (err.code === "23505") {
      return res.status(409).json({ error: "Guest already registered" });
    }
    console.error(err);
    res.status(500).json({ error: "Failed to register guest" });
  } finally {
    client?.release();
  }
}

/**
 * PATCH /api/guests/:id/review
 * Records a review decision: renew, revoke, or keep as-is.
 */
async function reviewGuest(req, res) {
  const { id } = req.params;
  const { decision, reason, new_expires_at } = req.body;

  if (!isValidUuid(id)) {
    return res.status(400).json({ error: "id must be a valid UUID" });
  }

  const validDecisions = { renew: "active", revoke: "revoked", keep: "active" };
  if (!validDecisions[decision]) {
    return res.status(400).json({ error: "decision must be one of: renew, revoke, keep" });
  }

  if (decision === "renew" && !isValidDate(new_expires_at)) {
    return res.status(400).json({ error: "new_expires_at must be a valid date" });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const { rows } = await client.query(
      `UPDATE guests
       SET status = $1,
           expires_at = COALESCE($2, expires_at),
           last_reviewed_at = now()
       WHERE id = $3
       RETURNING *`,
      [validDecisions[decision], decision === "renew" ? new_expires_at : null, id]
    );

    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Guest not found" });
    }

    await client.query(
      `INSERT INTO lifecycle_history (guest_id, action, performed_by, reason)
       VALUES ($1, $2, $3, $4)`,
      [id, decision, req.adminUser, reason || null]
    );

    await client.query("COMMIT");
    res.json(rows[0]);
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "Failed to review guest" });
  } finally {
    client?.release();
  }
}

/**
 * GET /api/guests/:id/history
 */
async function getGuestHistory(req, res) {
  const { id } = req.params;
  if (!isValidUuid(id)) {
    return res.status(400).json({ error: "id must be a valid UUID" });
  }

  try {
    const { rows } = await pool.query(
      "SELECT * FROM lifecycle_history WHERE guest_id = $1 ORDER BY occurred_at DESC",
      [id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch guest history" });
  }
}

module.exports = { listGuests, registerGuest, reviewGuest, getGuestHistory };
