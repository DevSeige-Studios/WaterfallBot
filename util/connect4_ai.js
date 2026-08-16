const Analytics = require("../schemas/analytics.js");
const workerPool = require('./workerPool.js');
const logger = require('../logger.js');

const ROWS = 6;
const COLS = 7;
const EMPTY = 0;
const HUMAN = 1;
const AI = 2;

let globalWaterfallWins = 0;
let globalHumanWins = 0;
let pendingWaterfallWins = 0;
let pendingHumanWins = 0;
const BATCH_SIZE = 5;

(async () => {
    try {
        const mongoose = require('mongoose');
        if (mongoose.connection.readyState !== 1) {
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Connection timeout')), 15000);
                mongoose.connection.once('connected', () => { clearTimeout(timeout); resolve(); });
            });
        }
        const stats = await Analytics.findOne({ timestamp: new Date(0) }).maxTimeMS(5000);
        globalWaterfallWins = stats?.connect4WaterfallWins || 0;
        globalHumanWins = stats?.connect4HumanWins || 0;
    } catch (err) {
        console.error("[C4 AI] Error loading global stats:", err);
    }
})();

async function syncWithDB() {
    if (pendingWaterfallWins === 0 && pendingHumanWins === 0) return;

    const w = pendingWaterfallWins;
    const h = pendingHumanWins;
    pendingWaterfallWins = 0;
    pendingHumanWins = 0;

    try {
        const updated = await Analytics.findOneAndUpdate(
            { timestamp: new Date(0) },
            {
                $inc: {
                    connect4WaterfallWins: w,
                    connect4HumanWins: h
                }
            },
            { upsert: true, new: true }
        );
        if (updated) {
            globalWaterfallWins = updated.connect4WaterfallWins;
            globalHumanWins = updated.connect4HumanWins;
        }
    } catch (err) {
        pendingWaterfallWins += w;
        pendingHumanWins += h;
        console.error("[C4 AI] Error syncing with MongoDB:", err);
    }
}

function recordGameResult(winner) {
    if (winner === AI) {
        pendingWaterfallWins++;
    } else if (winner === HUMAN) {
        pendingHumanWins++;
    }

    if (pendingWaterfallWins + pendingHumanWins >= BATCH_SIZE) {
        syncWithDB();
    }
}

function getGlobalStats() {
    return {
        waterfallWins: globalWaterfallWins + pendingWaterfallWins,
        humanWins: globalHumanWins + pendingHumanWins
    };
}

const COLUMN_ORDER = [3, 2, 4, 1, 5, 0, 6];

const POSITION_WEIGHTS = [
    [3, 4, 5, 7, 5, 4, 3],
    [4, 6, 8, 10, 8, 6, 4],
    [5, 8, 11, 13, 11, 8, 5],
    [5, 8, 11, 13, 11, 8, 5],
    [4, 6, 8, 10, 8, 6, 4],
    [3, 4, 5, 7, 5, 4, 3]
];

function createBoard() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(EMPTY));
}

function copyBoard(board) {
    return board.map(row => [...row]);
}

function isValidMove(board, col) {
    return board[0][col] === EMPTY;
}

function getValidMoves(board) {
    return COLUMN_ORDER.filter(col => isValidMove(board, col));
}

function dropPiece(board, col, piece) {
    for (let r = ROWS - 1; r >= 0; r--) {
        if (board[r][col] === EMPTY) {
            board[r][col] = piece;
            return r;
        }
    }
    return -1;
}

function undoPiece(board, col, row) {
    board[row][col] = EMPTY;
}

function checkWin(board, piece) {
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS - 3; c++) {
            if (board[r][c] === piece && board[r][c + 1] === piece && board[r][c + 2] === piece && board[r][c + 3] === piece) return true;
        }
    }
    for (let r = 0; r < ROWS - 3; r++) {
        for (let c = 0; c < COLS; c++) {
            if (board[r][c] === piece && board[r + 1][c] === piece && board[r + 2][c] === piece && board[r + 3][c] === piece) return true;
        }
    }
    for (let r = 3; r < ROWS; r++) {
        for (let c = 0; c < COLS - 3; c++) {
            if (board[r][c] === piece && board[r - 1][c + 1] === piece && board[r - 2][c + 2] === piece && board[r - 3][c + 3] === piece) return true;
        }
    }
    for (let r = 0; r < ROWS - 3; r++) {
        for (let c = 0; c < COLS - 3; c++) {
            if (board[r][c] === piece && board[r + 1][c + 1] === piece && board[r + 2][c + 2] === piece && board[r + 3][c + 3] === piece) return true;
        }
    }
    return false;
}

function getWinningCoords(board, piece) {
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS - 3; c++) {
            if (board[r][c] === piece && board[r][c + 1] === piece && board[r][c + 2] === piece && board[r][c + 3] === piece) {
                return [{ r, c }, { r, c: c + 1 }, { r, c: c + 2 }, { r, c: c + 3 }];
            }
        }
    }
    for (let r = 0; r < ROWS - 3; r++) {
        for (let c = 0; c < COLS; c++) {
            if (board[r][c] === piece && board[r + 1][c] === piece && board[r + 2][c] === piece && board[r + 3][c] === piece) {
                return [{ r, c }, { r: r + 1, c }, { r: r + 2, c }, { r: r + 3, c }];
            }
        }
    }
    for (let r = 0; r < ROWS - 3; r++) {
        for (let c = 0; c < COLS - 3; c++) {
            if (board[r][c] === piece && board[r + 1][c + 1] === piece && board[r + 2][c + 2] === piece && board[r + 3][c + 3] === piece) {
                return [{ r, c }, { r: r + 1, c: c + 1 }, { r: r + 2, c: c + 2 }, { r: r + 3, c: c + 3 }];
            }
        }
    }
    for (let r = 3; r < ROWS; r++) {
        for (let c = 0; c < COLS - 3; c++) {
            if (board[r][c] === piece && board[r - 1][c + 1] === piece && board[r - 2][c + 2] === piece && board[r - 3][c + 3] === piece) {
                return [{ r, c }, { r: r - 1, c: c + 1 }, { r: r - 2, c: c + 2 }, { r: r - 3, c: c + 3 }];
            }
        }
    }
    return [];
}

function evaluateWindow(window, piece) {
    let score = 0;
    const oppPiece = piece === AI ? HUMAN : AI;

    let pieceCount = 0;
    let emptyCount = 0;
    let oppCount = 0;
    for (let i = 0; i < 4; i++) {
        if (window[i] === piece) pieceCount++;
        else if (window[i] === EMPTY) emptyCount++;
        else if (window[i] === oppPiece) oppCount++;
    }

    if (pieceCount === 4) {
        score += 100000;
    } else if (pieceCount === 3 && emptyCount === 1) {
        score += 100;
    } else if (pieceCount === 2 && emptyCount === 2) {
        score += 10;
    }

    if (oppCount === 3 && emptyCount === 1) {
        score -= 120;
    } else if (oppCount === 2 && emptyCount === 2) {
        score -= 15;
    }

    return score;
}

function scorePosition(board, piece) {
    let score = 0;
    const oppPiece = piece === AI ? HUMAN : AI;

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (board[r][c] === piece) {
                score += POSITION_WEIGHTS[r][c];
            } else if (board[r][c] === oppPiece) {
                score -= POSITION_WEIGHTS[r][c];
            }
        }
    }

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS - 3; c++) {
            const window = [board[r][c], board[r][c + 1], board[r][c + 2], board[r][c + 3]];
            score += evaluateWindow(window, piece);
        }
    }
    for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < ROWS - 3; r++) {
            const window = [board[r][c], board[r + 1][c], board[r + 2][c], board[r + 3][c]];
            score += evaluateWindow(window, piece);
        }
    }
    for (let r = 0; r < ROWS - 3; r++) {
        for (let c = 0; c < COLS - 3; c++) {
            const window = [board[r][c], board[r + 1][c + 1], board[r + 2][c + 2], board[r + 3][c + 3]];
            score += evaluateWindow(window, piece);
        }
    }
    for (let r = 0; r < ROWS - 3; r++) {
        for (let c = 0; c < COLS - 3; c++) {
            const window = [board[r + 3][c], board[r + 2][c + 1], board[r + 1][c + 2], board[r][c + 3]];
            score += evaluateWindow(window, piece);
        }
    }

    return score;
}

function isTerminalNode(board) {
    return checkWin(board, AI) || checkWin(board, HUMAN) || getValidMoves(board).length === 0;
}

function findImmediateWin(board, piece) {
    const validMoves = getValidMoves(board);
    for (const col of validMoves) {
        const row = dropPiece(board, col, piece);
        const win = checkWin(board, piece);
        undoPiece(board, col, row);
        if (win) return col;
    }
    return -1;
}

function getBoardKey(board) {
    let key = '';
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            key += board[r][c];
        }
    }
    return key;
}

function minimax(board, depth, alpha, beta, maximizingPlayer, memo) {
    const validMoves = getValidMoves(board);
    const isTerminal = isTerminalNode(board);

    if (depth === 0 || isTerminal) {
        if (isTerminal) {
            if (checkWin(board, AI)) {
                return [null, 10000000 + depth];
            } else if (checkWin(board, HUMAN)) {
                return [null, -10000000 - depth];
            } else {
                return [null, 0];
            }
        } else {
            return [null, scorePosition(board, AI)];
        }
    }

    const boardKey = `${getBoardKey(board)}_${depth}_${maximizingPlayer ? 1 : 0}`;
    if (memo && memo.has(boardKey)) {
        return memo.get(boardKey);
    }

    let bestColumn = validMoves[0];

    if (maximizingPlayer) {
        let value = -Infinity;
        for (const col of validMoves) {
            const row = dropPiece(board, col, AI);
            const newScore = minimax(board, depth - 1, alpha, beta, false, memo)[1];
            undoPiece(board, col, row);
            if (newScore > value) {
                value = newScore;
                bestColumn = col;
            }
            alpha = Math.max(alpha, value);
            if (alpha >= beta) break;
        }
        const result = [bestColumn, value];
        if (memo) memo.set(boardKey, result);
        return result;
    } else {
        let value = Infinity;
        for (const col of validMoves) {
            const row = dropPiece(board, col, HUMAN);
            const newScore = minimax(board, depth - 1, alpha, beta, true, memo)[1];
            undoPiece(board, col, row);
            if (newScore < value) {
                value = newScore;
                bestColumn = col;
            }
            beta = Math.min(beta, value);
            if (alpha >= beta) break;
        }
        const result = [bestColumn, value];
        if (memo) memo.set(boardKey, result);
        return result;
    }
}

function getAIMove(board, difficulty = 'hard') {
    const validMoves = getValidMoves(board);
    if (validMoves.length === 0) return 0;

    if (board.every(row => row.every(cell => cell === EMPTY))) {
        return 3;
    }

    const winningCol = findImmediateWin(board, AI);
    if (winningCol !== -1) return winningCol;

    const blockingCol = findImmediateWin(board, HUMAN);
    if (blockingCol !== -1) return blockingCol;

    const mode = (difficulty || 'hard').toLowerCase();

    if (mode === 'normal') {
        if (Math.random() < 0.15 && validMoves.length > 1) {
            const safeMoves = validMoves.filter(col => {
                const row = dropPiece(board, col, AI);
                let givesWin = false;
                if (row > 0) {
                    board[row - 1][col] = HUMAN;
                    if (checkWin(board, HUMAN)) givesWin = true;
                    board[row - 1][col] = EMPTY;
                }
                undoPiece(board, col, row);
                return !givesWin;
            });
            const candidates = safeMoves.length > 0 ? safeMoves : validMoves;
            return candidates[Math.floor(Math.random() * candidates.length)];
        }

        const memo = new Map();
        const [col] = minimax(board, 4, -Infinity, Infinity, true, memo);
        return col !== null ? col : validMoves[0];
    }

    const targetDepth = mode === 'nightmare' ? 7 : 6;
    const memo = new Map();
    const scoredMoves = [];

    for (const col of validMoves) {
        const row = dropPiece(board, col, AI);
        let createsInstantLoss = false;
        if (row > 0) {
            board[row - 1][col] = HUMAN;
            if (checkWin(board, HUMAN)) createsInstantLoss = true;
            board[row - 1][col] = EMPTY;
        }

        const score = minimax(board, targetDepth - 1, -Infinity, Infinity, false, memo)[1];
        undoPiece(board, col, row);

        const adjustedScore = createsInstantLoss ? score - 50000 : score;
        scoredMoves.push({ col, score: adjustedScore });
    }

    scoredMoves.sort((a, b) => b.score - a.score);
    return scoredMoves[0].col;
}

async function getAIMoveAsync(board, difficulty = 'hard') {
    try {
        return await workerPool.execute('connect4', { type: 'ai', board, difficulty });
    } catch (err) {
        logger.warn(`[Connect4 AI] Worker failed, using main thread: ${err.message}`);
        return getAIMove(board, difficulty);
    }
}
function countThreats(board, piece) {
    let threats = 0;
    const check = (w) => {
        let p = 0, e = 0;
        for (let i = 0; i < 4; i++) { if (w[i] === piece) p++; else if (w[i] === EMPTY) e++; }
        if (p === 3 && e === 1) threats++;
    };
    for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS - 3; c++)
            check([board[r][c], board[r][c + 1], board[r][c + 2], board[r][c + 3]]);
    for (let c = 0; c < COLS; c++)
        for (let r = 0; r < ROWS - 3; r++)
            check([board[r][c], board[r + 1][c], board[r + 2][c], board[r + 3][c]]);
    for (let r = 0; r < ROWS - 3; r++)
        for (let c = 0; c < COLS - 3; c++)
            check([board[r][c], board[r + 1][c + 1], board[r + 2][c + 2], board[r + 3][c + 3]]);
    for (let r = 3; r < ROWS; r++)
        for (let c = 0; c < COLS - 3; c++)
            check([board[r][c], board[r - 1][c + 1], board[r - 2][c + 2], board[r - 3][c + 3]]);
    return threats;
}
//
function analyzeMoveContext(board, aiCol, playerCol) {
    const totalPieces = board.flat().filter(c => c !== EMPTY).length;
    const aiThreats = countThreats(board, AI);
    const humanThreats = countThreats(board, HUMAN);

    let blocked = false;
    let aiRow = -1;
    for (let r = 0; r < ROWS; r++) {
        if (board[r][aiCol] === AI) { aiRow = r; break; }
    }
    if (aiRow >= 0) {
        const testBoard = board.map(r => [...r]);
        testBoard[aiRow][aiCol] = HUMAN;
        if (checkWin(testBoard, HUMAN)) blocked = true;
    }

    let playerBlocked = false;
    let playerRow = -1;
    for (let r = 0; r < ROWS; r++) {
        if (board[r][playerCol] === HUMAN) { playerRow = r; break; }
    }
    if (playerRow >= 0) {
        const testBoard = board.map(r => [...r]);
        testBoard[playerRow][playerCol] = AI;
        if (checkWin(testBoard, AI)) playerBlocked = true;
    }

    let createdThreat = aiThreats > 0;

    const tookCenter = aiCol === 3;

    return { blocked, playerBlocked, createdThreat, tookCenter, aiThreats, humanThreats, aiCol, playerCol, totalPieces };
}
//
module.exports = {
    getAIMove,
    getAIMoveAsync,
    checkWin,
    getWinningCoords,
    dropPiece,
    recordGameResult,
    getGlobalStats,
    EMPTY,
    HUMAN,
    AI,
    ROWS,
    COLS,
    isValidMove,
    createBoard,
    getValidMoves,
    countThreats,
    analyzeMoveContext
};

// contributors: @relentiousdragon