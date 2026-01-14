const { SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { settings } = require("../../util/settingsModule.js");
const e = require("../../data/emoji.js");
//
module.exports = {
    data: new SlashCommandBuilder()
        .setName("find-emoji")
        .setDescription("Search for an emoji and get its value (DEV ONLY)")
        .addStringOption(option =>
            option.setName("emoji")
                .setDescription("The emoji key to search for")
                .setAutocomplete(true)
                .setRequired(true)
        ),
    integration_types: [0, 1],
    contexts: [0, 1, 2],
    dev: true,
    mod: false,
    beta: false,
    explicit: false,
    explicit: process.env.CANARY === "true" ? false : true,
    async autocomplete(interaction) {
        if (!settings.devs.includes(interaction.user.id)) return interaction.respond([]);
        const focused = interaction.options.getFocused();
        const emojiKeys = Object.keys(e.raw);

        let choices = [];
        if (!focused) {
            choices = emojiKeys.slice(0, 25);
        } else {
            const lower = focused.toLowerCase();
            choices = emojiKeys.filter(k => k.toLowerCase().includes(lower)).slice(0, 25);
        }

        return interaction.respond(choices.map(k => ({ name: k, value: k })));
    },
    async execute(bot, interaction, funcs, settings, logger) {
        if (!settings.devs.includes(interaction.user.id)) {
            return interaction.reply({
                content: `${e.pixel_cross} You don't have permission to use this command.`,
                flags: MessageFlags.Ephemeral
            });
        }

        const emojiKey = interaction.options.getString("emoji");
        const rawEmoji = e.raw[emojiKey];

        if (!rawEmoji) {
            return interaction.reply({
                content: `${e.pixel_cross} Emoji not found.`,
                flags: MessageFlags.Ephemeral
            });
        }

        const emojiValue = rawEmoji.match(/\d+/)?.[0] || rawEmoji;
        const isCanary = process.env.CANARY === "true";

        const content = isCanary
            ? `ID: ${emojiValue}`
            : `${e.ID} ${emojiValue} : ${rawEmoji}`;

        const components = [];

        const parsedEmoji = funcs.parseEmoji(rawEmoji);

        const rowDisabled = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("emoji_preview_primary_disabled")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true)
                .setEmoji(parsedEmoji),

            new ButtonBuilder()
                .setCustomId("emoji_preview_secondary_disabled")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
                .setEmoji(parsedEmoji),

            new ButtonBuilder()
                .setCustomId("emoji_preview_danger_disabled")
                .setStyle(ButtonStyle.Danger)
                .setDisabled(true)
                .setEmoji(parsedEmoji),

            new ButtonBuilder()
                .setCustomId("emoji_preview_success_disabled")
                .setStyle(ButtonStyle.Success)
                .setDisabled(true)
                .setEmoji(parsedEmoji)
        );

        const isAnimated = rawEmoji.startsWith('<a:');
        const customIdBase = `find_emoji_p_${emojiValue}_${isAnimated ? '1' : '0'}`;

        const rowEnabled = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`${customIdBase}_primary`)
                .setStyle(ButtonStyle.Primary)
                .setEmoji(parsedEmoji),

            new ButtonBuilder()
                .setCustomId(`${customIdBase}_secondary`)
                .setStyle(ButtonStyle.Secondary)
                .setEmoji(parsedEmoji),

            new ButtonBuilder()
                .setCustomId(`${customIdBase}_danger`)
                .setStyle(ButtonStyle.Danger)
                .setEmoji(parsedEmoji),

            new ButtonBuilder()
                .setCustomId(`${customIdBase}_success`)
                .setStyle(ButtonStyle.Success)
                .setEmoji(parsedEmoji)
        );

        components.push(rowDisabled, rowEnabled);

        await interaction.reply({
            content,
            components
        });
    },
    help: {
        name: "find-emoji",
        description: "Search for an emoji and get its value",
        category: "Dev",
        permissions: ["moderator"],
        botPermissions: [],
        created: 1766840686
    }
};

// contributors: @relentiousdragon