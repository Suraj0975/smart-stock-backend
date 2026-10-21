
const mongoose = require("mongoose");

async function connectDB() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing from backend/.env");
  }

  const connection = await mongoose.connect(
    process.env.MONGODB_URI
  );

  console.log(
    `MongoDB connected: ${connection.connection.host}`
  );

  return connection;
}

module.exports = connectDB;
