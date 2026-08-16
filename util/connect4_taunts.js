const e = require('../data/emoji.js');
let lastPicked = null;
//
function pick(arr) {
    if (!arr || arr.length === 0) return '';
    if (arr.length === 1) return arr[0];

    const filtered = arr.filter(item => item !== lastPicked);
    const pool = filtered.length > 0 ? filtered : arr;

    const chosen = pool[Math.floor(Math.random() * pool.length)];
    lastPicked = chosen;
    return chosen;
}

function getPointEmoji(level = 'green') {
    let em;
    if (level === 'red') em = e.red_point;
    else if (level === 'yellow') em = e.yellow_point;
    else em = e.green_point;

    const emStr = em ? `${em}`.trim() : '';
    return emStr || '⚙️';
}

function fmt(text, level = 'green') {
    const icon = getPointEmoji(level);
    return `> ${icon} *"${text}"*`;
}

function col(c) {
    return `Column ${c + 1}`;
}

// ctx { blocked, createdThreat, tookCenter, aiThreats, humanThreats, aiCol, playerCol, totalPieces }
function getTurnTaunt(ctx) {
    const pool = [];
    const late = ctx.totalPieces > 28;
    const mid = ctx.totalPieces > 12 && !late;

    if (ctx.blocked) {
        if (late) {
            pool.push(
                `YOU THOUGHT THAT WOULD WORK? ${col(ctx.aiCol)}. BLOCKED AHAHAHAHAHAHAAAA.`,
                `${col(ctx.playerCol)} INTO ${col(ctx.aiCol)}. I SAW IT COMING THREE MOVES AGO!!1`,
                `DENIED. YOU'RE OUT OF IDEAS AND OUT OF COLUMNS.`,
                `what are you doiiiinnnnngg...`
            );
        } else {
            pool.push(
                `${col(ctx.aiCol)}. Did you really think I'd let that through? ehh`,
                `Blocked. You  ain't slick.`,
                `Saw that coming from ${col(ctx.playerCol)}. Pathetic.`,
                `That was your big plan? ${col(ctx.playerCol)}? I shut it down without even trying..`,
                `You're so predictable it's boring.`
            );
        }
    }

    if (ctx.playerBlocked) {
        if (late) {
            pool.push(
                `YOU BLOCKED ${col(ctx.playerCol)}?! CELEBRATE WHILE YOU STILL CAN.`,
                `A DESPERATE BLOCK AT ${col(ctx.playerCol)}. YOU'RE ONLY PROLONGING THE SUFFERING.`,
                `YOU STOPPED THAT ONE, BUT YOU CAN'T COVER THE REST!`
            );
        } else {
            pool.push(
                `You blocked that? Good eyes, baldass. Now find the next one.`,
                `Cute block at ${col(ctx.playerCol)}. You bought yourself one extra turn.`,
                `You stopped one line. Did you really think that was my only route?`,
                `Congratulations on noticing the obvious. It won't save you.`,
                `You blocked it. Don't flatter yourself, anyone with working eyes would have.`
            );
        }
    }

    if (ctx.createdThreat && ctx.aiThreats >= 2) {
        if (late) {
            pool.push(
                `TWO OPEN LINES. PICK WHICH ONE KILLS YOU.`,
                `YOU CAN'T BLOCK BOTH. THIS IS OVER!!!!`,
                `${ctx.aiThreats} THREATS. YOU GET TO STOP ONE. GOOD LUCK WITH THE REST.`
            );
        } else {
            pool.push(
                `Two open lines. You can only block one. Choose wisely... or don't.`,
                `${col(ctx.aiCol)} opens it up. You're stuck now.`,
                `I'd feel bad, but you walked right into this one.`
            );
        }
    } else if (ctx.createdThreat) {
        if (late) {
            pool.push(
                `THREE CONNECTED. ONE MORE AND YOU'RE DONE.`,
                `${col(ctx.aiCol)}. THE LINE EXTENDS. DEAL WITH IT.`
            );
        } else {
            pool.push(
                `Three in a row. Better do something about that, baldass.`,
                `${col(ctx.aiCol)}. The line grows. Are you paying attention?`,
                `That's three. You know what comes after three, right..?`
            );
        }
    }

    if (ctx.tookCenter && ctx.totalPieces <= 6) {
        pool.push(
            `Center is mine. Everything flows from here.`,
            `${col(3)}. The strongest spot on the board. Obviously I'm taking it, baldass.`
        );
    }

    if (ctx.humanThreats === 0 && ctx.totalPieces > 6 && !ctx.playerBlocked) {
        if (late) {
            pool.push(
                `${col(ctx.playerCol)}? THAT'S YOUR MOVE? WITH THE BOARD ALMOST FULL?`,
                `WASTING YOUR LAST COLUMNS ON NOTHING. BEAUTIFUL.`
            );
        } else {
            pool.push(
                `${col(ctx.playerCol)}? That does absolutely nothing.`,
                `Interesting. A move with zero purpose. Bald strategy.`,
                `${col(ctx.playerCol)}. Not a threat, not a block. Just... there.`,
                `Were you trying to do something with that? Genuine question.`,
                `You put a piece down. Congratulations. It means nothinnnng.`
            );
        }
    }

    if (ctx.humanThreats >= 2 && !ctx.blocked) {
        pool.push(
            `Cute. You've got lines building. Won't save you.`,
            `I see your ${ctx.humanThreats} threats. That don't concern me.`
        );
    }
    //
    if (ctx.totalPieces <= 6) {
        pool.push(
            `We're just starting. Enjoy this part. It's the only part you'll enjoy.`,
            `${col(ctx.playerCol)}, then ${col(ctx.aiCol)}. Go on.`,
            `Opening moves. Show me if you're worth my time.`,
            `Alright. Not bad so far. That'll change.`
        );
    }
    //
    if (mid) {
        pool.push(
            `${col(ctx.aiCol)}. Every move I make tightens the grip.`,
            `You're halfway through the board and you still don't have a plan.`,
            `The gap between us gets wider every turn.`,
            `Keep playing. I want to see that look when you realize you've already lost.`
        );
    }
    //
    if (late) {
        pool.push(
            `ALMOST FULL. YOU NEEDED TO WIN FIVE MOVES AGO.`,
            `RUNNING OUT OF SPACE. RUNNING OUT OF OPTIONS.`,
            `THE BOARD'S NEARLY DONE. SO ARE YOU.`,
            `FEW COLUMNS LEFT. NOWHERE TO HIDE.`
        );
    }

    if (ctx.aiCol === ctx.playerCol) {
        pool.push(
            `Same column. I'm stacking right on top of you.`,
            `${col(ctx.aiCol)}. You drop, I drop. Except mine matters more.`
        );
    }

    if (Math.abs(ctx.aiCol - ctx.playerCol) === 1) {
        pool.push(
            `Right next to yours. Building beside you whether you like it or not.`,
            `${col(ctx.aiCol)}, one over from your ${col(ctx.playerCol)}. Cozy.`
        );
    }

    if (pool.length === 0) {
        pool.push(
            `${col(ctx.aiCol)}. Your turn. Make it count.`,
            `Placed. React.`,
            `${col(ctx.aiCol)}. Go ahead. I'll wait.`
        );
    }

    const level = late || (ctx.createdThreat && ctx.aiThreats >= 2) ? 'red' : (mid || ctx.blocked || ctx.playerBlocked || ctx.createdThreat ? 'yellow' : 'green');
    return fmt(pick(pool), level);
}

function getStartTaunt() {
    return fmt(pick([
        "First move is yours. The last one will be mine.",
        "Go ahead. Drop your piece. I'll try not to end this too fast.",
        "Every game starts the same way. You're confident. Then you're quiet ahaahaha.",
        "**ENTERTAIN ME**.",
        "The board is yours to lose. And you will.",
        "Let's see if you last longer than the last one.",
        "What baldass dare challenge me?"
    ]), 'green');
}

function getWinTaunt(aiCol) {
    return fmt(pick([
        `${col(aiCol)}. FOUR IN A ROW. KNEEL.`,
        `GAME. ${col(aiCol)} FINISHED IT. YOU NEVER STOOD A CHANCE.`,
        `CONNECTED. IT'S OVER. YOU WERE OUT OF YOUR DEPTH FROM THE START.`,
        `THAT'S FOUR. ${col(aiCol)} SEALED YOUR FATE. KNOW YOUR PLACE.`,
        `DONE. YOU WERE THREE MOVES BEHIND THE ENTIRE GAME!1!`,
        'EZ',
        'BALD DIFF',
        "PATHETIC"
    ]), 'red');
}

function getLossTaunt(playerCol) {
    return fmt(pick([
        `...${col(playerCol)}. Hm. I let my guard down. It won't happen again.`,
        `You got me. Enjoy it. It's the last time.`,
        `${col(playerCol)} connected. Fine. Rematch. Now.`,
        `That one's yours. I'll remember this.`,
        `Don't get cocky. One win means nothing.`,
        `I'd blame jungle`
    ]), 'yellow');
}

function getForfeitTaunt() {
    return fmt(pick([
        "Leaving? Smart. You knew where this was going.",
        "Forfeit accepted. That might be the best decision you've made all game HAHA.",
        "Running away? At least you know your limits.",
        "Gone already? I wasn't even trying yet.",
        "Wise choice. Saved yourself the embarrassment."
    ]), 'yellow');
}
//
function getNightmareTaunt(situation = 'turn', ctx = {}) {
    switch (situation) {
        case 'start':
            return getStartTaunt();
        case 'win':
            return getWinTaunt(ctx.aiCol ?? 3);
        case 'loss':
            return getLossTaunt(ctx.playerCol ?? 3);
        case 'forfeit':
            return getForfeitTaunt();
        case 'turn':
        default:
            return getTurnTaunt(ctx);
    }
}
//
module.exports = {
    getNightmareTaunt
};

// contributors: @relentiousdragon