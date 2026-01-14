const mongoose = require("mongoose");
//
const globalUserInfractionsSchema = mongoose.Schema({
    userID: { type: String, required: true, index: true },
    servers: [{ type: String }],
    infractionCount: { type: Number, default: 0 },
    lastInfraction: { type: Date, default: Date.now },
    timestamp: { type: Date, default: Date.now }
}, { versionKey: false });

globalUserInfractionsSchema.index({ timestamp: 1 }, { expireAfterSeconds: 45 * 24 * 60 * 60 });

const botDetectionSettingsSchema = mongoose.Schema({
    serverID: { type: String, required: true, unique: true, index: true },
    enabled: { type: Boolean, default: false },
    allowKick: { type: Boolean, default: false },
    allowTimeout: { type: Boolean, default: true },
    logAlerts: { type: Boolean, default: true },
    altDetection: {
        enabled: { type: Boolean, default: true },
        action: { type: String, enum: ['log', 'timeout'], default: 'log' },
        timeoutDuration: { type: Number, default: 0, max: 86400000 }
    },
    checks: {
        defaultAvatar: { type: Boolean, default: true },
        accountAge10m: { type: Boolean, default: true },
        accountAge1h: { type: Boolean, default: true },
        accountAge1d: { type: Boolean, default: true },
        accountAge1w: { type: Boolean, default: false },
        suspiciousUsername: { type: Boolean, default: true },
        messageBehavior: { type: Boolean, default: true }
    }
}, { versionKey: false });

const newUserTrackingSchema = mongoose.Schema({
    serverID: { type: String, required: true },
    userID: { type: String, required: true },
    joinedAt: { type: Date, default: Date.now },
    messageCount: { type: Number, default: 0 },
    linksSent: { type: Number, default: 0 },
    mentionCount: { type: Number, default: 0 },
    channelsUsed: [{ type: String }],
    similarMessages: [{ type: String }],
    analyzed: { type: Boolean, default: false },
    timestamp: { type: Date, default: Date.now }
}, { versionKey: false });

newUserTrackingSchema.index({ serverID: 1, userID: 1 }, { unique: true });
newUserTrackingSchema.index({ timestamp: 1 }, { expireAfterSeconds: 2 * 60 * 60 });
//
module.exports = {
    GlobalUserInfractions: mongoose.model("globalUserInfractions", globalUserInfractionsSchema),
    BotDetectionSettings: mongoose.model("botDetectionSettings", botDetectionSettingsSchema),
    NewUserTracking: mongoose.model("newUserTracking", newUserTrackingSchema)
};


// contributors: @relentiousdragon