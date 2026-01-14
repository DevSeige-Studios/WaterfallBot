const { Events } = require('discord.js');
const modLog = require('../util/modLog.js');
const logger = require('../logger.js');
const { settings } = require('../util/settingsModule.js');
const { Server } = require('../schemas/servers.js');
const { ServerStats } = require('../schemas/serverStats.js');
const inviteTracker = require('../util/inviteTracker.js');
const botDetection = require('../util/botDetection.js');
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

            if (!member.user.bot) {
                await handleBotDetection(bot, member);
            }
        } catch (error) {
            if (settings.debug === 'true') {
                logger.error(`Error logging member join event: ${error.message}`, error);
            }
        }
    }
};

async function handleBotDetection(bot, member) {
    try {
        const detectionSettings = await botDetection.getSettings(member.guild.id);
        if (!detectionSettings?.enabled) return;

        const serverData = await Server.findOne({ serverID: member.guild.id }).lean();

        let { confidence, reasons } = botDetection.calculateConfidence(member, detectionSettings);

        const globalResult = await botDetection.addGlobalInfractionFactor(member.user.id, confidence);
        confidence = globalResult.confidence;
        const globalCount = globalResult.globalCount;

        if (globalCount > 0) {
            reasons.push(`global_infractions_${globalCount}`);
        }

        let altResult = { isLikelyAlt: false, potentialAlts: [] };
        if (detectionSettings.altDetection?.enabled) {
            altResult = await botDetection.checkAltEvasion(member, serverData);
        }

        const logsConfigured = !!(serverData?.logs?.moderation?.webhook?.length);

        if (logsConfigured && detectionSettings.logAlerts) {
            if (confidence >= 30 || globalCount >= 3) {
                await modLog.logEvent(bot, member.guild.id, 'botDetectionAlert', {
                    member: member,
                    confidence: confidence,
                    reasons: reasons,
                    globalInfractions: globalCount,
                    riskLevel: botDetection.getRiskLevel(globalCount)
                });
            }

            if (altResult.isLikelyAlt && altResult.potentialAlts.length > 0) {
                const potentialUsers = altResult.potentialAlts.slice(0, 4);

                await modLog.logEvent(bot, member.guild.id, 'altDetectionAlert', {
                    member: member,
                    potentialAlts: potentialUsers,
                    totalMatches: altResult.potentialAlts.length
                });
            }
        }

        const action = botDetection.getActionFromConfidence(confidence, detectionSettings);

        if (action.action === 'kick' && detectionSettings.allowKick) {
            try {
                await member.kick(`[Bot Detection] Confidence: ${confidence}% - ${reasons.join(', ')}`);
                if (logsConfigured && detectionSettings.logAlerts) {
                    await modLog.logEvent(bot, member.guild.id, 'botDetectionKick', {
                        member: member,
                        confidence: confidence,
                        reasons: reasons
                    });
                }
                await botDetection.trackGlobalInfraction(member.user.id, member.guild.id, serverData, member.guild);
                return;
            } catch (err) {
                logger.debug(`[BotDetection] Failed to kick ${member.user.tag}: ${err.message}`);
            }
        }

        if (action.action === 'timeout' && detectionSettings.allowTimeout && action.duration > 0) {
            try {
                await member.timeout(action.duration, `[Bot Detection] Confidence: ${confidence}% - ${reasons.join(', ')}`);
                if (logsConfigured && detectionSettings.logAlerts) {
                    await modLog.logEvent(bot, member.guild.id, 'botDetectionTimeout', {
                        member: member,
                        confidence: confidence,
                        duration: action.duration,
                        reasons: reasons
                    });
                }
                await botDetection.trackGlobalInfraction(member.user.id, member.guild.id, serverData, member.guild);
            } catch (err) {
                logger.debug(`[BotDetection] Failed to timeout ${member.user.tag}: ${err.message}`);
            }
        }

        if (detectionSettings.checks?.messageBehavior && confidence >= 10) {
            await botDetection.createTracking(member.guild.id, member.user.id);
        }
    } catch (error) {
        logger.debug(`[BotDetection] Error processing member ${member.user.tag}: ${error.message}`);
    }
}


// contributors: @relentiousdragon