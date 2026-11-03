const { pool } = require("../config/db");

const WARNING_DAYS = Number(process.env.EXPIRY_WARNING_DAYS || 7);

/**
 * Flags guests approaching their expiry date for review, and marks guests
 * already past expiry. Pure database logic — doesn't need Nextcloud,
 * since expiry is lifecycle state our own system owns.
 */
async function checkExpiry() {
  const warningCutoff = new Date(Date.now() + WARNING_DAYS * 24 * 60 * 60 * 1000);

  const { rows: approaching } = await pool.query(
    `SELECT * FROM guests
     WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= $1`,
    [warningCutoff]
  );

  for (const guest of approaching) {
    await pool.query(`UPDATE guests SET status = 'review' WHERE id = $1`, [guest.id]);
    await pool.query(
      `INSERT INTO lifecycle_history (guest_id, action, performed_by, reason)
       VALUES ($1, 'flagged_for_review', 'system', 'Approaching expiry')`,
      [guest.id]
    );
  }

  const { rows: expired } = await pool.query(
    `SELECT * FROM guests
     WHERE status IN ('active', 'review') AND expires_at IS NOT NULL AND expires_at < now()`
  );

  for (const guest of expired) {
    await pool.query(`UPDATE guests SET status = 'expired' WHERE id = $1`, [guest.id]);
    await pool.query(
      `INSERT INTO lifecycle_history (guest_id, action, performed_by, reason)
       VALUES ($1, 'expired', 'system', NULL)`,
      [guest.id]
    );
  }
}

module.exports = { checkExpiry };
