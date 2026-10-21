const express = require("express");
const router = express.Router();

const {
  getSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
} = require("../controller/supplierController");

router.get("/", getSuppliers);
router.post("/", createSupplier);
router.put("/:id", updateSupplier);
router.delete("/:id", deleteSupplier);

module.exports = router;