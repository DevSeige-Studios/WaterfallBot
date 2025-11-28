const mongoose = require("mongoose");
//
const serverSchema = mongoose.Schema({
    serverID: { type: String, index: true },
    prefix: String,
    banned: { type: Boolean, default: false }
}, { versionKey: false });

serverSchema.index({ banned: 1 });

module.exports = {
    Server: mongoose.model("servers", serverSchema)
};
