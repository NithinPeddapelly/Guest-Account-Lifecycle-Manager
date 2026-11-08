const baseUrl = new URL(process.env.NEXTCLOUD_BASE_URL || "http://localhost:8080");
const localHttpHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "nextcloud", "host.docker.internal"]);
if (baseUrl.protocol !== "https:" && !(baseUrl.protocol === "http:" && localHttpHosts.has(baseUrl.hostname))) {
  throw new Error("NEXTCLOUD_BASE_URL must use HTTPS outside local or private Compose networking");
}

const user = process.env.NEXTCLOUD_ADMIN_USER;
const password = process.env.NEXTCLOUD_APP_PASSWORD;
if (!user || !password) throw new Error("NEXTCLOUD_ADMIN_USER and NEXTCLOUD_APP_PASSWORD must be set");
const REQUEST_TIMEOUT_MS = 10_000;
const headers = {
  "OCS-APIRequest": "true",
  Authorization: "Basic " + Buffer.from(user + ":" + password).toString("base64"),
};

async function request(path) {
  let res;
  try {
    const url = new URL(baseUrl);
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
    url.search = "format=json";
    res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    if (err.name === "AbortError" || err.name === "TimeoutError") {
      throw new Error(`Nextcloud request timed out: ${path}`, { cause: err });
    }
    throw err;
  }
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
