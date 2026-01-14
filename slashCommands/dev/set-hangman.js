const { SlashCommandBuilder, MessageFlags, EmbedBuilder, WebhookClient } = require("discord.js");
const e = require("../../data/emoji.js");
const commandMeta = require("../../util/i18n.js").getCommandMetadata();
const hangmanState = require("../../util/hangman_state.js");
//
module.exports = {
    data: new SlashCommandBuilder()
        .setName("set-hangman")
        .setNameLocalizations(commandMeta['set-hangman']?.name || {})
        .setDescription("Set the daily Hangman word")
        .setDescriptionLocalizations(commandMeta['set-hangman']?.description || {})
        .addStringOption(option =>
            option.setName("word")
                .setDescription("The word for players to guess (letters only)")
                .setRequired(true)
                .setMinLength(3)
                .setMaxLength(20)
        )
        .addStringOption(option =>
            option.setName("description")
                .setDescription("Optional hint or description for the word")
                .setRequired(false)
                .setMaxLength(100)
        )
        .addBooleanOption(option =>
            option.setName("scheduled")
                .setDescription("Schedule this word for when the current one expires")
                .setRequired(false)
        ),
    integration_types: [0, 1],
    contexts: [0, 1, 2],
    dev: true,
    mod: false,
    beta: false,
    explicit: process.env.CANARY === "true" ? false : true,
    async execute(bot, interaction, funcs, settings, logger, t) {
        try {
            const word = interaction.options.getString("word");
            const description = interaction.options.getString("description");
            const scheduled = interaction.options.getBoolean("scheduled") || false;

            const cleanWord = word.toUpperCase().replace(/[^A-Z]/g, '');
            if (cleanWord.length < 3) {
                return interaction.reply({
                    content: `${e.pixel_cross} ${t('commands:set-hangman.invalid_word')}`,
                    flags: MessageFlags.Ephemeral
                });
            }

            const currentWordInfo = hangmanState.getWordInfo();
            const pendingWordInfo = hangmanState.getPendingWordInfo();

            const result = await hangmanState.setWord({
                word: cleanWord,
                description,
                setByUserId: interaction.user.id,
                setByUsername: interaction.user.username,
                scheduled
            }, bot);

            const embed = new EmbedBuilder()
                .setColor(result.scheduled ? 0xFEE75C : 0x57F287)
                .setTitle(result.scheduled
                    ? `${e.pixel_check} ${t('commands:set-hangman.word_scheduled')}`
                    : `${e.pixel_check} ${t('commands:set-hangman.word_set')}`
                )
                .addFields(
                    { name: t('commands:set-hangman.word'), value: `\`${result.word}\``, inline: true }
                )
                .setFooter({ text: 'Waterfall', iconURL: bot.user.displayAvatarURL() })
                .setTimestamp();

            if (description) {
                embed.addFields({ name: t('commands:hangman.hint'), value: description, inline: true });
            }

            if (result.scheduled) {
                embed.setDescription(pendingWordInfo
                    ? t('commands:set-hangman.replaced_scheduled_note')
                    : t('commands:set-hangman.scheduled_note')
                );

                if (pendingWordInfo) {
                    embed.addFields({
                        name: t('commands:set-hangman.previous_word'),
                        value: `\`${pendingWordInfo.word}\`${pendingWordInfo.description ? `\n> ${pendingWordInfo.description}` : ''}`,
                        inline: false
                    });
                }

                if (currentWordInfo) {
                    embed.addFields({
                        name: t('commands:set-hangman.current_word'),
                        value: `\`${currentWordInfo.word}\` (${t('commands:set-hangman.expires')} <t:${Math.floor(currentWordInfo.expiresAt / 1000)}:R>)`,
                        inline: false
                    });
                }
            } else {
                if (currentWordInfo && !result.scheduled) {
                    embed.setDescription(t('commands:set-hangman.replaced_note', {
                        solved: currentWordInfo.solved,
                        attempts: currentWordInfo.attempts
                    }));

                    embed.addFields({
                        name: t('commands:set-hangman.previous_word'),
                        value: `\`${currentWordInfo.word}\`${currentWordInfo.description ? `\n> ${currentWordInfo.description}` : ''}`,
                        inline: false
                    });
                }

                const newWordInfo = hangmanState.getWordInfo();
                if (newWordInfo) {
                    embed.addFields({
                        name: t('commands:set-hangman.expires'),
                        value: `<t:${Math.floor(newWordInfo.expiresAt / 1000)}:R>`,
                        inline: true
                    });
                }
            }

            if (!result.scheduled && pendingWordInfo) {
                embed.addFields({
                    name: t('commands:set-hangman.pending_word'),
                    value: `\`${pendingWordInfo.word}\` ${t('commands:set-hangman.pending_note')}`,
                    inline: false
                });
            }

            await interaction.reply({
                embeds: [embed]
            });

            try {
                const webhook = new WebhookClient({
                    id: settings.logWebhook[0],
                    token: settings.logWebhook[1]
                });

                const newWordInfo = hangmanState.getWordInfo();
                const logEmbed = new EmbedBuilder()
                    .setColor(result.scheduled ? 0xFEE75C : 0x5865F2)
                    .setTitle(result.scheduled ? 'Hangman Word Scheduled' : 'Hangman Word Set')
                    .addFields(
                        { name: 'Word', value: `\`${result.word}\``, inline: true },
                        { name: 'Set By', value: `${interaction.user.username} (${interaction.user.id})`, inline: true },
                        //{ name: 'Scheduled', value: result.scheduled ? 'Yes' : 'No', inline: true }
                    )
                    .setFooter({ text: 'Waterfall', iconURL: bot.user.displayAvatarURL() })
                    .setTimestamp();

                if (description) {
                    logEmbed.addFields({ name: 'Description', value: description });
                }

                if (!result.scheduled && newWordInfo) {
                    logEmbed.addFields({ name: 'Expires', value: `<t:${Math.floor(newWordInfo.expiresAt / 1000)}:F>` });
                }

                await webhook.send({ embeds: [logEmbed] });
            } catch (webhookError) {
                //
            }

        } catch (error) {
            logger.error("Error:", error);
            return interaction.reply({
                content: `${e.pixel_cross} ${error.message || t('common:error')}`,
                flags: MessageFlags.Ephemeral
            });
        }
    },
    help: {
        name: "set-hangman",
        description: "Set the daily Hangman word",
        category: "Dev",
        permissions: [],
        botPermissions: [],
        created: 1767970682
    }
};

// contributors: @relentiousdragon