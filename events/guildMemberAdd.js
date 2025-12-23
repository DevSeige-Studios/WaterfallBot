const { Events } = require('discord.js');
const modLog = require('../util/modLog.js');
const logger = require('../logger.js');
const { settings } = require('../util/settingsModule.js');
const { Server } = require('../schemas/servers.js');
const { ServerStats } = require('../schemas/serverStats.js');
const inviteTracker = require('../util/inviteTracker.js');
//
module.exports = {
    name: Events.GuildMemberAdd,
    async execute(bot, member) {
        try {
            const usedInvite = await inviteTracker.findUsedInvite(member.guild);

            if (usedInvite && usedInvite.inviterId) {
                const serverData = await Server.findOne({ serverID: member.guild.id });
                if (serverData?.serverStats?.enabled) {
                    try {
                        await ServerStats.trackInviteUse(
                            member.guild.id,
                            usedInvite.code,
                            usedInvite.inviterId,
                            member.id
                        );
                    } catch (err) {
                        logger.debug(`[GuildMemberAdd] Stats tracking error: ${err.message}`);
                    }
                }
            }

            await modLog.logEvent(bot, member.guild.id, 'memberJoin', {
                member: member,
                inviteData: usedInvite
            });
        } catch (error) {
            if (settings.debug === 'true') {
                logger.error(`Error logging member join event: ${error.message}`, error);
            }
        }
    }
};

