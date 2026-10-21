const express = require("express");
const router = express.Router();
const c = require("../controller/localController");
router.get("/", c.getSales);
router.get("/:id", c.getSaleById);
router.post("/", c.createSale);
module.exports = router;
