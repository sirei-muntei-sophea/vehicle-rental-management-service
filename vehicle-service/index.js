require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const connectDB = require("./config/db");
const Vehicle = require("./models/Vehicle");
const authenticate = require("./middleware/authenticate");
const authorize = require("./middleware/authorize");

const app = express();

app.use(express.json());

// Identify the Vehicle replica handling the request.
app.use((req, res, next) => {
  res.setHeader(
    "X-Service-Instance",
    process.env.VEHICLE_SERVICE_EC2_INSTANCE || "vehicle-1"
  );

  next();
});

app.use(
  "/vehicles",
  authenticate,
  authorize("admin", "customer")
);

function checkVehicleId(req, res, next) {
  if (!mongoose.isObjectIdOrHexString(req.params.vehicleId)) {
    return res.status(400).json({
      message: "Invalid vehicle ID"
    });
  }

  next();
}

// Split vehicleInfo into the existing database fields.
function getVehicleFields(body) {
  const fields = {};

  if (body.vehicleInfo !== undefined) {
    if (typeof body.vehicleInfo !== "string") {
      const error = new Error("vehicleInfo must be text");
      error.status = 400;
      throw error;
    }

    const parts = body.vehicleInfo
      .split(",")
      .map((part) => part.trim());

    if (
      parts.length !== 4 ||
      parts.some((part) => !part) ||
      !/^\d{4}$/.test(parts[0])
    ) {
      const error = new Error(
        "Use vehicleInfo format: 2022, Honda, Civic, 2CD-5678"
      );
      error.status = 400;
      throw error;
    }

    fields.productionYear = Number(parts[0]);
    fields.brand = parts[1];
    fields.model = parts[2];
    fields.plateNumber = parts[3];
  }

  for (const field of [
    "vehicleType",
    "dailyRate",
    "operationalStatus"
  ]) {
    if (body[field] !== undefined) {
      fields[field] = body[field];
    }
  }

  return fields;
}

// 1. Create a vehicle — Admin only.
app.post(
  "/vehicles",
  authorize("admin"),
  async (req, res, next) => {
    try {
      const vehicle = await Vehicle.create(
        getVehicleFields(req.body || {})
      );

      return res.status(201).json({
        message: "Vehicle added successfully!",
        vehicle
      });
    } catch (error) {
      next(error);
    }
  }
);

// 2. Update vehicle information — Admin only.
app.patch(
  "/vehicles/:vehicleId",
  authorize("admin"),
  checkVehicleId,
  async (req, res, next) => {
    try {
      const updates = getVehicleFields(req.body || {});

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({
          message: "Provide vehicle fields to update"
        });
      }

      const vehicle = await Vehicle.findByIdAndUpdate(
        req.params.vehicleId,
        { $set: updates },
        { new: true, runValidators: true }
      );

      if (!vehicle) {
        return res.status(404).json({
          message: "Vehicle not found"
        });
      }

      return res.json({
        message: "Vehicle updated successfully!",
        vehicle
      });
    } catch (error) {
      next(error);
    }
  }
);

// 3. Delete a vehicle — Admin only.
app.delete(
  "/vehicles/:vehicleId",
  authorize("admin"),
  checkVehicleId,
  async (req, res, next) => {
    try {
      // Preserve vehicles referenced by rental records.
      const rental = await mongoose.connection
        .collection("rentals")
        .findOne({
          vehicleId: new mongoose.Types.ObjectId(
            req.params.vehicleId
          )
        });

      if (rental) {
        return res.status(409).json({
          message: "Cannot delete a vehicle with rental records"
        });
      }

      const vehicle = await Vehicle.findByIdAndDelete(
        req.params.vehicleId
      );

      if (!vehicle) {
        return res.status(404).json({
          message: "Vehicle not found"
        });
      }

      const vehicleDescription = [
        vehicle.productionYear,
        vehicle.brand,
        vehicle.model
      ]
        .filter((value) => value !== undefined && value !== null)
        .join(" ");

      return res.json({
        message: `Vehicle deleted successfully: ${vehicleDescription} (${vehicle.plateNumber})`,
        vehicleId: vehicle._id
      });
    } catch (error) {
      next(error);
    }
  }
);

// 4. List and filter vehicles — Admin and Customer.
app.get("/vehicles", async (req, res, next) => {
  try {
    const filter = {};

    // Rental Service retrieves a vehicle using this ID filter.
    if (req.query.id !== undefined) {
      if (!mongoose.isObjectIdOrHexString(req.query.id)) {
        return res.status(400).json({
          message: "Invalid vehicle ID"
        });
      }

      filter._id = req.query.id;
    }

    for (const field of [
      "brand",
      "vehicleType",
      "operationalStatus"
    ]) {
      if (typeof req.query[field] === "string") {
        filter[field] = req.query[field];
      }
    }

    const vehicles = await Vehicle.find(filter)
      .sort({ createdAt: -1 });

    return res.json(vehicles);
  } catch (error) {
    next(error);
  }
});

// Handle input, database, and server errors.
app.use((error, req, res, next) => {
  if (error.status === 400) {
    return res.status(400).json({
      message: error.message
    });
  }

  if (error.code === 11000) {
    return res.status(409).json({
      message: "Plate number already exists"
    });
  }

  if (
    error.name === "ValidationError" ||
    error.name === "CastError"
  ) {
    return res.status(400).json({
      message: error.message
    });
  }

  console.error("Vehicle operation failed:", error.message);

  return res.status(500).json({
    message: "Vehicle operation failed"
  });
});

async function startServer() {
  try {
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is missing from .env");
    }

    await connectDB();
    await Vehicle.init();

    const port = process.env.PORT || 5003;

    app.listen(port, () => {
      console.log(`Vehicle Service running on port ${port}`);
    });
  } catch (error) {
    console.error("Service failed to start:", error.message);
    process.exitCode = 1;
  }
}

startServer();