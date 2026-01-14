const { PermissionsBitField, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const { settings } = require("../util/settingsModule.js");
const funcs = require("../util/functions.js");
const { Server } = require("../schemas/servers.js");
const { ServerStats } = require("../schemas/serverStats.js");
const users = require("../schemas/users.js");
const { i18n } = require("../util/i18n.js");
const analyticsWorker = require("../util/analyticsWorker.js");
const botDetection = require("../util/botDetection.js");
const cooldowns = new Map();
const alertCooldowns = new Map();
const adminCommands = ["prefix", "p"];
const serverCache = new Map();
const statsEnabledCache = new Map();

async function getServerData(guildId) {
    const cacheData = serverCache.get(guildId);

    if (cacheData && (Date.now() - cacheData.timestamp < 60 * 60 * 1000)) {
        return cacheData.data;
    }

    const serverData = await Server.findOne({ serverID: guildId });

    serverCache.set(guildId, { data: serverData, timestamp: Date.now() });

    return serverData;
}

function updateServerCache(guildId, updatedData) {
    serverCache.set(guildId, { data: updatedData, timestamp: Date.now() });
}

async function isStatsEnabled(guildId) {
    const cached = statsEnabledCache.get(guildId);
    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
        return cached.enabled;
    }
    const serverData = await Server.findOne({ serverID: guildId });
    const enabled = serverData?.serverStats?.enabled || false;
    const excludedChannels = serverData?.serverStats?.excludedChannels || [];
    statsEnabledCache.set(guildId, { enabled, excludedChannels, timestamp: Date.now() });
    return enabled;
}

async function trackBotDetection(message) {
    if (!message.guild || message.author.bot) return;

    try {
        const settings = await botDetection.getSettings(message.guild.id);
        if (!settings?.enabled) return;

        const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
        if (member && (Date.now() - member.joinedTimestamp) < 2 * 60 * 60 * 1000) {
            const spamCheck = await botDetection.checkCrossChannelLinkSpam(message, settings);

            if (spamCheck.isSpam) {
                logger.debug(`[BotDetection] Spam detected for ${message.author.id}. Actions: Delete=${spamCheck.messages.length} msgs, Timeout=${settings.allowTimeout}, Log=${settings.logAlerts}`);

                if (spamCheck.messages?.length > 0) {
                    for (const msgInfo of spamCheck.messages) {
                        try {
                            const channel = message.guild.channels.cache.get(msgInfo.channelID);
                            if (channel) {
                                const msg = await channel.messages.fetch(msgInfo.messageID).catch(() => null);
                                if (msg) await msg.delete().catch(() => { });
                            }
                        } catch (e) {
                            //
                        }
                    }
                }

                const timeoutDuration = (settings.allowTimeout && settings.checks.messageBehavior) ?
                    (settings.timeoutDuration || 60 * 1000) : 60 * 1000;

                try {
                    await member.timeout(timeoutDuration, `[Bot Detection] Cross-channel link spam detected`);
                } catch (e) {
                    logger.debug(`[BotDetection] Failed to timeout ${message.author.id}: ${e.message}`);
                }

                if (settings.logAlerts) {
                    const modLog = require("../util/modLog.js");
                    await modLog.logEvent(message.client, message.guild.id, 'botDetectionAlert', {
                        member: member,
                        confidence: 100,
                        reasons: spamCheck.reasons,
                        globalInfractions: 0,
                        riskLevel: 'high'
                    });
                }
            }
        }

        const urlRegex = /(https?:\/\/[^\s]+)/gi;
        const linksCount = (message.content.match(urlRegex) || []).length;
        const mentionCount = message.mentions.users.size + message.mentions.roles.size;
        const contentHash = message.content.length > 20 ? message.content.substring(0, 50).toLowerCase().replace(/\s/g, '') : null;

        await botDetection.updateTracking(message.guild.id, message.author.id, {
            channelID: message.channel.id,
            linksCount,
            mentionCount,
            contentHash
        });
    } catch (error) {
        //
    }
}
//
module.exports = {
    name: "messageCreate",
    execute: async (bot, message) => {
        if (message.author.bot) return;

        const isDM = !message.guild;
        const isBotMentioned = message.mentions.has(bot.user);
        const serverData = message.guild ? await getServerData(message.guild.id) : null;
        const prefix = serverData?.prefix || settings.prefix;
        const startsWithPrefix = message.content.startsWith(prefix);

        if (isDM || isBotMentioned || startsWithPrefix) {
            analyticsWorker.trackMessage();
        }

        if (message.guild && process.env.CANARY !== 'true') {
            isStatsEnabled(message.guild.id).then(async (enabled) => {
                if (enabled) {
                    const cached = statsEnabledCache.get(message.guild.id);
                    const excludedChannels = cached?.excludedChannels || [];
                    if (!excludedChannels.includes(message.channel.id)) {
                        try {
                            await ServerStats.trackMessage(message.guild.id, message.channel.id, message.author.id);
                        } catch (err) {
                            //
                        }
                    }
                }
            });

            trackBotDetection(message).catch(() => { });
        }
        const locale = message.guild ? message.guild.preferredLocale : 'en';
        const t = i18n.getFixedT(locale);

        if (message.mentions.everyone) return;
        const isBotMentionedd = message.content.trim() === `<@${bot.user.id}>`;
        if (!isBotMentionedd) return;
        if (isBotMentionedd) {
            try {
                return message.reply(t('events:message.mention_help'));
            } catch {
                return;
            }
        }

        return;
        const args = message.content.substring(prefix.length).trim().split(/ +/g);
        const commandName = args.shift().toLowerCase();
        const command = bot.commands.get(commandName) || bot.commands.find(cmd => cmd.help.aliases && cmd.help.aliases.includes(commandName));


        /* if (serverData && serverData.disabledChannels.includes(message.channel.id) && 
            !adminCommands.includes(commandName) && 
            !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return;
        } */

        if (settings.event === "maintenance" && !settings.devs.includes(message.author.id)) {
            try {
                return message.reply(t('events:message.maintenance'));
            } catch {
                return;
            }
        }

        if (isBotMentioned) {
            try {
                return message.reply(t('events:message.mention_prefix', { prefix: prefix }));
            } catch {
                return;
            }
        }

        if (!message.channel.permissionsFor(bot.user).has(PermissionsBitField.Flags.SendMessages)) {
            logger.warn("NO PERMISSION TO SEND MESSAGES");
            return;
        }

        if (!command) {
            return;
        }

        if (command.help.dev && !settings.devs.includes(message.author.id)) return;

        const userId = message.author.id;
        if (cooldowns.has(userId)) {
            const expirationTime = cooldowns.get(userId);
            if (Date.now() < expirationTime) {
                return;
            }
        }

        cooldowns.set(userId, Date.now() + 850);

        try {
            await command.run(bot, message, args, funcs, prefix);

            if (adminCommands.includes(commandName)) {
                const updatedServerData = await Server.findOne({ serverID: message.guild.id });
                updateServerCache(message.guild.id, updatedServerData);
            }
        } catch (err) {
            logger.error("Error executing command: ", err);
            message.reply(t('events:message.error_execution'));
        }
        if (adminCommands.includes(commandName)) {
            return;
        } else {
            if (alertCooldowns.has(userId)) {
                const expirationTime2 = alertCooldowns.get(userId);
                if (Date.now() < expirationTime2) {
                    return;
                }
            }

            alertCooldowns.set(userId, Date.now() + 3600000);
            const userMail = await users.findOne({ "mail.read": false, userID: userId });
            if (userMail && userMail.mail && userMail.mail.some(mail => mail.read !== true)) {
                const embed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle(t('events:message.unread_mail_title'))
                    .setDescription(t('events:message.unread_mail_description', { user: `<@${userId}>`, prefix: prefix }))
                    .setThumbnail("https://media.discordapp.net/attachments/1005773484028350506/1301842300044972052/jPip3Me.gif?ex=6725f29f&is=6724a11f&hm=928b062b8e393d663fea1252daacf995c071cae852e3b9d1e7be82fcc8fe4341&=&width=472&height=472")
                    .setTimestamp();

                await message.channel.send({ embeds: [embed] });
            }
        }
    }
};


// contributors: @relentiousdragon