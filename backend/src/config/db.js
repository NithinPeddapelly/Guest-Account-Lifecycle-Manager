const { Pool } = require("pg");

function requiredEnv(name) {
  if (!process.env[name]) throw new Error(`${name} must be set`);
  return process.env[name];
}

const pool = new Pool({
  host: requiredEnv("APP_DB_HOST"),
  port: requiredEnv("APP_DB_PORT"),
  database: requiredEnv("APP_DB_NAME"),
  user: requiredEnv("APP_DB_USER"),
  password: requiredEnv("APP_DB_PASSWORD"),
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle Postgres client", err);
});

module.exports = { pool };
