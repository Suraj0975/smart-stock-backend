const express = require("express");
const router = express.Router();
const c = require("../controller/localController");
router.get("/", c.getUsers);
router.get("/:id", c.getUserById);
router.post("/", c.createUser);
router.put("/:id", c.updateUser);
router.delete("/:id", c.deleteUser);
module.exports = router;
