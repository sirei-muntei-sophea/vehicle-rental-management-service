require("dotenv").config();

const express = require("express");
const {
  createProxyMiddleware
} = require("http-proxy-middleware");

const authenticate = require("./middleware/authenticate");
const authorize = require("./middleware/authorize");

const app = express();

const requiredVariables = [
  "JWT_SECRET",
  "REGISTRATION_SERVICE_URL",
  "LOGIN_SERVICE_URL",
  "VEHICLE_SERVICE_URL",
  "RENTAL_SERVICE_URL"
];

for (const variable of requiredVariables) {
  if (!process.env[variable]) {
    throw new Error(`${variable} is missing from .env`);
  }
}

// Check authentication and roles before forwarding requests.
function protectRequests(req, res, next) {
  const path = req.path;
  const method = req.method;

  // Registration and Login are public.
  if (
    method === "POST" &&
    ["/account/register", "/auth/login"].includes(path)
  ) {
    return next();
  }

  authenticate(req, res, () => {
    let allowedRoles = ["admin", "customer"];

    if (
      path === "/account" ||
      path.startsWith("/account/")
    ) {
      allowedRoles = ["customer"];
    } else if (
      path === "/vehicles" ||
      path.startsWith("/vehicles/")
    ) {
      allowedRoles = method === "GET"
        ? ["admin", "customer"]
        : ["admin"];
    } else if (
      path === "/rentals" ||
      path.startsWith("/rentals/")
    ) {
      if (path === "/rentals" && method === "GET") {
        allowedRoles = ["admin"];
      } else if (
        method === "DELETE" ||
        path.endsWith("/status")
      ) {
        allowedRoles = ["admin"];
      } else if (
        method === "POST" ||
        method === "PATCH" ||
        path === "/rentals/my-rentals"
      ) {
        allowedRoles = ["customer"];
      }
    }

    authorize(...allowedRoles)(req, res, next);
  });
}

// Forward the complete path, Authorization header, and body.
function createServiceProxy(prefix, target) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,

    pathFilter: (path) =>
      path === prefix || path.startsWith(`${prefix}/`),

    on: {
      error: (error, req, res) => {
        console.error("Proxy failed:", error.message);

        if (!res.headersSent && !res.writableEnded) {
          res.writeHead(502, {
            "Content-Type": "application/json"
          });

          res.end(
            JSON.stringify({
              message: "Destination service is unavailable"
            })
          );
        }
      }
    }
  });
}

app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Vehicle Rental Management System</title>
      </head>
      <body>
        <h1>Vehicle Rental Management System</h1>
        <p>API Gateway is running.</p>
      </body>
    </html>
  `);
});

app.use(protectRequests);

// Destination services parse JSON.
// Do not place express.json() before these proxies.
app.use(
  createServiceProxy(
    "/account",
    process.env.REGISTRATION_SERVICE_URL
  )
);

app.use(
  createServiceProxy(
    "/auth",
    process.env.LOGIN_SERVICE_URL
  )
);

app.use(
  createServiceProxy(
    "/vehicles",
    process.env.VEHICLE_SERVICE_URL
  )
);

app.use(
  createServiceProxy(
    "/rentals",
    process.env.RENTAL_SERVICE_URL
  )
);

app.use((req, res) => {
  res.status(404).json({
    message: "API route not found"
  });
});

const port = process.env.PORT || 5000;

app.listen(port, () => {
  console.log(`API Gateway running on port ${port}`);
});