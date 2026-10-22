const jwt = require("jsonwebtoken");

function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({
      message: "A Bearer token is required"
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"]
    });

    if (
      !decoded.userId ||
      !["admin", "customer"].includes(decoded.role)
    ) {
      return res.status(401).json({
        message: "Invalid token"
      });
    }

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired token"
    });
  }
}

module.exports = authenticate;