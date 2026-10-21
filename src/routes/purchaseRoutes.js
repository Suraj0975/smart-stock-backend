const express = require("express");
const router = express.Router();
const c = require("../controller/localController");
router.get("/", c.getPurchases);
router.get("/:id", c.getPurchaseById);
router.post("/", c.createPurchase);
module.exports = router;
