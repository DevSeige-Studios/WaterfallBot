const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { settings, saveSettings } = require("../../util/settingsModule.js");
const e = require("../../data/emoji.js");
//
module.exports = {
    data: new SlashCommandBuilder()
        .setName("add-beta")
        .setDescription("Add a user to the beta testers list (DEV ONLY)")
        .addStringOption(option =>
            option.setName("user_id")
                .setDescription("The user ID to add")
                .setRequired(true)
        ),
    integration_types: [0, 1],
    contexts: [0, 1, 2],
    dev: true,
    mod: false,
    beta: false,
    explicit: process.env.CANARY === "true" ? false : true,
    async execute(bot, interaction) {
        if (!settings.devs.includes(interaction.user.id)) {
            return interaction.reply({ content: `${e.pixel_cross} You don't have permission to use this command.`, flags: MessageFlags.Ephemeral });
        }

        const userId = interaction.options.getString("user_id");

        if (settings.testers.includes(userId)) {
            return interaction.reply({ content: `${e.pixel_cross} User \`${userId}\` is already a beta tester.`, flags: MessageFlags.Ephemeral });
        }

        settings.testers.push(userId);
        saveSettings();

        await interaction.reply({
            content: `${e.pixel_check} Added \`${userId}\` to ${process.env.CANARY == true ? 'canary testers.' : 'beta testers.'}`
        });
    },
    help: {
        name: "add-beta",
        description: "Add a user to the beta testers list",
        category: "Dev",
        permissions: ["developer"],
        botPermissions: [],
        created: 1767953282
    }
};

// contributors: @relentiousdragon