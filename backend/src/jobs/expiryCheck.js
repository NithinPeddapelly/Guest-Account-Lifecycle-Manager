const { pool } = require("../config/db");

const WARNING_DAYS = Number(process.env.EXPIRY_WARNING_DAYS || 7);

/**
 * Flags guests approaching their expiry date for review, and marks guests
 * already past expiry. Pure database logic — doesn't need Nextcloud,
 * since expiry is lifecycle state our own system owns.
 */
async function checkExpiry() {
  const warningCutoff = new Date(Date.now() + WARNING_DAYS * 24 * 60 * 60 * 1000);
  const reviewWindowStart = new Date(Date.now() - WARNING_DAYS * 24 * 60 * 60 * 1000);

  const { rows: approaching } = await pool.query(
    `SELECT * FROM guests
     WHERE status = 'active' AND expires_at IS NOT NULL
       AND expires_at > now() AND expires_at <= $1
       AND (last_reviewed_at IS NULL OR last_reviewed_at < $2)`,
    [warningCutoff, reviewWindowStart]
  );

  for (const guest of approaching) {
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      const { rows } = await client.query(
        `UPDATE guests SET status = 'review'
         WHERE id = $1 AND status = 'active'
         RETURNING id`,
        [guest.id]
      );
      if (rows.length > 0) {
        await client.query(
          `INSERT INTO lifecycle_history (guest_id, action, performed_by, reason)
           VALUES ($1, 'flagged_for_review', 'system', 'Approaching expiry')`,
          [guest.id]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      if (client) await client.query("ROLLBACK").catch(() => {});
      console.error(`[jobs] Expiry check failed for guest ${guest.id}:`, err.message);
    } finally {
      client?.release();
    }
  }

  const { rows: expired } = await pool.query(
    `SELECT * FROM guests
     WHERE status IN ('active', 'review') AND expires_at IS NOT NULL AND expires_at < now()`
  );

  for (const guest of expired) {
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      const { rows } = await client.query(
        `UPDATE guests SET status = 'expired'
         WHERE id = $1 AND status = $2
         RETURNING id`,
        [guest.id, guest.status]
      );
      if (rows.length > 0) {
        await client.query(
          `INSERT INTO lifecycle_history (guest_id, action, performed_by, reason)
           VALUES ($1, 'expired', 'system', NULL)`,
          [guest.id]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      if (client) await client.query("ROLLBACK").catch(() => {});
      console.error(`[jobs] Expiry check failed for guest ${guest.id}:`, err.message);
    } finally {
      client?.release();
    }
  }
}

module.exports = { checkExpiry };
