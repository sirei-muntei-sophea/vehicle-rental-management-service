require("dotenv").config();

const express = require("express");
const bcrypt = require("bcryptjs");
const connectDB = require("./config/db");
const User = require("./models/User");
const authenticate = require("./middleware/authenticate");
const authorize = require("./middleware/authorize");

const app = express();

app.use(express.json());

// Register an Admin or Customer for the project.
app.post("/account/register", async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role = "customer"
    } = req.body || {};

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        message: "Provide a valid name, email, and password"
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({
        message: "Provide a valid email address"
      });
    }

    if (
      password.length < 6 ||
      Buffer.byteLength(password, "utf8") > 72
    ) {
      return res.status(400).json({
        message: "Password must be at least 6 characters and at most 72 bytes"
      });
    }

    if (!["admin", "customer"].includes(role)) {
      return res.status(400).json({
        message: "Role must be admin or customer"
      });
    }

    const existingUser = await User.findOne({
      email: normalizedEmail
    });

    if (existingUser) {
      return res.status(409).json({
        message: "Email is already registered"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role
    });

    return res.status(201).json({
      message: "Account registered successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "Email is already registered"
      });
    }

    console.error("Registration failed:", error.message);

    return res.status(500).json({
      message: "Registration failed"
    });
  }
});

// View the authenticated customer's profile.
app.get(
  "/account/my-profile",
  authenticate,
  authorize("customer"),
  async (req, res) => {
    try {
      const user = await User.findById(req.user.userId)
        .select("name email role");

      if (!user) {
        return res.status(404).json({
          message: "Account not found"
        });
      }

      return res.json(user);
    } catch (error) {
      console.error("Profile retrieval failed:", error.message);

      return res.status(500).json({
        message: "Could not retrieve profile"
      });
    }
  }
);

async function startServer() {
  try {
    await connectDB();
    await User.init();

    const port = process.env.PORT || 5001;

    app.listen(port, () => {
      console.log(`Registration Service running on port ${port}`);
    });
  } catch (error) {
    console.error("Service failed to start:", error.message);
    process.exitCode = 1;
  }
}

startServer();