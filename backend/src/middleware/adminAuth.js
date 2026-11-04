function requireAdmin(req, res, next) {
  const token = process.env.ADMIN_TOKEN;
  const authorization = req.get("authorization");

  if (!token || authorization !== `Bearer ${token}`) {
    return res.status(401).json({ error: "Admin authentication required" });
  }

  req.adminUser = "admin";
  next();
}

module.exports = { requireAdmin };
