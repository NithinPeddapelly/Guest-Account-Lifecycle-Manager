const { pool } = require("../config/db");
const nextcloud = require("../services/nextcloud");

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

  try {
    const { rows } = await pool.query(
      `INSERT INTO guests (nextcloud_user_id, email, display_name, owner, purpose, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [nextcloud_user_id, email, display_name || null, owner, purpose || null, expires_at || null]
    );

    await pool.query(
      `INSERT INTO lifecycle_history (guest_id, action, performed_by, reason)
       VALUES ($1, 'created', $2, $3)`,
      [rows[0].id, owner, purpose || null]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to register guest" });
  }
}

/**
 * PATCH /api/guests/:id/review
 * Records a review decision: renew, revoke, or keep as-is.
 */
async function reviewGuest(req, res) {
  const { id } = req.params;
  const { decision, performed_by, reason, new_expires_at } = req.body;

  const validDecisions = { renew: "active", revoke: "revoked", keep: "active" };
  if (!validDecisions[decision]) {
    return res.status(400).json({ error: "decision must be one of: renew, revoke, keep" });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE guests
       SET status = $1,
           expires_at = COALESCE($2, expires_at),
           last_reviewed_at = now()
       WHERE id = $3
       RETURNING *`,
      [validDecisions[decision], decision === "renew" ? new_expires_at : null, id]
    );

    if (rows.length === 0) return res.status(404).json({ error: "Guest not found" });

    await pool.query(
      `INSERT INTO lifecycle_history (guest_id, action, performed_by, reason)
       VALUES ($1, $2, $3, $4)`,
      [id, decision, performed_by || "unknown", reason || null]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to review guest" });
  }
}

/**
 * GET /api/guests/:id/history
 */
async function getGuestHistory(req, res) {
  const { id } = req.params;
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
