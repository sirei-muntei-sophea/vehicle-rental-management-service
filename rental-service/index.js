require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const connectDB = require("./config/db");
const Rental = require("./models/Rental");
const authenticate = require("./middleware/authenticate");
const authorize = require("./middleware/authorize");
const { getVehicle } = require("./services/vehicleClient");

const app = express();

app.use(express.json());
app.use("/rentals", authenticate, authorize("customer"));

// Start date is included; end date is excluded.
function parseDates(startDate, endDate) {
  const pattern = /^\d{4}-\d{2}-\d{2}$/;

  if (
    typeof startDate !== "string" ||
    typeof endDate !== "string" ||
    !pattern.test(startDate) ||
    !pattern.test(endDate)
  ) {
    throw new Error("Dates must use YYYY-MM-DD");
  }

  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);

  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    start.toISOString().slice(0, 10) !== startDate ||
    end.toISOString().slice(0, 10) !== endDate ||
    end <= start
  ) {
    throw new Error(
      "Use valid dates; end date must be after start date"
    );
  }

  return {
    start,
    end,
    days: (end - start) / 86400000
  };
}

function calculateTotal(days, dailyRate) {
  return Number((days * dailyRate).toFixed(2));
}

function checkRentalId(req, res, next) {
  if (!mongoose.isObjectIdOrHexString(req.params.rentalId)) {
    return res.status(400).json({
      message: "Invalid rental ID"
    });
  }

  next();
}

// Process changes one at a time in our single Rental instance.
let mutationQueue = Promise.resolve();

function serializeMutation(handler) {
  return (req, res, next) => {
    const operation = mutationQueue.then(() => handler(req, res));

    mutationQueue = operation.catch(() => {});
    operation.catch(next);
  };
}

// 1. Create a rental — Customer only.
app.post(
  "/rentals",
  serializeMutation(async (req, res) => {
    const { vehicleId, startDate, endDate } = req.body || {};

    if (!mongoose.isObjectIdOrHexString(vehicleId)) {
      return res.status(400).json({
        message: "Invalid vehicle ID"
      });
    }

    let dates;

    try {
      dates = parseDates(startDate, endDate);
    } catch (error) {
      return res.status(400).json({
        message: error.message
      });
    }

    const vehicle = await getVehicle(
      vehicleId,
      req.headers.authorization
    );

    if (vehicle.operationalStatus !== "active") {
      return res.status(409).json({
        message: "Vehicle is under maintenance"
      });
    }

    const overlap = await Rental.findOne({
      vehicleId,
      // Include records created with the previous version.
      status: {
        $in: ["confirmed", "active", "approved", "pending"]
      },
      startDate: { $lt: dates.end },
      endDate: { $gt: dates.start }
    });

    if (overlap) {
      return res.status(409).json({
        message: "Vehicle is already reserved for these dates"
      });
    }

    const rental = await Rental.create({
      customerId: req.user.userId,
      vehicleId,
      startDate: dates.start,
      endDate: dates.end,
      dailyRate: vehicle.dailyRate,
      totalCost: calculateTotal(dates.days, vehicle.dailyRate),
      status: "confirmed"
    });

    return res.status(201).json({
      message: "Rental confirmed successfully!",
      rental
    });
  })
);

// 2. View own rentals — Customer only.
app.get("/rentals/my-rentals", async (req, res, next) => {
  try {
    const rentals = await Rental.find({
      customerId: req.user.userId
    }).sort({ createdAt: -1 });

    return res.json(rentals);
  } catch (error) {
    next(error);
  }
});

// 3. Cancel own rental — Customer only.
app.patch(
  "/rentals/:rentalId/cancel",
  checkRentalId,
  serializeMutation(async (req, res) => {
    const rental = await Rental.findById(req.params.rentalId);

    if (!rental) {
      return res.status(404).json({
        message: "Rental not found"
      });
    }

    if (rental.customerId.toString() !== req.user.userId) {
      return res.status(403).json({
        message: "You cannot cancel another customer's rental"
      });
    }

    if (
      !["confirmed", "active", "pending", "approved"].includes(
        rental.status
      )
    ) {
      return res.status(409).json({
        message: "Only confirmed rentals can be cancelled"
      });
    }

    rental.status = "cancelled";
    await rental.save();

    return res.json({
      message: "Rental cancelled successfully!",
      rental
    });
  })
);

app.use((error, req, res, next) => {
  if (error.status === 404) {
    return res.status(404).json({
      message: "Vehicle not found"
    });
  }

  if (error.isAxiosError) {
    return res.status(502).json({
      message: "Could not retrieve vehicle details"
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

  console.error("Rental operation failed:", error.message);

  return res.status(500).json({
    message: "Rental operation failed"
  });
});

async function startServer() {
  try {
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is missing from .env");
    }

    if (!process.env.VEHICLE_SERVICE_URL) {
      throw new Error("VEHICLE_SERVICE_URL is missing from .env");
    }

    await connectDB();

    const port = process.env.PORT || 5004;

    app.listen(port, () => {
      console.log(`Rental Service running on port ${port}`);
    });
  } catch (error) {
    console.error("Service failed to start:", error.message);
    process.exitCode = 1;
  }
}

startServer();