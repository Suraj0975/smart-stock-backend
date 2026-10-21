const express = require("express");
const router = express.Router();
const c = require("../controller/localController");
router.get("/", c.getPredictions);
router.get("/:productId", c.getPredictionByProduct);
module.exports = router;
