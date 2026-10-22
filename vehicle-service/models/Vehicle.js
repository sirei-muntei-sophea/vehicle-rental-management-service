const mongoose = require("mongoose");

const vehicleSchema = new mongoose.Schema(
  {
    brand: {
      type: String,
      required: true,
      trim: true
    },
    model: {
      type: String,
      required: true,
      trim: true
    },
    productionYear: {
    type: Number,
    required: true,
    min: 1886,
    validate: {
        validator: Number.isInteger,
        message: "Production year must be a whole number"
    }
    },
    plateNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true
    },
    vehicleType: {
      type: String,
      required: true,
      trim: true
    },
    dailyRate: {
      type: Number,
      required: true,
      min: 0.01
    },
    operationalStatus: {
      type: String,
      enum: ["active", "maintenance"],
      default: "active"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Vehicle", vehicleSchema);