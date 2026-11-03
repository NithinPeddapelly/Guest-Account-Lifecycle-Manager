const baseUrl = process.env.NEXTCLOUD_BASE_URL || "http://localhost:8080";
const user = process.env.NEXTCLOUD_ADMIN_USER || "admin";
const password = process.env.NEXTCLOUD_APP_PASSWORD || "";
const headers = {
  "OCS-APIRequest": "true",
  Authorization: "Basic " + Buffer.from(user + ":" + password).toString("base64"),
};

async function request(path) {
  const res = await fetch(`${baseUrl}${path}?format=json`, { headers });
  if (!res.ok) {
    throw new Error(`Nextcloud request failed with status ${res.status}: ${path}`);
  }
  return res.json();
}

/**
 * Fetch a single user's (guest's) full OCS record — includes lastLogin,
 * lastLoginTimestamp, firstLoginTimestamp. Confirmed working against a
 * local test instance; see docs/setup-log.md.
 */
async function getUser(userId) {
  const data = await request(`/ocs/v2.php/cloud/users/${encodeURIComponent(userId)}`);
  return data?.ocs?.data;
}

/**
 * List guest user IDs via the "guest_app" group membership endpoint.
 * NOTE: this specific endpoint has not been curl-tested yet (unlike
 * getUser, which was). Confirm the group name and response shape against
 * a real instance before relying on this — see docs/setup-log.md's
 * "still to verify" section.
 */
async function listGuestUserIds() {
  const data = await request("/ocs/v2.php/cloud/groups/guest_app");
  return data?.ocs?.data?.users || [];
}

module.exports = { getUser, listGuestUserIds };
