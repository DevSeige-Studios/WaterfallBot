const e = require('../data/emoji');

const ITEMS = {
    GLASS: 'glass',
    SAW: 'saw',
    COLA: 'cola',
    CUFFS: 'cuffs',
    BANANAS: 'bananas',
    INVERTER: 'inverter'
};

const ITEM_NAMES = [ITEMS.GLASS, ITEMS.SAW, ITEMS.COLA, ITEMS.CUFFS, ITEMS.BANANAS, ITEMS.INVERTER];

function getItemEmoji(item) {
    const map = {
        [ITEMS.GLASS]: { custom: e.bs_glass, fallback: '🔍' },
        [ITEMS.SAW]: { custom: e.bs_saw, fallback: '🪚' },
        [ITEMS.COLA]: { custom: e.bs_cola, fallback: '🥤' },
        [ITEMS.CUFFS]: { custom: e.bs_cuffs, fallback: '⛓️' },
        [ITEMS.BANANAS]: { custom: e.bs_bananas, fallback: '🍌' },
        [ITEMS.INVERTER]: { custom: e.reload2, fallback: '🔄' }
    };
    const entry = map[item];
    if (!entry) return '❓';
    const str = `${entry.custom}`;
    return str || entry.fallback;
}

const ITEM_EMOJIS = Object.fromEntries(
    ITEM_NAMES.map(item => [item, getItemEmoji(item)])
);

const MAX_HP = 4;
const MAX_ITEMS = 4;
//
function createPlayer(id, name, isAI = false) {
    return {
        id,
        name,
        isAI,
        hp: MAX_HP,
        maxHp: MAX_HP,
        items: [],
        handcuffed: false,
        alive: true,
        consecutiveSkips: 0
    };
}

function generateChamber(playerCount = 2) {
    const minShells = Math.max(3, playerCount + 1);
    const maxShells = 8;
    const totalShells = Math.floor(Math.random() * (maxShells - minShells + 1)) + minShells;

    const liveCount = Math.max(1, Math.min(totalShells - 1, Math.floor(totalShells / 2) + (Math.random() < 0.5 ? 0 : (Math.random() < 0.5 ? 1 : -1))));
    const blankCount = totalShells - liveCount;

    const shells = [];
    for (let i = 0; i < liveCount; i++) shells.push('live');
    for (let i = 0; i < blankCount; i++) shells.push('blank');

    for (let i = shells.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shells[i], shells[j]] = [shells[j], shells[i]];
    }

    return {
        shells,
        initialLive: liveCount,
        initialBlank: blankCount
    };
}

function distributeItems(players, countPerPlayer = 2) {
    const granted = {};
    for (const p of players) {
        if (!p.alive) continue;
        granted[p.id] = [];
        for (let i = 0; i < countPerPlayer; i++) {
            if (p.items.length < MAX_ITEMS) {
                const randomItem = ITEM_NAMES[Math.floor(Math.random() * ITEM_NAMES.length)];
                p.items.push(randomItem);
                granted[p.id].push(randomItem);
            }
        }
    }
    return granted;
}

function createGameState(players, mode = 'duel') {
    const chamber = generateChamber(players.length);
    const grantedItems = distributeItems(players, 2);

    return {
        mode, // duel, party, pve
        players,
        turnIndex: 0,
        chamber: chamber.shells,
        initialLive: chamber.initialLive,
        initialBlank: chamber.initialBlank,
        sawActive: false,
        currentPeek: {}, // ,map ,playerId -> peeked shell info if glas used
        logs: [],
        previousRoundLastLog: null,
        roundNumber: 1,
        started: true,
        winner: null,
        grantedItems
    };
}

function getAlivePlayers(state) {
    return state.players.filter(p => p.alive);
}

function getCurrentPlayer(state) {
    return state.players[state.turnIndex];
}

function getNextTurnIndex(state) {
    let next = (state.turnIndex + 1) % state.players.length;
    let attempts = 0;
    while (!state.players[next].alive && attempts < state.players.length) {
        next = (next + 1) % state.players.length;
        attempts++;
    }
    return next;
}

function advanceTurn(state) {
    state.sawActive = false;
    state.currentPeek = {};

    let nextIndex = getNextTurnIndex(state);
    const nextPlayer = state.players[nextIndex];

    if (nextPlayer.handcuffed) {
        nextPlayer.handcuffed = false;
        state.logs.push({ type: 'cuffs_skip', targetId: nextPlayer.id, targetName: nextPlayer.name, round: state.roundNumber });
        state.turnIndex = nextIndex;
        return advanceTurn(state);
    }

    state.turnIndex = nextIndex;
}

function checkAndReloadChamber(state) {
    if (state.chamber.length === 0) {
        const prevLogs = state.logs.filter(l => l.type !== 'reload');
        if (prevLogs.length > 0) {
            state.previousRoundLastLog = {
                ...prevLogs[prevLogs.length - 1],
                round: state.roundNumber
            };
        }
        state.logs = [];

        const aliveCount = getAlivePlayers(state).length;
        const newChamber = generateChamber(aliveCount);
        state.chamber = newChamber.shells;
        state.initialLive = newChamber.initialLive;
        state.initialBlank = newChamber.initialBlank;
        state.roundNumber++;
        state.grantedItems = distributeItems(state.players, Math.min(2, Math.max(1, 5 - aliveCount)));
        state.sawActive = false;
        state.currentPeek = {};
        state.logs.push({
            type: 'reload',
            live: newChamber.initialLive,
            blank: newChamber.initialBlank,
            round: state.roundNumber
        });
        return true;
    }
    return false;
}

function executeShot(state, targetId) {
    if (state.chamber.length === 0) {
        checkAndReloadChamber(state);
    }

    const currentP = getCurrentPlayer(state);
    const targetP = state.players.find(p => p.id === targetId);
    if (!targetP || !targetP.alive) return null;

    const shell = state.chamber.shift();
    const damage = state.sawActive ? 2 : 1;
    const isSelfShot = (currentP.id === targetId);
    const wasSawActive = state.sawActive;

    state.sawActive = false;
    state.currentPeek = {};

    const result = {
        shooterId: currentP.id,
        shooterName: currentP.name,
        targetId: targetP.id,
        targetName: targetP.name,
        isSelfShot,
        shell,
        damage,
        sawActive: wasSawActive,
        targetDied: false,
        extraTurn: false,
        gameOver: false,
        winner: null
    };

    if (shell === 'live') {
        targetP.hp = Math.max(0, targetP.hp - damage);
        if (targetP.hp === 0) {
            targetP.alive = false;
            result.targetDied = true;
        }

        const alive = getAlivePlayers(state);
        if (alive.length <= 1) {
            result.gameOver = true;
            result.winner = alive[0] || null;
            state.winner = result.winner;
            state.logs.push({ type: 'shot', round: state.roundNumber, ...result });
            return result;
        }

        advanceTurn(state);
    } else {
        if (isSelfShot) {
            result.extraTurn = true;
        } else {
            advanceTurn(state);
        }
    }

    state.logs.push({ type: 'shot', round: state.roundNumber, ...result });
    checkAndReloadChamber(state);

    return result;
}

function useItem(state, playerId, itemType, targetId = null) {
    const player = state.players.find(p => p.id === playerId);
    if (!player || !player.alive) return { success: false, error: 'invalid_player' };

    const itemIdx = player.items.indexOf(itemType);
    if (itemIdx === -1) return { success: false, error: 'item_not_found' };

    if (state.chamber.length === 0) {
        checkAndReloadChamber(state);
    }

    player.items.splice(itemIdx, 1);

    const logEntry = {
        type: 'item_use',
        round: state.roundNumber,
        userId: player.id,
        userName: player.name,
        item: itemType,
        targetId,
        detail: null
    };

    switch (itemType) {
        case ITEMS.GLASS: {
            const nextShell = state.chamber[0];
            state.currentPeek[player.id] = nextShell;
            logEntry.detail = { peekedShell: nextShell };
            break;
        }
        case ITEMS.SAW: {
            state.sawActive = true;
            logEntry.detail = { sawActive: true };
            break;
        }
        case ITEMS.COLA: {
            const ejectedShell = state.chamber.shift();
            state.currentPeek = {};
            logEntry.detail = { ejectedShell };
            checkAndReloadChamber(state);
            break;
        }
        case ITEMS.CUFFS: {
            const target = state.players.find(p => p.id === targetId) || state.players[getNextTurnIndex(state)];
            if (target && target.id !== player.id) {
                target.handcuffed = true;
                logEntry.targetId = target.id;
                logEntry.targetName = target.name;
            }
            break;
        }
        case ITEMS.BANANAS: {
            const healed = player.hp < player.maxHp;
            player.hp = Math.min(player.maxHp, player.hp + 1);
            logEntry.detail = { healed, newHp: player.hp };
            break;
        }
        case ITEMS.INVERTER: {
            if (state.chamber.length > 0) {
                state.chamber[0] = state.chamber[0] === 'live' ? 'blank' : 'live';
                if (state.currentPeek[player.id]) {
                    state.currentPeek[player.id] = state.chamber[0];
                }
                logEntry.detail = { inverted: true };
            }
            break;
        }
    }

    state.logs.push(logEntry);
    return { success: true, log: logEntry };
}

function getDealerAction(state) {
    const dealer = getCurrentPlayer(state);
    if (!dealer || !dealer.isAI) return null;

    const opponent = getAlivePlayers(state).find(p => p.id !== dealer.id);
    if (!opponent) return null;

    let knownShell = state.currentPeek[dealer.id] || null;
    const remainingLives = state.chamber.filter(s => s === 'live').length;
    const remainingBlanks = state.chamber.filter(s => s === 'blank').length;
    const total = state.chamber.length;

    if (!knownShell && total > 0) {
        if (remainingLives === total) knownShell = 'live';
        else if (remainingBlanks === total) knownShell = 'blank';
    }

    const liveProb = total > 0 ? remainingLives / total : 0.5;

    // P1: Bananas (Heal if damaged)
    if (dealer.items.includes(ITEMS.BANANAS) && dealer.hp < dealer.maxHp) {
        return { action: 'item', item: ITEMS.BANANAS };
    }

    // P2: Magnifying Glass
    if (dealer.items.includes(ITEMS.GLASS) && !knownShell && total > 1 && remainingLives > 0 && remainingBlanks > 0) {
        return { action: 'item', item: ITEMS.GLASS };
    }

    // P3: Inverter (flip)
    if (dealer.items.includes(ITEMS.INVERTER)) {
        if (knownShell === 'blank' || (liveProb === 0 && total > 0)) {
            return { action: 'item', item: ITEMS.INVERTER };
        }
    }

    // P4: Handsaw (2x dmg)
    if (dealer.items.includes(ITEMS.SAW) && !state.sawActive) {
        if (knownShell === 'live' || liveProb >= 0.75) {
            return { action: 'item', item: ITEMS.SAW };
        }
    }

    // P5: Handcuffs
    if (dealer.items.includes(ITEMS.CUFFS) && !opponent.handcuffed) {
        if (knownShell === 'live' || liveProb >= 0.6) {
            return { action: 'item', item: ITEMS.CUFFS, targetId: opponent.id };
        }
    }

    // P6: Cola (eject blank)
    if (dealer.items.includes(ITEMS.COLA)) {
        if (knownShell === 'blank' && remainingLives > 0 && !dealer.items.includes(ITEMS.INVERTER)) {
            return { action: 'item', item: ITEMS.COLA };
        }
        if (liveProb < 0.4 && remainingLives > 0 && total > 2 && !knownShell) {
            return { action: 'item', item: ITEMS.COLA };
        }
    }

    if (knownShell === 'live') {
        return { action: 'shoot', targetId: opponent.id };
    } else if (knownShell === 'blank') {
        return { action: 'shoot', targetId: dealer.id };
    }

    if (liveProb >= 0.5) {
        return { action: 'shoot', targetId: opponent.id };
    } else {
        return { action: 'shoot', targetId: dealer.id };
    }
}
//
module.exports = {
    ITEMS,
    ITEM_NAMES,
    ITEM_EMOJIS,
    MAX_HP,
    MAX_ITEMS,
    createPlayer,
    createGameState,
    getAlivePlayers,
    getCurrentPlayer,
    getNextTurnIndex,
    executeShot,
    useItem,
    getDealerAction
};

// contributors: @relentiousdragon