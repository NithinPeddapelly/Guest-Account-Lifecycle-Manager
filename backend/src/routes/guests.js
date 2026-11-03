const express = require("express");
const router = express.Router();
const guestsController = require("../controllers/guestsController");

router.get("/", guestsController.listGuests);
router.post("/", guestsController.registerGuest);
router.patch("/:id/review", guestsController.reviewGuest);
router.get("/:id/history", guestsController.getGuestHistory);

module.exports = router;
