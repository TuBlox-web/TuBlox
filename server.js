require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();

// ═══════════════════════════════════════════════════════════════
// MONGOOSE CONNECTION (Vercel-friendly singleton)
// ═══════════════════════════════════════════════════════════════

let isConnected = false;

async function connectDB() {
    if (isConnected) return;

    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI, {
            bufferCommands: false,
        });
        isConnected = conn.connections[0].readyState === 1;
        console.log('MongoDB connected');
    } catch (err) {
        console.error('MongoDB connection error:', err);
        throw err;
    }
}

// ═══════════════════════════════════════════════════════════════
// EXPRESS MIDDLEWARE
// ═══════════════════════════════════════════════════════════════

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ═══════════════════════════════════════════════════════════════
// MONGOOSE SCHEMAS
// ═══════════════════════════════════════════════════════════════

const counterSchema = new mongoose.Schema({
    _id: String,
    seq: { type: Number, default: 0 }
});
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

async function getNextUserId() {
    const counter = await Counter.findByIdAndUpdate('userId', { $inc: { seq: 1 } }, { new: true, upsert: true });
    return counter.seq;
}

async function getNextPostId() {
    const counter = await Counter.findByIdAndUpdate('postId', { $inc: { seq: 1 } }, { new: true, upsert: true });
    return counter.seq;
}

async function getNextReplyId() {
    const counter = await Counter.findByIdAndUpdate('replyId', { $inc: { seq: 1 } }, { new: true, upsert: true });
    return counter.seq;
}

const userSchema = new mongoose.Schema({
    odilId: { type: Number, unique: true },
    username: { type: String, required: true, unique: true, minlength: 3, maxlength: 20, lowercase: true, trim: true },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    lastLogin: { type: Date, default: Date.now },
    lastSeen: { type: Date, default: Date.now },
    gameData: {
        level: { type: Number, default: 1 },
        coins: { type: Number, default: 0 },
        playTime: { type: Number, default: 0 }
    }
});
const User = mongoose.models.User || mongoose.model('User', userSchema);

const gameSchema = new mongoose.Schema({
    id: { type: String, unique: true, required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    creator: { type: String, required: true },
    creatorId: { type: Number },
    thumbnail: { type: String, default: '' },
    featured: { type: Boolean, default: false },
    category: { type: String, default: 'other' },
    visits: { type: Number, default: 0 },
    activePlayers: { type: Number, default: 0 },
    maxPlayers: { type: Number, default: 50 },
    buildData: { type: mongoose.Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});
const Game = mongoose.models.Game || mongoose.model('Game', gameSchema);

const launchTokenSchema = new mongoose.Schema({
    token: { type: String, unique: true },
    odilId: { type: Number, required: true },
    username: { type: String, required: true },
    gameId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: 300 }
});
const LaunchToken = mongoose.models.LaunchToken || mongoose.model('LaunchToken', launchTokenSchema);

const forumPostSchema = new mongoose.Schema({
    postId: { type: Number, unique: true },
    authorId: { type: Number, required: true },
    authorName: { type: String, required: true },
    title: { type: String, required: true, maxlength: 100 },
    content: { type: String, required: true, maxlength: 5000 },
    category: { type: String, default: 'general' },
    likes: [{ type: Number }],
    views: { type: Number, default: 0 },
    replies: { type: Number, default: 0 },
    isPinned: { type: Boolean, default: false },
    isLocked: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});
const ForumPost = mongoose.models.ForumPost || mongoose.model('ForumPost', forumPostSchema);

const forumReplySchema = new mongoose.Schema({
    replyId: { type: Number, unique: true },
    postId: { type: Number, required: true },
    authorId: { type: Number, required: true },
    authorName: { type: String, required: true },
    content: { type: String, required: true, maxlength: 2000 },
    likes: [{ type: Number }],
    createdAt: { type: Date, default: Date.now }
});
const ForumReply = mongoose.models.ForumReply || mongoose.model('ForumReply', forumReplySchema);

const banSchema = new mongoose.Schema({
    odilId: { type: Number },
    ip: { type: String },
    reason: { type: String },
    bannedBy: { type: Number },
    bannedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null }
});
const Ban = mongoose.models.Ban || mongoose.model('Ban', banSchema);

const whitelistSchema = new mongoose.Schema({
    odilId: { type: Number, unique: true, required: true },
    username: { type: String, required: true },
    status: { type: String, default: 'approved', enum: ['pending', 'approved', 'rejected'] },
    requestedAt: { type: Date, default: Date.now },
    approvedAt: { type: Date }
});
const Whitelist = mongoose.models.Whitelist || mongoose.model('Whitelist', whitelistSchema);

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const ADMIN_IDS = [1];
const AUTO_APPROVE = true;

const BADGES = {
    'Staff': {
        id: 'Staff',
        name: 'Staff',
        description: 'TuBlox Staff Member',
        icon: '/img/badges/Staff.svg',
        color: '#ff4444',
        rarity: 'legendary',
        holders: [1, 5]
    },
    'TuBloxUser': {
        id: 'TuBloxUser',
        name: 'TuBlox User',
        description: 'Verified TuBlox Player',
        icon: '/img/badges/TuBloxUser.svg',
        color: '#4488ff',
        rarity: 'common',
        holders: null
    }
};

function getUserBadges(odilId) {
    const badges = [];
    for (const [badgeId, badge] of Object.entries(BADGES)) {
        if (badge.holders === null) {
            badges.push({ id: badge.id, name: badge.name, description: badge.description, icon: badge.icon, color: badge.color, rarity: badge.rarity });
        } else if (Array.isArray(badge.holders) && badge.holders.includes(odilId)) {
            badges.push({ id: badge.id, name: badge.name, description: badge.description, icon: badge.icon, color: badge.color, rarity: badge.rarity });
        }
    }
    const rarityOrder = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4 };
    badges.sort((a, b) => (rarityOrder[a.rarity] || 99) - (rarityOrder[b.rarity] || 99));
    return badges;
}

// ═══════════════════════════════════════════════════════════════
// GAME BUILD DATA
// ═══════════════════════════════════════════════════════════════

const baseplateBuildData = {
    objects: [
        { type: 'cube', position: { x: 0, y: -0.5, z: 0 }, scale: { x: 100, y: 1, z: 100 }, color: { r: 0.3, g: 0.8, b: 0.3 }, isStatic: true },
        { type: 'spawn', position: { x: 0, y: 2, z: 0 } }
    ],
    settings: { gravity: -20, skyColor: { r: 0.53, g: 0.81, b: 0.92 }, ambientColor: { r: 0.4, g: 0.4, b: 0.5 }, fogEnabled: false, spawnPoint: { x: 0, y: 2, z: 0 } },
    version: 1
};

const obbyBuildData = {
    objects: [
        { type: 'cube', position: { x: 0, y: 0, z: 0 }, scale: { x: 8, y: 1, z: 8 }, color: { r: 0.2, g: 0.6, b: 0.2 }, isStatic: true },
        { type: 'spawn', position: { x: 0, y: 2, z: 0 } },
        { type: 'cube', position: { x: 0, y: 0, z: 12 }, scale: { x: 4, y: 1, z: 4 }, color: { r: 0.9, g: 0.3, b: 0.3 }, isStatic: true },
        { type: 'cube', position: { x: 0, y: 2, z: 20 }, scale: { x: 4, y: 1, z: 4 }, color: { r: 0.9, g: 0.6, b: 0.2 }, isStatic: true },
        { type: 'cube', position: { x: 6, y: 4, z: 20 }, scale: { x: 3, y: 1, z: 3 }, color: { r: 0.9, g: 0.9, b: 0.2 }, isStatic: true },
        { type: 'cube', position: { x: 12, y: 6, z: 20 }, scale: { x: 3, y: 1, z: 3 }, color: { r: 0.2, g: 0.9, b: 0.2 }, isStatic: true },
        { type: 'cube', position: { x: 12, y: 8, z: 12 }, scale: { x: 3, y: 1, z: 3 }, color: { r: 0.2, g: 0.7, b: 0.9 }, isStatic: true },
        { type: 'cube', position: { x: 12, y: 10, z: 4 }, scale: { x: 3, y: 1, z: 3 }, color: { r: 0.5, g: 0.2, b: 0.9 }, isStatic: true },
        { type: 'cube', position: { x: 12, y: 12, z: -4 }, scale: { x: 6, y: 1, z: 6 }, color: { r: 1.0, g: 0.84, b: 0.0 }, isStatic: true }
    ],
    settings: { gravity: -25, skyColor: { r: 0.4, g: 0.6, b: 0.9 }, ambientColor: { r: 0.5, g: 0.5, b: 0.6 }, fogEnabled: false, spawnPoint: { x: 0, y: 2, z: 0 } },
    version: 1
};

const hotelBuildData = {
    objects: [
        { type: 'cube', position: { x: 0, y: 0, z: 0 }, scale: { x: 30, y: 0.5, z: 40 }, color: { r: 0.15, g: 0.1, b: 0.08 }, isStatic: true },
        { type: 'cube', position: { x: 0, y: 0.26, z: 0 }, scale: { x: 12, y: 0.02, z: 20 }, color: { r: 0.6, g: 0.1, b: 0.15 }, isStatic: true },
        { type: 'cube', position: { x: 0, y: 10, z: 0 }, scale: { x: 30, y: 0.5, z: 40 }, color: { r: 0.95, g: 0.93, b: 0.88 }, isStatic: true },
        { type: 'cube', position: { x: -15, y: 5, z: 0 }, scale: { x: 0.5, y: 10, z: 40 }, color: { r: 0.85, g: 0.8, b: 0.7 }, isStatic: true },
        { type: 'cube', position: { x: 15, y: 5, z: 0 }, scale: { x: 0.5, y: 10, z: 40 }, color: { r: 0.85, g: 0.8, b: 0.7 }, isStatic: true },
        { type: 'cube', position: { x: 0, y: 5, z: -20 }, scale: { x: 30, y: 10, z: 0.5 }, color: { r: 0.85, g: 0.8, b: 0.7 }, isStatic: true },
        { type: 'cube', position: { x: -10, y: 5, z: 20 }, scale: { x: 10, y: 10, z: 0.5 }, color: { r: 0.85, g: 0.8, b: 0.7 }, isStatic: true },
        { type: 'cube', position: { x: 10, y: 5, z: 20 }, scale: { x: 10, y: 10, z: 0.5 }, color: { r: 0.85, g: 0.8, b: 0.7 }, isStatic: true },
        { type: 'cube', position: { x: 0, y: 1.5, z: -15 }, scale: { x: 10, y: 3, z: 2 }, color: { r: 0.3, g: 0.2, b: 0.15 }, isStatic: true },
        { type: 'cube', position: { x: -10, y: 0.8, z: 5 }, scale: { x: 5, y: 1.6, z: 2 }, color: { r: 0.2, g: 0.15, b: 0.4 }, isStatic: true },
        { type: 'cube', position: { x: 10, y: 0.8, z: 5 }, scale: { x: 5, y: 1.6, z: 2 }, color: { r: 0.2, g: 0.15, b: 0.4 }, isStatic: true },
        { type: 'spawn', position: { x: 0, y: 2, z: 15 } }
    ],
    settings: { gravity: -20, skyColor: { r: 0.1, g: 0.1, b: 0.15 }, ambientColor: { r: 0.6, g: 0.55, b: 0.5 }, fogEnabled: false, spawnPoint: { x: 0, y: 2, z: 15 } },
    version: 1
};

const DEFAULT_GAMES = [
    { id: 'baseplate', title: 'Baseplate', description: 'A simple green baseplate. Perfect for hanging out with friends!', creator: 'Today_Idk', creatorId: 1, featured: true, category: 'sandbox', maxPlayers: 50, buildData: baseplateBuildData },
    { id: 'obby', title: 'Obby', description: 'Jump through colorful platforms and reach the golden finish!', creator: 'Today_Idk', creatorId: 1, featured: true, category: 'obby', maxPlayers: 30, buildData: obbyBuildData },
    { id: 'hotel', title: 'Hotel', description: 'A beautiful hotel lobby. Relax and meet new people!', creator: 'Today_Idk', creatorId: 1, featured: true, category: 'roleplay', maxPlayers: 40, buildData: hotelBuildData }
];

// ═══════════════════════════════════════════════════════════════
// SEED GAMES (upsert — не удаляет, не дублирует)
// ═══════════════════════════════════════════════════════════════

async function seedGames() {
    for (const gameData of DEFAULT_GAMES) {
        await Game.findOneAndUpdate(
            { id: gameData.id },
            { $setOnInsert: { ...gameData, visits: 0, activePlayers: 0, createdAt: new Date(), updatedAt: new Date() } },
            { upsert: true, new: true }
        );
    }
    console.log('[Seed] Games ensured (upsert)');
}

// ═══════════════════════════════════════════════════════════════
// PRESENCE (Vercel serverless — no persistent state)
// In serverless, we rely on lastSeen from DB
// ═══════════════════════════════════════════════════════════════

function getUserPresence(odilId) {
    // In serverless, we can't track real-time presence
    // Return offline — real presence tracked by WS server (separate service)
    return { isOnline: false, currentGame: null };
}

async function enrichPresenceWithGameInfo(presence) {
    if (!presence.currentGame || !presence.currentGame.gameId) return presence;
    try {
        const game = await Game.findOne({ id: presence.currentGame.gameId }).select('title thumbnail id').lean();
        if (game) {
            presence.currentGame.id = game.id;
            presence.currentGame.title = game.title || game.id;
            presence.currentGame.thumbnail = game.thumbnail || '';
        }
    } catch (err) {
        console.error('[Presence] Error:', err.message);
    }
    return presence;
}

// ═══════════════════════════════════════════════════════════════
// AUTH MIDDLEWARE
// ═══════════════════════════════════════════════════════════════

const auth = async (req, res, next) => {
    try {
        await connectDB();
        const token = req.cookies.token;
        if (!token) return res.redirect('/auth');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');
        if (!user) { res.clearCookie('token'); return res.redirect('/auth'); }
        req.user = user;
        next();
    } catch (err) {
        res.clearCookie('token');
        res.redirect('/auth');
    }
};

const authAPI = async (req, res, next) => {
    try {
        await connectDB();
        const token = req.cookies.token;
        if (!token) return res.status(401).json({ success: false, message: 'Not authorized' });
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');
        if (!user) { res.clearCookie('token'); return res.status(401).json({ success: false, message: 'Not authorized' }); }
        req.user = user;
        next();
    } catch (err) {
        res.clearCookie('token');
        res.status(401).json({ success: false, message: 'Not authorized' });
    }
};

const adminAPI = async (req, res, next) => {
    await authAPI(req, res, () => {
        if (!ADMIN_IDS.includes(req.user.odilId)) {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }
        next();
    });
};

// ═══════════════════════════════════════════════════════════════
// HEALTH
// ═══════════════════════════════════════════════════════════════

app.get('/api/health', async (req, res) => {
    try {
        await connectDB();
        res.json({ status: 'ok', platform: 'vercel', uptime: process.uptime() });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// PAGES
// ═══════════════════════════════════════════════════════════════

app.get('/', (req, res) => {
    try {
        const token = req.cookies.token;
        if (token && jwt.verify(token, process.env.JWT_SECRET)) return res.redirect('/home');
    } catch (e) { res.clearCookie('token'); }
    res.sendFile(path.join(__dirname, 'pages', 'landing.html'));
});

app.get('/auth', (req, res) => {
    try {
        const token = req.cookies.token;
        if (token && jwt.verify(token, process.env.JWT_SECRET)) return res.redirect('/home');
    } catch (e) { res.clearCookie('token'); }
    res.sendFile(path.join(__dirname, 'pages', 'auth.html'));
});

app.get('/home', auth, (req, res) => res.sendFile(path.join(__dirname, 'pages', 'home.html')));
app.get('/games', auth, (req, res) => res.sendFile(path.join(__dirname, 'pages', 'games.html')));
app.get('/game/:id', auth, (req, res) => res.sendFile(path.join(__dirname, 'pages', 'game.html')));
app.get('/users', (req, res) => res.sendFile(path.join(__dirname, 'pages', 'users.html')));
app.get('/user/:id', (req, res) => res.sendFile(path.join(__dirname, 'pages', 'profile.html')));
app.get('/TuForums', (req, res) => res.sendFile(path.join(__dirname, 'pages', 'forum.html')));
app.get('/TuForums/:ownerId', (req, res) => res.sendFile(path.join(__dirname, 'pages', 'forum-user.html')));
app.get('/TuForums/:ownerId/:postId', (req, res) => res.sendFile(path.join(__dirname, 'pages', 'forum-post.html')));
app.get('/whitelist', (req, res) => res.sendFile(path.join(__dirname, 'pages', 'whitelist.html')));

// ═══════════════════════════════════════════════════════════════
// API - AUTH
// ═══════════════════════════════════════════════════════════════

app.post('/api/register', async (req, res) => {
    try {
        await connectDB();
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ success: false, message: 'All fields required' });

        const cleanUsername = username.toLowerCase().trim();
        if (cleanUsername.length < 3 || cleanUsername.length > 20) return res.status(400).json({ success: false, message: 'Username must be 3-20 characters' });
        if (!/^[a-z0-9_]+$/.test(cleanUsername)) return res.status(400).json({ success: false, message: 'Username can only contain letters, numbers and underscore' });
        if (password.length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });

        const exists = await User.findOne({ username: cleanUsername });
        if (exists) return res.status(400).json({ success: false, message: 'Username already taken' });

        const odilId = await getNextUserId();
        const hash = await bcrypt.hash(password, 12);
        const user = new User({ username: cleanUsername, password: hash, odilId, lastSeen: new Date() });
        await user.save();

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'strict' });
        res.json({ success: true, odilId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        await connectDB();
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ success: false, message: 'All fields required' });

        const cleanUsername = username.toLowerCase().trim();
        const user = await User.findOne({ username: cleanUsername });
        if (!user) return res.status(400).json({ success: false, message: 'Invalid username or password' });

        // Check if banned
        const ban = await Ban.findOne({ odilId: user.odilId, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] });
        if (ban) return res.status(403).json({ success: false, message: 'Your account is banned' });

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(400).json({ success: false, message: 'Invalid username or password' });

        user.lastLogin = new Date();
        user.lastSeen = new Date();
        await user.save();

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'strict' });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/logout', async (req, res) => {
    try {
        await connectDB();
        const token = req.cookies.token;
        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            await User.findByIdAndUpdate(decoded.id, { lastSeen: new Date() });
        }
    } catch (e) {}
    res.clearCookie('token');
    res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════
// API - USER
// ═══════════════════════════════════════════════════════════════

app.get('/api/user', authAPI, (req, res) => {
    const presence = getUserPresence(req.user.odilId);
    const badges = getUserBadges(req.user.odilId);

    res.json({
        success: true,
        user: {
            id: req.user._id,
            odilId: req.user.odilId,
            username: req.user.username,
            createdAt: req.user.createdAt,
            lastSeen: req.user.lastSeen,
            isOnline: presence.isOnline,
            currentGame: presence.currentGame,
            gameData: req.user.gameData,
            isAdmin: ADMIN_IDS.includes(req.user.odilId),
            badges: badges
        }
    });
});

app.get('/api/users', async (req, res) => {
    try {
        await connectDB();
        const users = await User.find().select('odilId username gameData createdAt lastSeen').sort({ createdAt: -1 }).limit(100);
        const usersWithPresence = users.map(u => {
            const presence = getUserPresence(u.odilId);
            return { ...u.toObject(), isOnline: presence.isOnline, currentGame: presence.currentGame };
        });
        res.json({ success: true, users: usersWithPresence });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/user/:id', async (req, res) => {
    try {
        await connectDB();
        const odilId = parseInt(req.params.id);
        if (isNaN(odilId)) return res.status(400).json({ success: false, message: 'Invalid user ID' });

        const user = await User.findOne({ odilId }).select('odilId username gameData createdAt lastSeen lastLogin');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const presence = getUserPresence(odilId);
        const badges = getUserBadges(odilId);

        res.json({
            success: true,
            user: {
                odilId: user.odilId,
                username: user.username,
                gameData: user.gameData,
                createdAt: user.createdAt,
                isOnline: presence.isOnline,
                currentGame: presence.currentGame,
                lastSeen: user.lastSeen || user.lastLogin || user.createdAt,
                isAdmin: ADMIN_IDS.includes(odilId),
                badges: badges
            }
        });
    } catch (err) {
        console.error('[API] User error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ═══════════════════════════════════════════════════════════════
// API - BADGES
// ═══════════════════════════════════════════════════════════════

app.get('/api/badges', (req, res) => {
    const allBadges = Object.values(BADGES).map(b => ({
        id: b.id, name: b.name, description: b.description, icon: b.icon, color: b.color, rarity: b.rarity, isExclusive: b.holders !== null
    }));
    res.json({ success: true, badges: allBadges });
});

app.get('/api/user/:id/badges', async (req, res) => {
    try {
        await connectDB();
        const odilId = parseInt(req.params.id);
        if (isNaN(odilId)) return res.status(400).json({ success: false, message: 'Invalid user ID' });

        const user = await User.findOne({ odilId }).select('odilId username');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const badges = getUserBadges(odilId);
        res.json({ success: true, badges, username: user.username, odilId: user.odilId });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ═══════════════════════════════════════════════════════════════
// API - GAMES
// ═══════════════════════════════════════════════════════════════

app.get('/api/games', async (req, res) => {
    try {
        await connectDB();
        await seedGames();

        const { featured, category, page = 1, limit = 3 } = req.query;
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(12, Math.max(1, parseInt(limit) || 3));
        const skip = (pageNum - 1) * limitNum;

        let query = {};
        if (featured === 'true') query.featured = true;
        if (category && category !== 'all') query.category = category;

        const totalGames = await Game.countDocuments(query);
        const totalPages = Math.ceil(totalGames / limitNum);

        const games = await Game.find(query).select('-buildData').sort({ featured: -1, visits: -1 }).skip(skip).limit(limitNum);

        const gamesWithPlayers = games.map(g => ({ ...g.toObject(), activePlayers: 0 }));

        res.json({
            success: true,
            games: gamesWithPlayers,
            pagination: { currentPage: pageNum, totalPages, totalGames, gamesPerPage: limitNum, hasNextPage: pageNum < totalPages, hasPrevPage: pageNum > 1 }
        });
    } catch (err) {
        console.error('[API] Games error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/game/:id', async (req, res) => {
    try {
        await connectDB();
        await seedGames();
        const game = await Game.findOne({ id: req.params.id }).select('-buildData');
        if (!game) return res.status(404).json({ success: false, message: 'Game not found' });
        res.json({ success: true, game: { ...game.toObject(), activePlayers: 0 } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/game/:id/servers', async (req, res) => {
    try {
        // In serverless, no persistent game servers
        res.json({ success: true, servers: [] });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/game/launch', authAPI, async (req, res) => {
    try {
        await connectDB();
        await seedGames();

        const { gameId } = req.body;
        if (!gameId) return res.status(400).json({ success: false, message: 'gameId required' });

        const game = await Game.findOne({ id: gameId });
        if (!game) return res.status(404).json({ success: false, message: 'Game not found' });

        // Check if banned
        const ban = await Ban.findOne({ odilId: req.user.odilId, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] });
        if (ban) return res.status(403).json({ success: false, message: 'You are banned from playing' });

        await Game.findOneAndUpdate({ id: gameId }, { $inc: { visits: 1 } });

        const launchToken = crypto.randomBytes(32).toString('hex');
        await LaunchToken.create({ token: launchToken, odilId: req.user.odilId, username: req.user.username, gameId: game.id });

        // For Vercel, WS host should point to your separate WS server (e.g. on Render)
        const wsHost = process.env.WS_HOST || 'tublox.onrender.com';
        const wsPort = parseInt(process.env.WS_PORT) || 443;

        res.json({ success: true, token: launchToken, wsHost, wsPort, gameId: game.id });
    } catch (err) {
        console.error('[Launch] Error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/game/validate/:token', async (req, res) => {
    try {
        await connectDB();
        const launchData = await LaunchToken.findOne({ token: req.params.token });
        if (!launchData) return res.status(404).json({ success: false, message: 'Invalid or expired token' });

        // Check if banned
        const ban = await Ban.findOne({ odilId: launchData.odilId, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] });
        if (ban) {
            await LaunchToken.deleteOne({ token: req.params.token });
            return res.status(403).json({ success: false, message: 'You are banned' });
        }

        const game = await Game.findOne({ id: launchData.gameId });
        await LaunchToken.deleteOne({ token: req.params.token });

        const wsHost = process.env.WS_HOST || 'tublox.onrender.com';

        res.json({
            success: true,
            odilId: launchData.odilId,
            username: launchData.username,
            gameId: launchData.gameId,
            wsHost,
            wsPort: 443,
            buildData: game?.buildData || baseplateBuildData,
            gameName: game?.title || launchData.gameId,
            creatorName: game?.creator || 'Unknown'
        });
    } catch (err) {
        console.error('[Validate] Error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ═══════════════════════════════════════════════════════════════
// API - WHITELIST
// ═══════════════════════════════════════════════════════════════

app.get('/api/whitelist/count', async (req, res) => {
    try {
        await connectDB();
        const count = await Whitelist.countDocuments({ status: 'approved' });
        res.json({ success: true, count });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.get('/api/whitelist/me', authAPI, async (req, res) => {
    try {
        const entry = await Whitelist.findOne({ odilId: req.user.odilId });
        res.json({
            success: true,
            whitelisted: entry?.status === 'approved',
            pending: entry?.status === 'pending',
            status: entry?.status || null
        });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.post('/api/whitelist/request', authAPI, async (req, res) => {
    try {
        const existing = await Whitelist.findOne({ odilId: req.user.odilId });
        if (existing) {
            if (existing.status === 'approved') return res.json({ success: true, whitelisted: true, autoApproved: false });
            if (existing.status === 'pending') return res.json({ success: true, pending: true });
            if (existing.status === 'rejected') return res.status(400).json({ success: false, message: 'Request was rejected' });
        }

        const entry = new Whitelist({
            odilId: req.user.odilId,
            username: req.user.username,
            status: AUTO_APPROVE ? 'approved' : 'pending',
            approvedAt: AUTO_APPROVE ? new Date() : null
        });
        await entry.save();

        res.json({ success: true, autoApproved: AUTO_APPROVE, whitelisted: AUTO_APPROVE, pending: !AUTO_APPROVE });
    } catch (err) {
        console.error('[Whitelist] Error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/whitelist/check/:id', async (req, res) => {
    try {
        await connectDB();
        const odilId = parseInt(req.params.id);
        const entry = await Whitelist.findOne({ odilId, status: 'approved' });
        res.json({ success: true, whitelisted: !!entry });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.get('/api/whitelist', authAPI, async (req, res) => {
    try {
        if (!ADMIN_IDS.includes(req.user.odilId)) return res.status(403).json({ success: false, message: 'Admin only' });
        const { status } = req.query;
        const query = status ? { status } : {};
        const entries = await Whitelist.find(query).sort({ requestedAt: -1 });
        res.json({ success: true, entries, count: entries.length });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.patch('/api/whitelist/:id', authAPI, async (req, res) => {
    try {
        if (!ADMIN_IDS.includes(req.user.odilId)) return res.status(403).json({ success: false, message: 'Admin only' });
        const odilId = parseInt(req.params.id);
        const { status } = req.body;
        if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ success: false, message: 'Invalid status' });

        const entry = await Whitelist.findOneAndUpdate(
            { odilId },
            { status, approvedAt: status === 'approved' ? new Date() : null },
            { new: true }
        );
        if (!entry) return res.status(404).json({ success: false, message: 'Not found' });
        res.json({ success: true, entry });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.delete('/api/whitelist/:id', authAPI, async (req, res) => {
    try {
        if (!ADMIN_IDS.includes(req.user.odilId)) return res.status(403).json({ success: false, message: 'Admin only' });
        const odilId = parseInt(req.params.id);
        const entry = await Whitelist.findOneAndDelete({ odilId });
        if (!entry) return res.status(404).json({ success: false, message: 'Not found' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// ═══════════════════════════════════════════════════════════════
// API - ADMIN (Ban management via DB)
// ═══════════════════════════════════════════════════════════════

app.get('/api/admin/bans', adminAPI, async (req, res) => {
    try {
        const bans = await Ban.find({}).sort({ bannedAt: -1 });
        res.json({ success: true, bans });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/admin/ban', adminAPI, async (req, res) => {
    try {
        const { odilId, ip, reason, duration } = req.body;
        if (!odilId && !ip) return res.status(400).json({ success: false, message: 'odilId or ip required' });

        const ban = new Ban({
            odilId: odilId || null,
            ip: ip || null,
            reason: reason || 'Banned by admin',
            bannedBy: req.user.odilId,
            expiresAt: duration ? new Date(Date.now() + duration * 1000) : null
        });
        await ban.save();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/admin/unban', adminAPI, async (req, res) => {
    try {
        const { odilId, ip } = req.body;
        if (odilId) await Ban.deleteMany({ odilId });
        if (ip) await Ban.deleteMany({ ip });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ═══════════════════════════════════════════════════════════════
// API - FORUM
// ═══════════════════════════════════════════════════════════════

const FORUM_CATEGORIES = [
    { id: 'general', name: 'General', description: 'General discussion' },
    { id: 'games', name: 'Games', description: 'Talk about games' },
    { id: 'creations', name: 'Creations', description: 'Share your creations' },
    { id: 'help', name: 'Help', description: 'Get help from community' },
    { id: 'suggestions', name: 'Suggestions', description: 'Suggest new features' },
    { id: 'offtopic', name: 'Off-Topic', description: 'Random discussions' }
];

app.get('/api/forum/categories', (req, res) => {
    res.json({ success: true, categories: FORUM_CATEGORIES });
});

app.get('/api/forum/posts', async (req, res) => {
    try {
        await connectDB();
        const { page = 1, limit = 15, category, sort = 'newest', search } = req.query;
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 15));
        const skip = (pageNum - 1) * limitNum;

        let query = {};
        if (category && category !== 'all') query.category = category;
        if (search) query.$or = [{ title: { $regex: search, $options: 'i' } }, { content: { $regex: search, $options: 'i' } }];

        let sortOption = { isPinned: -1 };
        switch (sort) {
            case 'newest': sortOption.createdAt = -1; break;
            case 'oldest': sortOption.createdAt = 1; break;
            case 'popular': sortOption.views = -1; break;
            case 'mostliked': sortOption = { isPinned: -1, likes: -1 }; break;
            case 'mostreplies': sortOption.replies = -1; break;
            default: sortOption.createdAt = -1;
        }

        const totalPosts = await ForumPost.countDocuments(query);
        const totalPages = Math.ceil(totalPosts / limitNum);
        const posts = await ForumPost.find(query).sort(sortOption).skip(skip).limit(limitNum).lean();

        res.json({ success: true, posts, pagination: { currentPage: pageNum, totalPages, totalPosts, hasNextPage: pageNum < totalPages, hasPrevPage: pageNum > 1 } });
    } catch (err) {
        console.error('[Forum] Error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/forum/user/:ownerId/posts', async (req, res) => {
    try {
        await connectDB();
        const { page = 1, limit = 15 } = req.query;
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 15));
        const skip = (pageNum - 1) * limitNum;
        const authorId = parseInt(req.params.ownerId);

        const user = await User.findOne({ odilId: authorId }).select('username odilId');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const totalPosts = await ForumPost.countDocuments({ authorId });
        const totalPages = Math.ceil(totalPosts / limitNum);
        const posts = await ForumPost.find({ authorId }).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean();

        res.json({ success: true, user: { username: user.username, odilId: user.odilId }, posts, pagination: { currentPage: pageNum, totalPages, totalPosts, hasNextPage: pageNum < totalPages, hasPrevPage: pageNum > 1 } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/forum/post/:ownerId/:postId', async (req, res) => {
    try {
        await connectDB();
        const post = await ForumPost.findOne({ postId: parseInt(req.params.postId), authorId: parseInt(req.params.ownerId) });
        if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

        post.views += 1;
        await post.save();

        const replies = await ForumReply.find({ postId: post.postId }).sort({ createdAt: 1 }).lean();
        res.json({ success: true, post, replies });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/forum/posts', authAPI, async (req, res) => {
    try {
        // Check if banned
        const ban = await Ban.findOne({ odilId: req.user.odilId, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] });
        if (ban) return res.status(403).json({ success: false, message: 'You are banned' });

        const { title, content, category } = req.body;
        if (!title || !content) return res.status(400).json({ success: false, message: 'Title and content required' });
        if (title.length > 100) return res.status(400).json({ success: false, message: 'Title too long (max 100)' });
        if (content.length > 5000) return res.status(400).json({ success: false, message: 'Content too long (max 5000)' });

        const validCategory = FORUM_CATEGORIES.find(c => c.id === category);
        const postId = await getNextPostId();

        const post = new ForumPost({ postId, authorId: req.user.odilId, authorName: req.user.username, title: title.trim(), content: content.trim(), category: validCategory ? category : 'general' });
        await post.save();

        res.json({ success: true, post, url: `/TuForums/${req.user.odilId}/${postId}` });
    } catch (err) {
        console.error('[Forum] Create error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/forum/post/:postId/reply', authAPI, async (req, res) => {
    try {
        const ban = await Ban.findOne({ odilId: req.user.odilId, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] });
        if (ban) return res.status(403).json({ success: false, message: 'You are banned' });

        const { content } = req.body;
        if (!content || content.trim().length === 0) return res.status(400).json({ success: false, message: 'Content required' });
        if (content.length > 2000) return res.status(400).json({ success: false, message: 'Reply too long (max 2000)' });

        const post = await ForumPost.findOne({ postId: parseInt(req.params.postId) });
        if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
        if (post.isLocked) return res.status(403).json({ success: false, message: 'Post is locked' });

        const replyId = await getNextReplyId();
        const reply = new ForumReply({ replyId, postId: post.postId, authorId: req.user.odilId, authorName: req.user.username, content: content.trim() });
        await reply.save();

        post.replies += 1;
        post.updatedAt = new Date();
        await post.save();

        res.json({ success: true, reply });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/forum/post/:postId/like', authAPI, async (req, res) => {
    try {
        const post = await ForumPost.findOne({ postId: parseInt(req.params.postId) });
        if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

        const userId = req.user.odilId;
        const hasLiked = post.likes.includes(userId);
        if (hasLiked) post.likes = post.likes.filter(id => id !== userId);
        else post.likes.push(userId);
        await post.save();

        res.json({ success: true, liked: !hasLiked, likesCount: post.likes.length });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/forum/reply/:replyId/like', authAPI, async (req, res) => {
    try {
        const reply = await ForumReply.findOne({ replyId: parseInt(req.params.replyId) });
        if (!reply) return res.status(404).json({ success: false, message: 'Reply not found' });

        const userId = req.user.odilId;
        const hasLiked = reply.likes.includes(userId);
        if (hasLiked) reply.likes = reply.likes.filter(id => id !== userId);
        else reply.likes.push(userId);
        await reply.save();

        res.json({ success: true, liked: !hasLiked, likesCount: reply.likes.length });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.delete('/api/forum/post/:postId', authAPI, async (req, res) => {
    try {
        const post = await ForumPost.findOne({ postId: parseInt(req.params.postId) });
        if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

        if (post.authorId !== req.user.odilId && !ADMIN_IDS.includes(req.user.odilId)) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        await ForumReply.deleteMany({ postId: post.postId });
        await post.deleteOne();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ═══════════════════════════════════════════════════════════════
// API - DEBUG
// ═══════════════════════════════════════════════════════════════

app.post('/api/heartbeat', authAPI, (req, res) => {
    res.json({ success: true, timestamp: Date.now() });
});

// ═══════════════════════════════════════════════════════════════
// API - VERSION
// ═══════════════════════════════════════════════════════════════

app.get('/api/version', (req, res) => {
    res.json({
        version: "0.5.2",
        downloadUrl: "https://tublox.vercel.app/download/TuClient.zip",
        message: "Patch 0.5.2 - Fix"
    });
});

// ═══════════════════════════════════════════════════════════════
// DOWNLOADS
// ═══════════════════════════════════════════════════════════════

app.get('/download/TuBloxSetup.exe', (req, res) => {
    const filePath = path.join(__dirname, 'public', 'download', 'TuBloxSetup.exe');
    if (!fs.existsSync(filePath)) return res.status(404).send('File not found');
    res.download(filePath, 'TuBloxSetup.exe');
});

app.get('/download/TuClient.zip', (req, res) => {
    const filePath = path.join(__dirname, 'public', 'download', 'TuClient.zip');
    if (!fs.existsSync(filePath)) return res.status(404).send('File not found');
    res.download(filePath, 'TuClient.zip');
});

// ═══════════════════════════════════════════════════════════════
// ERROR HANDLER
// ═══════════════════════════════════════════════════════════════

app.use((err, req, res, next) => {
    console.error('[Server] Error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
});

// ═══════════════════════════════════════════════════════════════
// EXPORT FOR VERCEL (no server.listen!)
// ═══════════════════════════════════════════════════════════════

module.exports = app;