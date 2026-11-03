const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.APP_DB_HOST || "localhost",
  port: process.env.APP_DB_PORT || 5432,
  database: process.env.APP_DB_NAME || "guest_lifecycle",
  user: process.env.APP_DB_USER || "lifecycle_admin",
  password: process.env.APP_DB_PASSWORD || "changeme",
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle Postgres client", err);
});

module.exports = { pool };
