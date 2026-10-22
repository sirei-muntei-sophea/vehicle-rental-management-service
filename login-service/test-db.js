require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("./config/db");

async function testConnection() {
  try {
    await connectDB();
    console.log("Connection test passed!");
  } catch (error) {
    console.error("Connection test failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

testConnection();