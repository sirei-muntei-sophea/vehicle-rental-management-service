function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: "Your role cannot access this API"
      });
    }

    next();
  };
}

module.exports = authorize;