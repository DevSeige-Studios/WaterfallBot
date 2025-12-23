const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits, ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize, ButtonBuilder, ButtonStyle, ActionRowBuilder, AttachmentBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder } = require('discord.js');
const e = require("../../data/emoji.js");
const commandMeta = require("../../util/i18n.js").getCommandMetadata();
const { Server } = require("../../schemas/servers.js");
const { ServerStats } = require("../../schemas/serverStats.js");
const graphRenderer = require("../../util/statsGraphRenderer.js");

const statsCache = new Map();

async function getServerSettings(guildId) {
    const cached = statsCache.get(guildId);
    if (cached && Date.now() - cached.timestamp < 60 * 1000) {
        return cached.data;
    }
    const serverData = await Server.findOne({ serverID: guildId });
    statsCache.set(guildId, { data: serverData, timestamp: Date.now() });
    return serverData;
}

function clearStatsCache(guildId) {
    statsCache.delete(guildId);
}

function formatDuration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
    return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

async function getMessageStats(guildId, days = 7) {
    const stats = await ServerStats.findOne({ guildId });
    if (!stats?.messageStats?.length) return null;

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const filtered = stats.messageStats.filter(s => s.date >= cutoff);

    const dailyStats = new Map();
    for (const stat of filtered) {
        const day = stat.date.toISOString().split('T')[0];
        dailyStats.set(day, (dailyStats.get(day) || 0) + stat.count);
    }

    return {
        total: filtered.reduce((sum, s) => sum + s.count, 0),
        daily: [...dailyStats.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    };
}

async function getHourlyDistribution(guildId) {
    const stats = await ServerStats.findOne({ guildId });
    if (!stats?.messageStats?.length) return null;

    const hourly = new Array(24).fill(0);
    for (const stat of stats.messageStats) {
        const hour = stat.date.getUTCHours();
        hourly[hour] += stat.count;
    }
    return hourly;
}

async function getTopUsers(guildId, limit = 10) {
    const stats = await ServerStats.findOne({ guildId });
    if (!stats?.messageStats?.length) return [];

    const userCounts = new Map();
    for (const stat of stats.messageStats) {
        userCounts.set(stat.userId, (userCounts.get(stat.userId) || 0) + stat.count);
    }

    return [...userCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([userId, count]) => ({ userId, count }));
}

async function getTopChannels(guildId, limit = 10) {
    const stats = await ServerStats.findOne({ guildId });
    if (!stats?.messageStats?.length) return [];

    const channelCounts = new Map();
    for (const stat of stats.messageStats) {
        channelCounts.set(stat.channelId, (channelCounts.get(stat.channelId) || 0) + stat.count);
    }

    return [...channelCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([channelId, count]) => ({ channelId, count }));
}

async function getVcLeaderboard(guildId, limit = 10) {
    const stats = await ServerStats.findOne({ guildId });
    if (!stats?.vcSessions?.length) return [];

    const userDurations = new Map();
    for (const session of stats.vcSessions) {
        userDurations.set(session.userId, (userDurations.get(session.userId) || 0) + session.duration);
    }

    return [...userDurations.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([userId, duration]) => ({ userId, duration }));
}

async function getInviteLeaderboard(guildId, limit = 10) {
    const stats = await ServerStats.findOne({ guildId });
    if (!stats?.memberJoins?.length) return [];

    const inviterCounts = new Map();
    for (const join of stats.memberJoins) {
        if (join.inviterId) {
            inviterCounts.set(join.inviterId, (inviterCounts.get(join.inviterId) || 0) + 1);
        }
    }

    return [...inviterCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([inviterId, count]) => ({ inviterId, count }));
}

async function getUserStats(guildId, userId) {
    const stats = await ServerStats.findOne({ guildId });
    if (!stats) return null;

    const messages = stats.messageStats?.filter(s => s.userId === userId).reduce((sum, s) => sum + s.count, 0) || 0;
    const vcTime = stats.vcSessions?.filter(s => s.userId === userId).reduce((sum, s) => sum + s.duration, 0) || 0;
    const invites = stats.memberJoins?.filter(s => s.inviterId === userId).length || 0;

    return { messages, vcTime, invites };
}
//
module.exports = {
    data: new SlashCommandBuilder()
        .setName("serverstats")
        .setNameLocalizations(commandMeta.serverstats?.name || {})
        .setDescription("View and manage server statistics")
        .setDescriptionLocalizations(commandMeta.serverstats?.description || {})
        .addSubcommand(sub =>
            sub.setName("enable")
                .setDescription("Enable server stats tracking (Admin only)")
        )
        .addSubcommand(sub =>
            sub.setName("disable")
                .setDescription("Disable server stats tracking (Admin only)")
        )
        .addSubcommand(sub =>
            sub.setName("overview")
                .setDescription("View server stats overview with message graph")
                .addIntegerOption(opt =>
                    opt.setName("days")
                        .setDescription("Number of days to show (7, 14, or 30)")
                        .addChoices(
                            { name: "7 days", value: 7 },
                            { name: "14 days", value: 14 },
                            { name: "30 days", value: 30 }
                        )
                )
        )
        .addSubcommand(sub =>
            sub.setName("activity")
                .setDescription("View peak hours and activity patterns")
        )
        .addSubcommand(sub =>
            sub.setName("voice")
                .setDescription("View voice channel activity leaderboard")
        )
        .addSubcommand(sub =>
            sub.setName("invites")
                .setDescription("View invite tracking leaderboard")
        ),
    integration_types: [0],
    contexts: [0],
    dev: false,
    mod: false,
    beta: true,
    explicit: false,
    async execute(bot, interaction, funcs, settings, logger, t) {
        if (!interaction.inGuild()) {
            return interaction.reply({ content: `${e.pixel_cross} This command can only be used in a server.`, flags: MessageFlags.Ephemeral });
        }

        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        try {
            if (subcommand === 'enable' || subcommand === 'disable') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({ content: `${e.pixel_cross} ${t('commands:serverstats.admin_only')}`, flags: MessageFlags.Ephemeral });
                }

                const serverData = await getServerSettings(guildId);
                const currentlyEnabled = serverData?.serverStats?.enabled || false;
                const wantsEnabled = subcommand === 'enable';

                if (currentlyEnabled === wantsEnabled) {
                    const alreadyMessage = wantsEnabled
                        ? t('commands:serverstats.already_enabled')
                        : t('commands:serverstats.already_disabled');
                    return interaction.reply({ content: `${e.pixel_cross} ${alreadyMessage}`, flags: MessageFlags.Ephemeral });
                }

                await Server.updateOne(
                    { serverID: guildId },
                    { $set: { 'serverStats.enabled': wantsEnabled } },
                    { upsert: true }
                );

                clearStatsCache(guildId);

                if (wantsEnabled) {
                    await ServerStats.getOrCreate(guildId);
                }

                const emoji = wantsEnabled ? e.pixel_check || '✅' : e.pixel_cross || '❌';
                const message = wantsEnabled ? t('commands:serverstats.enabled_success') : t('commands:serverstats.disabled_success');

                return interaction.reply({ content: `${emoji} ${message}` });
            }

            const serverData = await getServerSettings(guildId);
            if (!serverData?.serverStats?.enabled) {
                return interaction.reply({
                    content: `${e.pixel_cross} ${t('commands:serverstats.not_enabled')}`,
                    flags: MessageFlags.Ephemeral
                });
            }

            await interaction.deferReply();

            if (subcommand === 'overview') {
                const days = interaction.options.getInteger('days') || 7;
                const msgStats = await getMessageStats(guildId, days);
                const fullStats = await ServerStats.findOne({ guildId }).lean();

                if (!msgStats || msgStats.daily.length === 0) {
                    return interaction.editReply({ content: `${e.not_found} ${t('commands:serverstats.no_data')}` });
                }

                const graphBuffer = await graphRenderer.renderLineChart({
                    data: msgStats.daily.map(d => d[1]),
                    labels: msgStats.daily.map(d => d[0].slice(5)),
                    title: t('commands:serverstats.overview_graph_title', { days }),
                    width: 600,
                    height: 300
                });

                const attachName = `stats_${Date.now()}.gif`;
                const attachment = new AttachmentBuilder(graphBuffer, { name: attachName });

                const allTopUsers = await getTopUsers(guildId);
                const topUsers = allTopUsers.slice(0, 3);
                const restUsers = allTopUsers.slice(3);
                const restTotal = restUsers.reduce((a, b) => a + b.count, 0);

                const topChannels = await getTopChannels(guildId);

                const topUsersFormatted = await Promise.all(topUsers.map(async (u, i) => {
                    const user = await bot.users.fetch(u.userId).catch(() => null);
                    const name = user ? user.username : `<@${u.userId}>`;
                    return `${['🥇', '🥈', '🥉'][i]} **${name}**: ${funcs.abbr(u.count)}`;
                }));

                if (restUsers.length > 0) {
                    topUsersFormatted.push(t('commands:serverstats.leaderboard_remaining_generic', {
                        count: restUsers.length,
                        value: funcs.abbr(restTotal),
                        unit: t('commands:serverstats.messages').toLowerCase()
                    }));
                }

                const statsText = [
                    `${e.chart} **${t('commands:serverstats.total_messages')}:** ${funcs.abbr(msgStats.total)}`,
                    `${e.archive} **${t('commands:serverstats.total_messages_ever')}:** ${funcs.abbr(fullStats?.totalMessages || msgStats.total)}`,
                    `${e.green_point} **${t('commands:serverstats.daily_average')}:** ${funcs.abbr(Math.round(msgStats.total / days))}`,
                    '',
                    `**${t('commands:serverstats.top_users')}:**`,
                    ...topUsersFormatted,
                    '',
                    `**${t('commands:serverstats.top_channels')}:**`,
                    ...topChannels.slice(0, 3).map((c, i) => `${['🥇', '🥈', '🥉'][i]} <#${c.channelId}>: ${funcs.abbr(c.count)}`)
                ].join('\n');

                const container = new ContainerBuilder()
                    .setAccentColor(0x5865F2)
                    .addSectionComponents(
                        new SectionBuilder()
                            .addTextDisplayComponents(
                                new TextDisplayBuilder().setContent(`# ${e.chart} ${t('commands:serverstats.overview_title')}`),
                                new TextDisplayBuilder().setContent(`-# ${interaction.guild.name}`)
                            )
                            .setThumbnailAccessory(new ThumbnailBuilder().setURL(interaction.guild.iconURL() || bot.user.displayAvatarURL()))
                    )
                    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${attachName}`)))
                    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(statsText))
                    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Waterfall - ${t('commands:serverstats.data_from_days', { days })}`));

                return interaction.editReply({
                    components: [container],
                    files: [attachment],
                    flags: MessageFlags.IsComponentsV2 | MessageFlags.SuppressNotifications,
                    allowedMentions: { parse: [] }
                });
            }

            if (subcommand === 'activity') {
                const hourly = await getHourlyDistribution(guildId);

                if (!hourly || hourly.every(h => h === 0)) {
                    return interaction.editReply({ content: `${e.not_found} ${t('commands:serverstats.no_data')}` });
                }

                const labels = Array.from({ length: 24 }, (_, i) => `${i}:00`);
                const graphBuffer = await graphRenderer.renderBarChart({
                    data: hourly,
                    labels,
                    title: t('commands:serverstats.activity_by_hour'),
                    width: 600,
                    height: 300
                });

                const attachName = `activity_${Date.now()}.gif`;
                const attachment = new AttachmentBuilder(graphBuffer, { name: attachName });

                const peakHour = hourly.indexOf(Math.max(...hourly));
                const now = new Date();
                now.setUTCHours(peakHour, 0, 0, 0);
                const startTimestamp = Math.floor(now.getTime() / 1000);
                const endTimestamp = startTimestamp + 3600;
                const peakInfo = `-# ${e.calendar} **${t('commands:serverstats.peak_hour')}:** <t:${startTimestamp}:t> - <t:${endTimestamp}:t>`;

                const container = new ContainerBuilder()
                    .setAccentColor(0x5865F2)
                    .addSectionComponents(
                        new SectionBuilder()
                            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${e.chart} ${t('commands:serverstats.activity_title')}`))
                            .addTextDisplayComponents(new TextDisplayBuilder().setContent(peakInfo))
                            .setThumbnailAccessory(new ThumbnailBuilder().setURL(interaction.guild.iconURL() || bot.user.displayAvatarURL()))
                    )
                    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${attachName}`)))
                    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Waterfall - ${t('commands:serverstats.utc_time')}`));

                return interaction.editReply({ components: [container], files: [attachment], flags: MessageFlags.IsComponentsV2 });
            }

            if (subcommand === 'voice') {
                const allVcData = await getVcLeaderboard(guildId);
                const vcLeaderboard = allVcData.slice(0, 10);
                const restVc = allVcData.slice(10);
                const restVcTime = restVc.reduce((a, b) => a + b.duration, 0);

                if (!allVcData.length) {
                    return interaction.editReply({ content: `${e.not_found} ${t('commands:serverstats.no_vc_data')}` });
                }

                let vcList = await Promise.all(vcLeaderboard.map(async (u, i) => {
                    const medal = i < 3 ? ['🥇', '🥈', '🥉'][i] : `**${i + 1}.**`;
                    const user = await bot.users.fetch(u.userId).catch(() => null);
                    const name = user ? user.username : `<@${u.userId}>`;
                    return `${medal} **${name}**: ${formatDuration(u.duration)}`;
                }));

                if (restVc.length > 0) {
                    vcList.push(t('commands:serverstats.leaderboard_remaining_time', {
                        count: restVc.length,
                        time: formatDuration(restVcTime)
                    }));
                }

                vcList = vcList.join('\n');

                const container = new ContainerBuilder()
                    .setAccentColor(0x5865F2)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${e.voice_channnel} ${t('commands:serverstats.voice_leaderboard')}`))
                    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(vcList))
                    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Waterfall - ${t('commands:serverstats.last_30_days')}`));

                return interaction.editReply({
                    components: [container],
                    flags: MessageFlags.IsComponentsV2 | MessageFlags.SuppressNotifications,
                    allowedMentions: { parse: [] }
                });
            }

            if (subcommand === 'invites') {
                const allInvites = await getInviteLeaderboard(guildId);
                const inviteLeaderboard = allInvites.slice(0, 10);
                const restInvites = allInvites.slice(10);
                const restInvitesCount = restInvites.reduce((a, b) => a + b.count, 0);

                if (!allInvites.length) {
                    return interaction.editReply({ content: `${e.not_found} ${t('commands:serverstats.no_invite_data')}` });
                }

                let inviteList = await Promise.all(inviteLeaderboard.map(async (u, i) => {
                    const medal = i < 3 ? ['🥇', '🥈', '🥉'][i] : `**${i + 1}.**`;
                    const user = await bot.users.fetch(u.inviterId).catch(() => null);
                    const name = user ? user.username : `<@${u.inviterId}>`;
                    const count = u.count !== undefined ? u.count : 0;
                    return `${medal} **${name}**: ${count} ${t('commands:serverstats.invites_count')}`;
                }));

                if (restInvites.length > 0) {
                    inviteList.push(t('commands:serverstats.leaderboard_remaining_generic', {
                        count: restInvites.length,
                        value: restInvitesCount,
                        unit: t('commands:serverstats.invites_count')
                    }));
                }

                inviteList = inviteList.join('\n');

                const container = new ContainerBuilder()
                    .setAccentColor(0x5865F2)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${e.invite} ${t('commands:serverstats.invite_leaderboard')}`))
                    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(inviteList))
                    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Waterfall - ${t('commands:serverstats.last_30_days')}`));

                return interaction.editReply({
                    components: [container],
                    flags: MessageFlags.IsComponentsV2 | MessageFlags.SuppressNotifications,
                    allowedMentions: { parse: [] }
                });
            }

        } catch (error) {
            logger.error("[/serverstats] Error executing command:", error);
            if (interaction.deferred || interaction.replied) {
                return interaction.editReply({ content: `${e.pixel_cross} An error occurred while executing the command.` });
            }
            return interaction.reply({ content: `${e.pixel_cross} An error occurred while executing the command.`, flags: MessageFlags.Ephemeral });
        }
    },
    help: {
        name: "serverstats",
        description: "View and manage server statistics",
        category: "General",
        permissions: [],
        botPermissions: [],
        created: 1766491397
    }
};
