const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { settings } = require("../../util/settingsModule.js");
const { i18n } = require("../../util/i18n.js");
const fs = require("fs");
const path = require("path");
const e = require("../../data/emoji.js");
//
module.exports = {
    data: new SlashCommandBuilder()
        .setName("find-locale")
        .setDescription("Get the value of a locale key")
        .addStringOption(option =>
            option.setName("locale")
                .setDescription("The language code (e.g., en, es)")
                .setAutocomplete(true)
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("key")
                .setDescription("The locale key to search for (e.g., common:error)")
                .setAutocomplete(true)
                .setRequired(true)
        ),
    integration_types: [0, 1],
    contexts: [0, 1, 2],
    dev: false,
    mod: false,
    beta: true,
    explicit: process.env.CANARY === "true" ? false : true,
    async autocomplete(interaction) {
        if (!settings.devs.includes(interaction.user.id)) return interaction.respond([]);
        const focused = interaction.options.getFocused(true);
        const localesDir = path.join(__dirname, "../../locales");

        if (focused.name === "locale") {
            const locales = fs.readdirSync(localesDir).filter(f => fs.statSync(path.join(localesDir, f)).isDirectory());
            const filtered = locales.filter(l => l.toLowerCase().includes(focused.value.toLowerCase())).slice(0, 25);
            return interaction.respond(filtered.map(l => ({ name: l, value: l })));
        }

        if (focused.name === "key") {
            const selectedLocale = interaction.options.getString("locale") || "en";
            const localePath = path.join(localesDir, selectedLocale);

            if (!fs.existsSync(localePath)) return interaction.respond([]);

            const files = fs.readdirSync(localePath).filter(f => f.endsWith(".json"));
            let allKeys = [];

            for (const file of files) {
                const ns = file.replace(".json", "");
                try {
                    const content = JSON.parse(fs.readFileSync(path.join(localePath, file), "utf8"));

                    const flatten = (obj, prefix = "") => {
                        let keys = [];
                        for (const key in obj) {
                            if (key === "_instructions") continue;
                            const fullKey = prefix ? `${prefix}.${key}` : `${ns}:${key}`;
                            if (typeof obj[key] === "object" && obj[key] !== null && !Array.isArray(obj[key])) {
                                keys = keys.concat(flatten(obj[key], fullKey));
                            } else {
                                keys.push(fullKey);
                            }
                        }
                        return keys;
                    };

                    allKeys = allKeys.concat(flatten(content));
                } catch (err) {
                    //
                }
            }

            const filtered = allKeys.filter(k => k.toLowerCase().includes(focused.value.toLowerCase())).slice(0, 25);
            return interaction.respond(filtered.map(k => ({ name: k, value: k })));
        }
    },
    async execute(bot, interaction) {
        /*if (!settings.devs.includes(interaction.user.id)) {
            return interaction.reply({ content: `${e.pixel_cross} You don't have permission to use this command.`, flags: MessageFlags.Ephemeral });
        }*/

        const locale = interaction.options.getString("locale");
        const key = interaction.options.getString("key");

        const value = i18n.t(key, { lng: locale });

        if (value === key) {
            return interaction.reply({ content: `${e.pixel_cross} Key not found or untranslated.`, flags: MessageFlags.Ephemeral });
        }

        const isLong = value.length > 1900;
        const response = `**Key:** \`${key}\` (\`${locale}\`)\n**Value:**\n${isLong ? "```" + value.substring(0, 1900) + "... (truncated)```" : "```" + value + "```"}`;

        await interaction.reply({
            content: response
        });
    },
    help: {
        name: "find-locale",
        description: "Get the value of a locale key",
        category: "Dev",
        permissions: ["tester"],
        botPermissions: [],
        created: 1766840686
    }
};

// contributors: @relentiousdragon