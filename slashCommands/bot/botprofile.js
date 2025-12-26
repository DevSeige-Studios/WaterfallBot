const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const { Server } = require("../../schemas/servers.js");
const path = require("path");
const fs = require("fs");
const e = require("../../data/emoji.js");
const commandMeta = require("../../util/i18n.js").getCommandMetadata();
//
module.exports = {
    data: new SlashCommandBuilder()
        .setName("botprofile")
        .setNameLocalizations(commandMeta.botprofile.name || {})
        .setDescription("Change the bot's profile picture and banner for this server")
        .setDescriptionLocalizations(commandMeta.botprofile.description || {})
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName("profile")
                .setNameLocalizations(commandMeta.botprofile.options_profile_name || {})
                .setDescription("The profile theme to apply")
                .setDescriptionLocalizations(commandMeta.botprofile.options_profile_description || {})
                .setRequired(true)
                .addChoices(
                    { name: "Default", value: "default" },
                    { name: "Crimson", value: "crimson" },
                    { name: "Azure", value: "azure" },
                    { name: "Azure (Glow)", value: "azure_glow" }
                )
        ),
    integration_types: [0],
    contexts: [0],
    dev: false,
    mod: false,
    beta: true,
    explicit: false,
    async execute(bot, interaction, funcs, settings, logger, t) {
        const profile = interaction.options.getString("profile");
        const guildId = interaction.guild.id;

        const assetsDir = path.join(__dirname, "../../assets");
        const profiles = {
            default: {
                avatar: "Waterfall_avatar.webp",
                banner: "Waterfall_banner.png"
            },
            crimson: {
                avatar: "Waterfall_avatar2_red.png",
                banner: "Waterfall_banner2_red.png"
            },
            azure: {
                avatar: "Waterfall_avatar2_blue.png",
                banner: "Waterfall_banner2_blue.png"
            },
            azure_glow: {
                avatar: "Waterfall_avatar2_blue_glow.png",
                banner: "Waterfall_banner2_blue_glow.png"
            }
        };

        const selected = profiles[profile];
        if (!selected) {
            return interaction.reply({ content: "Invalid profile selected.", flags: MessageFlags.Ephemeral });
        }

        const profileNames = {
            default: "Default",
            crimson: "Crimson",
            azure: "Azure",
            azure_glow: "Azure (Glow)"
        };

        const COOLDOWN = 600000;
        try {
            const serverData = await Server.findOne({ serverID: guildId });
            if (serverData) {
                if (serverData.botProfile === profile) {
                    const formattedProfile = profileNames[profile] || (profile.charAt(0).toUpperCase() + profile.slice(1));
                    return interaction.reply({
                        content: t("commands:botprofile.already_set", { profile: formattedProfile }),
                        flags: MessageFlags.Ephemeral
                    });
                }
                if (serverData.botProfileLastUpdate) {
                    const diff = Date.now() - serverData.botProfileLastUpdate;
                    if (diff < COOLDOWN) {
                        const nextUpdate = Math.floor((serverData.botProfileLastUpdate + COOLDOWN) / 1000);
                        return interaction.reply({
                            content: t("commands:botprofile.cooldown", { time: `<t:${nextUpdate}:R>` }),
                            flags: MessageFlags.Ephemeral
                        });
                    }
                }
            }
        } catch (err) { logger.error("[BotProfile] Cooldown check failed:", err); }

        await interaction.reply({ content: `${e.loading} ${t("common:loading")}` });

        try {
            const avatarPath = path.join(assetsDir, selected.avatar);
            const bannerPath = path.join(assetsDir, selected.banner);

            let avatarDataUri = null;
            let bannerDataUri = null;

            try {
                if (fs.existsSync(avatarPath)) {
                    const avatarBuffer = fs.readFileSync(avatarPath);
                    const ext = path.extname(avatarPath).substring(1);
                    avatarDataUri = `data:image/${ext};base64,${avatarBuffer.toString('base64')}`;
                }
                if (fs.existsSync(bannerPath)) {
                    const bannerBuffer = fs.readFileSync(bannerPath);
                    const ext = path.extname(bannerPath).substring(1);
                    bannerDataUri = `data:image/${ext};base64,${bannerBuffer.toString('base64')}`;
                }
            } catch (fileErr) {
                logger.error(`[BotProfile] Failed to read assets for ${profile}:`, fileErr);
                return interaction.editReply({ content: `Error: Could not find asset files for ${profile}.` });
            }

            logger.debug(`[BotProfile] Sending PATCH to /guilds/${guildId}/members/@me for profile ${profile}`);

            await interaction.client.rest.patch(`/guilds/${guildId}/members/@me`, {
                body: {
                    avatar: avatarDataUri,
                    banner: bannerDataUri
                },
                reason: `Bot profile changed to ${profile} by ${interaction.user.tag}`
            });

            await Server.findOneAndUpdate(
                { serverID: guildId },
                { botProfile: profile, botProfileLastUpdate: Date.now() },
                { upsert: true }
            );

            const formattedProfile = profileNames[profile] || (profile.charAt(0).toUpperCase() + profile.slice(1));

            await interaction.editReply({
                content: t("commands:botprofile.success", { profile: formattedProfile })
            });

        } catch (error) {
            logger.error("[BotProfile] Error updating profile:", error);

            const apiMsg = error.message || error.rawError?.message;

            if (apiMsg && apiMsg.includes("AVATAR_RATE_LIMIT")) {
                return interaction.editReply({ content: t("commands:botprofile.rate_limited") });
            }

            return interaction.editReply({ content: t("commands:botprofile.error") });
        }
    },
    help: {
        name: "botprofile",
        description: "Change the bot's profile picture and banner for the current server",
        category: "Bot",
        permissions: ["Administrator"],
        botPermissions: [],
        created: 1766749709
    }
};
