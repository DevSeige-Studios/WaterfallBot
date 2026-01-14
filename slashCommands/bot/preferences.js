const { SlashCommandBuilder, MessageFlags, ContainerBuilder, SectionBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ButtonBuilder, ButtonStyle, ActionRowBuilder, ThumbnailBuilder } = require("discord.js");
const users = require("../../schemas/users.js");
const commandMeta = require("../../util/i18n.js").getCommandMetadata();
const e = require("../../data/emoji.js");
const funcs = require("../../util/functions.js");
//
module.exports = {
    data: new SlashCommandBuilder()
        .setName("preferences")
        .setDescription("Manage your preferences related to the usage of Waterfall")
        .setNameLocalizations(commandMeta.preferences.name)
        .setDescriptionLocalizations(commandMeta.preferences.description)
        .addSubcommand(subcommand =>
            subcommand
                .setName("notifications")
                .setDescription("Manage your notification settings")
                .setNameLocalizations(commandMeta.preferences.option_notifications_name)
                .setDescriptionLocalizations(commandMeta.preferences.option_notifications_description)
        ),
    integration_types: [0, 1],
    contexts: [0, 1, 2],
    dev: false,
    explicit: false,
    async execute(bot, interaction, funcs, settings, logger, t) {
        try {
            const userId = interaction.user.id;
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === "notifications") {
                let userDoc = await users.findOne({ userID: userId });
                if (!userDoc) {
                    userDoc = new users({ userID: userId });
                    await userDoc.save();
                }

                const container = buildNotificationsContainer(userDoc, t, interaction.user, funcs);

                await interaction.reply({
                    components: [container],
                    flags: MessageFlags.IsComponentsV2
                });
            }

        } catch (error) {
            logger.error("[/Preferences] Error executing command:", error);
            return interaction.reply({
                content: `${e.pixel_cross} ${t('common:error')}`,
                flags: MessageFlags.Ephemeral
            });
        }
    },
    async handleButton(bot, interaction, t, logger) {
        const userId = interaction.user.id;
        const customId = interaction.customId;

        //preferences_[action]_[userId]
        const parts = customId.split('_');
        const action = parts[1];
        const targetUserId = parts[2];

        if (userId !== targetUserId) {
            return interaction.reply({
                content: `${e.deny} ${t('common:pagination.not_for_you')}`,
                flags: MessageFlags.Ephemeral
            });
        }

        let userDoc = await users.findOne({ userID: userId });
        if (!userDoc) return;

        if (action === "toggleVote") {
            const current = userDoc.preferences?.notifications?.vote || "OFF";
            let nextState = "OFF";
            if (current === "OFF") nextState = "DM";
            else if (current === "DM") nextState = "INTERACTION";
            else if (current === "INTERACTION") nextState = "OFF";

            if (!userDoc.preferences) userDoc.preferences = {};
            if (!userDoc.preferences.notifications) userDoc.preferences.notifications = {};

            userDoc.preferences.notifications.vote = nextState;
            await userDoc.save();

            const container = buildNotificationsContainer(userDoc, t, interaction.user, funcs);
            await interaction.update({
                components: [container],
                flags: MessageFlags.IsComponentsV2
            });
        } else if (action === "toggleVoteThanks") {
            const current = userDoc.preferences?.notifications?.voteThanks || "DM";
            let nextState = current === "OFF" ? "DM" : "OFF";

            if (!userDoc.preferences) userDoc.preferences = {};
            if (!userDoc.preferences.notifications) userDoc.preferences.notifications = {};

            userDoc.preferences.notifications.voteThanks = nextState;
            await userDoc.save();

            const container = buildNotificationsContainer(userDoc, t, interaction.user, funcs);
            await interaction.update({
                components: [container],
                flags: MessageFlags.IsComponentsV2
            });
        } else if (action === "enableAll") {
            if (!userDoc.preferences) userDoc.preferences = {};
            if (!userDoc.preferences.notifications) userDoc.preferences.notifications = {};

            userDoc.preferences.notifications.vote = "DM";
            userDoc.preferences.notifications.voteThanks = "DM";
            userDoc.preferences.notifications.voteNotice = true;

            await userDoc.save();
            const container = buildNotificationsContainer(userDoc, t, interaction.user, funcs);
            await interaction.update({
                components: [container],
                flags: MessageFlags.IsComponentsV2
            });
        } else if (action === "disableAll") {
            if (!userDoc.preferences) userDoc.preferences = {};
            if (!userDoc.preferences.notifications) userDoc.preferences.notifications = {};

            userDoc.preferences.notifications.vote = "OFF";
            userDoc.preferences.notifications.voteThanks = "OFF";
            userDoc.preferences.notifications.voteNotice = false;

            await userDoc.save();
            const container = buildNotificationsContainer(userDoc, t, interaction.user, funcs);
            await interaction.update({
                components: [container],
                flags: MessageFlags.IsComponentsV2
            });
        }
    },
    help: {
        name: "preferences",
        description: "Manage your preferences related to the usage of Waterfall",
        category: "Bot",
        permissions: [],
        botPermissions: [],
        created: 1768221831
    }
};

function buildNotificationsContainer(userDoc, t, user, funcs) {
    const voteStatus = userDoc.preferences?.notifications?.vote || "OFF";

    let nextState = "OFF";
    if (voteStatus === "OFF") nextState = "DM";
    else if (voteStatus === "DM") nextState = "INTERACTION";

    let btnStyle = ButtonStyle.Secondary;
    let btnEmoji = e.red_point;
    let btnLabel = t('common:disabled');

    if (voteStatus === "DM") {
        btnStyle = ButtonStyle.Success;
        btnEmoji = e.checkmark_green;
        btnLabel = t('common:dm');
    } else if (voteStatus === "INTERACTION") {
        btnStyle = ButtonStyle.Primary;
        btnEmoji = e.chain;
        btnLabel = t('common:interaction');
    }

    const thanksStatus = userDoc.preferences?.notifications?.voteThanks || "DM";
    let thanksBtnStyle = thanksStatus === "DM" ? ButtonStyle.Success : ButtonStyle.Secondary;
    let thanksBtnEmoji = thanksStatus === "DM" ? e.checkmark_green : e.red_point;
    let thanksBtnLabel = thanksStatus === "DM" ? t('common:dm') : t('common:disabled');



    const container = new ContainerBuilder()
        .setAccentColor(0x5865F2)
        .addSectionComponents(
            new SectionBuilder()
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(user.displayAvatarURL()))
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`# ${e.settings_cog_blue} ${t('commands:preferences.title')}`),
                    new TextDisplayBuilder().setContent(`-# ${t('commands:preferences.option_notifications_description')}`)
                )
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`### ${e.discord_orbs} ${t('commands:vote.reminders_title')}`),
                new TextDisplayBuilder().setContent(t('commands:preferences.vote_reminders_desc')),
            )
            .setButtonAccessory(
                new ButtonBuilder()
                    .setCustomId(`preferences_toggleVote_${userDoc.userID}`)
                    .setLabel(btnLabel)
                    .setStyle(btnStyle)
                    .setEmoji(funcs.parseEmoji(btnEmoji))
            )
    );

    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`### ${e.moyai} ${t('commands:preferences.vote_thanks_title')}`),
                new TextDisplayBuilder().setContent(t('commands:preferences.vote_thanks_desc')),
            )
            .setButtonAccessory(
                new ButtonBuilder()
                    .setCustomId(`preferences_toggleVoteThanks_${userDoc.userID}`)
                    .setLabel(thanksBtnLabel)
                    .setStyle(thanksBtnStyle)
                    .setEmoji(funcs.parseEmoji(thanksBtnEmoji))
            )
    );

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`preferences_enableAll_${userDoc.userID}`)
                .setLabel(t('commands:preferences.enable_all'))
                .setStyle(ButtonStyle.Secondary)
                .setEmoji(funcs.parseEmoji(e.green_point)),
            new ButtonBuilder()
                .setCustomId(`preferences_disableAll_${userDoc.userID}`)
                .setLabel(t('commands:preferences.disable_all'))
                .setStyle(ButtonStyle.Secondary)
                .setEmoji(funcs.parseEmoji(e.red_point))
        )
    );

    return container;
}

// contributors: @relentiousdragon