const mongoose = require("mongoose");

const rentalSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    vehicleId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      required: true
    },
    dailyRate: {
      type: Number,
      required: true,
      min: 0.01
    },
    totalCost: {
      type: Number,
      required: true,
      min: 0
    },
    status: {
    type: String,
    enum: ["confirmed", "cancelled"],
    default: "confirmed"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Rental", rentalSchema);