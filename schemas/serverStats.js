const mongoose = require("mongoose");
const logger = require("../logger.js");
//
const serverStatsSchema = mongoose.Schema({
    guildId: { type: String, index: true, required: true },
    enabled: { type: Boolean, default: false },
    messageStats: [{
        date: { type: Date, index: true },
        channelId: String,
        userId: String,
        count: { type: Number, default: 0 }
    }],
    vcSessions: [{
        userId: String,
        channelId: String,
        joinTime: Date,
        leaveTime: Date,
        duration: { type: Number, default: 0 }//seconds 
    }],
    activeVcSessions: [{
        userId: String,
        channelId: String,
        joinTime: Date
    }],
    allTimeVoiceMinutes: { type: Number, default: 0 },
    dailySnapshots: [{
        date: Date,
        messages: Number,
        voiceMinutes: Number,
        memberCount: Number,
    }],
    exportConfig: {
        channelId: { type: String, default: null },
        lastExportAt: { type: Date, default: null },
        enabled: { type: Boolean, default: false }
    },
    invites: [{
        code: String,
        inviterId: String,
        uses: { type: Number, default: 0 },
        createdAt: Date
    }],
    memberJoins: [{
        userId: String,
        inviteCode: String,
        inviterId: String,
        joinedAt: Date
    }],
    totalMessages: { type: Number, default: 0 },
    pendingDeletion: { type: Date, default: null }
}, { versionKey: false, timestamps: true });

serverStatsSchema.index({ guildId: 1, 'messageStats.date': -1 });
serverStatsSchema.index({ guildId: 1, 'vcSessions.joinTime': -1 });
serverStatsSchema.index({ guildId: 1, 'memberJoins.joinedAt': -1 });

serverStatsSchema.statics.cleanupOldData = async function (guildId) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    await this.updateOne(
        { guildId },
        {
            $pull: {
                messageStats: { date: { $lt: thirtyDaysAgo } },
                vcSessions: { joinTime: { $lt: thirtyDaysAgo } },
                memberJoins: { joinedAt: { $lt: thirtyDaysAgo } },
                dailySnapshots: { date: { $lt: sixtyDaysAgo } }
            }
        }
    );
};

serverStatsSchema.statics.getOrCreate = async function (guildId) {
    let doc = await this.findOne({ guildId });
    if (!doc) {
        doc = await this.create({ guildId, enabled: false });
    }
    return doc;
};

serverStatsSchema.statics.trackMessage = async function (guildId, channelId, userId) {
    const now = new Date();
    const hourBucket = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours()));

    const result = await this.updateOne(
        {
            guildId,
            messageStats: {
                $elemMatch: {
                    date: hourBucket,
                    channelId,
                    userId
                }
            }
        },
        {
            $inc: {
                'messageStats.$.count': 1,
                totalMessages: 1
            }
        }
    );

    if (result.modifiedCount === 0) {
        await this.updateOne(
            { guildId },
            {
                $inc: { totalMessages: 1 },
                $push: {
                    messageStats: {
                        date: hourBucket,
                        channelId,
                        userId,
                        count: 1
                    }
                }
            },
            { upsert: true }
        );
        logger.debug(`[ServerStats] Created new message stat bucket for guild ${guildId}`);
    } else {
        logger.debug(`[ServerStats] Incremented message count for guild ${guildId}`);
    }
};

serverStatsSchema.statics.trackVcJoin = async function (guildId, channelId, userId) {
    await this.updateOne(
        { guildId },
        {
            $push: {
                activeVcSessions: {
                    userId,
                    channelId,
                    joinTime: new Date()
                }
            }
        },
        { upsert: true }
    );
    logger.debug(`[ServerStats] Tracked VC join for user ${userId} in guild ${guildId}`);
};

serverStatsSchema.statics.trackVcLeave = async function (guildId, channelId, userId) {
    const doc = await this.findOne({ guildId });
    if (!doc) return;

    const activeSession = doc.activeVcSessions?.find(
        s => s.userId === userId && s.channelId === channelId
    );

    if (activeSession) {
        const duration = Math.floor((Date.now() - activeSession.joinTime.getTime()) / 1000);

        await this.updateOne(
            { guildId },
            {
                $pull: { activeVcSessions: { userId, channelId } },
                $push: {
                    vcSessions: {
                        userId,
                        channelId,
                        joinTime: activeSession.joinTime,
                        leaveTime: new Date(),
                        duration
                    }
                },
                $inc: { allTimeVoiceMinutes: Math.floor(duration / 60) }
            }
        );
        logger.debug(`[ServerStats] Tracked VC leave for user ${userId} in guild ${guildId}, duration: ${duration}s`);
    }
};

serverStatsSchema.statics.trackInviteUse = async function (guildId, code, inviterId, newUserId) {
    await this.updateOne(
        { guildId },
        {
            $push: {
                memberJoins: {
                    userId: newUserId,
                    inviteCode: code,
                    inviterId,
                    joinedAt: new Date()
                }
            }
        },
        { upsert: true }
    );

    await this.updateOne(
        { guildId, 'invites.code': code },
        { $inc: { 'invites.$.uses': 1 } }
    );
};
//
module.exports = {
    ServerStats: mongoose.model("serverStats", serverStatsSchema)
};
