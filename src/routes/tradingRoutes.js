
const express = require("express");
const router = express.Router();
const controller = require("../controller/localController");

router.get("/portfolio", controller.getTradingPortfolio);
router.get("/orders", controller.getTradingOrders);
router.post("/buy", controller.buyShares);
router.post("/sell", controller.sellShares);

module.exports = router;
