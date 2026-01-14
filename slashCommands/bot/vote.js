const { SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const users = require("../../schemas/users.js");
const commandMeta = require("../../util/i18n.js").getCommandMetadata();
const e = require("../../data/emoji.js");
//
module.exports = {
    data: new SlashCommandBuilder()
        .setName("vote")
        .setDescription("Vote for the bot!")
        .setNameLocalizations(commandMeta.vote.name)
        .setDescriptionLocalizations(commandMeta.vote.description),
    integration_types: [0, 1],
    contexts: [0, 1, 2],
    dev: false,
    explicit: false,
    async execute(bot, interaction, funcs, settings, logger, t) {
        const userId = interaction.user.id;
        let data = await users.findOne({ userID: userId });

        if (!data) {
            data = new users({
                userID: userId,
                name: interaction.user.username
            });
            await data.save();
        }

        const currentTime = Date.now();
        const lastVoteTime = data.lastVote?.getTime() || 0;
        const lastVoteClaimTime = data.lastVoteClaim?.getTime() || 0;
        const twelveHours = 12 * 60 * 60 * 1000;
        const reminderStatus = data.preferences?.notifications?.vote || "OFF";

        if (currentTime - lastVoteTime >= twelveHours || (!data.lastVote && !data.lastVoteClaim)) {
            return interaction.reply({
                content: `${e.pixel_unknown} ${t('commands:vote.not_voted')}`,
                flags: MessageFlags.Ephemeral
            });
        }

        if ((lastVoteClaimTime < lastVoteTime) || (data.lastVote != null && data.lastVoteClaim == null)) {
            data.lastVoteClaim = currentTime;
            await data.save();

            let reply = {
                content: t('commands:vote.thank_you')
            };

            if (reminderStatus === "OFF") {
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`vote_enable_reminders_${userId}`)
                            .setLabel(t('commands:vote.enable_reminders'))
                            .setStyle(ButtonStyle.Success)
                            .setEmoji(funcs.parseEmoji(e.yellow_point))
                    );
                reply.components = [row];
                reply.content += `\n-# ${t('commands:vote.reminders_description')}`;
            }

            return interaction.reply(reply);
        }

        if (currentTime - lastVoteTime < twelveHours) {
            const timeRemaining = lastVoteTime + twelveHours;
            return interaction.reply({
                content: `${e.blurple_star} ${t('commands:vote.already_voted', { time: Math.floor(timeRemaining / 1000) })}`,
                flags: MessageFlags.Ephemeral
            });
        }
    },
    async handleButton(bot, interaction, t, logger) {
        if (interaction.customId.startsWith('vote_enable_reminders_')) {
            const targetId = interaction.customId.split('_')[3];
            if (interaction.user.id !== targetId) {
                return interaction.reply({ content: `${e.pixel_cross} ${t('common:pagination.not_for_you')}`, flags: MessageFlags.Ephemeral });
            }

            const data = await users.findOne({ userID: interaction.user.id });
            const currentStatus = data?.preferences?.notifications?.vote || "OFF";

            if (currentStatus !== "OFF") {
                return interaction.reply({
                    content: `${e.deny} ${t('commands:vote.reminders_already_enabled')}\n-# ${t('commands:vote.manage_preferences')}`,
                    flags: MessageFlags.Ephemeral
                });
            }

            await users.updateOne(
                { userID: interaction.user.id },
                { $set: { "preferences.notifications.vote": "DM" } }
            );

            return interaction.reply({
                content: `${e.checkmark_green} ${t('commands:vote.reminders_enabled')}\n-# ${t('commands:vote.manage_preferences')}`,
                flags: MessageFlags.Ephemeral
            });
        }
    },
    help: {
        name: "vote",
        description: "Vote for the bot!",
        category: "Bot",
        permissions: [],
        botPermissions: [],
        created: 1764938508
    }
};

// contributors: @relentiousdragon