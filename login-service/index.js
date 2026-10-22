require("dotenv").config();

const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const connectDB = require("./config/db");
const User = require("./models/User");
const authenticate = require("./middleware/authenticate");

const app = express();

app.use(express.json());

// Admin and Customer use the same login API.
app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string" ||
      !password
    ) {
      return res.status(400).json({
        message: "Email and password are required"
      });
    }

    // Explicitly include the password hash for comparison.
    const user = await User.findOne({
      email: email.trim().toLowerCase()
    }).select("+password");

    if (!user) {
      return res.status(401).json({
        message: "Incorrect email or password"
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatches) {
      return res.status(401).json({
        message: "Incorrect email or password"
      });
    }

    // The role comes from MongoDB, not the request body.
    const token = jwt.sign(
      {
        userId: user._id.toString(),
        role: user.role
      },
      process.env.JWT_SECRET,
      {
        algorithm: "HS256",
        expiresIn: "1h"
      }
    );

    return res.status(200).json({
      message: "Login successful!",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error("Login failed:", error.message);

    return res.status(500).json({
      message: "Login failed"
    });
  }
});

app.get("/auth/verify", authenticate, (req, res) => {
  res.json({
    message: "Token is valid",
    userId: req.user.userId,
    role: req.user.role,
    expiresAt: new Date(req.user.exp * 1000).toISOString()
  });
});

async function startServer() {
  try {
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is missing from .env");
    }

    await connectDB();

    const port = process.env.PORT || 5002;

    app.listen(port, () => {
      console.log(`Login Service running on port ${port}`);
    });
  } catch (error) {
    console.error("Service failed to start:", error.message);
    process.exitCode = 1;
  }
}

startServer();