const { parentPort, workerData } = require('worker_threads');
const Canvas = require('canvas');
const GIFEncoder = require('gifencoder');

const ROWS = 6;
const COLS = 7;
const EMPTY = 0;
const HUMAN = 1;
const AI = 2;
const PLAYER_1 = HUMAN;
const PLAYER_2 = AI;

const CELL_SIZE = 72;
const PADDING = 8;
const COL_NUM_HEIGHT = 40;
const BOARD_INNER_WIDTH = COLS * CELL_SIZE + (COLS + 1) * PADDING;
const BOARD_INNER_HEIGHT = ROWS * CELL_SIZE + (ROWS + 1) * PADDING + COL_NUM_HEIGHT;
const SIGNATURE_WIDTH = 64;
const BOARD_WIDTH = BOARD_INNER_WIDTH + SIGNATURE_WIDTH;
const BOARD_HEIGHT = BOARD_INNER_HEIGHT;
const BOARD_OFFSET_X = 0;
const BOARD_OFFSET_Y = 0;
const BALL_RADIUS = (CELL_SIZE / 2) - 4;

const COLUMN_ORDER = [3, 2, 4, 1, 5, 0, 6];

const POSITION_WEIGHTS = [
    [3, 4, 5, 7, 5, 4, 3],
    [4, 6, 8, 10, 8, 6, 4],
    [5, 8, 11, 13, 11, 8, 5],
    [5, 8, 11, 13, 11, 8, 5],
    [4, 6, 8, 10, 8, 6, 4],
    [3, 4, 5, 7, 5, 4, 3]
];

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

const darkenedColorCache = new Map();
function darkenColor(hex, percent) {
    const key = `${hex}_${percent}`;
    if (darkenedColorCache.has(key)) return darkenedColorCache.get(key);

    const num = parseInt(hex.replace('#', ''), 16),
        amt = Math.round(2.55 * percent),
        R = (num >> 16) - amt,
        G = (num >> 8 & 0x00FF) - amt,
        B = (num & 0x0000FF) - amt;
    const result = "#" + (0x1000000 + (R < 255 ? R < 0 ? 0 : R : 255) * 0x10000 + (G < 255 ? G < 0 ? 0 : G : 255) * 0x100 + (B < 255 ? B < 0 ? 0 : B : 255)).toString(16).slice(1);
    darkenedColorCache.set(key, result);
    return result;
}

function drawSideSignature(ctx, gameId) {
    if (!gameId) return;

    const startX = BOARD_INNER_WIDTH;
    const width = SIGNATURE_WIDTH;
    const height = BOARD_HEIGHT;

    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(startX, 0, 2, height);

    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(startX + 2, 0, width - 2, height);

    let hash = 0;
    for (let i = 0; i < gameId.length; i++) {
        hash = ((hash << 5) - hash) + gameId.charCodeAt(i);
        hash |= 0;
    }

    const seededFunc = (s) => {
        let t = s += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };

    let rnd = hash;

    ctx.save();
    for (let i = 0; i < 20; i++) {
        const barY = seededFunc(rnd++) * height;
        const barH = 4 + seededFunc(rnd++) * 25;
        const barW = 2 + seededFunc(rnd++) * (width - 12);
        const opacity = 0.3 + seededFunc(rnd++) * 0.5;

        const palette = ['#ff9d00', '#00ffcc', '#ffffff', '#ff37ff', '#37ffff'];
        ctx.fillStyle = palette[Math.floor(seededFunc(rnd++) * palette.length)];
        ctx.globalAlpha = opacity;

        ctx.fillRect(startX + 6 + (width - 12 - barW) / 2, barY, barW, barH);

        if (seededFunc(rnd++) > 0.7) {
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fillRect(startX + 4, barY, width - 8, 1);
        }
    }
    ctx.restore();
}

function drawNightmareCracks(ctx, board, gameId) {
    const totalPieces = board.flat().filter(c => c !== EMPTY).length;
    if (totalPieces < 8) return;

    const isLate = totalPieces >= 24;
    const crackCount = isLate ? 22 : 9;

    let hash = 0;
    const str = (gameId || 'nightmare_c4') + '_cracks';
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    const pseudoRnd = (s) => {
        let t = s += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };

    let rndSeed = hash;

    ctx.save();
    for (let i = 0; i < crackCount; i++) {
        const startX = BOARD_OFFSET_X + pseudoRnd(rndSeed++) * BOARD_INNER_WIDTH;
        const startY = BOARD_OFFSET_Y + COL_NUM_HEIGHT + pseudoRnd(rndSeed++) * (BOARD_INNER_HEIGHT - COL_NUM_HEIGHT);
        const segments = 4 + Math.floor(pseudoRnd(rndSeed++) * (isLate ? 6 : 4));
        const length = (isLate ? 40 : 22) + pseudoRnd(rndSeed++) * (isLate ? 60 : 35);
        let angle = pseudoRnd(rndSeed++) * Math.PI * 2;

        let currX = startX;
        let currY = startY;

        const pts = [{ x: currX, y: currY }];
        for (let s = 0; s < segments; s++) {
            angle += (pseudoRnd(rndSeed++) - 0.5) * 1.5;
            const segLen = length / segments;
            currX += Math.cos(angle) * segLen;
            currY += Math.sin(angle) * segLen;
            pts.push({ x: currX, y: currY });
        }

        ctx.strokeStyle = 'rgba(12, 0, 20, 0.9)';
        ctx.lineWidth = isLate ? 3.5 : 2.0;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let p = 1; p < pts.length; p++) ctx.lineTo(pts[p].x, pts[p].y);
        ctx.stroke();

        ctx.strokeStyle = isLate ? 'rgba(255, 0, 85, 0.75)' : 'rgba(180, 0, 255, 0.5)';
        ctx.lineWidth = isLate ? 1.5 : 0.9;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let p = 1; p < pts.length; p++) ctx.lineTo(pts[p].x, pts[p].y);
        ctx.stroke();
    }
    ctx.restore();
}

function drawBoardBackground(ctx, board = null, isNightmare = false, gameId = null) {
    const boardGrad = ctx.createLinearGradient(0, 0, 0, BOARD_HEIGHT);
    if (isNightmare) {
        boardGrad.addColorStop(0, '#190033');
        boardGrad.addColorStop(0.5, '#0c0822');
        boardGrad.addColorStop(1, '#2c0018');
    } else {
        boardGrad.addColorStop(0, '#0066cc');
        boardGrad.addColorStop(1, '#004488');
    }
    ctx.fillStyle = boardGrad;
    ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

    ctx.fillStyle = isNightmare ? 'rgba(255, 120, 180, 0.9)' : 'rgba(255, 255, 255, 0.85)';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let c = 0; c < COLS; c++) {
        const x = BOARD_OFFSET_X + PADDING + c * (CELL_SIZE + PADDING) + CELL_SIZE / 2;
        ctx.fillText(`${c + 1}`, x, BOARD_OFFSET_Y + COL_NUM_HEIGHT / 2);
    }

    if (isNightmare && board) {
        drawNightmareCracks(ctx, board, gameId);
    }
}

function drawHole(ctx, x, y) {
    const holeGrad = ctx.createRadialGradient(x, y, 0, x, y, BALL_RADIUS);
    holeGrad.addColorStop(0, '#111');
    holeGrad.addColorStop(0.8, '#222');
    holeGrad.addColorStop(1, '#000');
    ctx.fillStyle = holeGrad;
    ctx.beginPath();
    ctx.arc(x, y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
}

function drawPiece(ctx, x, y, colorData, isWinning = false, shineRatio = -1) {
    const isNightmare = (typeof colorData === 'object' && colorData?.isNightmare) || colorData === '#8A00C2' || colorData?.name === 'Nightmare';
    const baseHex = (typeof colorData === 'object') ? (colorData.hex || '#ff3131') : colorData;

    if (isWinning) {
        ctx.shadowColor = isNightmare ? '#FF0055' : '#fff';
        ctx.shadowBlur = 18;
        ctx.strokeStyle = isNightmare ? '#FF0055' : '#fff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, BALL_RADIUS + 2, 0, Math.PI * 2);
        ctx.stroke();
    }

    if (isNightmare) {
        const nightmareGrad = ctx.createLinearGradient(x - BALL_RADIUS, y - BALL_RADIUS, x + BALL_RADIUS, y + BALL_RADIUS);
        nightmareGrad.addColorStop(0, '#9D00FF');
        nightmareGrad.addColorStop(0.45, '#6A00A8');
        nightmareGrad.addColorStop(0.75, '#D6004B');
        nightmareGrad.addColorStop(1, '#FF0055');

        const sphereShading = ctx.createRadialGradient(x - BALL_RADIUS / 3, y - BALL_RADIUS / 3, BALL_RADIUS / 10, x, y, BALL_RADIUS);
        sphereShading.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
        sphereShading.addColorStop(0.6, 'rgba(0, 0, 0, 0)');
        sphereShading.addColorStop(1, 'rgba(15, 0, 25, 0.7)');

        ctx.fillStyle = nightmareGrad;
        ctx.beginPath();
        ctx.arc(x, y, BALL_RADIUS, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = sphereShading;
        ctx.beginPath();
        ctx.arc(x, y, BALL_RADIUS, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(40, 0, 60, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, BALL_RADIUS, 0, Math.PI * 2);
        ctx.stroke();

        if (shineRatio >= 0 && shineRatio < 1.0) {
            const shineAlpha = Math.sin(shineRatio * Math.PI) * 0.9;
            if (shineAlpha > 0.02) {
                ctx.save();
                ctx.beginPath();
                ctx.arc(x, y, BALL_RADIUS, 0, Math.PI * 2);
                ctx.clip();

                const beamOffset = (shineRatio * 2.2 - 0.6) * BALL_RADIUS * 2;
                const bx = x - BALL_RADIUS + beamOffset;
                const by = y - BALL_RADIUS + beamOffset;

                const beamGrad = ctx.createLinearGradient(bx - 20, by - 20, bx + 20, by + 20);
                beamGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
                beamGrad.addColorStop(0.5, `rgba(255, 240, 255, ${shineAlpha})`);
                beamGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

                ctx.fillStyle = beamGrad;
                ctx.fillRect(x - BALL_RADIUS, y - BALL_RADIUS, BALL_RADIUS * 2, BALL_RADIUS * 2);

                const glintGrad = ctx.createRadialGradient(bx, by, 0, bx, by, BALL_RADIUS * 0.5);
                glintGrad.addColorStop(0, `rgba(255, 255, 255, ${shineAlpha})`);
                glintGrad.addColorStop(0.4, `rgba(255, 100, 220, ${shineAlpha * 0.5})`);
                glintGrad.addColorStop(1, 'rgba(255, 0, 100, 0)');
                ctx.fillStyle = glintGrad;
                ctx.beginPath();
                ctx.arc(bx, by, BALL_RADIUS * 0.5, 0, Math.PI * 2);
                ctx.fill();

                ctx.restore();
            }
        }

        if (shineRatio < 0 || shineRatio >= 0.95) {
            ctx.beginPath();
            ctx.arc(x - BALL_RADIUS / 3.5, y - BALL_RADIUS / 3.5, BALL_RADIUS / 2.2, 0, Math.PI * 2);
            const glossGrad = ctx.createLinearGradient(x - BALL_RADIUS, y - BALL_RADIUS, x, y);
            glossGrad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
            glossGrad.addColorStop(0.5, 'rgba(255, 150, 220, 0.15)');
            glossGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = glossGrad;
            ctx.fill();
        }

    } else {
        const pieceGrad = ctx.createRadialGradient(x - BALL_RADIUS / 3, y - BALL_RADIUS / 3, BALL_RADIUS / 10, x, y, BALL_RADIUS);
        pieceGrad.addColorStop(0, baseHex);
        pieceGrad.addColorStop(0.8, darkenColor(baseHex, 20));
        pieceGrad.addColorStop(1, darkenColor(baseHex, 40));

        ctx.fillStyle = pieceGrad;
        ctx.beginPath();
        ctx.arc(x, y, BALL_RADIUS, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x - BALL_RADIUS / 4, y - BALL_RADIUS / 4, BALL_RADIUS / 2, 0, Math.PI * 2);
        const shineGrad = ctx.createLinearGradient(x - BALL_RADIUS, y - BALL_RADIUS, x, y);
        shineGrad.addColorStop(0, 'rgba(255,255,255,0.4)');
        shineGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = shineGrad;
        ctx.fill();
    }

    ctx.shadowBlur = 0;
}

function drawFullBoard(ctx, board, colors, winningCoords = [], gameId = null) {
    const isNightmare = Boolean(colors?.p2?.isNightmare || colors?.p1?.isNightmare || colors?.isNightmare);
    drawBoardBackground(ctx, board, isNightmare, gameId);
    if (gameId) drawSideSignature(ctx, gameId);
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const x = BOARD_OFFSET_X + PADDING + c * (CELL_SIZE + PADDING) + CELL_SIZE / 2;
            const y = BOARD_OFFSET_Y + COL_NUM_HEIGHT + PADDING + r * (CELL_SIZE + PADDING) + CELL_SIZE / 2;
            const cell = board[r][c];
            const isWinning = winningCoords.some(coord => coord.r === r && coord.c === c);

            if (cell === EMPTY) {
                drawHole(ctx, x, y);
            } else {
                drawPiece(ctx, x, y, cell === PLAYER_1 ? colors.p1 : colors.p2, isWinning);
            }
        }
    }
}

function drawFlames(ctx, x, y, frame) {
    const flameCount = 12;
    for (let i = 0; i < flameCount; i++) {
        const angle = (i / flameCount) * Math.PI * 2;
        const distance = 10 + frame * 5;
        const fx = x + Math.cos(angle) * distance;
        const fy = y + Math.sin(angle) * distance;
        const size = Math.max(0, 15 - frame * 2);

        const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, size);
        grad.addColorStop(0, '#ffcc00');
        grad.addColorStop(0.5, '#ff6600');
        grad.addColorStop(1, 'rgba(255,0,0,0)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(fx, fy, size, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawGlassShatter(ctx, impactX, impactY, frame, maxFrames = 10, isNightmare = false) {
    ctx.save();

    const progress = Math.min(1.0, (frame + 1) / Math.max(1, maxFrames));
    const alpha = Math.min(1.0, 0.4 + progress * 0.6);

    const rayCount = 10;
    for (let i = 0; i < rayCount; i++) {
        const baseAngle = (i / rayCount) * Math.PI * 2 + 0.15;
        const maxDist = 280 * progress;

        ctx.beginPath();
        ctx.moveTo(impactX, impactY);
        let currX = impactX;
        let currY = impactY;
        let segDist = 0;
        let ang = baseAngle;

        while (segDist < maxDist) {
            const step = 25 + (i * 7) % 20;
            segDist += step;
            ang += ((i * 13 + segDist) % 7 - 3) * 0.08;
            currX = impactX + Math.cos(ang) * segDist;
            currY = impactY + Math.sin(ang) * segDist;
            ctx.lineTo(currX, currY);
        }

        ctx.strokeStyle = isNightmare ? `rgba(255, 180, 230, ${alpha * 0.85})` : `rgba(220, 245, 255, ${alpha * 0.85})`;
        ctx.lineWidth = 1.6;
        ctx.stroke();

        if (i % 2 === 0 && segDist > 60) {
            const branchAng = ang + ((i % 4 === 0) ? 0.6 : -0.6);
            ctx.beginPath();
            ctx.moveTo(currX - Math.cos(ang) * 30, currY - Math.sin(ang) * 30);
            ctx.lineTo(currX + Math.cos(branchAng) * 45, currY + Math.sin(branchAng) * 45);
            ctx.strokeStyle = isNightmare ? `rgba(255, 100, 200, ${alpha * 0.6})` : `rgba(200, 235, 255, ${alpha * 0.6})`;
            ctx.lineWidth = 1.0;
            ctx.stroke();
        }
    }

    const ringRadii = [35 * progress, 75 * progress, 130 * progress];
    for (let r of ringRadii) {
        if (r < 10) continue;
        ctx.beginPath();
        const segments = 12;
        for (let s = 0; s <= segments; s++) {
            const theta = (s / segments) * Math.PI * 2;
            const jitter = ((s * 17) % 9 - 4) * 3;
            const rx = impactX + Math.cos(theta) * (r + jitter);
            const ry = impactY + Math.sin(theta) * (r + jitter);
            if (s === 0) ctx.moveTo(rx, ry);
            else ctx.lineTo(rx, ry);
        }
        ctx.closePath();
        ctx.strokeStyle = isNightmare ? `rgba(255, 150, 220, ${alpha * 0.5})` : `rgba(210, 240, 255, ${alpha * 0.5})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
    }

    const cornerShards = [
        {
            pts: [[4, 4], [80, 10], [55, 75], [10, 85]],
            drift: [-2 * progress, -2 * progress],
            tint: isNightmare ? 'rgba(255, 150, 220, 0.28)' : 'rgba(200, 235, 255, 0.32)'
        },
        {
            pts: [[20, 100], [70, 80], [45, 140], [10, 130]],
            drift: [-3 * progress, 1 * progress],
            tint: isNightmare ? 'rgba(200, 100, 255, 0.22)' : 'rgba(180, 220, 255, 0.25)'
        },
        {
            pts: [[90, 8], [160, 12], [130, 50], [75, 45]],
            drift: [1 * progress, -3 * progress],
            tint: isNightmare ? 'rgba(255, 120, 180, 0.25)' : 'rgba(210, 245, 255, 0.28)'
        },
        {
            pts: [[BOARD_WIDTH - 8, 4], [BOARD_WIDTH - 75, 12], [BOARD_WIDTH - 60, 80], [BOARD_WIDTH - 12, 70]],
            drift: [2 * progress, -2 * progress],
            tint: isNightmare ? 'rgba(255, 150, 220, 0.28)' : 'rgba(200, 235, 255, 0.32)'
        },
        {
            pts: [[BOARD_WIDTH - 85, 15], [BOARD_WIDTH - 150, 25], [BOARD_WIDTH - 120, 70], [BOARD_WIDTH - 70, 65]],
            drift: [-1 * progress, -3 * progress],
            tint: isNightmare ? 'rgba(200, 100, 255, 0.22)' : 'rgba(180, 220, 255, 0.25)'
        },
        {
            pts: [[BOARD_WIDTH - 15, 85], [BOARD_WIDTH - 65, 95], [BOARD_WIDTH - 40, 155], [BOARD_WIDTH - 8, 140]],
            drift: [3 * progress, 1 * progress],
            tint: isNightmare ? 'rgba(255, 120, 180, 0.25)' : 'rgba(210, 245, 255, 0.28)'
        },
        {
            pts: [[4, BOARD_HEIGHT - 6], [85, BOARD_HEIGHT - 12], [65, BOARD_HEIGHT - 75], [10, BOARD_HEIGHT - 80]],
            drift: [-2 * progress, 2 * progress],
            tint: isNightmare ? 'rgba(255, 150, 220, 0.28)' : 'rgba(200, 235, 255, 0.32)'
        },
        {
            pts: [[12, BOARD_HEIGHT - 90], [60, BOARD_HEIGHT - 80], [40, BOARD_HEIGHT - 145], [8, BOARD_HEIGHT - 130]],
            drift: [-3 * progress, -1 * progress],
            tint: isNightmare ? 'rgba(200, 100, 255, 0.22)' : 'rgba(180, 220, 255, 0.25)'
        },
        {
            pts: [[95, BOARD_HEIGHT - 10], [165, BOARD_HEIGHT - 15], [135, BOARD_HEIGHT - 60], [80, BOARD_HEIGHT - 50]],
            drift: [1 * progress, 3 * progress],
            tint: isNightmare ? 'rgba(255, 120, 180, 0.25)' : 'rgba(210, 245, 255, 0.28)'
        },
        {
            pts: [[BOARD_WIDTH - 8, BOARD_HEIGHT - 6], [BOARD_WIDTH - 80, BOARD_HEIGHT - 15], [BOARD_WIDTH - 60, BOARD_HEIGHT - 75], [BOARD_WIDTH - 10, BOARD_HEIGHT - 80]],
            drift: [2 * progress, 2 * progress],
            tint: isNightmare ? 'rgba(255, 150, 220, 0.28)' : 'rgba(200, 235, 255, 0.32)'
        },
        {
            pts: [[BOARD_WIDTH - 15, BOARD_HEIGHT - 90], [BOARD_WIDTH - 65, BOARD_HEIGHT - 80], [BOARD_WIDTH - 45, BOARD_HEIGHT - 145], [BOARD_WIDTH - 10, BOARD_HEIGHT - 135]],
            drift: [3 * progress, -1 * progress],
            tint: isNightmare ? 'rgba(200, 100, 255, 0.22)' : 'rgba(180, 220, 255, 0.25)'
        },
        {
            pts: [[BOARD_WIDTH - 90, BOARD_HEIGHT - 12], [BOARD_WIDTH - 160, BOARD_HEIGHT - 20], [BOARD_WIDTH - 130, BOARD_HEIGHT - 65], [BOARD_WIDTH - 75, BOARD_HEIGHT - 55]],
            drift: [-1 * progress, 3 * progress],
            tint: isNightmare ? 'rgba(255, 120, 180, 0.25)' : 'rgba(210, 245, 255, 0.28)'
        }
    ];

    for (let shard of cornerShards) {
        ctx.save();
        ctx.beginPath();
        const dx = shard.drift[0];
        const dy = shard.drift[1];
        ctx.moveTo(shard.pts[0][0] + dx, shard.pts[0][1] + dy);
        for (let i = 1; i < shard.pts.length; i++) {
            ctx.lineTo(shard.pts[i][0] + dx, shard.pts[i][1] + dy);
        }
        ctx.closePath();

        ctx.fillStyle = shard.tint;
        ctx.fill();

        ctx.strokeStyle = isNightmare ? `rgba(255, 220, 245, ${alpha * 0.9})` : `rgba(255, 255, 255, ${alpha * 0.95})`;
        ctx.lineWidth = 1.4;
        ctx.stroke();

        const gx = shard.pts[0][0] + dx;
        const gy = shard.pts[0][1] + dy;
        const glint = ctx.createRadialGradient(gx, gy, 0, gx, gy, 6);
        glint.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        glint.addColorStop(0.5, isNightmare ? 'rgba(255, 180, 240, 0.4)' : 'rgba(200, 240, 255, 0.4)');
        glint.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = glint;
        ctx.beginPath();
        ctx.arc(gx, gy, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    ctx.restore();
}

function createBoard() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(EMPTY));
}

async function renderBoard(board, colors, lastMove = null, gameId = null) {
    if (lastMove) {
        return renderAnimatedBoard(board, colors, lastMove, gameId);
    }

    const canvas = Canvas.createCanvas(BOARD_WIDTH, BOARD_HEIGHT);
    const ctx = canvas.getContext('2d');
    drawFullBoard(ctx, board, colors, [], gameId);
    return canvas.toBuffer();
}

async function renderAnimatedBoard(board, colors, lastMove, gameId = null) {
    return new Promise((resolve, reject) => {
        const encoder = new GIFEncoder(BOARD_WIDTH, BOARD_HEIGHT);
        const stream = encoder.createReadStream();
        encoder.start();
        encoder.setRepeat(-1);
        encoder.setDelay(50);
        encoder.setQuality(19);

        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', (err) => reject(err));

        const canvas = Canvas.createCanvas(BOARD_WIDTH, BOARD_HEIGHT);
        const ctx = canvas.getContext('2d');

        const staticCanvas = Canvas.createCanvas(BOARD_WIDTH, BOARD_HEIGHT);
        const staticCtx = staticCanvas.getContext('2d');
        const prevBoard = createBoard();
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (r === lastMove.row && c === lastMove.col) prevBoard[r][c] = EMPTY;
                else prevBoard[r][c] = board[r][c];
            }
        }
        drawFullBoard(staticCtx, prevBoard, colors, [], gameId);

        const endY = BOARD_OFFSET_Y + COL_NUM_HEIGHT + PADDING + lastMove.row * (CELL_SIZE + PADDING) + CELL_SIZE / 2;
        const x = BOARD_OFFSET_X + PADDING + lastMove.col * (CELL_SIZE + PADDING) + CELL_SIZE / 2;
        const startY = -BALL_RADIUS;
        let currentY = startY;
        const speed = 50;
        const totalDist = endY - startY;
        const playerColorData = lastMove.player === PLAYER_1 ? colors.p1 : colors.p2;

        while (currentY < endY) {
            currentY += speed;
            if (currentY > endY) currentY = endY;

            const shineProgress = Math.min(1.0, Math.max(0.0, (currentY - startY) / totalDist));

            ctx.drawImage(staticCanvas, 0, 0);
            drawPiece(ctx, x, currentY, playerColorData, false, shineProgress);
            encoder.addFrame(ctx);
            if (currentY === endY) break;
        }

        const isWinMove = checkWin(board, lastMove.player);
        const isNightmare = Boolean(colors?.p2?.isNightmare || colors?.p1?.isNightmare || colors?.isNightmare);
        const totalPieces = board.flat().filter(c => c !== EMPTY).length;
        const isLate = totalPieces >= 24;

        if (isWinMove) {
            const winningCoords = getWinningCoords(board, lastMove.player);
            const shakeFrames = isNightmare ? 14 : 8;
            const shakeMag = isNightmare ? 18 : 10;
            for (let i = 0; i < shakeFrames; i++) {
                const decay = (shakeFrames - i) / shakeFrames;
                const shakeX = (Math.random() - 0.5) * shakeMag * decay;
                const shakeY = (Math.random() - 0.5) * shakeMag * decay;

                ctx.save();
                ctx.translate(shakeX, shakeY);
                drawFullBoard(ctx, board, colors, winningCoords, gameId);
                drawFlames(ctx, x, endY, i);
                drawGlassShatter(ctx, x, endY, i, shakeFrames, isNightmare);
                encoder.addFrame(ctx);
                ctx.restore();
            }
            for (let i = 0; i < 5; i++) {
                drawFullBoard(ctx, board, colors, winningCoords, gameId);
                drawGlassShatter(ctx, x, endY, shakeFrames, shakeFrames, isNightmare);
                encoder.addFrame(ctx);
            }
        } else {
            let impactFrames = 0;
            let impactMag = 0;

            if (isNightmare) {
                if (lastMove.player === PLAYER_2) {
                    impactFrames = isLate ? 5 : 3;
                    impactMag = isLate ? 9 : 4.5;
                } else if (isLate) {
                    impactFrames = 3;
                    impactMag = 3;
                }
            }

            if (impactFrames > 0) {
                for (let i = 0; i < impactFrames; i++) {
                    const decay = (impactFrames - i) / impactFrames;
                    const shakeX = (Math.random() - 0.5) * impactMag * decay;
                    const shakeY = (Math.random() - 0.5) * impactMag * decay;

                    ctx.save();
                    ctx.translate(shakeX, shakeY);
                    drawFullBoard(ctx, board, colors, [], gameId);
                    encoder.addFrame(ctx);
                    ctx.restore();
                }
            }

            drawFullBoard(ctx, board, colors, [], gameId);
            encoder.addFrame(ctx);
        }

        encoder.finish();
    });
}

if (parentPort && workerData) {
    (async () => {
        try {
            const { type, ...options } = workerData;
            let result;

            switch (type) {
                case 'ai':
                    result = getAIMove(options.board, options.difficulty || 'hard');
                    break;
                case 'render':
                    result = await renderBoard(options.board, options.colors, options.lastMove || null, options.gameId || null);
                    break;
                default:
                    throw new Error(`Unknown task type: ${type}`);
            }

            parentPort.postMessage({ data: result });
        } catch (error) {
            parentPort.postMessage({ error: error.message });
        }
    })();
}

// contributors: @relentiousdragon
