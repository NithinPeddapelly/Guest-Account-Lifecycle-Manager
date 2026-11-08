const crypto = require("node:crypto");

function requireAdmin(req, res, next) {
  const token = process.env.ADMIN_TOKEN;
  const authorization = req.get("authorization");
  const suppliedToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  const expectedDigest = crypto.createHash("sha256").update(token || "").digest();
  const suppliedDigest = crypto.createHash("sha256").update(suppliedToken).digest();

  if (!token || !crypto.timingSafeEqual(expectedDigest, suppliedDigest)) {
    return res.status(401).json({ error: "Admin authentication required" });
  }

  req.adminUser = "admin";
  next();
}

module.exports = { requireAdmin };
