require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);

// ═══════════════════════════════════════════════════════════════
// WEBSOCKET SERVER
// ═══════════════════════════════════════════════════════════════

const wss = new WebSocket.Server({ server });

// Структура серверов игр
// gameServers = { gameId: { host: ws, players: Map<odilId, {ws, data}>, hostOdilId, createdAt } }
const gameServers = new Map();

// Все подключённые клиенты
const connectedClients = new Map(); // odilId -> {ws, gameId, username}

// Типы пакетов (синхронизировано с C++ Protocol.h)
const PacketType = {
    // Подключение
    CONNECT_REQUEST: 1,
    CONNECT_RESPONSE: 2,
    DISCONNECT: 3,
    PING: 4,
    PONG: 5,

    // Игроки
    PLAYER_JOIN: 10,
    PLAYER_LEAVE: 11,
    PLAYER_STATE: 12,
    PLAYER_INPUT: 13,
    PLAYER_LIST: 14,

    // Мир
    WORLD_STATE: 20,
    OBJECT_SPAWN: 21,
    OBJECT_DESTROY: 22,
    OBJECT_UPDATE: 23,

    // Чат
    CHAT_MESSAGE: 30,

    // Хост/сервер
    HOST_ASSIGN: 50,
    BUILD_DATA: 51,
    SERVER_INFO: 52
};

function broadcastToGame(gameId, data, excludeOdilId = null) {
    const game = gameServers.get(gameId);
    if (!game) return;

    const message = typeof data === 'string' ? data : JSON.stringify(data);
    
    game.players.forEach((player, odilId) => {
        if (odilId !== excludeOdilId && player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(message);
        }
    });
}

function sendToClient(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(typeof data === 'string' ? data : JSON.stringify(data));
    }
}

function getOrCreateGameServer(gameId) {
    if (!gameServers.has(gameId)) {
        gameServers.set(gameId, {
            hostOdilId: null,
            players: new Map(),
            createdAt: Date.now(),
            buildData: null
        });
    }
    return gameServers.get(gameId);
}

wss.on('connection', (ws, req) => {
    let clientOdilId = null;
    let clientGameId = null;
    let clientUsername = null;

    console.log('[WS] New connection');

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case PacketType.CONNECT_REQUEST: {
                    clientOdilId = data.odilId;
                    clientGameId = data.gameId || 'tublox-world';
                    clientUsername = data.username || `Player${clientOdilId}`;

                    console.log(`[WS] Connect: ${clientUsername} (#${clientOdilId}) -> ${clientGameId}`);

                    const game = getOrCreateGameServer(clientGameId);
                    
                    // Определяем, является ли этот игрок хостом
                    let isHost = false;
                    if (game.hostOdilId === null || game.players.size === 0) {
                        game.hostOdilId = clientOdilId;
                        isHost = true;
                        console.log(`[WS] ${clientUsername} is now HOST of ${clientGameId}`);
                        
                        // Загружаем buildData для хоста
                        const gameDoc = await Game.findOne({ id: clientGameId });
                        if (gameDoc && gameDoc.buildData) {
                            game.buildData = gameDoc.buildData;
                        }
                    }

                    // Добавляем игрока
                    game.players.set(clientOdilId, {
                        ws,
                        username: clientUsername,
                        position: { x: 0, y: 5, z: 0 },
                        rotation: { x: 0, y: 0, z: 0 },
                        velocity: { x: 0, y: 0, z: 0 },
                        animationId: 0,
                        isGrounded: false,
                        isJumping: false,
                        isSprinting: false,
                        isInWater: false,
                        lastUpdate: Date.now()
                    });

                    connectedClients.set(clientOdilId, { ws, gameId: clientGameId, username: clientUsername });

                    // Обновляем количество игроков в БД
                    await Game.findOneAndUpdate(
                        { id: clientGameId },
                        { activePlayers: game.players.size }
                    );

                    // Отправляем ответ подключения
                    sendToClient(ws, {
                        type: PacketType.CONNECT_RESPONSE,
                        success: true,
                        odilId: clientOdilId,
                        isHost: isHost,
                        spawnX: 0,
                        spawnY: 5,
                        spawnZ: 0,
                        message: 'Connected!'
                    });

                    // Если хост - отправляем buildData
                    if (isHost && game.buildData) {
                        sendToClient(ws, {
                            type: PacketType.BUILD_DATA,
                            buildData: game.buildData
                        });
                    }

                    // Отправляем список существующих игроков новичку
                    game.players.forEach((player, odilId) => {
                        if (odilId !== clientOdilId) {
                            sendToClient(ws, {
                                type: PacketType.PLAYER_JOIN,
                                odilId: odilId,
                                username: player.username,
                                posX: player.position.x,
                                posY: player.position.y,
                                posZ: player.position.z
                            });
                        }
                    });

                    // Уведомляем всех о новом игроке
                    broadcastToGame(clientGameId, {
                        type: PacketType.PLAYER_JOIN,
                        odilId: clientOdilId,
                        username: clientUsername,
                        posX: 0,
                        posY: 5,
                        posZ: 0
                    }, clientOdilId);

                    console.log(`[WS] ${clientGameId} now has ${game.players.size} players`);
                    break;
                }

                case PacketType.PLAYER_STATE: {
                    if (!clientGameId || !clientOdilId) break;

                    const game = gameServers.get(clientGameId);
                    if (!game) break;

                    const player = game.players.get(clientOdilId);
                    if (player) {
                        player.position = { x: data.posX, y: data.posY, z: data.posZ };
                        player.rotation = { x: data.rotX, y: data.rotY, z: data.rotZ };
                        player.velocity = { x: data.velX, y: data.velY, z: data.velZ };
                        player.animationId = data.animationId || 0;
                        player.isGrounded = data.isGrounded || false;
                        player.isJumping = data.isJumping || false;
                        player.isSprinting = data.isSprinting || false;
                        player.isInWater = data.isInWater || false;
                        player.lastUpdate = Date.now();
                    }

                    // Рассылаем состояние другим игрокам
                    broadcastToGame(clientGameId, {
                        type: PacketType.PLAYER_STATE,
                        odilId: clientOdilId,
                        posX: data.posX,
                        posY: data.posY,
                        posZ: data.posZ,
                        rotX: data.rotX,
                        rotY: data.rotY,
                        rotZ: data.rotZ,
                        velX: data.velX,
                        velY: data.velY,
                        velZ: data.velZ,
                        animationId: data.animationId || 0,
                        isGrounded: data.isGrounded || false,
                        isJumping: data.isJumping || false,
                        isSprinting: data.isSprinting || false,
                        isInWater: data.isInWater || false
                    }, clientOdilId);
                    break;
                }

                case PacketType.CHAT_MESSAGE: {
                    if (!clientGameId) break;

                    broadcastToGame(clientGameId, {
                        type: PacketType.CHAT_MESSAGE,
                        odilId: clientOdilId,
                        username: clientUsername,
                        message: data.message
                    });
                    
                    console.log(`[Chat] ${clientUsername}: ${data.message}`);
                    break;
                }

                case PacketType.PING: {
                    sendToClient(ws, {
                        type: PacketType.PONG,
                        clientTime: data.clientTime,
                        serverTime: Date.now()
                    });
                    break;
                }

                case PacketType.DISCONNECT: {
                    // Обработка будет в ws.on('close')
                    break;
                }
            }
        } catch (err) {
            console.error('[WS] Message error:', err);
        }
    });

    ws.on('close', async () => {
        console.log(`[WS] Disconnected: ${clientUsername} (#${clientOdilId})`);

        if (clientGameId && clientOdilId) {
            const game = gameServers.get(clientGameId);
            
            if (game) {
                game.players.delete(clientOdilId);
                
                // Уведомляем других
                broadcastToGame(clientGameId, {
                    type: PacketType.PLAYER_LEAVE,
                    odilId: clientOdilId
                });

                // Если ушёл хост - назначаем нового
                if (game.hostOdilId === clientOdilId) {
                    if (game.players.size > 0) {
                        const newHostId = game.players.keys().next().value;
                        game.hostOdilId = newHostId;
                        
                        const newHost = game.players.get(newHostId);
                        if (newHost) {
                            sendToClient(newHost.ws, {
                                type: PacketType.HOST_ASSIGN,
                                isHost: true
                            });
                            console.log(`[WS] New host for ${clientGameId}: ${newHost.username}`);
                        }
                    } else {
                        // Сервер пуст - удаляем
                        gameServers.delete(clientGameId);
                        console.log(`[WS] Game server ${clientGameId} closed (empty)`);
                    }
                }

                // Обновляем количество игроков
                await Game.findOneAndUpdate(
                    { id: clientGameId },
                    { activePlayers: game ? game.players.size : 0 }
                );
            }
        }

        connectedClients.delete(clientOdilId);
    });

    ws.on('error', (err) => {
        console.error('[WS] Error:', err);
    });
});

// Периодическая проверка таймаутов
setInterval(() => {
    const now = Date.now();
    
    gameServers.forEach((game, gameId) => {
        game.players.forEach((player, odilId) => {
            // Таймаут 30 секунд
            if (now - player.lastUpdate > 30000) {
                console.log(`[WS] Timeout: ${player.username} in ${gameId}`);
                if (player.ws.readyState === WebSocket.OPEN) {
                    player.ws.close();
                }
            }
        });
    });
}, 10000);

// ═══════════════════════════════════════════════════════════════
// EXPRESS MIDDLEWARE
// ═══════════════════════════════════════════════════════════════

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static('public'));

// ═══════════════════════════════════════════════════════════════
// MONGOOSE SCHEMAS
// ═══════════════════════════════════════════════════════════════

const counterSchema = new mongoose.Schema({
    _id: String,
    seq: { type: Number, default: 0 }
});
const Counter = mongoose.model('Counter', counterSchema);

async function getNextUserId() {
    const counter = await Counter.findByIdAndUpdate(
        'userId',
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
    );
    return counter.seq;
}

const userSchema = new mongoose.Schema({
    odilId: { type: Number, unique: true },
    username: { 
        type: String, 
        required: true, 
        unique: true, 
        minlength: 3, 
        maxlength: 20,
        lowercase: true,
        trim: true
    },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    lastLogin: { type: Date, default: Date.now },
    gameData: {
        level: { type: Number, default: 1 },
        coins: { type: Number, default: 0 },
        playTime: { type: Number, default: 0 }
    }
});

const User = mongoose.model('User', userSchema);

const gameSchema = new mongoose.Schema({
    id: { type: String, unique: true, required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    creator: { type: String, required: true },
    creatorId: { type: Number },
    thumbnail: { type: String, default: '' },
    featured: { type: Boolean, default: false },
    visits: { type: Number, default: 0 },
    activePlayers: { type: Number, default: 0 },
    maxPlayers: { type: Number, default: 50 },
    buildData: { type: mongoose.Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const Game = mongoose.model('Game', gameSchema);

const launchTokenSchema = new mongoose.Schema({
    token: { type: String, unique: true },
    odilId: { type: Number, required: true },
    username: { type: String, required: true },
    gameId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: 300 }
});

const LaunchToken = mongoose.model('LaunchToken', launchTokenSchema);

// ═══════════════════════════════════════════════════════════════
// DEFAULT WORLD DATA
// ═══════════════════════════════════════════════════════════════

const defaultWorldBuildData = {
    objects: [
        {
            type: 'grass_cube',
            position: { x: 0, y: -1, z: 0 },
            scale: { x: 120, y: 2, z: 120 },
            isStatic: true
        },
        {
            type: 'spawn',
            position: { x: 0, y: 2, z: 0 }
        },
        {
            type: 'cube',
            position: { x: 0, y: 0, z: 0 },
            scale: { x: 10, y: 0.3, z: 10 },
            color: { r: 0.85, g: 0.85, b: 0.85 },
            isStatic: true
        },
        {
            type: 'cube',
            position: { x: 5, y: 1, z: 0 },
            scale: { x: 3, y: 2, z: 3 },
            color: { r: 0.3, g: 0.7, b: 0.3 },
            isStatic: true
        },
        {
            type: 'cube',
            position: { x: -5, y: 1.5, z: 5 },
            scale: { x: 4, y: 3, z: 4 },
            color: { r: 0.7, g: 0.3, b: 0.3 },
            isStatic: true
        },
        {
            type: 'cube',
            position: { x: 10, y: 0.2, z: 0 },
            scale: { x: 3, y: 0.3, z: 3 },
            color: { r: 1.0, g: 0.3, b: 0.5 },
            isStatic: true,
            bounciness: 2.0
        },
        {
            type: 'cube',
            position: { x: 10, y: 0.2, z: 5 },
            scale: { x: 3, y: 0.3, z: 3 },
            color: { r: 0.3, g: 1.0, b: 0.5 },
            isStatic: true,
            bounciness: 3.0
        }
    ],
    settings: {
        gravity: -9.81,
        skyColor: { r: 0.45, g: 0.65, b: 0.95 },
        fogEnabled: false,
        spawnPoint: { x: 0, y: 2, z: 0 }
    },
    version: 1
};

// ═══════════════════════════════════════════════════════════════
// MONGODB CONNECTION
// ═══════════════════════════════════════════════════════════════

mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log('MongoDB connected');
        try {
            await mongoose.connection.collection('users').dropIndex('email_1');
        } catch (e) {}
        
        const gameCount = await Game.countDocuments();
        if (gameCount === 0) {
            await Game.create({
                id: 'tublox-world',
                title: 'TuBlox World',
                description: 'Welcome to TuBlox World! Explore, play and have fun with friends!',
                creator: 'TuBlox',
                creatorId: 1,
                thumbnail: '/img/games/tublox-world.png',
                featured: true,
                visits: 0,
                maxPlayers: 50,
                buildData: defaultWorldBuildData
            });
            console.log('Default game created');
        }
    })
    .catch(err => console.error('MongoDB error:', err));

// ═══════════════════════════════════════════════════════════════
// AUTH MIDDLEWARE
// ═══════════════════════════════════════════════════════════════

const auth = async (req, res, next) => {
    try {
        const token = req.cookies.token;
        if (!token) return res.redirect('/auth');
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');
        
        if (!user) {
            res.clearCookie('token');
            return res.redirect('/auth');
        }
        
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
        
        if (!user) {
            res.clearCookie('token');
            return res.status(401).json({ success: false, message: 'Not authorized' });
        }
        
        req.user = user;
        next();
    } catch (err) {
        res.clearCookie('token');
        res.status(401).json({ success: false, message: 'Not authorized' });
    }
};

// ═══════════════════════════════════════════════════════════════
// PAGES
// ═══════════════════════════════════════════════════════════════

app.get('/', (req, res) => {
    try {
        const token = req.cookies.token;
        if (token && jwt.verify(token, process.env.JWT_SECRET)) {
            return res.redirect('/home');
        }
    } catch (e) {
        res.clearCookie('token');
    }
    res.sendFile(path.join(__dirname, 'pages', 'landing.html'));
});

app.get('/auth', (req, res) => {
    try {
        const token = req.cookies.token;
        if (token && jwt.verify(token, process.env.JWT_SECRET)) {
            return res.redirect('/home');
        }
    } catch (e) {
        res.clearCookie('token');
    }
    res.sendFile(path.join(__dirname, 'pages', 'auth.html'));
});

app.get('/home', auth, (req, res) => {
    res.sendFile(path.join(__dirname, 'pages', 'home.html'));
});

app.get('/games', auth, (req, res) => {
    res.sendFile(path.join(__dirname, 'pages', 'games.html'));
});

app.get('/game/:id', auth, (req, res) => {
    res.sendFile(path.join(__dirname, 'pages', 'game.html'));
});

app.get('/users', (req, res) => {
    res.sendFile(path.join(__dirname, 'pages', 'users.html'));
});

app.get('/user/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'pages', 'profile.html'));
});

// ═══════════════════════════════════════════════════════════════
// API - USER
// ═══════════════════════════════════════════════════════════════

app.get('/api/user', authAPI, (req, res) => {
    res.json({
        success: true,
        user: {
            id: req.user._id,
            odilId: req.user.odilId,
            username: req.user.username,
            createdAt: req.user.createdAt,
            gameData: req.user.gameData
        }
    });
});

app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find()
            .select('odilId username gameData createdAt')
            .sort({ createdAt: -1 })
            .limit(100);
        
        res.json({ success: true, users });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/user/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findOne({ odilId: parseInt(id) })
            .select('odilId username gameData createdAt');

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ═══════════════════════════════════════════════════════════════
// API - AUTH
// ═══════════════════════════════════════════════════════════════

app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'All fields required' });
        }

        const cleanUsername = username.toLowerCase().trim();

        if (cleanUsername.length < 3 || cleanUsername.length > 20) {
            return res.status(400).json({ success: false, message: 'Username must be 3-20 characters' });
        }

        if (!/^[a-z0-9_]+$/.test(cleanUsername)) {
            return res.status(400).json({ success: false, message: 'Username can only contain letters, numbers and underscore' });
        }

        if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }

        const exists = await User.findOne({ username: cleanUsername });
        if (exists) {
            return res.status(400).json({ success: false, message: 'Username already taken' });
        }

        const odilId = await getNextUserId();
        const hash = await bcrypt.hash(password, 12);
        
        const user = new User({ 
            username: cleanUsername, 
            password: hash,
            odilId: odilId
        });
        await user.save();

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, { 
            httpOnly: true, 
            maxAge: 7 * 24 * 60 * 60 * 1000, 
            sameSite: 'strict' 
        });
        
        res.json({ success: true, odilId });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'All fields required' });
        }

        const cleanUsername = username.toLowerCase().trim();
        const user = await User.findOne({ username: cleanUsername });
        
        if (!user) {
            return res.status(400).json({ success: false, message: 'Invalid username or password' });
        }

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            return res.status(400).json({ success: false, message: 'Invalid username or password' });
        }

        user.lastLogin = new Date();
        await user.save();

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, { 
            httpOnly: true, 
            maxAge: 7 * 24 * 60 * 60 * 1000, 
            sameSite: 'strict' 
        });
        
        res.json({ success: true });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════
// API - GAMES
// ═══════════════════════════════════════════════════════════════

app.get('/api/games', async (req, res) => {
    try {
        const { featured, limit } = req.query;
        
        let query = {};
        if (featured === 'true') {
            query.featured = true;
        }
        
        const games = await Game.find(query)
            .select('-buildData')
            .sort({ featured: -1, visits: -1 })
            .limit(parseInt(limit) || 50);
        
        res.json({ success: true, games });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/game/:id', async (req, res) => {
    try {
        const game = await Game.findOne({ id: req.params.id }).select('-buildData');
        
        if (!game) {
            return res.status(404).json({ success: false, message: 'Game not found' });
        }
        
        res.json({ success: true, game });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ═══════════════════════════════════════════════════════════════
// API - GAME SERVERS (Live)
// ═══════════════════════════════════════════════════════════════

app.get('/api/game/:id/servers', async (req, res) => {
    try {
        const gameId = req.params.id;
        const game = gameServers.get(gameId);
        
        if (!game || game.players.size === 0) {
            return res.json({ 
                success: true, 
                servers: [],
                message: 'No active servers'
            });
        }

        // Для простоты — один "сервер" на игру
        const hostPlayer = game.players.get(game.hostOdilId);
        
        res.json({
            success: true,
            servers: [{
                id: gameId,
                name: `${hostPlayer?.username || 'Unknown'}'s Server`,
                players: game.players.size,
                maxPlayers: 50,
                hostOdilId: game.hostOdilId,
                hostUsername: hostPlayer?.username || 'Unknown',
                ping: 0 // Можно добавить реальный пинг
            }]
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ═══════════════════════════════════════════════════════════════
// API - GAME LAUNCH
// ═══════════════════════════════════════════════════════════════

app.post('/api/game/launch', authAPI, async (req, res) => {
    try {
        const { gameId } = req.body;
        
        const game = await Game.findOne({ id: gameId });
        if (!game) {
            return res.status(404).json({ success: false, message: 'Game not found' });
        }
        
        game.visits += 1;
        await game.save();
        
        const launchToken = crypto.randomBytes(32).toString('hex');
        
        await LaunchToken.create({
            token: launchToken,
            odilId: req.user.odilId,
            username: req.user.username,
            gameId: game.id
        });
        
        console.log(`[Launch] ${req.user.username} launching ${gameId}`);
        
        // Возвращаем WebSocket endpoint
        res.json({ 
            success: true, 
            token: launchToken,
            wsHost: process.env.WS_HOST || 'localhost',
            wsPort: parseInt(process.env.PORT) || 3000,
            gameId: game.id
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/game/validate/:token', async (req, res) => {
    try {
        const launchData = await LaunchToken.findOne({ token: req.params.token });
        
        if (!launchData) {
            return res.status(404).json({ success: false, message: 'Invalid or expired token' });
        }
        
        const game = await Game.findOne({ id: launchData.gameId });
        
        await LaunchToken.deleteOne({ token: req.params.token });
        
        const response = {
            success: true,
            odilId: launchData.odilId,
            username: launchData.username,
            gameId: launchData.gameId,
            wsHost: process.env.WS_HOST || 'localhost',
            wsPort: parseInt(process.env.PORT) || 3000
        };
        
        if (game && game.buildData) {
            response.buildData = game.buildData;
        } else {
            response.buildData = defaultWorldBuildData;
        }
        
        res.json(response);
    } catch (err) {
        console.error('[Validate] Error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ═══════════════════════════════════════════════════════════════
// DOWNLOADS
// ═══════════════════════════════════════════════════════════════

app.get('/download/TuBloxSetup.exe', (req, res) => {
    const filePath = path.join(__dirname, 'public', 'download', 'TuBloxSetup.exe');
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found');
    }
    
    res.download(filePath, 'TuBloxSetup.exe');
});

// ═══════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`WebSocket running on ws://localhost:${PORT}`);
});