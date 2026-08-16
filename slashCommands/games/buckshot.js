const { SlashCommandBuilder, MessageFlags, ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const e = require('../../data/emoji.js');
const funcs = require('../../util/functions.js');
const commandMeta = require('../../util/i18n.js').getCommandMetadata();
const engine = require('../../util/buckshot_engine.js');
const logger = require('../../logger.js');
const User = require('../../schemas/users.js');
const Analytics = require('../../schemas/analytics.js');

const activeGames = new Map();
const userToGame = new Map();
const GAME_TIMEOUT_MS = 15 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const TURN_TIMEOUT_MS = 30 * 1000;
const LOBBY_TIMEOUT_MS = 10 * 60 * 1000;
//
function startTurnTimer(gameId, t) {
    const game = activeGames.get(gameId);
    if (!game || game.type !== 'game') return;

    if (game.turnTimeout) clearTimeout(game.turnTimeout);

    const state = game.state;
    const currentP = engine.getCurrentPlayer(state);
    if (!currentP || !currentP.alive) return;

    if (currentP.isAI) {
        funcs.sleep(800).then(() => {
            handleDealerTurn(gameId, state, game.interaction, t);
        });
        return;
    }

    game.turnTimeout = setTimeout(async () => {
        await handleTurnTimeout(gameId, t);
    }, TURN_TIMEOUT_MS);
}

async function handleTurnTimeout(gameId, t) {
    const game = activeGames.get(gameId);
    if (!game || game.type !== 'game') return;

    const state = game.state;
    const currentP = engine.getCurrentPlayer(state);
    if (!currentP || !currentP.alive || currentP.isAI) return;

    currentP.consecutiveSkips = (currentP.consecutiveSkips || 0) + 1;

    if (currentP.consecutiveSkips >= 3) {
        currentP.alive = false;
        currentP.hp = 0;
        userToGame.delete(currentP.id);
        state.logs.push({
            type: 'kick_timeout',
            userId: currentP.id,
            userName: currentP.name,
            round: state.roundNumber
        });

        const alive = engine.getAlivePlayers(state);
        if (alive.length <= 1) {
            removeGame(gameId);
            if (state.mode === 'pve') {
                recordBuckshotResult(alive[0]?.isAI ? 'ai' : 'human');
            }
            const finalContainer = buildGameOverContainer(state, alive[0], t);
            return game.interaction.editReply({ components: [finalContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => { });
        }
    } else {
        state.logs.push({
            type: 'skip_timeout',
            userId: currentP.id,
            userName: currentP.name,
            skips: currentP.consecutiveSkips,
            round: state.roundNumber
        });
    }

    state.sawActive = false;
    state.currentPeek = {};
    state.turnIndex = engine.getNextTurnIndex(state);
    game.lastInteraction = Date.now();

    const container = buildGameContainer(gameId, state, t);
    await game.interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => { });

    startTurnTimer(gameId, t);
}

async function recordBuckshotResult(winnerType) {
    try {
        const isBotWin = (winnerType === 'ai');
        await Analytics.findOneAndUpdate(
            { timestamp: new Date(0) },
            {
                $inc: {
                    buckshotWaterfallWins: isBotWin ? 1 : 0,
                    buckshotHumanWins: isBotWin ? 0 : 1
                }
            },
            { upsert: true }
        ).maxTimeMS(5000);
    } catch (err) {
        logger.error('[/Buckshot] Failed to record analytics win result:', err);
    }
}

async function sendTutorial(interaction, t, userId = interaction.user.id) {
    if (!userId || userId === 'ai') return;
    try {
        const userDoc = await User.findOne({ userID: userId }).select('lastBuckshotGuide').lean();
        if (userDoc?.lastBuckshotGuide && (Date.now() - new Date(userDoc.lastBuckshotGuide).getTime() < THIRTY_DAYS_MS)) {
            return;
        }

        await User.updateOne(
            { userID: userId },
            { $set: { lastBuckshotGuide: new Date() } },
            { upsert: true }
        );

        const itemList = engine.ITEM_NAMES.map(item => {
            const emoji = engine.ITEM_EMOJIS[item];
            const name = t(`commands:buckshot.items.${item}`);
            const desc = t(`commands:buckshot.tutorial.item_${item}`);
            return `${emoji} **${name}** — ${desc}`;
        }).join('\n');

        const tutorialText = [
            `## ${t('commands:buckshot.tutorial.title')}`,
            '',
            `### ${t('commands:buckshot.tutorial.rules_title')}`,
            t('commands:buckshot.tutorial.rules_body'),
            '',
            `### ${t('commands:buckshot.tutorial.items_title')}`,
            itemList,
            '',
            `-# ${t('commands:buckshot.tutorial.footer')}`
        ].join('\n');

        const container = new ContainerBuilder()
            .setAccentColor(0x5865F2)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(tutorialText));

        await interaction.followUp({
            components: [container],
            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
        }).catch(() => { });
    } catch (err) {
        logger.error('[/Buckshot] Error sending tutorial:', err);
    }
}

setInterval(() => {
    const now = Date.now();
    for (const [gameId, game] of activeGames.entries()) {
        if (now - (game.lastInteraction || game.createdAt) > GAME_TIMEOUT_MS) {
            removeGame(gameId);
        }
    }
}, 60000);

function isUserInGame(userId) {
    const gameId = userToGame.get(userId);
    if (!gameId) return null;
    if (!activeGames.has(gameId)) {
        userToGame.delete(userId);
        return null;
    }
    return gameId;
}

function removeGame(gameId) {
    const game = activeGames.get(gameId);
    if (game) {
        if (game.turnTimeout) clearTimeout(game.turnTimeout);
        if (game.players) {
            for (const p of game.players) userToGame.delete(p.id);
        }
        if (game.hostId) userToGame.delete(game.hostId);
        if (game.partyMembers) {
            for (const m of game.partyMembers) userToGame.delete(m.id);
        }
    }
    activeGames.delete(gameId);
}

function formatHp(hp, maxHp) {
    const green = `${e.lightning_green}` || '🟩';
    const red = `${e.lightning_red}` || '🟥';
    const greenChar = green || '🟩';
    const redChar = red || '🟥';
    let bar = '';
    for (let i = 0; i < hp; i++) bar += greenChar;
    for (let i = 0; i < Math.max(0, maxHp - hp); i++) bar += redChar;
    return `${bar} (${hp}/${maxHp})`;
}

function buildForfeitButton(gameId, t, disabled = false) {
    return new ButtonBuilder()
        .setCustomId(`bs_forfeit_${gameId}`)
        .setLabel(t('common:games.forfeit'))
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🏳️')
        .setDisabled(disabled);
}

function shellEmoji(type) {
    if (type === 'live') {
        const str = `${e.bs_shell}`;
        return str || '🔴';
    }
    const str = `${e.bs_slug}`;
    return str || '⚪';
}

function formatShells(liveCount, blankCount) {
    let blanks = '';
    for (let i = 0; i < blankCount; i++) blanks += shellEmoji('blank');
    let lives = '';
    for (let i = 0; i < liveCount; i++) lives += shellEmoji('live');

    if (blanks && lives) {
        return `${blanks}  ${lives}`;
    }
    return blanks || lives || '—';
}

function formatLogLine(log, t) {
    if (!log) return '';
    if (log.type === 'shot') {
        const shooter = log.shooterId === 'ai' ? 'Waterfall' : `<@${log.shooterId}>`;
        const target = log.targetId === 'ai' ? 'Waterfall' : `<@${log.targetId}>`;
        if (log.isSelfShot) {
            if (log.shell === 'live') {
                return `${shooter} ${t('commands:buckshot.log_shot_self_live', { dmg: log.damage })}`;
            } else {
                return `${shooter} ${t('commands:buckshot.log_shot_self_blank')}`;
            }
        } else {
            if (log.shell === 'live') {
                return `${shooter} ${t('commands:buckshot.log_shot_other_live', { target, dmg: log.damage })}`;
            } else {
                return `${shooter} ${t('commands:buckshot.log_shot_other_blank', { target })}`;
            }
        }
    } else if (log.type === 'item_use') {
        const user = log.userId === 'ai' ? 'Waterfall' : `<@${log.userId}>`;
        const itemEmoji = engine.ITEM_EMOJIS[log.item] || '';
        const itemName = t(`commands:buckshot.items.${log.item}`);
        const fullItem = `${itemEmoji} ${itemName}`;
        if (log.item === 'cola' && log.detail?.ejectedShell) {
            const shellName = log.detail.ejectedShell === 'live' ? t('commands:buckshot.live') : t('commands:buckshot.blank');
            return `${user} ${t('commands:buckshot.log_used_cola', { item: fullItem, shell: shellName })}`;
        }
        if (log.item === 'bananas') {
            return `${user} ${t('commands:buckshot.log_used_bananas', { item: fullItem })}`;
        }
        if (log.item === 'saw') {
            return `${user} ${t('commands:buckshot.log_used_saw', { item: fullItem })}`;
        }
        if (log.item === 'cuffs') {
            const target = log.targetId === 'ai' ? 'Waterfall' : `<@${log.targetId}>`;
            return `${user} ${t('commands:buckshot.log_used_cuffs', { item: fullItem, target })}`;
        }
        if (log.item === 'inverter') {
            return `${user} ${t('commands:buckshot.log_used_inverter', { item: fullItem })}`;
        }
        if (log.item === 'glass') {
            return `${user} ${t('commands:buckshot.log_used_glass', { item: fullItem })}`;
        }
        return `${user} ${t('commands:buckshot.log_used_item', { item: fullItem })}`;
    } else if (log.type === 'cuffs_skip') {
        const target = log.targetId === 'ai' ? 'Waterfall' : `<@${log.targetId}>`;
        return `${target} ${t('commands:buckshot.log_cuffs_skip')}`;
    } else if (log.type === 'reload') {
        return `**${t('commands:buckshot.log_reloaded')}** ${formatShells(log.live, log.blank)}`;
    } else if (log.type === 'forfeit') {
        const user = log.userId === 'ai' ? 'Waterfall' : `<@${log.userId}>`;
        return `${user} ${t('commands:buckshot.log_forfeited')}`;
    } else if (log.type === 'skip_timeout') {
        const user = log.userId === 'ai' ? 'Waterfall' : `<@${log.userId}>`;
        return `${user} ${t('commands:buckshot.log_skip_timeout', { skips: log.skips })}`;
    } else if (log.type === 'kick_timeout') {
        const user = log.userId === 'ai' ? 'Waterfall' : `<@${log.userId}>`;
        return `${user} ${t('commands:buckshot.log_kick_timeout')}`;
    }
    return '';
}

function buildGameOverContainer(state, winner, t, forfeiterId = null) {
    const isPvE = state.mode === 'pve';
    let accentColor = 0x57F287;
    let titleText = '';

    if (forfeiterId) {
        accentColor = 0xED4245;
        const winMsg = isPvE
            ? (winner?.isAI ? t('common:games.you_lose') : t('common:games.you_win'))
            : (winner ? t('common:games.winner', { user: `<@${winner.id}>` }) : t('common:games.winner', { user: 'Nobody' }));
        titleText = `# 🏳️ ${t('common:games.forfeited', { user: `<@${forfeiterId}>` })}\n${winMsg}`;
    } else if (isPvE) {
        if (winner?.isAI) {
            accentColor = 0xED4245;
            titleText = `# 🪦 ${t('common:games.you_lose')}`;
        } else {
            accentColor = 0x57F287;
            titleText = `# 🎉 ${t('common:games.you_win')}`;
        }
    } else {
        accentColor = 0x57F287;
        const winnerDisplay = winner ? `<@${winner.id}>` : 'Nobody';
        titleText = `# 🏆 ${t('common:games.winner', { user: winnerDisplay })}`;
    }

    const container = new ContainerBuilder()
        .setAccentColor(accentColor)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(titleText))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    let summary = `-# ${t('commands:buckshot.title')} • ${t('commands:buckshot.round', { round: state.roundNumber })}\n`;
    for (const p of state.players) {
        const nameDisplay = p.isAI ? 'Waterfall' : `<@${p.id}>`;
        const prefix = p.alive ? '• ' : `${e.pixel_headstone} `;
        const crown = (p.id === winner?.id) ? ' 👑' : '';
        const hpDisplay = p.alive ? formatHp(p.hp, p.maxHp) : formatHp(0, p.maxHp);
        summary += p.alive
            ? `${prefix}${nameDisplay}: ${hpDisplay}${crown}\n`
            : `${prefix}~~${nameDisplay}~~: ${hpDisplay}\n`;
    }

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(summary));
    return container;
}

function buildGameContainer(gameId, state, t, extraInfo = '') {
    const currentP = engine.getCurrentPlayer(state);
    const alivePlayers = engine.getAlivePlayers(state);
    const container = new ContainerBuilder().setAccentColor(0x5865F2);

    let headerText = `## ${e.discord_orbs} ${t('commands:buckshot.title')}\n`;
    headerText += `-# ${t('commands:buckshot.round', { round: state.roundNumber })}`;
    if (state.sawActive) {
        headerText += `\n${e.pixel_warning} **${t('commands:buckshot.saw_active')}**`;
    }

    let playerStatusList = '';
    for (const p of state.players) {
        const isCurrent = (p.id === currentP.id && p.alive);
        const cuffTag = p.handcuffed ? ' `[Handcuffed]`' : '';
        const nameDisplay = p.isAI ? 'Waterfall' : `<@${p.id}>`;
        if (!p.alive) {
            playerStatusList += `${e.pixel_headstone} ~~${nameDisplay}~~: ${formatHp(0, p.maxHp)}\n`;
        } else if (isCurrent) {
            playerStatusList += `> **${nameDisplay}**: ${formatHp(p.hp, p.maxHp)}${cuffTag}\n`;
        } else {
            playerStatusList += `• ${nameDisplay}: ${formatHp(p.hp, p.maxHp)}${cuffTag}\n`;
        }
    }

    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(headerText),
                new TextDisplayBuilder().setContent(playerStatusList)
            )
            .setButtonAccessory(buildForfeitButton(gameId, t))
    );
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    const remainingLives = state.chamber.filter(s => s === 'live').length;
    const remainingBlanks = state.chamber.filter(s => s === 'blank').length;

    let chamberText = `${formatShells(remainingLives, remainingBlanks)}\n-# ${t('commands:buckshot.chamber_loaded', { live: state.initialLive, blank: state.initialBlank })}`;
    if (extraInfo) {
        chamberText += `\n${extraInfo}`;
    }
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(chamberText));

    const maxLogs = (state.mode === 'pve') ? 5 : 7;
    const currentLogs = (state.logs || []).slice(-maxLogs);
    const prevLog = state.previousRoundLastLog;

    if (prevLog || currentLogs.length > 0) {
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        let logContent = `**${t('commands:buckshot.recent_events')}:**\n`;
        if (prevLog) {
            logContent += `- ${formatLogLine(prevLog, t)} (Round ${prevLog.round || state.roundNumber - 1})\n`;
        }
        for (const log of currentLogs) {
            logContent += `- ${formatLogLine(log, t)}\n`;
        }

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(logContent.trimEnd()));
    }

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    const currentName = currentP.isAI ? 'Waterfall' : `<@${currentP.id}>`;
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${t('commands:buckshot.current_turn', { user: currentName })}**`));

    const actionRows = buildTurnButtons(gameId, state, t);
    for (const row of actionRows) {
        container.addActionRowComponents(row);
    }

    return container;
}

function buildTurnButtons(gameId, state, t) {
    const rows = [];
    const currentP = engine.getCurrentPlayer(state);
    const aliveOpponents = engine.getAlivePlayers(state).filter(p => p.id !== currentP.id);

    const shootRow = new ActionRowBuilder();

    if (aliveOpponents.length === 1) {
        const opp = aliveOpponents[0];
        const oppLabel = opp.isAI ? 'Waterfall' : opp.name;
        shootRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`bs_shoot_${gameId}_${opp.id}`)
                .setLabel(`${t('commands:buckshot.shoot_target', { target: oppLabel })}`)
                .setStyle(ButtonStyle.Danger)
        );
    } else if (aliveOpponents.length > 1) {
        for (const opp of aliveOpponents.slice(0, 3)) {
            shootRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`bs_shoot_${gameId}_${opp.id}`)
                    .setLabel(`${t('commands:buckshot.shoot_target', { target: opp.name })}`)
                    .setStyle(ButtonStyle.Danger)
            );
        }
    }

    shootRow.addComponents(
        new ButtonBuilder()
            .setCustomId(`bs_shoot_${gameId}_${currentP.id}`)
            .setLabel(t('commands:buckshot.shoot_self'))
            .setStyle(ButtonStyle.Secondary)
    );

    rows.push(shootRow);

    if (currentP.items && currentP.items.length > 0) {
        const itemRow = new ActionRowBuilder();
        const uniqueItems = [...new Set(currentP.items)];
        for (const itemType of uniqueItems) {
            const count = currentP.items.filter(i => i === itemType).length;
            const emoji = engine.ITEM_EMOJIS[itemType] || '';
            const name = t(`commands:buckshot.items.${itemType}`);
            const itemBtn = new ButtonBuilder()
                .setCustomId(`bs_item_${gameId}_${itemType}`)
                .setLabel(`${name} (${count})`)
                .setStyle(ButtonStyle.Primary);
            if (emoji) itemBtn.setEmoji(emoji);
            itemRow.addComponents(itemBtn);
        }
        rows.push(itemRow);
    }

    return rows;
}

function buildPartyLobbyContainer(gameId, game, t) {
    const container = new ContainerBuilder().setAccentColor(0x5865F2);
    let memberList = '';
    game.partyMembers.forEach((m, idx) => {
        const hostBadge = m.id === game.hostId ? ` (${t('commands:buckshot.host')})` : '';
        memberList += `${idx + 1}. <@${m.id}>${hostBadge}\n`;
    });

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`# ${e.discord_orbs} ${t('commands:buckshot.party_lobby')}`),
        new TextDisplayBuilder().setContent(t('commands:buckshot.party_desc', { count: game.partyMembers.length, max: 4 }))
    );
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(memberList));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`bs_join_${gameId}`)
            .setLabel(t('commands:buckshot.join_party'))
            .setStyle(ButtonStyle.Success)
            .setDisabled(game.partyMembers.length >= 4),
        new ButtonBuilder()
            .setCustomId(`bs_leave_${gameId}`)
            .setLabel(t('commands:buckshot.leave_party'))
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`bs_start_${gameId}`)
            .setLabel(t('commands:buckshot.start_game'))
            .setStyle(ButtonStyle.Primary)
            .setDisabled(game.partyMembers.length < 2),
        new ButtonBuilder()
            .setCustomId(`bs_cancel_${gameId}`)
            .setLabel(t('commands:buckshot.cancel_lobby'))
            .setStyle(ButtonStyle.Danger)
    );

    container.addActionRowComponents(row);
    return container;
}
//
module.exports = {
    data: new SlashCommandBuilder()
        .setName('buckshot')
        .setNameLocalizations(commandMeta.buckshot?.name || {})
        .setDescription('Play high-stakes Buckshot Roulette against Waterfall or friends (Up to 4 players)')
        .setDescriptionLocalizations(commandMeta.buckshot?.description || {})
        .addUserOption(opt =>
            opt.setName('opponent')
                .setNameLocalizations(commandMeta.buckshot?.option_opponent_name || {})
                .setDescription('Challenge a player directly to a 1v1 duel (optional)')
                .setDescriptionLocalizations(commandMeta.buckshot?.option_opponent_description || {})
                .setRequired(false)
        )
        .addStringOption(opt =>
            opt.setName('mode')
                .setNameLocalizations(commandMeta.buckshot?.option_mode_name || {})
                .setDescription('Select game mode (optional)')
                .setDescriptionLocalizations(commandMeta.buckshot?.option_mode_description || {})
                .setRequired(false)
                .addChoices(
                    { name: 'Solo vs Dealer (PvE)', value: 'solo' },
                    { name: 'Host Party (2-4 Players)', value: 'party' }
                )
        ),
    integration_types: [0, 1],
    contexts: [0, 1, 2],
    activeGames,
    dev: false,
    mod: false,
    beta: false,
    explicit: false,
    async execute(bot, interaction, funcs, settings, logger, t) {
        try {
            const userId = interaction.user.id;
            const opponent = interaction.options.getUser('opponent');
            const modeChoice = interaction.options.getString('mode');

            const existingGameId = isUserInGame(userId);
            if (existingGameId) {
                const game = activeGames.get(existingGameId);
                let messageExists = false;

                if (game && game.interaction) {
                    try {
                        await game.interaction.fetchReply();
                        messageExists = true;
                    } catch (err) {
                        messageExists = false;
                    }
                }

                const container = new ContainerBuilder().setAccentColor(0xED4245);

                if (messageExists) {
                    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`${e.pixel_cross} ${t('common:games.already_in_game')}`));
                } else {
                    container.addSectionComponents(
                        new SectionBuilder()
                            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${e.pixel_cross} ${t('common:games.already_in_game')}`))
                            .setButtonAccessory(
                                new ButtonBuilder()
                                    .setCustomId(`bs_forfeit_${existingGameId}`)
                                    .setLabel(t('common:games.forfeit'))
                                    .setStyle(ButtonStyle.Danger)
                                    .setEmoji('🏳️')
                            )
                    );
                }

                return interaction.reply({
                    components: [container],
                    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
                });
            }

            if (opponent) {
                if (opponent.id === userId) {
                    return interaction.reply({ content: `${e.pixel_cross} ${t('common:games.cant_play_self')}`, flags: MessageFlags.Ephemeral });
                }
                if (opponent.bot) {
                    return interaction.reply({ content: `${e.pixel_cross} ${t('common:games.cant_play_bot')}`, flags: MessageFlags.Ephemeral });
                }
                const oppInGame = isUserInGame(opponent.id);
                if (oppInGame) {
                    return interaction.reply({ content: `${e.pixel_cross} ${t('common:games.challenger_busy')}`, flags: MessageFlags.Ephemeral });
                }

                const gameId = `bs_duel_${userId}_${opponent.id}_${Date.now()}`;
                const challengeContainer = new ContainerBuilder()
                    .setAccentColor(0x5865F2)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`# ${e.discord_orbs} ${t('commands:buckshot.title')}`),
                        new TextDisplayBuilder().setContent(t('commands:buckshot.challenge_desc', { challenger: `<@${userId}>`, opponent: `<@${opponent.id}>` }))
                    )
                    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${t('commands:buckshot.challenge_timeout')}`))
                    .addActionRowComponents(
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`bs_accept_${gameId}`).setLabel(t('common:games.accept')).setStyle(ButtonStyle.Success),
                            new ButtonBuilder().setCustomId(`bs_decline_${gameId}`).setLabel(t('common:games.decline')).setStyle(ButtonStyle.Danger)
                        )
                    );

                activeGames.set(gameId, {
                    type: 'duel_invite',
                    hostId: userId,
                    opponentId: opponent.id,
                    hostName: interaction.user.username,
                    opponentName: opponent.username,
                    createdAt: Date.now(),
                    interaction
                });
                userToGame.set(userId, gameId);
                userToGame.set(opponent.id, gameId);

                setTimeout(async () => {
                    const g = activeGames.get(gameId);
                    if (g && g.type === 'duel_invite') {
                        userToGame.delete(g.hostId);
                        if (g.opponentId) userToGame.delete(g.opponentId);
                        activeGames.delete(gameId);
                        try {
                            const expiredContainer = new ContainerBuilder()
                                .setAccentColor(0x99AAB5)
                                .addTextDisplayComponents(new TextDisplayBuilder().setContent(t('common:games.challenge_expired')));
                            await interaction.editReply({ components: [expiredContainer], flags: MessageFlags.IsComponentsV2 });
                        } catch (e) { }
                    }
                }, LOBBY_TIMEOUT_MS);

                return interaction.reply({
                    components: [new TextDisplayBuilder().setContent(`<@${opponent.id}>`), challengeContainer],
                    flags: MessageFlags.IsComponentsV2
                });
            }

            if (modeChoice === 'party') {
                const gameId = `bs_party_${userId}_${Date.now()}`;
                const game = {
                    type: 'party_lobby',
                    hostId: userId,
                    partyMembers: [{ id: userId, name: interaction.user.username }],
                    createdAt: Date.now(),
                    interaction
                };
                activeGames.set(gameId, game);
                userToGame.set(userId, gameId);

                setTimeout(async () => {
                    const g = activeGames.get(gameId);
                    if (g && g.type === 'party_lobby') {
                        if (g.partyMembers) {
                            for (const m of g.partyMembers) userToGame.delete(m.id);
                        }
                        if (g.hostId) userToGame.delete(g.hostId);
                        activeGames.delete(gameId);
                        try {
                            const expiredContainer = new ContainerBuilder()
                                .setAccentColor(0xED4245)
                                .addTextDisplayComponents(new TextDisplayBuilder().setContent(t('commands:buckshot.lobby_timeout')));
                            await interaction.editReply({ components: [expiredContainer], flags: MessageFlags.IsComponentsV2 });
                        } catch (e) { }
                    }
                }, LOBBY_TIMEOUT_MS);

                const container = buildPartyLobbyContainer(gameId, game, t);
                return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            const gameId = `bs_pve_${userId}_${Date.now()}`;
            const player1 = engine.createPlayer(userId, interaction.user.username, false);
            const dealer = engine.createPlayer('ai', 'Waterfall', true);
            const gameState = engine.createGameState([player1, dealer], 'pve');

            activeGames.set(gameId, {
                type: 'game',
                state: gameState,
                hostId: userId,
                createdAt: Date.now(),
                lastInteraction: Date.now(),
                interaction
            });
            userToGame.set(userId, gameId);

            const container = buildGameContainer(gameId, gameState, t);

            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            sendTutorial(interaction, t, userId);
            return startTurnTimer(gameId, t);

        } catch (error) {
            logger.error('[/Buckshot] Error in execute:', error);
            if (interaction.deferred || interaction.replied) {
                interaction.editReply({ content: t('common:error') }).catch(() => { });
            } else {
                interaction.reply({ content: t('common:error'), flags: MessageFlags.Ephemeral });
            }
        }
    },

    async handleButton(bot, interaction, t, logger) {
        const customId = interaction.customId;
        const userId = interaction.user.id;
        const parts = customId.split('_');
        const action = parts[1]; // accept, decline, join, leave, start, cancel, shoot, item, forfeit

        if (action === 'accept' || action === 'decline') {
            const gameId = parts.slice(2).join('_');
            const game = activeGames.get(gameId);
            if (!game || game.type !== 'duel_invite') {
                return interaction.reply({ content: `${e.pixel_cross} ${t('common:games.game_expired')}`, flags: MessageFlags.Ephemeral });
            }

            if (action === 'decline') {
                if (userId !== game.opponentId && userId !== game.hostId) {
                    return interaction.reply({ content: `${e.deny} ${t('common:pagination.not_for_you')}`, flags: MessageFlags.Ephemeral });
                }
                removeGame(gameId);
                const container = new ContainerBuilder()
                    .setAccentColor(0xED4245)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(t('common:games.declined', { user: `<@${userId}>` })));
                return interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            if (action === 'accept') {
                if (userId !== game.opponentId) {
                    return interaction.reply({ content: `${e.deny} ${t('common:pagination.not_for_you')}`, flags: MessageFlags.Ephemeral });
                }

                await interaction.deferUpdate();
                const p1 = engine.createPlayer(game.hostId, game.hostName, false);
                const p2 = engine.createPlayer(game.opponentId, game.opponentName, false);
                const gameState = engine.createGameState([p1, p2], 'duel');

                game.type = 'game';
                game.state = gameState;
                game.lastInteraction = Date.now();
                game.interaction = interaction;

                const container = buildGameContainer(gameId, gameState, t);

                await interaction.editReply({
                    components: [new TextDisplayBuilder().setContent(`<@${game.hostId}> <@${game.opponentId}>`), container],
                    flags: MessageFlags.IsComponentsV2
                });
                sendTutorial(interaction, t, userId);
                return startTurnTimer(gameId, t);
            }
        }

        if (action === 'join' || action === 'leave' || action === 'start' || action === 'cancel') {
            const gameId = parts.slice(2).join('_');
            const game = activeGames.get(gameId);
            if (!game || game.type !== 'party_lobby') {
                return interaction.reply({ content: `${e.pixel_cross} ${t('common:games.game_expired')}`, flags: MessageFlags.Ephemeral });
            }

            if (action === 'join') {
                if (game.partyMembers.some(m => m.id === userId)) {
                    return interaction.reply({ content: `${e.deny} ${t('commands:buckshot.already_in_party')}`, flags: MessageFlags.Ephemeral });
                }
                if (isUserInGame(userId)) {
                    return interaction.reply({ content: `${e.pixel_cross} ${t('common:games.already_in_game')}`, flags: MessageFlags.Ephemeral });
                }
                if (game.partyMembers.length >= 4) {
                    return interaction.reply({ content: `${e.deny} ${t('commands:buckshot.party_full')}`, flags: MessageFlags.Ephemeral });
                }

                game.partyMembers.push({ id: userId, name: interaction.user.username });
                userToGame.set(userId, gameId);
                const container = buildPartyLobbyContainer(gameId, game, t);
                return interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            if (action === 'leave') {
                if (!game.partyMembers.some(m => m.id === userId)) {
                    return interaction.reply({ content: `${e.deny} ${t('commands:buckshot.not_in_party')}`, flags: MessageFlags.Ephemeral });
                }
                if (userId === game.hostId) {
                    removeGame(gameId);
                    const container = new ContainerBuilder()
                        .setAccentColor(0xED4245)
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(t('commands:buckshot.host_cancelled')));
                    return interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
                }

                game.partyMembers = game.partyMembers.filter(m => m.id !== userId);
                userToGame.delete(userId);
                const container = buildPartyLobbyContainer(gameId, game, t);
                return interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            if (action === 'cancel') {
                if (userId !== game.hostId) {
                    return interaction.reply({ content: `${e.deny} ${t('commands:buckshot.only_host_cancel')}`, flags: MessageFlags.Ephemeral });
                }
                removeGame(gameId);
                const container = new ContainerBuilder()
                    .setAccentColor(0xED4245)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(t('commands:buckshot.host_cancelled')));
                return interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            if (action === 'start') {
                if (userId !== game.hostId) {
                    return interaction.reply({ content: `${e.deny} ${t('commands:buckshot.only_host_start')}`, flags: MessageFlags.Ephemeral });
                }
                if (game.partyMembers.length < 2) {
                    return interaction.reply({ content: `${e.deny} ${t('commands:buckshot.need_more_players')}`, flags: MessageFlags.Ephemeral });
                }

                await interaction.deferUpdate();
                const players = game.partyMembers.map(m => engine.createPlayer(m.id, m.name, false));
                const gameState = engine.createGameState(players, 'party');

                game.type = 'game';
                game.state = gameState;
                game.lastInteraction = Date.now();
                game.interaction = interaction;

                const mentions = players.map(p => `<@${p.id}>`).join(' ');
                const container = buildGameContainer(gameId, gameState, t);

                await interaction.editReply({
                    components: [new TextDisplayBuilder().setContent(mentions), container],
                    flags: MessageFlags.IsComponentsV2
                });
                sendTutorial(interaction, t, userId);
                return startTurnTimer(gameId, t);
            }
        }

        const gameId = parts.slice(2, parts.length - (action === 'shoot' || action === 'item' ? 1 : 0)).join('_');
        const game = activeGames.get(gameId);
        if (!game || game.type !== 'game') {
            return interaction.reply({ content: `${e.pixel_cross} ${t('common:games.game_expired')}`, flags: MessageFlags.Ephemeral });
        }

        const state = game.state;
        const currentP = engine.getCurrentPlayer(state);

        if (action === 'forfeit') {
            const forfeitingPlayer = state.players.find(p => p.id === userId);
            if (!forfeitingPlayer || !forfeitingPlayer.alive) {
                return interaction.reply({ content: `${e.deny} ${t('common:pagination.not_for_you')}`, flags: MessageFlags.Ephemeral });
            }

            forfeitingPlayer.alive = false;
            forfeitingPlayer.hp = 0;
            userToGame.delete(userId);
            if (game.turnTimeout) clearTimeout(game.turnTimeout);

            state.logs.push({
                type: 'forfeit',
                userId: forfeitingPlayer.id,
                userName: forfeitingPlayer.name,
                round: state.roundNumber
            });

            const alive = engine.getAlivePlayers(state);
            if (alive.length <= 1) {
                removeGame(gameId);
                const winner = alive[0] || null;
                if (state.mode === 'pve') {
                    recordBuckshotResult(winner?.isAI ? 'ai' : 'human');
                }
                const finalContainer = buildGameOverContainer(state, winner, t, userId);
                return interaction.update({ components: [finalContainer], flags: MessageFlags.IsComponentsV2 });
            }

            if (currentP.id === userId) {
                state.sawActive = false;
                state.currentPeek = {};
                state.turnIndex = engine.getNextTurnIndex(state);
            }

            game.lastInteraction = Date.now();
            game.interaction = interaction;
            const container = buildGameContainer(gameId, state, t);
            await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
            return startTurnTimer(gameId, t);
        }

        if (userId !== currentP.id) {
            return interaction.reply({ content: t('common:games.not_your_turn'), flags: MessageFlags.Ephemeral });
        }

        if (action === 'item') {
            const itemType = parts[parts.length - 1];
            const useResult = engine.useItem(state, userId, itemType);

            if (!useResult.success) {
                return interaction.reply({ content: `${e.pixel_cross} ${t('commands:buckshot.item_error')}`, flags: MessageFlags.Ephemeral });
            }

            currentP.consecutiveSkips = 0;
            game.lastInteraction = Date.now();
            game.interaction = interaction;

            if (itemType === engine.ITEMS.GLASS && useResult.log?.detail?.peekedShell) {
                const peeked = useResult.log.detail.peekedShell;
                const shellDesc = peeked === 'live' ? `**${t('commands:buckshot.live')}**` : `**${t('commands:buckshot.blank')}**`;
                await interaction.reply({
                    content: `**${t('commands:buckshot.glass_peek_secret')}:** ${shellDesc}`,
                    flags: MessageFlags.Ephemeral
                });
                const container = buildGameContainer(gameId, state, t);
                await interaction.message.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });
                return startTurnTimer(gameId, t);
            }

            const container = buildGameContainer(gameId, state, t);
            await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
            return startTurnTimer(gameId, t);
        }

        if (action === 'shoot') {
            const targetId = parts[parts.length - 1];
            await interaction.deferUpdate();

            const result = engine.executeShot(state, targetId);
            currentP.consecutiveSkips = 0;
            game.lastInteraction = Date.now();
            game.interaction = interaction;

            if (!result) {
                return interaction.editReply({ content: t('common:error') });
            }

            if (result.gameOver) {
                removeGame(gameId);
                if (state.mode === 'pve') {
                    recordBuckshotResult(result.winner?.isAI ? 'ai' : 'human');
                }
                const finalContainer = buildGameOverContainer(state, result.winner, t);
                return interaction.editReply({ components: [finalContainer], flags: MessageFlags.IsComponentsV2 });
            }

            const newCurrent = engine.getCurrentPlayer(state);
            if (state.mode === 'pve' && newCurrent.isAI && newCurrent.alive) {
                const container = buildGameContainer(gameId, state, t);
                await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });

                await funcs.sleep(1000);
                await handleDealerTurn(gameId, state, interaction, t);
                return;
            }

            const container = buildGameContainer(gameId, state, t);
            await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            return startTurnTimer(gameId, t);
        }
    },

    help: {
        name: 'buckshot',
        description: 'Play high-stakes Buckshot Roulette against Waterfall or friends (Up to 4 players)',
        category: 'Games',
        permissions: [],
        botPermissions: [],
        created: 1766066848
    }
};
//
function calculateDealerDelay(state) {
    const dealer = state.players.find(p => p.isAI);
    const opponent = state.players.find(p => !p.isAI && p.alive);
    if (!dealer || !opponent) return 2500;

    let tension = 0;

    if (dealer.hp === 1) tension += 3;
    else if (dealer.hp === 2) tension += 1.5;

    if (opponent.hp === 1) tension += 3;
    else if (opponent.hp === 2) tension += 1.5;

    if (state.sawActive) tension += 2.5;

    const total = state.chamber.length;
    const remainingLives = state.chamber.filter(s => s === 'live').length;
    const remainingBlanks = state.chamber.filter(s => s === 'blank').length;

    if (total <= 2 && total > 0) tension += 2;
    else if (remainingLives > 0 && remainingBlanks > 0 && Math.abs(remainingLives - remainingBlanks) <= 1) {
        tension += 1.5;
    }

    if (state.roundNumber >= 2) tension += 1;
    if (state.roundNumber >= 3) tension += 1;

    tension = Math.min(10, tension);

    const jitter = Math.floor(Math.random() * 800) - 400;
    const calculated = Math.round(2200 + (tension / 10) * 12500 + jitter);
    return Math.max(2200, Math.min(15000, calculated));
}

async function handleDealerTurn(gameId, state, interaction, t) {
    const game = activeGames.get(gameId);
    if (!game || !state) return;

    let aiPlayer = engine.getCurrentPlayer(state);
    let moves = 0;

    while (aiPlayer && aiPlayer.isAI && aiPlayer.alive && moves < 8) {
        moves++;
        const decision = engine.getDealerAction(state);
        if (!decision) break;

        if (decision.action === 'item') {
            const itemDelay = Math.floor(Math.random() * 800) + 1600;
            await funcs.sleep(itemDelay);

            const res = engine.useItem(state, 'ai', decision.item, decision.targetId);
            if (!res.success) {
                break;
            }

            const container = buildGameContainer(gameId, state, t);
            await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => { });

            aiPlayer = engine.getCurrentPlayer(state);
            continue;
        }

        if (decision.action === 'shoot') {
            const shootDelay = calculateDealerDelay(state);
            await funcs.sleep(shootDelay);

            const result = engine.executeShot(state, decision.targetId);
            if (result.gameOver) {
                removeGame(gameId);
                if (state.mode === 'pve') {
                    recordBuckshotResult(result.winner?.isAI ? 'ai' : 'human');
                }
                const finalContainer = buildGameOverContainer(state, result.winner, t);
                return interaction.editReply({ components: [finalContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => { });
            }

            const container = buildGameContainer(gameId, state, t);
            await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => { });

            aiPlayer = engine.getCurrentPlayer(state);
            if (!result.extraTurn) {
                break;
            }
        }
    }

    aiPlayer = engine.getCurrentPlayer(state);
    if (aiPlayer && aiPlayer.isAI && aiPlayer.alive) {
        const opponent = engine.getAlivePlayers(state).find(p => p.id !== aiPlayer.id);
        if (opponent) {
            const shootDelay = calculateDealerDelay(state);
            await funcs.sleep(shootDelay);

            const result = engine.executeShot(state, opponent.id);
            if (result && result.gameOver) {
                removeGame(gameId);
                if (state.mode === 'pve') {
                    recordBuckshotResult(result.winner?.isAI ? 'ai' : 'human');
                }
                const finalContainer = buildGameOverContainer(state, result.winner, t);
                return interaction.editReply({ components: [finalContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => { });
            }

            const container = buildGameContainer(gameId, state, t);
            await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => { });

            if (result && result.extraTurn) {
                return handleDealerTurn(gameId, state, interaction, t);
            }
        }
    }

    startTurnTimer(gameId, t);
}
// contributors: @relentiousdragon