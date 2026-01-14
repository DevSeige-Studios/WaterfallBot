const { SlashCommandBuilder, MessageFlags, TextDisplayBuilder, ThumbnailBuilder, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, MediaGalleryBuilder, MediaGalleryItemBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ContainerBuilder } = require('discord.js');
const axios = require('axios');
const e = require("../../data/emoji.js");
const commandMeta = require("../../util/i18n.js").getCommandMetadata();

const GITHUB_API = "https://api.github.com";
const SNAZ_API = "https://api.snaz.in/v2";

const axiosConfig = {
    headers: {
        'User-Agent': 'WaterfallBot (https://github.com/DevSiege-Studios/WaterfallBot)'
    },
    timeout: 7000
};

function getFlag(location) {
    if (!location) return null;
    if (/\p{Emoji}/u.test(location)) return null;

    const loc = location.toLowerCase();
    const countryMap = {
        "united states": "🇺🇸", "usa": "🇺🇸", "u.s.a": "🇺🇸",
        "united kingdom": "🇬🇧", "uk": "🇬🇧", "u.k": "🇬🇧", "england": "🇬🇧",
        "canada": "🇨🇦", "australia": "🇦🇺", "germany": "🇩🇪", "deutschland": "🇩🇪",
        "france": "🇫🇷", "italy": "🇮🇹", "italia": "🇮🇹", "spain": "🇪🇸", "españa": "🇪🇸",
        "japan": "🇯🇵", "china": "🇨🇳", "russia": "🇷🇺", "brazil": "🇧🇷", "brasil": "🇧🇷",
        "india": "🇮🇳", "netherlands": "🇳🇱", "sweden": "🇸🇪", "norway": "🇳🇴",
        "denmark": "🇩🇰", "finland": "🇫🇮", "switzerland": "🇨🇭", "austria": "🇦🇹",
        "belgium": "🇧🇪", "portugal": "🇵🇹", "mexico": "🇲🇽", "argentina": "🇦🇷",
        "turkey": "🇹🇷", "türkiye": "🇹🇷", "south korea": "🇰🇷", "poland": "🇵🇱",
        "ukraine": "🇺🇦", "greece": "🇬🇷", "ireland": "🇮🇪", "new zealand": "🇳🇿"
    };

    for (const [name, flag] of Object.entries(countryMap)) {
        if (loc.includes(name)) return flag;
    }

    const parts = location.trim().split(/[\s,]+/);
    const last = parts[parts.length - 1]?.toUpperCase();
    if (!last || last.length !== 2) return null;

    const usStates = ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"];
    if (usStates.includes(last)) return "🇺🇸";

    const countryCodes = ["AF", "AX", "AL", "DZ", "AS", "AD", "AO", "AI", "AQ", "AG", "AR", "AM", "AW", "AU", "AT", "AZ", "BS", "BH", "BD", "BB", "BY", "BE", "BZ", "BJ", "BM", "BT", "BO", "BA", "BW", "BV", "BR", "IO", "BN", "BG", "BF", "BI", "KH", "CM", "CA", "CV", "KY", "CF", "TD", "CL", "CN", "CX", "CC", "CO", "KM", "CG", "CD", "CK", "CR", "CI", "HR", "CU", "CY", "CZ", "DK", "DJ", "DM", "DO", "EC", "EG", "SV", "GQ", "ER", "EE", "ET", "FK", "FO", "FJ", "FI", "FR", "GF", "PF", "TF", "GA", "GM", "GE", "DE", "GH", "GI", "GR", "GL", "GD", "GP", "GU", "GT", "GG", "GN", "GW", "GY", "HT", "HM", "VA", "HN", "HK", "HU", "IS", "IN", "ID", "IR", "IQ", "IE", "IM", "IL", "IT", "JM", "JP", "JE", "JO", "KZ", "KE", "KI", "KP", "KR", "KW", "KG", "LA", "LV", "LB", "LS", "LR", "LY", "LI", "LT", "LU", "MO", "MK", "MG", "MW", "MY", "MV", "ML", "MT", "MH", "MQ", "MR", "MU", "YT", "MX", "FM", "MD", "MC", "MN", "MS", "MA", "MZ", "MM", "NA", "NR", "NP", "NL", "AN", "NC", "NZ", "NI", "NE", "NG", "NU", "NF", "MP", "NO", "OM", "PK", "PW", "PS", "PA", "PG", "PY", "PE", "PH", "PN", "PL", "PT", "PR", "QA", "RE", "RO", "RU", "RW", "SH", "KN", "LC", "PM", "VC", "WS", "SM", "ST", "SA", "SN", "CS", "SC", "SL", "SG", "SK", "SI", "SB", "SO", "ZA", "GS", "ES", "LK", "SD", "SR", "SJ", "SZ", "SE", "CH", "SY", "TW", "TJ", "TZ", "TH", "TL", "TG", "TK", "TO", "TT", "TN", "TR", "TM", "TC", "TV", "UG", "UA", "AE", "GB", "US", "UM", "UY", "UZ", "VU", "VE", "VN", "VG", "VI", "WF", "EH", "YE", "ZM", "ZW"];
    if (countryCodes.includes(last)) {
        return String.fromCodePoint(...[...last].map(c => c.charCodeAt(0) + 127397));
    }

    return null;
}
//
module.exports = {
    data: new SlashCommandBuilder()
        .setName("github")
        .setNameLocalizations(commandMeta.github.name)
        .setDescription("Get information about GitHub users or repositories")
        .setDescriptionLocalizations(commandMeta.github.description)
        .addSubcommand(sub =>
            sub.setName("user")
                .setNameLocalizations(commandMeta.github.user_name)
                .setDescription("Get information about a GitHub user")
                .setDescriptionLocalizations(commandMeta.github.user_description)
                .addStringOption(o => o.setName("username").setNameLocalizations(commandMeta.github.option_username_name).setDescription("GitHub username").setDescriptionLocalizations(commandMeta.github.option_username_description).setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName("repo")
                .setNameLocalizations(commandMeta.github.repo_name)
                .setDescription("Get information about a GitHub repository")
                .setDescriptionLocalizations(commandMeta.github.repo_description)
                .addStringOption(o => o.setName("owner").setNameLocalizations(commandMeta.github.option_owner_name).setDescription("GitHub repository owner").setDescriptionLocalizations(commandMeta.github.option_owner_description).setRequired(true))
                .addStringOption(o => o.setName("repo").setNameLocalizations(commandMeta.github.option_repo_name).setDescription("GitHub repository name").setDescriptionLocalizations(commandMeta.github.option_repo_description).setRequired(true))
        ),
    integration_types: [0, 1],
    contexts: [0, 1, 2],
    dev: false,
    mod: false,
    beta: false,
    explicit: false,
    async execute(bot, interaction, funcs, settings, logger, t) {
        const sub = interaction.options.getSubcommand();

        try {
            if (sub === "user") {
                await interaction.deferReply();
                const username = interaction.options.getString("username");

                try {
                    const [res, socialsRes] = await Promise.all([
                        axios.get(`${GITHUB_API}/users/${username}`, axiosConfig),
                        axios.get(`${GITHUB_API}/users/${username}/social_accounts`, axiosConfig).catch(() => ({ data: [] }))
                    ]);

                    const user = res.data;
                    const socials = socialsRes.data || [];

                    const websiteLink = socials.find(s => s.provider === "generic")?.url || user.blog;
                    const twitterHandle = user.twitter_username || (socials.find(s => s.provider === "twitter")?.url?.split('/').pop());

                    const bio = user.bio?.trim()
                        ? `-# ${funcs.truncate(user.bio, 150)}`
                        : `-# ${t('commands:github.public_repos')}: **${user.public_repos.toLocaleString()}**`;

                    const container = new ContainerBuilder()
                        .setAccentColor(0x2b3137)
                        .addSectionComponents(
                            new SectionBuilder()
                                .setThumbnailAccessory(new ThumbnailBuilder().setURL(user.avatar_url))
                                .addTextDisplayComponents(
                                    new TextDisplayBuilder().setContent(`# ${e.icon_github}${user.name || user.login}`),
                                    new TextDisplayBuilder().setContent(bio)
                                )
                        )
                        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))

                    const stats = [
                        new TextDisplayBuilder().setContent(`${e.member} **${user.followers.toLocaleString()}** ${t('commands:github.followers')}  ·  **${user.following.toLocaleString()}** ${t('commands:github.following')}`)
                    ];

                    if (user.bio?.trim()) {
                        stats.push(new TextDisplayBuilder().setContent(`${e.channel} ${t('commands:github.public_repos')}: **${user.public_repos.toLocaleString()}**`));
                    }

                    if (user.public_gists > 0) {
                        stats.push(new TextDisplayBuilder().setContent(`${e.icon_githubDesktop} ${t('commands:github.public_gists')}: **${user.public_gists.toLocaleString()}**`));
                    }

                    container.addTextDisplayComponents(...stats);

                    const details = [];
                    const ensureLink = (url) => url.startsWith('http') ? url : `https://${url}`;

                    if (user.company?.trim()) details.push(`${e.members} ${t('commands:github.company')}: **${user.company.trim()}**`);
                    if (user.location?.trim()) {
                        const flag = getFlag(user.location.trim());
                        details.push(`${e.globe} ${t('commands:github.location')}: **${user.location.trim()}** ${flag || ''}`);
                    }
                    if (websiteLink?.trim()) {
                        const blog = websiteLink.trim();
                        const blogLabel = blog.split('/').filter(Boolean).pop();
                        details.push(`${e.website} ${t('commands:github.website')}: **[${blogLabel}](${ensureLink(blog)})**`);
                    }
                    if (process.env.CANARY === "true" && user.email?.trim()) {
                        details.push(`${e.email} ${t('commands:github.email')}: **${user.email.trim()}**`);
                    }
                    if (twitterHandle?.trim()) {
                        details.push(`${e.icon_twitter} ${t('commands:github.twitter')}: **[@${twitterHandle.trim().replace(/^@/, '')}](https://x.com/${twitterHandle.trim().replace(/^@/, '')})**`);
                    }

                    const providerMap = {
                        discord: e.icon_discord,
                        youtube: e.icon_youtube,
                        reddit: e.icon_reddit,
                        facebook: e.icon_facebook,
                        instagram: e.icon_instagram,
                        linkedin: e.icon_linkedIn
                    };

                    socials.forEach(s => {
                        if (["generic", "twitter"].includes(s.provider)) return;
                        const icon = providerMap[s.provider] || e.invite;
                        const label = s.url.split('/').filter(Boolean).pop();
                        details.push(`${icon} ${s.provider.charAt(0).toUpperCase() + s.provider.slice(1)}: **[${label}](${s.url})**`);
                    });

                    if (details.length > 0) {
                        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                            .addTextDisplayComponents(...details.map(d => new TextDisplayBuilder().setContent(d)));
                    }

                    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(`-# ${t('commands:github.created_at')}: <t:${Math.floor(new Date(user.created_at).getTime() / 1000)}:R>  •  ${t('commands:github.updated_at')}: <t:${Math.floor(new Date(user.updated_at).getTime() / 1000)}:R>`)
                        )
                        .addActionRowComponents(
                            new ActionRowBuilder()
                                .addComponents(
                                    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t('commands:github.view_profile')).setURL(user.html_url)
                                )
                        );

                    return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
                } catch (error) {
                    if (error.response?.status === 404) {
                        return interaction.editReply({ content: `${e.pixel_cross} ${t('commands:github.user_not_found')}` });
                    }
                    throw error;
                }
            }

            if (sub === "repo") {
                await interaction.deferReply();
                const owner = interaction.options.getString("owner");
                const repoName = interaction.options.getString("repo");

                try {
                    const [repoRes, snazRes] = await Promise.all([
                        axios.get(`${GITHUB_API}/repos/${owner}/${repoName}`, axiosConfig),
                        axios.get(`${SNAZ_API}/github/used-by/${owner}/${repoName}`, axiosConfig).catch(() => ({ data: { ok: false } }))
                    ]);

                    const repo = repoRes.data;
                    const snaz = snazRes.data;

                    const container = new ContainerBuilder()
                        .setAccentColor(0x238636)
                        .addSectionComponents(
                            new SectionBuilder()
                                .setThumbnailAccessory(new ThumbnailBuilder().setURL(repo.owner.avatar_url))
                                .addTextDisplayComponents(
                                    new TextDisplayBuilder().setContent(`# ${e.icon_github} ${repo.name}`),
                                    new TextDisplayBuilder().setContent(`-# ${funcs.truncate(repo.description, 150) || "..."}`)
                                )
                        )
                        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(`${e.pixel_star} ${t('commands:github.stars')}: **${repo.stargazers_count.toLocaleString()}**`),
                            new TextDisplayBuilder().setContent(`${e.join} ${t('commands:github.forks')}: **${repo.forks_count.toLocaleString()}**`),
                            new TextDisplayBuilder().setContent(`${e.preview} ${t('commands:github.watchers')}: **${repo.subscribers_count.toLocaleString()}**`),
                            new TextDisplayBuilder().setContent(`${e.warning} ${t('commands:github.issues')}: **${repo.open_issues_count.toLocaleString()}**`)
                        );

                    const details = [];
                    const ensureLink = (url) => url.startsWith('http') ? url : `https://${url}`;

                    if (repo.language?.trim()) details.push(`${e.language} ${t('commands:github.language')}: **${repo.language.trim()}**`);
                    if (repo.license?.name?.trim()) details.push(`${e.archive} ${t('commands:github.license')}: **${repo.license.name.trim()}**`);
                    if (repo.homepage?.trim()) {
                        const homepage = repo.homepage.trim();
                        const homeLabel = homepage.split('/').filter(Boolean).pop();
                        details.push(`${e.website} ${t('commands:github.website')}: **[${homeLabel}](${ensureLink(homepage)})**`);
                    }
                    if (repo.visibility?.trim()) details.push(`${repo.visibility.trim() === 'public' ? e.channel : e.locked_channel} ${t('commands:github.visibility')}: **${repo.visibility.trim().toUpperCase()}**`);

                    if (details.length > 0) {
                        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                            .addTextDisplayComponents(...details.map(d => new TextDisplayBuilder().setContent(d)));
                    }

                    if (snaz.ok) {
                        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                            .addTextDisplayComponents(
                                new TextDisplayBuilder().setContent(`${e.member} ${t('commands:github.used_by')}: **${snaz.used_by?.formatted || snaz.used_by?.value?.toLocaleString() || "0"}**`),
                                new TextDisplayBuilder().setContent(`${e.archive} ${t('commands:github.used_by_packages')}: **${snaz.used_by_packages?.formatted || snaz.used_by_packages?.value?.toLocaleString() || "0"}**`)
                            );

                        if (snaz.repos && snaz.repos.length > 0) {
                            const gallery = new MediaGalleryBuilder();
                            snaz.repos.slice(0, 4).forEach(r => {
                                if (r.icon) gallery.addItems(new MediaGalleryItemBuilder().setURL(r.icon));
                            });

                            if (gallery.items.length > 0) {
                                container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${t('commands:github.recent_users')}`))
                                    .addMediaGalleryComponents(gallery);
                            }
                        }
                    }

                    if (repo.topics && repo.topics.length > 0) {
                        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                            .addTextDisplayComponents(
                                new TextDisplayBuilder().setContent(`-# ${t('commands:github.topics')}: ${repo.topics.join(", ")}`)
                            );
                    }

                    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(`-# ${t('commands:github.created_at')}: <t:${Math.floor(new Date(repo.created_at).getTime() / 1000)}:R>  •  ${t('commands:github.last_pushed')}: <t:${Math.floor(new Date(repo.pushed_at).getTime() / 1000)}:R>`)
                        )
                        .addActionRowComponents(
                            new ActionRowBuilder()
                                .addComponents(
                                    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t('commands:github.view_repo')).setURL(repo.html_url)
                                )
                        );

                    return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
                } catch (error) {
                    if (error.response?.status === 404) {
                        return interaction.editReply({ content: `${e.pixel_cross} ${t('commands:github.repo_not_found')}` });
                    }
                    throw error;
                }
            }
        } catch (error) {
            logger.error("[/GITHUB] Error executing command:", error);
            const content = `${e.pixel_cross} An error occurred while fetching data from GitHub.`;
            if (interaction.deferred || interaction.replied) {
                return interaction.editReply({ content });
            }
            return interaction.reply({ content, flags: MessageFlags.Ephemeral });
        }
    },
    help: {
        name: "github",
        description: "Get information about GitHub users or repositories",
        category: "Utility",
        permissions: [],
        botPermissions: [],
        created: 1767267107
    }
};

// contributors: @relentiousdragon