const mongoose = require("mongoose");
//
const lockSchema = new mongoose.Schema({
    key: { type: String, unique: true },
    expiresAt: { type: Date, required: true },
});

module.exports = mongoose.models.Lock || mongoose.model("Lock", lockSchema);

// contributors: @relentiousdragon
