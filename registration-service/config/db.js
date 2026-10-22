const mongoose = require("mongoose");

async function connectDB() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is missing from .env");
  }

  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000
  });

  console.log("MongoDB connected:", mongoose.connection.name);
}

module.exports = connectDB;