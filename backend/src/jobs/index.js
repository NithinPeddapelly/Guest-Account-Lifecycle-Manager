const { checkInactivity } = require("./inactivityCheck");
const { checkExpiry } = require("./expiryCheck");

/**
 * Runs the inactivity and expiry checks on a schedule. Every hour is a
 * reasonable default for a demo; tighten or loosen via the interval below.
 */
function startScheduledJobs() {
  setInterval(async () => {
    console.log("[jobs] Running inactivity check...");
    try {
      await checkInactivity();
    } catch (error) {
      console.error("[jobs] Inactivity check failed:", error);
    }
  }, 3_600_000);

  setInterval(async () => {
    console.log("[jobs] Running expiry check...");
    try {
      await checkExpiry();
    } catch (error) {
      console.error("[jobs] Expiry check failed:", error);
    }
  }, 3_600_000);

  console.log("[jobs] Scheduled jobs registered (hourly).");
}

module.exports = { startScheduledJobs };
