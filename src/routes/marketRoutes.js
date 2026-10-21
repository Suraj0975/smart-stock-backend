
const express = require("express");
const router = express.Router();
const controller = require("../controller/localController");

router.get("/", controller.getMarket);

module.exports = router;
