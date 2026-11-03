require("dotenv").config();
const express = require("express");
const cors = require("cors");

const guestsRouter = require("./routes/guests");
const { startScheduledJobs } = require("./jobs");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok" }));
app.use("/api/guests", guestsRouter);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Guest Lifecycle backend listening on port ${PORT}`);
  startScheduledJobs();
});
