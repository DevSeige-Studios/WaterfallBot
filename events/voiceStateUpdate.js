const { Events } = require("discord.js");
const { Server } = require("../schemas/servers.js");
const { ServerStats } = require("../schemas/serverStats.js");
const logger = require("../logger.js");

const statsEnabledCache = new Map();

async function isStatsEnabled(guildId) {
    const cached = statsEnabledCache.get(guildId);
    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
        return cached.enabled;
    }
    const serverData = await Server.findOne({ serverID: guildId });
    const enabled = serverData?.serverStats?.enabled || false;
    statsEnabledCache.set(guildId, { enabled, timestamp: Date.now() });
    return enabled;
}
//
module.exports = {
    name: Events.VoiceStateUpdate,
    async execute(bot, oldState, newState) {
        const guildId = newState.guild?.id || oldState.guild?.id;
        if (!guildId) return;

        const userId = newState.member?.id || oldState.member?.id;
        if (!userId) return;

        try {
            const enabled = await isStatsEnabled(guildId);
            if (!enabled) return;

            if (!oldState.channelId && newState.channelId) {
                await ServerStats.trackVcJoin(guildId, newState.channelId, userId);
            }
            else if (oldState.channelId && !newState.channelId) {
                await ServerStats.trackVcLeave(guildId, oldState.channelId, userId);
            }
            else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
                await ServerStats.trackVcLeave(guildId, oldState.channelId, userId);
                await ServerStats.trackVcJoin(guildId, newState.channelId, userId);
            }
        } catch (error) {
            logger.debug(`[VoiceStateUpdate] Stats tracking error: ${error.message}`);
        }
    }
};
