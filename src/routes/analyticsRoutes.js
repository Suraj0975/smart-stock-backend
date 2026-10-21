const express = require("express");
const router = express.Router();
const c = require("../controller/localController");
router.get("/dashboard", c.getDashboard);
router.get("/sales", c.getSalesAnalytics);
router.get("/inventory", c.getInventoryAnalytics);
module.exports = router;
