
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

// Existing routes
const authRoutes = require("./routes/authRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const productRoutes = require("./routes/productRoutes");
const supplierRoutes = require("./routes/supplierRoutes");
const userRoutes = require("./routes/userRoutes");
const saleRoutes = require("./routes/saleRoutes");
const purchaseRoutes = require("./routes/purchaseRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const predictionRoutes = require("./routes/predictionRoutes");

// Simulated stock market routes
const marketRoutes = require("./routes/marketRoutes");
const tradingRoutes = require("./routes/tradingRoutes");

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
  })
);

app.use(express.json({ limit: "1mb" }));

// API health check
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Smart Stock AI API is running locally",
    database: "Local JSON storage",
    tradingMode: "Simulated paper trading",
  });
});

// Existing application APIs
app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/users", userRoutes);
app.use("/api/sales", saleRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/predictions", predictionRoutes);

// Stock market and paper trading APIs
app.use("/api/market", marketRoutes);
app.use("/api/trading", tradingRoutes);

// Start server
app.listen(port, () => {
  console.log("----------------------------------------");
  console.log("Smart Stock AI Backend");
  console.log(`API: http://localhost:${port}`);
  console.log("Mode: Local development");
  console.log("Storage: JSON files on this PC");
  console.log("Trading: Simulated paper trading");
  console.log("MongoDB: Disconnected");
  console.log("----------------------------------------");
});
