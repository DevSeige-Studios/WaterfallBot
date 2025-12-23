const { Events, EmbedBuilder, WebhookClient } = require('discord.js');
const { settings } = require('../util/settingsModule.js');
const e = require('../data/emoji.js');
const logger = require('../logger.js');
const { i18n } = require('../util/i18n.js');
const { Server } = require('../schemas/servers.js');
const { ServerStats } = require('../schemas/serverStats.js');
//
module.exports = {
    name: Events.GuildDelete,
    async execute(bot, guild) {
        try {
            const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

            await Server.updateOne(
                { serverID: guild.id },
                { $set: { pendingDeletion: thirtyDaysFromNow } }
            );

            await ServerStats.updateOne(
                { guildId: guild.id },
                { $set: { pendingDeletion: thirtyDaysFromNow } }
            );

            logger.info(`[GuildDelete] Marked guild ${guild.id} (${guild.name}) for deletion on ${thirtyDaysFromNow.toISOString()}`);

            if (!settings.leaveWebhook || settings.leaveWebhook.length !== 2) return;

            const webhookClient = new WebhookClient({ id: settings.leaveWebhook[0], token: settings.leaveWebhook[1] });

            const t = i18n.getFixedT('en');

            const embed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle(`<:i:1442933112370761759> ${t('events:guild_delete.title')}`)
                .setThumbnail(guild.iconURL({ dynamic: true }))
                .addFields(
                    { name: t('events:guild_delete.name'), value: `${guild.name}`, inline: true },
                    { name: t('events:guild_delete.id'), value: `${guild.id}`, inline: true },
                    { name: t('events:guild_delete.members'), value: `${guild.memberCount}`, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: 'Data will be deleted in 30 days' });

            await webhookClient.send({ embeds: [embed] });
        } catch (error) {
            logger.error(`Error in guildDelete event: ${error.message}`);
        }
    }
};
