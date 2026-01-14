const {
    SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ContainerBuilder,
    SectionBuilder, TextDisplayBuilder, ThumbnailBuilder, SeparatorBuilder,
    SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle
} = require("discord.js");
const commandMeta = require("../../util/i18n.js").getCommandMetadata();
const e = require("../../data/emoji.js");
const { parseEmoji } = require("../../util/functions.js");
const { Server } = require("../../schemas/servers.js");
const botDetection = require("../../util/botDetection.js");
//
module.exports = {
    data: new SlashCommandBuilder()
        .setName("bot-detection")
        .setDescription("Configure automatic bot/spam detection")
        .setNameLocalizations(commandMeta.bot_detection?.name || {})
        .setDescriptionLocalizations(commandMeta.bot_detection?.description || {})
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub => sub
            .setName("setup")
            .setDescription("Interactive bot detection setup")
            .setNameLocalizations(commandMeta.bot_detection?.setup_name || {})
            .setDescriptionLocalizations(commandMeta.bot_detection?.setup_description || {})
        )
        .addSubcommand(sub => sub
            .setName("status")
            .setDescription("View current bot detection settings")
            .setNameLocalizations(commandMeta.bot_detection?.status_name || {})
            .setDescriptionLocalizations(commandMeta.bot_detection?.status_description || {})
        ),
    integration_types: [0],
    contexts: [0],
    dev: false,
    mod: false,
    beta: true,
    explicit: false,
    async execute(bot, interaction, funcs, settings, logger, t) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({
                content: `${e.deny} ${t('commands:bot_detection.error_no_permission')}`,
                flags: MessageFlags.Ephemeral
            });
        }

        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case "setup":
                    await handleSetup(bot, interaction, t, logger);
                    break;
                case "status":
                    await handleStatus(bot, interaction, t, logger);
                    break;
            }
        } catch (error) {
            logger.error("Bot detection command error:", error);
            await interaction.editReply({
                content: `${e.deny} ${t('commands:bot_detection.error_generic')}`,
                flags: MessageFlags.Ephemeral
            });
        }
    },
    help: {
        name: "bot-detection",
        description: "Configure automatic bot/spam detection",
        category: "Moderation",
        permissions: ["ManageGuild"],
        botPermissions: ["ModerateMembers", "KickMembers"],
        created: 1735843200
    }
};

async function handleSetup(bot, interaction, t, logger) {
    await interaction.deferReply();

    const serverData = await Server.findOne({ serverID: interaction.guild.id }).lean();
    const existingSettings = await botDetection.getSettings(interaction.guild.id);
    const logsConfigured = !!(serverData?.logs?.moderation?.webhook?.length);

    const state = {
        currentPage: 1,
        enabled: existingSettings?.enabled || false,
        allowTimeout: existingSettings?.allowTimeout ?? true,
        allowKick: existingSettings?.allowKick || false,
        logAlerts: existingSettings?.logAlerts ?? true,
        checks: {
            defaultAvatar: existingSettings?.checks?.defaultAvatar ?? true,
            accountAge10m: existingSettings?.checks?.accountAge10m ?? true,
            accountAge1h: existingSettings?.checks?.accountAge1h ?? true,
            accountAge1d: existingSettings?.checks?.accountAge1d ?? true,
            accountAge1w: existingSettings?.checks?.accountAge1w || false,
            suspiciousUsername: existingSettings?.checks?.suspiciousUsername ?? true,
            messageBehavior: existingSettings?.checks?.messageBehavior ?? true
        },
        altDetection: {
            enabled: existingSettings?.altDetection?.enabled ?? true,
            action: existingSettings?.altDetection?.action || 'log',
            timeoutDuration: existingSettings?.altDetection?.timeoutDuration || 0
        },
        logsConfigured
    };

    const pages = createSetupPages(state, t, bot, logsConfigured);
    const initialContainer = pages[state.currentPage - 1];

    const message = await interaction.editReply({
        content: null,
        components: [initialContainer],
        flags: MessageFlags.IsComponentsV2
    });

    const collector = message.createMessageComponentCollector({
        time: 600000,
        filter: i => i.user.id === interaction.user.id && i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
    });

    collector.on('collect', async i => {
        try {
            await i.deferUpdate();

            if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                return;
            }

            const customId = i.customId;

            if (customId === 'bd_save') {
                await saveConfiguration(interaction, state, t, logger);
                collector.stop('saved');
                return;
            }

            if (customId === 'bd_cancel') {
                const cancelContainer = new ContainerBuilder()
                    .setAccentColor(0xef4444)
                    .addSectionComponents(
                        new SectionBuilder()
                            .setThumbnailAccessory(
                                new ThumbnailBuilder().setURL("https://img.icons8.com/color/512/cancel--v3.png")
                            )
                            .addTextDisplayComponents(
                                new TextDisplayBuilder().setContent(`# ${e.pixel_cross} ${t('commands:bot_detection.setup_cancelled')}`)
                            )
                    );
                await i.editReply({ components: [cancelContainer] });
                collector.stop('cancelled');
                return;
            }

            if (customId === 'bd_prev') {
                if (state.currentPage > 1) state.currentPage -= 1;
            } else if (customId === 'bd_next') {
                if (state.currentPage < 3) state.currentPage += 1;
            } else if (customId === 'bd_toggle_enabled') {
                state.enabled = !state.enabled;
            } else if (customId === 'bd_toggle_timeout') {
                state.allowTimeout = !state.allowTimeout;
            } else if (customId === 'bd_toggle_kick') {
                state.allowKick = !state.allowKick;
            } else if (customId === 'bd_toggle_log') {
                state.logAlerts = !state.logAlerts;
            } else if (customId.startsWith('bd_check_')) {
                const checkName = customId.replace('bd_check_', '');
                if (state.checks.hasOwnProperty(checkName)) {
                    state.checks[checkName] = !state.checks[checkName];
                }
            } else if (customId === 'bd_toggle_alt') {
                state.altDetection.enabled = !state.altDetection.enabled;
            } else if (customId === 'bd_alt_log') {
                state.altDetection.action = 'log';
                state.altDetection.timeoutDuration = 0;
            } else if (customId === 'bd_alt_timeout') {
                state.altDetection.action = 'timeout';
            } else if (customId.startsWith('bd_alt_dur_')) {
                const duration = parseInt(customId.replace('bd_alt_dur_', ''));
                state.altDetection.timeoutDuration = duration;
            }

            const updatedPages = createSetupPages(state, t, bot, state.logsConfigured);
            const updatedContainer = updatedPages[state.currentPage - 1];
            await i.editReply({ components: [updatedContainer] });

        } catch (error) {
            logger.error("Bot detection setup interaction error:", error);
        }
    });

    collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
            try {
                const timeoutContainer = new ContainerBuilder()
                    .setAccentColor(0xef4444)
                    .addSectionComponents(
                        new SectionBuilder()
                            .setThumbnailAccessory(
                                new ThumbnailBuilder().setURL("https://img.icons8.com/color/512/cancel--v3.png")
                            )
                            .addTextDisplayComponents(
                                new TextDisplayBuilder().setContent(`## ${e.pixel_cross} ${t('commands:bot_detection.setup_timeout')}`)
                            )
                    );
                await interaction.editReply({ components: [timeoutContainer] });
            } catch (error) { }
        }
    });
}

function createSetupPages(state, t, bot, logsConfigured) {
    const pages = [];

    const page1 = new ContainerBuilder()
        .setAccentColor(0x5865f2)
        .addSectionComponents(
            new SectionBuilder()
                .setThumbnailAccessory(
                    new ThumbnailBuilder().setURL(bot.user.displayAvatarURL())
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# ${e.settings_cog_blue} ${t('commands:bot_detection.setup_title')}\n` +
                        `-# ${t('commands:bot_detection.setup_desc')}`
                    )
                )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `### ${e.blurple_mod} ${t('commands:bot_detection.core_settings')}`
            )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
        );

    page1.addSectionComponents(
        new SectionBuilder()
            .setButtonAccessory(
                new ButtonBuilder()
                    .setCustomId('bd_toggle_enabled')
                    .setStyle(state.enabled ? ButtonStyle.Success : ButtonStyle.Secondary)
                    .setLabel(state.enabled ? t('common:enabled') : t('common:disabled'))
                    .setEmoji(parseEmoji(state.enabled ? e.checkmark_green : e.red_point))
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `**${t('commands:bot_detection.enable_detection')}**\n${t('commands:bot_detection.enable_detection_desc')}`
                )
            )
    );

    page1.addSectionComponents(
        new SectionBuilder()
            .setButtonAccessory(
                new ButtonBuilder()
                    .setCustomId('bd_toggle_timeout')
                    .setStyle(state.allowTimeout ? ButtonStyle.Success : ButtonStyle.Secondary)
                    .setLabel(state.allowTimeout ? t('common:enabled') : t('common:disabled'))
                    .setEmoji(parseEmoji(state.allowTimeout ? e.checkmark_green : e.red_point))
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `**${t('commands:bot_detection.allow_timeout')}**\n${t('commands:bot_detection.allow_timeout_desc')}`
                )
            )
    );

    page1.addSectionComponents(
        new SectionBuilder()
            .setButtonAccessory(
                new ButtonBuilder()
                    .setCustomId('bd_toggle_kick')
                    .setStyle(state.allowKick ? ButtonStyle.Danger : ButtonStyle.Secondary)
                    .setLabel(state.allowKick ? t('common:enabled') : t('common:disabled'))
                    .setEmoji(parseEmoji(state.allowKick ? e.checkmark_green : e.red_point))
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `**${t('commands:bot_detection.allow_kick')}**\n${t('commands:bot_detection.allow_kick_desc')}`
                )
            )
    );

    page1.addSectionComponents(
        new SectionBuilder()
            .setButtonAccessory(
                new ButtonBuilder()
                    .setCustomId('bd_toggle_log')
                    .setStyle(state.logAlerts ? ButtonStyle.Success : ButtonStyle.Secondary)
                    .setLabel(state.logAlerts ? t('common:enabled') : t('common:disabled'))
                    .setEmoji(parseEmoji(state.logAlerts ? e.checkmark_green : e.red_point))
                    .setDisabled(!logsConfigured)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `**${t('commands:bot_detection.log_alerts')}**\n${t('commands:bot_detection.log_alerts_desc')}` +
                    (!logsConfigured ? `\n-# ${e.warning} ${t('commands:bot_detection.logs_not_configured')}` : '')
                )
            )
    );

    page1.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );
    page1.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# *${t('commands:bot_detection.page_label')} 1 / 3*`)
    );

    const page1Row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('bd_save')
            .setLabel(t('commands:bot_detection.save_button'))
            .setStyle(ButtonStyle.Success)
            .setEmoji(parseEmoji(e.checkmark_green)),
        new ButtonBuilder()
            .setCustomId('bd_cancel')
            .setLabel(t('commands:bot_detection.cancel_button'))
            .setStyle(ButtonStyle.Danger)
            .setEmoji(parseEmoji(e.deny))
    );

    const page1Row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('bd_prev')
            .setStyle(ButtonStyle.Primary)
            .setEmoji(parseEmoji(e.arrow_bwd))
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId('bd_next')
            .setStyle(ButtonStyle.Primary)
            .setEmoji(parseEmoji(e.arrow_fwd))
    );

    page1.addActionRowComponents(page1Row1);
    page1.addActionRowComponents(page1Row2);
    pages.push(page1);

    const page2 = new ContainerBuilder()
        .setAccentColor(0x5865f2)
        .addSectionComponents(
            new SectionBuilder()
                .setThumbnailAccessory(
                    new ThumbnailBuilder().setURL(bot.user.displayAvatarURL())
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# ${e.member} ${t('commands:bot_detection.detection_checks')}\n` +
                        `-# ${t('commands:bot_detection.detection_checks_desc')}`
                    )
                )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );

    const checkOptions = [
        { id: 'defaultAvatar', label: t('commands:bot_detection.check_default_avatar'), desc: t('commands:bot_detection.check_default_avatar_desc') },
        { id: 'accountAge10m', label: t('commands:bot_detection.check_age_10m'), desc: t('commands:bot_detection.check_age_10m_desc') },
        { id: 'accountAge1h', label: t('commands:bot_detection.check_age_1h'), desc: t('commands:bot_detection.check_age_1h_desc') },
        { id: 'accountAge1d', label: t('commands:bot_detection.check_age_1d'), desc: t('commands:bot_detection.check_age_1d_desc') },
        { id: 'accountAge1w', label: t('commands:bot_detection.check_age_1w'), desc: t('commands:bot_detection.check_age_1w_desc') },
        { id: 'suspiciousUsername', label: t('commands:bot_detection.check_username'), desc: t('commands:bot_detection.check_username_desc') },
        { id: 'messageBehavior', label: t('commands:bot_detection.check_message'), desc: t('commands:bot_detection.check_message_desc') }
    ];

    checkOptions.forEach(opt => {
        const isEnabled = state.checks[opt.id];
        page2.addSectionComponents(
            new SectionBuilder()
                .setButtonAccessory(
                    new ButtonBuilder()
                        .setCustomId(`bd_check_${opt.id}`)
                        .setStyle(isEnabled ? ButtonStyle.Success : ButtonStyle.Secondary)
                        .setLabel(isEnabled ? t('common:enabled') : t('common:disabled'))
                        .setEmoji(parseEmoji(isEnabled ? e.checkmark_green : e.red_point))
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`**${opt.label}**\n${opt.desc}`)
                )
        );
    });

    page2.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );
    page2.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# *${t('commands:bot_detection.page_label')} 2 / 3*`)
    );

    const page2Row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('bd_save')
            .setLabel(t('commands:bot_detection.save_button'))
            .setStyle(ButtonStyle.Success)
            .setEmoji(parseEmoji(e.checkmark_green)),
        new ButtonBuilder()
            .setCustomId('bd_cancel')
            .setLabel(t('commands:bot_detection.cancel_button'))
            .setStyle(ButtonStyle.Danger)
            .setEmoji(parseEmoji(e.deny))
    );

    const page2Row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('bd_prev')
            .setStyle(ButtonStyle.Primary)
            .setEmoji(parseEmoji(e.arrow_bwd)),
        new ButtonBuilder()
            .setCustomId('bd_next')
            .setStyle(ButtonStyle.Primary)
            .setEmoji(parseEmoji(e.arrow_fwd))
    );

    page2.addActionRowComponents(page2Row1);
    page2.addActionRowComponents(page2Row2);
    pages.push(page2);

    const page3 = new ContainerBuilder()
        .setAccentColor(0x5865f2)
        .addSectionComponents(
            new SectionBuilder()
                .setThumbnailAccessory(
                    new ThumbnailBuilder().setURL(bot.user.displayAvatarURL())
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# ${e.deny} ${t('commands:bot_detection.alt_detection')}\n` +
                        `-# ${t('commands:bot_detection.alt_detection_desc')}`
                    )
                )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );

    page3.addSectionComponents(
        new SectionBuilder()
            .setButtonAccessory(
                new ButtonBuilder()
                    .setCustomId('bd_toggle_alt')
                    .setStyle(state.altDetection.enabled ? ButtonStyle.Success : ButtonStyle.Secondary)
                    .setLabel(state.altDetection.enabled ? t('common:enabled') : t('common:disabled'))
                    .setEmoji(parseEmoji(state.altDetection.enabled ? e.checkmark_green : e.red_point))
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `**${t('commands:bot_detection.enable_alt_detection')}**\n${t('commands:bot_detection.enable_alt_detection_desc')}`
                )
            )
    );

    if (state.altDetection.enabled) {
        page3.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
        );
        page3.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**${t('commands:bot_detection.alt_action')}**\n${t('commands:bot_detection.alt_action_desc')}`
            )
        );

        const actionRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('bd_alt_log')
                .setLabel(t('commands:bot_detection.action_log_only'))
                .setStyle(state.altDetection.action === 'log' ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('bd_alt_timeout')
                .setLabel(t('commands:bot_detection.action_timeout'))
                .setStyle(state.altDetection.action === 'timeout' ? ButtonStyle.Success : ButtonStyle.Secondary)
        );
        page3.addActionRowComponents(actionRow);

        if (state.altDetection.action === 'timeout') {
            page3.addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
            );
            page3.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `**${t('commands:bot_detection.alt_timeout_duration')}**`
                )
            );

            const durations = [
                { value: 60000, label: '1m' },
                { value: 600000, label: '10m' },
                { value: 1800000, label: '30m' },
                { value: 3600000, label: '1h' },
                { value: 43200000, label: '12h' },
                { value: 86400000, label: '1d' }
            ];

            const durationRow = new ActionRowBuilder();
            durations.forEach(dur => {
                durationRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`bd_alt_dur_${dur.value}`)
                        .setLabel(dur.label)
                        .setStyle(state.altDetection.timeoutDuration === dur.value ? ButtonStyle.Success : ButtonStyle.Secondary)
                );
            });
            page3.addActionRowComponents(durationRow);
        }
    }

    page3.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );
    page3.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# *${t('commands:bot_detection.page_label')} 3 / 3*`)
    );

    const page3Row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('bd_save')
            .setLabel(t('commands:bot_detection.save_button'))
            .setStyle(ButtonStyle.Success)
            .setEmoji(parseEmoji(e.checkmark_green)),
        new ButtonBuilder()
            .setCustomId('bd_cancel')
            .setLabel(t('commands:bot_detection.cancel_button'))
            .setStyle(ButtonStyle.Danger)
            .setEmoji(parseEmoji(e.deny))
    );

    const page3Row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('bd_prev')
            .setStyle(ButtonStyle.Primary)
            .setEmoji(parseEmoji(e.arrow_bwd)),
        new ButtonBuilder()
            .setCustomId('bd_next')
            .setStyle(ButtonStyle.Primary)
            .setEmoji(parseEmoji(e.arrow_fwd))
            .setDisabled(true)
    );

    page3.addActionRowComponents(page3Row1);
    page3.addActionRowComponents(page3Row2);
    pages.push(page3);

    return pages;
}

async function saveConfiguration(interaction, state, t, logger) {
    try {
        await botDetection.saveSettings(interaction.guild.id, {
            enabled: state.enabled,
            allowTimeout: state.allowTimeout,
            allowKick: state.allowKick,
            logAlerts: state.logAlerts,
            checks: state.checks,
            altDetection: state.altDetection
        });

        const successContainer = new ContainerBuilder()
            .setAccentColor(0x10b981)
            .addSectionComponents(
                new SectionBuilder()
                    .setThumbnailAccessory(
                        new ThumbnailBuilder().setURL("https://images.icon-icons.com/1527/PNG/512/shield_106660.png")
                    )
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `# ${e.checkmark_green} ${t('commands:bot_detection.setup_success_title')}\n` +
                            `${t('commands:bot_detection.setup_success_desc')}`
                        )
                    )
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            );

        let statusText = `${e.blurple_checkmark} **${t('commands:bot_detection.detection_enabled')}:** ${state.enabled ? t('common:yes') : t('common:no')}\n`;
        statusText += `${e.blurple_checkmark} **${t('commands:bot_detection.timeout_enabled')}:** ${state.allowTimeout ? t('common:yes') : t('common:no')}\n`;
        statusText += `${e.blurple_checkmark} **${t('commands:bot_detection.kick_enabled')}:** ${state.allowKick ? t('common:yes') : t('common:no')}\n`;
        statusText += `${e.blurple_checkmark} **${t('commands:bot_detection.alt_detection_enabled')}:** ${state.altDetection.enabled ? t('common:yes') : t('common:no')}`;

        successContainer.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(statusText)
        );

        await interaction.editReply({ components: [successContainer], flags: MessageFlags.IsComponentsV2 });
    } catch (error) {
        logger.error("Failed to save bot detection settings:", error);
        const errorContainer = new ContainerBuilder()
            .setAccentColor(0xef4444)
            .addSectionComponents(
                new SectionBuilder()
                    .setThumbnailAccessory(
                        new ThumbnailBuilder().setURL("https://img.icons8.com/color/512/cancel--v3.png")
                    )
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`## ${e.pixel_cross} ${t('commands:bot_detection.save_error')}`)
                    )
            );
        await interaction.editReply({ components: [errorContainer] });
    }
}

async function handleStatus(bot, interaction, t, logger) {
    await interaction.deferReply();

    try {
        const settings = await botDetection.getSettings(interaction.guild.id);
        const serverData = await Server.findOne({ serverID: interaction.guild.id }).lean();
        const logsConfigured = !!(serverData?.logs?.moderation?.webhook?.length);

        if (!settings) {
            const container = new ContainerBuilder()
                .setAccentColor(0xfbbf24)
                .addSectionComponents(
                    new SectionBuilder()
                        .setThumbnailAccessory(
                            new ThumbnailBuilder().setURL(bot.user.displayAvatarURL())
                        )
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `# ${e.warning} ${t('commands:bot_detection.not_configured')}\n` +
                                `-# ${t('commands:bot_detection.not_configured_desc')}`
                            )
                        )
                );
            return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const container = new ContainerBuilder()
            .setAccentColor(settings.enabled ? 0x10b981 : 0x6b7280)
            .addSectionComponents(
                new SectionBuilder()
                    .setThumbnailAccessory(
                        new ThumbnailBuilder().setURL(bot.user.displayAvatarURL())
                    )
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `# ${settings.enabled ? e.checkmark_green : e.red_point} ${t('commands:bot_detection.status_title')}\n` +
                            `-# ${settings.enabled ? t('commands:bot_detection.status_enabled') : t('commands:bot_detection.status_disabled')}`
                        )
                    )
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            );

        let coreStatus = `### ${t('commands:bot_detection.core_settings')}\n`;
        coreStatus += `${settings.allowTimeout ? e.checkmark_green : e.red_point} ${t('commands:bot_detection.allow_timeout')}\n`;
        coreStatus += `${settings.allowKick ? e.checkmark_green : e.red_point} ${t('commands:bot_detection.allow_kick')}\n`;
        coreStatus += `${settings.logAlerts && logsConfigured ? e.checkmark_green : e.red_point} ${t('commands:bot_detection.log_alerts')}`;
        if (!logsConfigured) coreStatus += ` *(${t('commands:bot_detection.logs_not_setup')})*`;

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(coreStatus));

        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
        );

        const enabledChecks = Object.entries(settings.checks || {}).filter(([_, v]) => v).map(([k]) => k);
        let checksStatus = `### ${t('commands:bot_detection.active_checks')}\n`;
        checksStatus += enabledChecks.length > 0 ? enabledChecks.map(c => `${e.blurple_checkmark} ${c}`).join('\n') : `*${t('commands:bot_detection.no_checks_enabled')}*`;

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(checksStatus));

        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
        );

        let altStatus = `### ${t('commands:bot_detection.alt_detection')}\n`;
        altStatus += `${settings.altDetection?.enabled ? e.checkmark_green : e.red_point} ${t('commands:bot_detection.enable_alt_detection')}\n`;
        if (settings.altDetection?.enabled) {
            altStatus += `-# ${t('commands:bot_detection.alt_action')}: ${settings.altDetection.action === 'timeout' ? t('commands:bot_detection.action_timeout') : t('commands:bot_detection.action_log_only')}`;
        }

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(altStatus));

        await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    } catch (error) {
        logger.error("Failed to get bot detection status:", error);
        await interaction.editReply({
            content: `${e.pixel_cross} ${t('commands:bot_detection.error_generic')}`,
            components: []
        });
    }
}

// contributors: @relentiousdragon