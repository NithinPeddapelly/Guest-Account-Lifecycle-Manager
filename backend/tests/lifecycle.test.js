const assert = require("node:assert/strict");
const { test } = require("node:test");

process.env.APP_DB_HOST ||= "app-db";
process.env.APP_DB_PORT ||= "5432";
process.env.APP_DB_NAME ||= "guest_lifecycle_test";
process.env.APP_DB_USER ||= "test_user";
process.env.APP_DB_PASSWORD ||= "test_password";
process.env.NEXTCLOUD_BASE_URL ||= "http://nextcloud";
process.env.NEXTCLOUD_ADMIN_USER ||= "test_admin";
process.env.NEXTCLOUD_APP_PASSWORD ||= "test_app_password";
process.env.EXPIRY_WARNING_DAYS = "7";
process.env.INACTIVITY_THRESHOLD_DAYS = "30";

const { pool } = require("../src/config/db");
const controllers = require("../src/controllers/guestsController");
const { requireAdmin } = require("../src/middleware/adminAuth");
const router = require("../src/routes/guests");
const { checkExpiry } = require("../src/jobs/expiryCheck");
const { checkInactivity } = require("../src/jobs/inactivityCheck");
const nextcloud = require("../src/services/nextcloud");

function response() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function request(body = {}, headers = {}) {
  return {
    body,
    headers,
    get(name) {
      return this.headers[name.toLowerCase()];
    },
  };
}

function clientFor(handler) {
  const calls = [];
  return {
    calls,
    released: false,
    async query(sql, params) {
      calls.push({ sql, params });
      return handler(sql, params);
    },
    release() {
      this.released = true;
    },
  };
}

async function withPool(stubs, callback) {
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  pool.query = stubs.query || pool.query;
  pool.connect = stubs.connect || pool.connect;
  try {
    return await callback();
  } finally {
    pool.query = originalQuery;
    pool.connect = originalConnect;
  }
}

test("guest routes fail closed without a configured or valid admin token", () => {
  const original = process.env.ADMIN_TOKEN;
  const res = response();
  delete process.env.ADMIN_TOKEN;
  requireAdmin(request(), res, () => assert.fail("missing token must not continue"));
  assert.equal(res.statusCode, 401);

  process.env.ADMIN_TOKEN = "expected-token";
  const invalid = response();
  requireAdmin(request({}, { authorization: "Bearer caller-token" }), invalid, () => {
    assert.fail("invalid token must not continue");
  });
  assert.equal(invalid.statusCode, 401);

  const valid = response();
  const validRequest = request({}, { authorization: "Bearer expected-token" });
  let continued = false;
  requireAdmin(validRequest, valid, () => {
    continued = true;
  });
  assert.equal(continued, true);
  assert.equal(valid.statusCode, 200);
  assert.equal(validRequest.adminUser, "admin");

  const routeLayers = router.stack.filter((layer) => layer.route);
  assert.equal(router.stack[0].handle, requireAdmin);
  assert.equal(routeLayers.length, 4);
  if (original === undefined) delete process.env.ADMIN_TOKEN;
  else process.env.ADMIN_TOKEN = original;
});

test("controllers reject malformed ids and invalid renewal dates before querying", async () => {
  const invalidReview = response();
  const invalidHistory = response();
  const invalidRenewal = response();
  await withPool(
    {
      query: async () => assert.fail("invalid history id must not query"),
      connect: async () => assert.fail("invalid review input must not connect"),
    },
    async () => {
      await controllers.reviewGuest(
        { params: { id: "not-a-uuid" }, body: { decision: "keep" } },
        invalidReview
      );
      await controllers.getGuestHistory({ params: { id: "not-a-uuid" } }, invalidHistory);
      await controllers.reviewGuest(
        {
          params: { id: "00000000-0000-4000-8000-000000000001" },
          body: { decision: "renew", new_expires_at: "not-a-date" },
        },
        invalidRenewal
      );
    }
  );

  assert.equal(invalidReview.statusCode, 400);
  assert.equal(invalidHistory.statusCode, 400);
  assert.equal(invalidRenewal.statusCode, 400);
  assert.equal(invalidReview.body.error, "id must be a valid UUID");
  assert.equal(invalidRenewal.body.error, "new_expires_at must be a valid date");
});

test("registerGuest rolls back both writes and releases its client", async () => {
  const client = clientFor(async (sql) => {
    if (sql === "BEGIN") return;
    if (sql.startsWith("INSERT INTO guests")) return { rows: [{ id: "guest-1" }] };
    if (sql.startsWith("INSERT INTO lifecycle_history")) throw new Error("history failed");
    if (sql === "ROLLBACK") return;
    assert.fail(`unexpected SQL: ${sql}`);
  });

  const res = response();
  await withPool({ connect: async () => client }, () =>
    controllers.registerGuest(
      { adminUser: "admin", body: { nextcloud_user_id: "nc-1", email: "guest@example.test", owner: "owner" } },
      res
    )
  );

  assert.equal(res.statusCode, 500);
  assert.deepEqual(client.calls.map(({ sql }) => sql), [
    "BEGIN",
    "INSERT INTO guests (nextcloud_user_id, email, display_name, owner, purpose, expires_at)\n       VALUES ($1, $2, $3, $4, $5, $6)\n       RETURNING *",
    "INSERT INTO lifecycle_history (guest_id, action, performed_by, reason)\n       VALUES ($1, 'created', $2, $3)",
    "ROLLBACK",
  ]);
  assert.equal(client.released, true);
});

test("reviewGuest commits history with the authenticated admin, not performed_by input", async () => {
  let historyParams;
  const client = clientFor(async (sql, params) => {
    if (sql === "BEGIN" || sql === "COMMIT") return;
    if (sql.startsWith("UPDATE guests")) return { rows: [{ id: "guest-2", status: "active" }] };
    if (sql.startsWith("INSERT INTO lifecycle_history")) {
      historyParams = params;
      return;
    }
    assert.fail(`unexpected SQL: ${sql}`);
  });

  const res = response();
  await withPool({ connect: async () => client }, () =>
    controllers.reviewGuest(
      {
        adminUser: "admin",
        params: { id: "00000000-0000-4000-8000-000000000002" },
        body: { decision: "keep", performed_by: "attacker", reason: "checked" },
      },
      res
    )
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(historyParams, ["00000000-0000-4000-8000-000000000002", "keep", "admin", "checked"]);
  assert.equal(client.released, true);
});

test("registerGuest returns 409 for a duplicate guest", async () => {
  const client = clientFor(async (sql) => {
    if (sql === "BEGIN") return;
    if (sql.startsWith("INSERT INTO guests")) {
      const error = new Error("duplicate");
      error.code = "23505";
      throw error;
    }
    if (sql === "ROLLBACK") return;
    assert.fail(`unexpected SQL: ${sql}`);
  });
  const res = response();

  await withPool({ connect: async () => client }, () =>
    controllers.registerGuest(
      { adminUser: "admin", body: { nextcloud_user_id: "nc-duplicate", email: "guest@example.test", owner: "owner" } },
      res
    )
  );

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { error: "Guest already registered" });
  assert.equal(client.released, true);
});

test("expiry check excludes expired approaching guests, suppresses recent reviews, guards stale updates, and continues after failures", async () => {
  const clients = [
    clientFor(async (sql) => {
      if (sql === "BEGIN" || sql === "COMMIT") return;
      if (sql.startsWith("UPDATE guests")) return { rows: [] };
      assert.fail(`unexpected stale-guest SQL: ${sql}`);
    }),
    clientFor(async (sql) => {
      if (sql === "BEGIN") return;
      if (sql.startsWith("UPDATE guests")) throw new Error("stale update");
      if (sql === "ROLLBACK") return;
      assert.fail(`unexpected failed-guest SQL: ${sql}`);
    }),
    clientFor(async (sql) => {
      if (sql === "BEGIN" || sql === "COMMIT") return;
      if (sql.startsWith("UPDATE guests")) return { rows: [{ id: "approaching-good" }] };
      if (sql.startsWith("INSERT INTO lifecycle_history")) return;
      assert.fail(`unexpected good-guest SQL: ${sql}`);
    }),
    clientFor(async (sql) => {
      if (sql === "BEGIN" || sql === "COMMIT") return;
      if (sql.startsWith("UPDATE guests")) return { rows: [{ id: "expired" }] };
      if (sql.startsWith("INSERT INTO lifecycle_history")) return;
      assert.fail(`unexpected expired-guest SQL: ${sql}`);
    }),
  ];
  const allClients = [...clients];
  let selectCount = 0;
  await withPool(
    {
      query: async (sql, params) => {
        if (!sql.startsWith("SELECT")) assert.fail(`unexpected pool SQL: ${sql}`);
        selectCount += 1;
        if (selectCount === 1) {
          assert.match(sql, /expires_at > now\(\)/);
          assert.match(sql, /last_reviewed_at/);
          assert.equal(params.length, 2);
          return {
            rows: [
              { id: "approaching-stale", status: "active" },
              { id: "approaching-failed", status: "active" },
              { id: "approaching-good", status: "active" },
            ],
          };
        }
        assert.match(sql, /status IN \('active', 'review'\)/);
        return { rows: [{ id: "expired", status: "review" }] };
      },
      connect: async () => clients.shift(),
    },
    async () => checkExpiry()
  );

  assert.equal(clients.length, 0);
  assert.equal(selectCount, 2);
  assert.equal(allClients[1].calls.some(({ sql }) => sql === "ROLLBACK"), true);
  assert.equal(allClients.every((client) => client.released), true);
});

test("inactivity check skips recently reviewed guests, guards stale updates, and continues after a guest failure", async () => {
  const recentReview = new Date(Date.now() - 60 * 60 * 1000);
  const oldLogin = Date.now() - 31 * 24 * 60 * 60 * 1000;
  const clients = [
    clientFor(async (sql) => {
      if (sql === "BEGIN" || sql === "COMMIT") return;
      if (sql.startsWith("UPDATE guests")) return { rows: [] };
      assert.fail(`unexpected stale-guest SQL: ${sql}`);
    }),
    clientFor(async (sql) => {
      if (sql === "BEGIN" || sql === "COMMIT") return;
      if (sql.startsWith("UPDATE guests")) return { rows: [{ id: "good" }] };
      if (sql.startsWith("INSERT INTO lifecycle_history")) return;
      assert.fail(`unexpected good-guest SQL: ${sql}`);
    }),
  ];
  const allClients = [...clients];
  const lookedUp = [];

  await withPool(
    {
      query: async (sql) => {
        assert.match(sql, /status = 'active'/);
        return {
          rows: [
            { id: "recent", nextcloud_user_id: "recent", last_reviewed_at: recentReview },
            { id: "stale", nextcloud_user_id: "stale", last_reviewed_at: null },
            { id: "failed", nextcloud_user_id: "failed", last_reviewed_at: null },
            { id: "good", nextcloud_user_id: "good", last_reviewed_at: null },
          ],
        };
      },
      connect: async () => clients.shift(),
    },
    async () => {
      const originalGetUser = nextcloud.getUser;
      nextcloud.getUser = async (id) => {
        lookedUp.push(id);
        if (id === "failed") throw new Error("Nextcloud unavailable");
        return { lastLogin: oldLogin };
      };
      try {
        await checkInactivity();
      } finally {
        nextcloud.getUser = originalGetUser;
      }
    }
  );

  assert.deepEqual(lookedUp, ["stale", "failed", "good"]);
  assert.equal(clients.length, 0);
  assert.equal(allClients.every((client) => client.released), true);
});

test("Nextcloud requests use a finite timeout and expose timeout failures cleanly", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    assert.match(String(url), /ocs\/v2\.php\/cloud\/users\/user-1\?format=json$/);
    assert.equal(options.headers["OCS-APIRequest"], "true");
    assert.ok(options.signal instanceof AbortSignal);
    const error = new Error("aborted");
    error.name = "TimeoutError";
    throw error;
  };

  try {
    await assert.rejects(
      () => nextcloud.getUser("user-1"),
      (error) => error.message === "Nextcloud request timed out: /ocs/v2.php/cloud/users/user-1"
    );
  } finally {
    global.fetch = originalFetch;
  }
});
