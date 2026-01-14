const mongoose = require("mongoose");
//
const infractionSchema = mongoose.Schema({
    serverID: { type: String, required: true, index: true },
    userID: { type: String, required: true, index: true },
    type: { type: String, enum: ['warn', 'timeout', 'kick', 'ban'], required: true },
    warnId: { type: String, required: false, index: true },
    reason: { type: String, default: 'No reason provided' },
    moderatorID: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
}, { versionKey: false });

infractionSchema.index({ timestamp: 1 }, { expireAfterSeconds: 45 * 24 * 60 * 60 });
//
module.exports = mongoose.model("infractions", infractionSchema);

// contributors: @relentiousdragon