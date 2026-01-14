const mongoose = require('mongoose');
//
const hangmanSchema = new mongoose.Schema({
    _id: { type: String, default: 'current' },
    word: { type: String, required: true },
    description: { type: String, default: null },
    setByUserId: { type: String, required: true },
    setByUsername: { type: String, required: true },
    setAt: { type: Number, required: true },
    expiresAt: { type: Number, required: true },
    solved: { type: Number, default: 0 },
    attempts: { type: Number, default: 0 },
    winners: { type: [String], default: [] },
    firstWinner: {
        userId: { type: String, default: null },
        username: { type: String, default: null },
        solveTime: { type: Number, default: null }
    },
    failedPlayers: { type: [String], default: [] },
    pendingWord: {
        word: { type: String, default: null },
        description: { type: String, default: null },
        setByUserId: { type: String, default: null },
        setByUsername: { type: String, default: null }
    }
});
//
module.exports = mongoose.model('Hangman', hangmanSchema);


// contributors: @relentiousdragon