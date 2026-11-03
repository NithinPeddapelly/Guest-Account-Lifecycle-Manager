const { pool } = require("../config/db");
const nextcloud = require("../services/nextcloud");

const THRESHOLD_DAYS = Number(process.env.INACTIVITY_THRESHOLD_DAYS || 30);

/**
 * Flags guests for review if their Nextcloud lastLogin is older than the
 * configured threshold. This is LOGIN recency, not file-activity recency —
 * see docs/setup-log.md for why that distinction matters.
 */
async function checkInactivity() {
  const { rows: guests } = await pool.query(
    "SELECT * FROM guests WHERE status = 'active'"
  );

  const cutoff = Date.now() - THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

  for (const guest of guests) {
    try {
      const live = await nextcloud.getUser(guest.nextcloud_user_id);
      const lastLoginMs = Number(live?.lastLogin || 0);

      if (lastLoginMs > 0 && lastLoginMs < cutoff) {
        await pool.query(
          `UPDATE guests SET status = 'review', last_known_login = $1 WHERE id = $2`,
          [new Date(lastLoginMs), guest.id]
        );
        await pool.query(
          `INSERT INTO lifecycle_history (guest_id, action, performed_by, reason)
           VALUES ($1, 'flagged_for_review', 'system', $2)`,
          [guest.id, `No login for over ${THRESHOLD_DAYS} days`]
        );
      }
    } catch (err) {
      console.error(`[jobs] Inactivity check failed for guest ${guest.id}:`, err.message);
    }
  }
}

module.exports = { checkInactivity };
