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
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const IS_VERCEL = !!process.env.VERCEL;
const GAME_SERVER_URL = process.env.GAME_SERVER_URL || 'https://tublox-servers.onrender.com';
const GAME_SERVER_WS_HOST = process.env.GAME_SERVER_WS_HOST || 'tublox-servers.onrender.com';

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║         TuBlox Website v1.0 — Vercel Edition            ║');
console.log('╚══════════════════════════════════════════════════════════╝');
console.log(`[Boot] Platform: ${IS_VERCEL ? 'Vercel' : 'Local'}`);
console.log(`[Boot] Game Server: ${GAME_SERVER_URL}`);

// ═══════════════════════════════════════════════════════════════
// EXPRESS MIDDLEWARE
// ═══════════════════════════════════════════════════════════════

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// CORS for game server communication
app.use((req, res, next) => {
    const allowedOrigins = [
        'https://tublox-servers.onrender.com',
        'https://tublox.vercel.app',
        'http://localhost:3000'
    ];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// ═══════════════════════════════════════════════════════════════
// MONGODB CONNECTION (Vercel-friendly)
// ═══════════════════════════════════════════════════════════════

let dbConnected = false;

async function connectDB() {
    if (dbConnected && mongoose.connection.readyState === 1) return;
    try {
        await mongoose.connect(process.env.MONGODB_URI, { 
            bufferCommands: false,
            serverSelectionTimeoutMS: 10000
        });
        dbConnected = true;
        console.log('[DB] MongoDB connected');
    } catch (err) {
        console.error('[DB] MongoDB error:', err.message);
        throw err;
    }
}

// Auto-connect middleware
app.use(async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (err) {
        if (req.path.startsWith('/api/')) {
            return res.status(500).json({ success: false, message: 'Database connection failed' });
        }
        next(err);
    }
});

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
    odilId:        { type: Number, unique: true },
    username:      { type: String, required: true, unique: true, minlength: 3, maxlength: 20, lowercase: true, trim: true },
    password:      { type: String, required: true },
    
    // ← ДОБАВЬ ЭТИ ДВЕ СТРОКИ
    discordId:     { type: String, unique: true, sparse: true, default: null },
    discordAvatar: { type: String, default: null },
    
    createdAt:  { type: Date, default: Date.now },
    lastLogin:  { type: Date, default: Date.now },
    lastSeen:   { type: Date, default: Date.now },
    gameData: {
        level:    { type: Number, default: 1 },
        coins:    { type: Number, default: 0 },
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
// CONSTANTS & HELPERS
// ═══════════════════════════════════════════════════════════════

const ADMIN_IDS = [1];
const AUTO_APPROVE_WHITELIST = true;

const BADGES = {
    'Staff': {
        id: 'Staff', name: 'Staff', description: 'TuBlox Staff Member',
        icon: '/img/badges/Staff.svg', color: '#ff4444', rarity: 'legendary',
        holders: [1, 4]
    },
    'TuBloxUser': {
        id: 'TuBloxUser', name: 'TuBlox User', description: 'Verified TuBlox Player',
        icon: '/img/badges/TuBloxUser.svg', color: '#00c8ff', rarity: 'common',
        holders: null
    }
};

function getUserBadges(odilId) {
    const badges = [];
    for (const [badgeId, badge] of Object.entries(BADGES)) {
        if (badge.holders === null || (Array.isArray(badge.holders) && badge.holders.includes(odilId))) {
            badges.push({
                id: badge.id, name: badge.name, description: badge.description,
                icon: badge.icon, color: badge.color, rarity: badge.rarity
            });
        }
    }
    const rarityOrder = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4 };
    badges.sort((a, b) => (rarityOrder[a.rarity] || 99) - (rarityOrder[b.rarity] || 99));
    return badges;
}

// Fetch presence from game server
async function fetchUserPresence(odilId) {
    try {
        const https = require('https');
        const url = `${GAME_SERVER_URL}/api/presence/${odilId}`;
        
        return new Promise((resolve) => {
            const req = https.get(url, { timeout: 3000 }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        resolve(json.success ? json : { isOnline: false, currentGame: null });
                    } catch {
                        resolve({ isOnline: false, currentGame: null });
                    }
                });
            });
            req.on('error', () => resolve({ isOnline: false, currentGame: null }));
            req.on('timeout', () => { req.destroy(); resolve({ isOnline: false, currentGame: null }); });
        });
    } catch {
        return { isOnline: false, currentGame: null };
    }
}

// ═══════════════════════════════════════════════════════════════
// BUILD DATA (default games)
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
    settings: { gravity: -25, skyColor: { r: 0.4, g: 0.6, b: 0.9 }, spawnPoint: { x: 0, y: 2, z: 0 } },
    version: 1
};

const hotelBuildData = {
    objects: [
        { type: 'cube', position: { x: 0, y: 0, z: 0 }, scale: { x: 30, y: 0.5, z: 40 }, color: { r: 0.15, g: 0.1, b: 0.08 }, isStatic: true },
        { type: 'spawn', position: { x: 0, y: 2, z: 15 } }
    ],
    settings: { gravity: -20, skyColor: { r: 0.1, g: 0.1, b: 0.15 }, spawnPoint: { x: 0, y: 2, z: 15 } },
    version: 1
};

async function seedGames() {
    try {
        const defaultGames = [
            { id: 'baseplate', title: 'Baseplate', description: 'A simple green baseplate.', creator: 'Today_Idk', creatorId: 1, featured: true, category: 'sandbox', maxPlayers: 50, buildData: baseplateBuildData },
            { id: 'obby', title: 'Obby', description: 'Jump through colorful platforms!', creator: 'Today_Idk', creatorId: 1, featured: true, category: 'obby', maxPlayers: 30, buildData: obbyBuildData },
            { id: 'hotel', title: 'Hotel', description: 'A beautiful hotel lobby.', creator: 'Today_Idk', creatorId: 1, featured: true, category: 'roleplay', maxPlayers: 40, buildData: hotelBuildData }
        ];
        for (const gameData of defaultGames) {
            await Game.findOneAndUpdate(
                { id: gameData.id },
                { $setOnInsert: { ...gameData, visits: 0, activePlayers: 0, createdAt: new Date() } },
                { upsert: true }
            );
        }
        console.log('[Seed] Games ready');
    } catch (err) {
        console.error('[Seed] Error:', err.message);
    }
}

// ═══════════════════════════════════════════════════════════════
// AUTH MIDDLEWARE
// ═══════════════════════════════════════════════════════════════

const auth = async (req, res, next) => {
    try {
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
app.get('/settings', auth, (req, res) => res.sendFile(path.join(__dirname, 'pages', 'settings.html')));
app.get('/studio', auth, (req, res) => 
    res.sendFile(path.join(__dirname, 'pages', 'studio.html'))
);

// ═══════════════════════════════════════════════════════════════
// API - HEALTH
// ═══════════════════════════════════════════════════════════════

app.get('/api/health', async (req, res) => {
    // Fetch game server status
    let gameServerStatus = 'unknown';
    try {
        const https = require('https');
        await new Promise((resolve) => {
            const req = https.get(`${GAME_SERVER_URL}/api/health`, { timeout: 3000 }, (r) => {
                gameServerStatus = r.statusCode === 200 ? 'online' : 'error';
                resolve();
            });
            req.on('error', () => { gameServerStatus = 'offline'; resolve(); });
            req.on('timeout', () => { req.destroy(); gameServerStatus = 'timeout'; resolve(); });
        });
    } catch { gameServerStatus = 'error'; }

    res.json({
        status: 'ok',
        platform: 'vercel',
        gameServer: {
            url: GAME_SERVER_URL,
            wsHost: GAME_SERVER_WS_HOST,
            status: gameServerStatus
        },
        timestamp: Date.now()
    });
});

// ═══════════════════════════════════════════════════════════════
// API - AUTH
// ═══════════════════════════════════════════════════════════════

app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ success: false, message: 'All fields required' });

        const cleanUsername = username.toLowerCase().trim();
        if (cleanUsername.length < 3 || cleanUsername.length > 20) 
            return res.status(400).json({ success: false, message: 'Username must be 3-20 characters' });
        if (!/^[a-z0-9_]+$/.test(cleanUsername)) 
            return res.status(400).json({ success: false, message: 'Username: letters, numbers, underscore only' });
        if (password.length < 6) 
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });

        const exists = await User.findOne({ username: cleanUsername });
        if (exists) return res.status(400).json({ success: false, message: 'Username already taken' });

        const odilId = await getNextUserId();
        const hash = await bcrypt.hash(password, 12);
        const user = new User({ username: cleanUsername, password: hash, odilId, lastSeen: new Date() });
        await user.save();

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'strict', secure: true });
        res.json({ success: true, odilId });
    } catch (err) {
        console.error('[Register]', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ success: false, message: 'All fields required' });

        const cleanUsername = username.toLowerCase().trim();
        const user = await User.findOne({ username: cleanUsername });
        if (!user) return res.status(400).json({ success: false, message: 'Invalid credentials' });

        // Check ban
        const ban = await Ban.findOne({ odilId: user.odilId, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] });
        if (ban) return res.status(403).json({ success: false, message: 'Your account is banned: ' + (ban.reason || 'No reason') });

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(400).json({ success: false, message: 'Invalid credentials' });

        user.lastLogin = new Date();
        user.lastSeen = new Date();
        await user.save();

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'strict', secure: true });
        res.json({ success: true });
    } catch (err) {
        console.error('[Login]', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/logout', async (req, res) => {
    try {
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
// API - DISCORD OAuth2
// ═══════════════════════════════════════════════════════════════

app.get('/api/auth/discord', (req, res) => {
    const clientId = process.env.DISCORD_CLIENT_ID;
    const redirectUri = encodeURIComponent(process.env.DISCORD_REDIRECT_URI);
    const scope = encodeURIComponent('identify');
    
    res.redirect(
        `https://discord.com/api/oauth2/authorize` +
        `?client_id=${clientId}` +
        `&redirect_uri=${redirectUri}` +
        `&response_type=code` +
        `&scope=${scope}`
    );
});

app.get('/api/auth/discord/callback', async (req, res) => {
    const { code, error } = req.query;
    
    if (error || !code) return res.redirect('/auth?error=discord_denied');
    
    try {
        // Обменять code на токен
        const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id:     process.env.DISCORD_CLIENT_ID,
                client_secret: process.env.DISCORD_CLIENT_SECRET,
                grant_type:    'authorization_code',
                code,
                redirect_uri:  process.env.DISCORD_REDIRECT_URI
            })
        });
        
        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) return res.redirect('/auth?error=token_failed');
        
        // Получить данные пользователя Discord
        const userRes = await fetch('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });
        
        const discordUser = await userRes.json();
        if (!discordUser.id) return res.redirect('/auth?error=user_failed');
        
        // Аватар Discord
        const discordAvatar = discordUser.avatar
            ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
            : null;
        
        // Ищем пользователя по discordId
        let user = await User.findOne({ discordId: discordUser.id });
        
        if (user) {
            // Уже зарегистрирован — просто обновляем аватар
            user.lastLogin = new Date();
            user.lastSeen  = new Date();
            if (discordAvatar) user.discordAvatar = discordAvatar;
            await user.save();
        } else {
            // Новый пользователь
            // Чистим имя из Discord
            let username = (discordUser.username || 'user')
                .toLowerCase()
                .replace(/[^a-z0-9_]/g, '_')
                .substring(0, 16);
            
            // Если имя занято — добавляем цифры
            const taken = await User.findOne({ username });
            if (taken) username = username.substring(0, 12) + '_' + Math.floor(Math.random() * 9999);
            
            const odilId = await getNextUserId();
            
            user = new User({
                odilId,
                username,
                password:      await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
                discordId:     discordUser.id,
                discordAvatar: discordAvatar,
                lastSeen:      new Date()
            });
            await user.save();
            
            console.log(`[Discord] New user: ${username} #${odilId}`);
        }
        
        // Создаём JWT сессию
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, {
            httpOnly: true,
            maxAge:   7 * 24 * 60 * 60 * 1000,
            sameSite: 'lax',
            secure:   true
        });
        
        res.redirect('/home');
        
    } catch (err) {
        console.error('[Discord OAuth]', err);
        res.redirect('/auth?error=server_error');
    }
});

// ═══════════════════════════════════════════════════════════════
// API - USER
// ═══════════════════════════════════════════════════════════════

app.get('/api/user', authAPI, async (req, res) => {
    const presence = await fetchUserPresence(req.user.odilId);
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
            badges
        }
    });
});

app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find().select('odilId username gameData createdAt lastSeen').sort({ createdAt: -1 }).limit(100);
        res.json({ success: true, users });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/user/:id', async (req, res) => {
    try {
        const odilId = parseInt(req.params.id);
        if (isNaN(odilId)) return res.status(400).json({ success: false, message: 'Invalid user ID' });

        const user = await User.findOne({ odilId }).select('odilId username gameData createdAt lastSeen lastLogin');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const presence = await fetchUserPresence(odilId);
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
                lastSeen: presence.isOnline ? null : (user.lastSeen || user.lastLogin || user.createdAt),
                isAdmin: ADMIN_IDS.includes(odilId),
                badges
            }
        });
    } catch (err) {
        console.error('[API] User error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ═══════════════════════════════════════════════════════════════
// API - USER SETTINGS
// ═══════════════════════════════════════════════════════════════

// Change username
app.patch('/api/user/username', authAPI, async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ success: false, message: 'Username required' });

        const cleanUsername = username.toLowerCase().trim();
        if (cleanUsername.length < 3 || cleanUsername.length > 20) 
            return res.status(400).json({ success: false, message: 'Username must be 3-20 characters' });
        if (!/^[a-z0-9_]+$/.test(cleanUsername)) 
            return res.status(400).json({ success: false, message: 'Username: letters, numbers, underscore only' });

        // Check if username is taken
        const exists = await User.findOne({ username: cleanUsername, _id: { $ne: req.user._id } });
        if (exists) return res.status(400).json({ success: false, message: 'Username already taken' });

        // Update username
        await User.findByIdAndUpdate(req.user._id, { username: cleanUsername });

        res.json({ success: true, username: cleanUsername });
    } catch (err) {
        console.error('[Username Change]', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Change password
app.patch('/api/user/password', authAPI, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) 
            return res.status(400).json({ success: false, message: 'All fields required' });

        if (newPassword.length < 6) 
            return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });

        // Get user with password
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        // Verify current password
        const valid = await bcrypt.compare(currentPassword, user.password);
        if (!valid) return res.status(400).json({ success: false, message: 'Current password is incorrect' });

        // Hash new password
        const hash = await bcrypt.hash(newPassword, 12);
        await User.findByIdAndUpdate(req.user._id, { password: hash });

        res.json({ success: true });
    } catch (err) {
        console.error('[Password Change]', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Verify password (for viewing)
app.post('/api/user/verify-password', authAPI, async (req, res) => {
    try {
        const { password } = req.body;
        if (!password) return res.status(400).json({ success: false, message: 'Password required' });

        // Get user with password
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        // Verify password
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(400).json({ success: false, message: 'Incorrect password' });

        res.json({ success: true });
    } catch (err) {
        console.error('[Password Verify]', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ═══════════════════════════════════════════════════════════════
// API - BADGES
// ═══════════════════════════════════════════════════════════════

app.get('/api/badges', (req, res) => {
    const allBadges = Object.values(BADGES).map(b => ({
        id: b.id, name: b.name, description: b.description,
        icon: b.icon, color: b.color, rarity: b.rarity,
        isExclusive: b.holders !== null
    }));
    res.json({ success: true, badges: allBadges });
});

app.get('/api/user/:id/badges', async (req, res) => {
    try {
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
        await seedGames();
        const { featured, category, page = 1, limit = 12 } = req.query;
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 12));
        const skip = (pageNum - 1) * limitNum;

        let query = {};
        if (featured === 'true') query.featured = true;
        if (category && category !== 'all') query.category = category;

        const totalGames = await Game.countDocuments(query);
        const totalPages = Math.ceil(totalGames / limitNum);
        const games = await Game.find(query).select('-buildData').sort({ featured: -1, visits: -1 }).skip(skip).limit(limitNum);

        res.json({
            success: true,
            games,
            pagination: { currentPage: pageNum, totalPages, totalGames, hasNextPage: pageNum < totalPages, hasPrevPage: pageNum > 1 }
        });
    } catch (err) {
        console.error('[API] Games error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/game/:id', async (req, res) => {
    try {
        await seedGames();
        const game = await Game.findOne({ id: req.params.id }).select('-buildData');
        if (!game) return res.status(404).json({ success: false, message: 'Game not found' });
        res.json({ success: true, game });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get active servers from game server
app.get('/api/game/:id/servers', async (req, res) => {
    try {
        const https = require('https');
        const url = `${GAME_SERVER_URL}/api/game/${req.params.id}/servers`;
        
        const serverData = await new Promise((resolve) => {
            const req = https.get(url, { timeout: 5000 }, (r) => {
                let data = '';
                r.on('data', chunk => data += chunk);
                r.on('end', () => {
                    try { resolve(JSON.parse(data)); } 
                    catch { resolve({ success: true, servers: [] }); }
                });
            });
            req.on('error', () => resolve({ success: true, servers: [] }));
            req.on('timeout', () => { req.destroy(); resolve({ success: true, servers: [] }); });
        });

        res.json(serverData);
    } catch (err) {
        res.json({ success: true, servers: [] });
    }
});

// ═══════════════════════════════════════════════════════════════
// API - GAME LAUNCH (CRITICAL - Returns game server host)
// ═══════════════════════════════════════════════════════════════

app.post('/api/game/launch', authAPI, async (req, res) => {
    try {
        await seedGames();
        const { gameId } = req.body;
        if (!gameId) return res.status(400).json({ success: false, message: 'gameId required' });

        const game = await Game.findOne({ id: gameId });
        if (!game) return res.status(404).json({ success: false, message: 'Game not found' });

        // Check ban
        const ban = await Ban.findOne({ odilId: req.user.odilId, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] });
        if (ban) return res.status(403).json({ success: false, message: 'You are banned: ' + (ban.reason || '') });

        game.visits += 1;
        await game.save();

        const launchToken = crypto.randomBytes(32).toString('hex');
        await LaunchToken.create({ token: launchToken, odilId: req.user.odilId, username: req.user.username, gameId: game.id });

        // *** CRITICAL: Return game server WebSocket host ***
        res.json({
            success: true,
            token: launchToken,
            wsHost: GAME_SERVER_WS_HOST,  // tublox-servers.onrender.com
            wsPort: 443,
            gameId: game.id
        });
    } catch (err) {
        console.error('[Launch]', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/game/validate/:token', async (req, res) => {
    try {
        await seedGames();
        const launchData = await LaunchToken.findOne({ token: req.params.token });
        if (!launchData) return res.status(404).json({ success: false, message: 'Invalid or expired token' });

        // Check ban
        const ban = await Ban.findOne({ odilId: launchData.odilId, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] });
        if (ban) {
            await LaunchToken.deleteOne({ token: req.params.token });
            return res.status(403).json({ success: false, message: 'You are banned' });
        }

        const game = await Game.findOne({ id: launchData.gameId });
        await LaunchToken.deleteOne({ token: req.params.token });

        res.json({
            success: true,
            odilId: launchData.odilId,
            username: launchData.username,
            gameId: launchData.gameId,
            wsHost: GAME_SERVER_WS_HOST,
            wsPort: 443,
            buildData: game?.buildData || baseplateBuildData,
            gameName: game?.title || launchData.gameId,
            creatorName: game?.creator || 'Unknown'
        });
    } catch (err) {
        console.error('[Validate]', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ═══════════════════════════════════════════════════════════════
// API - WHITELIST
// ═══════════════════════════════════════════════════════════════

app.get('/api/whitelist/count', async (req, res) => {
    try {
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
            if (existing.status === 'approved') return res.json({ success: true, whitelisted: true });
            if (existing.status === 'pending') return res.json({ success: true, pending: true });
            if (existing.status === 'rejected') return res.status(400).json({ success: false, message: 'Request was rejected' });
        }

        const entry = new Whitelist({
            odilId: req.user.odilId,
            username: req.user.username,
            status: AUTO_APPROVE_WHITELIST ? 'approved' : 'pending',
            approvedAt: AUTO_APPROVE_WHITELIST ? new Date() : null
        });
        await entry.save();

        res.json({ success: true, autoApproved: AUTO_APPROVE_WHITELIST, whitelisted: AUTO_APPROVE_WHITELIST, pending: !AUTO_APPROVE_WHITELIST });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/whitelist/check/:id', async (req, res) => {
    try {
        const entry = await Whitelist.findOne({ odilId: parseInt(req.params.id), status: 'approved' });
        res.json({ success: true, whitelisted: !!entry });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// ═══════════════════════════════════════════════════════════════
// API - FORUM
// ═══════════════════════════════════════════════════════════════

const FORUM_CATEGORIES = [
    { id: 'general', name: 'General', description: 'General discussion' },
    { id: 'games', name: 'Games', description: 'Talk about games' },
    { id: 'creations', name: 'Creations', description: 'Share your creations' },
    { id: 'help', name: 'Help', description: 'Get help' },
    { id: 'suggestions', name: 'Suggestions', description: 'Suggest features' },
    { id: 'offtopic', name: 'Off-Topic', description: 'Random discussions' }
];

app.get('/api/forum/categories', (req, res) => {
    res.json({ success: true, categories: FORUM_CATEGORIES });
});

app.get('/api/forum/posts', async (req, res) => {
    try {
        const { page = 1, limit = 15, category, sort = 'newest', search } = req.query;
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 15));
        const skip = (pageNum - 1) * limitNum;

        let query = {};
        if (category && category !== 'all') query.category = category;
        if (search) query.$or = [{ title: { $regex: search, $options: 'i' } }, { content: { $regex: search, $options: 'i' } }];

        let sortOption = { isPinned: -1, createdAt: -1 };
        if (sort === 'oldest') sortOption = { isPinned: -1, createdAt: 1 };
        if (sort === 'popular') sortOption = { isPinned: -1, views: -1 };

        const totalPosts = await ForumPost.countDocuments(query);
        const totalPages = Math.ceil(totalPosts / limitNum);
        const posts = await ForumPost.find(query).sort(sortOption).skip(skip).limit(limitNum).lean();

        res.json({ success: true, posts, pagination: { currentPage: pageNum, totalPages, totalPosts, hasNextPage: pageNum < totalPages } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/forum/post/:ownerId/:postId', async (req, res) => {
    try {
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
        const { title, content, category } = req.body;
        if (!title || !content) return res.status(400).json({ success: false, message: 'Title and content required' });

        const postId = await getNextPostId();
        const post = new ForumPost({
            postId, authorId: req.user.odilId, authorName: req.user.username,
            title: title.trim().substring(0, 100), content: content.trim().substring(0, 5000),
            category: FORUM_CATEGORIES.find(c => c.id === category) ? category : 'general'
        });
        await post.save();

        res.json({ success: true, post, url: `/TuForums/${req.user.odilId}/${postId}` });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/forum/post/:postId/reply', authAPI, async (req, res) => {
    try {
        const { content } = req.body;
        if (!content?.trim()) return res.status(400).json({ success: false, message: 'Content required' });

        const post = await ForumPost.findOne({ postId: parseInt(req.params.postId) });
        if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
        if (post.isLocked) return res.status(403).json({ success: false, message: 'Post is locked' });

        const replyId = await getNextReplyId();
        const reply = new ForumReply({
            replyId, postId: post.postId, authorId: req.user.odilId,
            authorName: req.user.username, content: content.trim().substring(0, 2000)
        });
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

        const hasLiked = post.likes.includes(req.user.odilId);
        if (hasLiked) post.likes = post.likes.filter(id => id !== req.user.odilId);
        else post.likes.push(req.user.odilId);
        await post.save();

        res.json({ success: true, liked: !hasLiked, likesCount: post.likes.length });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ═══════════════════════════════════════════════════════════════
// API - VERSION
// ═══════════════════════════════════════════════════════════════

app.get('/api/version', (req, res) => {
    res.json({
        version: "0.5.2",
        downloadUrl: `${GAME_SERVER_URL}/download/TuClient.zip`,
        message: "Patch 0.5.2 - Server Split"
    });
});

// ═══════════════════════════════════════════════════════════════
// API - HEARTBEAT (for online status)
// ═══════════════════════════════════════════════════════════════

app.post('/api/heartbeat', authAPI, (req, res) => {
    res.json({ success: true, timestamp: Date.now() });
});

// ═══════════════════════════════════════════════════════════════
// DOWNLOADS (redirect to game server)
// ═══════════════════════════════════════════════════════════════

app.get('/download/TuBloxSetup.exe', (req, res) => {
    res.redirect(`${GAME_SERVER_URL}/download/TuBloxSetup.exe`);
});

app.get('/download/TuClient.zip', (req, res) => {
    res.redirect(`${GAME_SERVER_URL}/download/TuClient.zip`);
});

app.get('/download/TuStudio.zip', (req, res) => {
    res.redirect(`${GAME_SERVER_URL}/download/TuStudio.zip`);
});


app.get('/download/TuStudioSetup.exe', (req, res) => {
    res.redirect(`${GAME_SERVER_URL}/download/TuStudioSetup.exe`);
});
// ═══════════════════════════════════════════════════════════════
// API - ADMIN (delete user by username + badges)
// ═══════════════════════════════════════════════════════════════

app.delete('/api/admin/user/:username', adminAPI, async (req, res) => {
    try {
        const username = String(req.params.username || '').toLowerCase().trim();
        if (!username) return res.status(400).json({ success: false, message: 'Username required' });

        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        // Нельзя удалить админа (опционально)
        if (ADMIN_IDS.includes(user.odilId)) {
            return res.status(403).json({ success: false, message: 'Cannot delete admin user' });
        }

        const odilId = user.odilId;

        // Чистим связанные данные (чтобы не оставлять мусор)
        await Promise.allSettled([
            Ban.deleteMany({ odilId }),
            Whitelist.deleteMany({ odilId }),
            LaunchToken.deleteMany({ odilId }),
            ForumPost.deleteMany({ authorId: odilId }),
            ForumReply.deleteMany({ authorId: odilId })
        ]);

        // Удаляем пользователя
        await User.deleteOne({ _id: user._id });

        // ВАЖНО: Counter НЕ трогаем — id дальше будут расти, ничего не ломается
        res.json({ success: true, deleted: { username, odilId } });
    } catch (err) {
        console.error('[Admin Delete]', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/admin/badge/grant', adminAPI, async (req, res) => {
    try {
        const username = String(req.body.username || '').toLowerCase().trim();
        const badgeId  = String(req.body.badgeId  || '').trim();

        if (!username || !badgeId) {
            return res.status(400).json({ success: false, message: 'username and badgeId required' });
        }
        if (!BADGES[badgeId]) {
            return res.status(400).json({ success: false, message: 'Unknown badgeId' });
        }

        const user = await User.findOneAndUpdate(
            { username },
            { $addToSet: { badges: badgeId } }, // addToSet чтобы не дублировалось
            { new: true }
        );
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        res.json({
            success: true,
            user: { username: user.username, odilId: user.odilId },
            badges: getUserBadgesFromUser(user)
        });
    } catch (err) {
        console.error('[Admin Badge Grant]', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/admin/badge/revoke', adminAPI, async (req, res) => {
    try {
        const username = String(req.body.username || '').toLowerCase().trim();
        const badgeId  = String(req.body.badgeId  || '').trim();

        if (!username || !badgeId) {
            return res.status(400).json({ success: false, message: 'username and badgeId required' });
        }

        const user = await User.findOneAndUpdate(
            { username },
            { $pull: { badges: badgeId } },
            { new: true }
        );
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        res.json({
            success: true,
            user: { username: user.username, odilId: user.odilId },
            badges: getUserBadgesFromUser(user)
        });
    } catch (err) {
        console.error('[Admin Badge Revoke]', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ═══════════════════════════════════════════════════════════════
// ERROR HANDLER
// ═══════════════════════════════════════════════════════════════

app.use((err, req, res, next) => {
    console.error('[Server] Error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
});

app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Not found' });
});

// ═══════════════════════════════════════════════════════════════
// EXPORT FOR VERCEL
// ═══════════════════════════════════════════════════════════════

module.exports = app;