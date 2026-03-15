// server.js - ИСПРАВЛЕННАЯ ВЕРСИЯ С ЧАТОМ

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
// KEEP ALIVE
// ═══════════════════════════════════════════════════════════════

const SELF_URL = process.env.RENDER_EXTERNAL_URL || process.env.SELF_URL;

if (SELF_URL) {
    setInterval(() => {
        const https = require('https');
        const httpModule = require('http');
        const client = SELF_URL.startsWith('https') ? https : httpModule;
        
        client.get(SELF_URL + '/api/health', (res) => {
            console.log('[KeepAlive] Ping sent, status:', res.statusCode);
        }).on('error', (err) => {
            console.log('[KeepAlive] Ping failed:', err.message);
        });
    }, 14 * 60 * 1000);
}

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        uptime: process.uptime(),
        games: gameServers.size,
        connections: connectedClients.size
    });
});

// ═══════════════════════════════════════════════════════════════
// WEBSOCKET SERVER
// ═══════════════════════════════════════════════════════════════

const wss = new WebSocket.Server({ 
    server,
    path: '/ws'
});

const gameServers = new Map();
const connectedClients = new Map();

const PacketType = {
    CONNECT_REQUEST: 1,
    CONNECT_RESPONSE: 2,
    DISCONNECT: 3,
    PING: 4,
    PONG: 5,
    PLAYER_JOIN: 10,
    PLAYER_LEAVE: 11,
    PLAYER_STATE: 12,
    PLAYER_INPUT: 13,
    PLAYER_LIST: 14,
    WORLD_STATE: 20,
    OBJECT_SPAWN: 21,
    OBJECT_DESTROY: 22,
    OBJECT_UPDATE: 23,
    CHAT_MESSAGE: 30,
    HOST_ASSIGN: 50,
    BUILD_DATA: 51,
    SERVER_INFO: 52
};

function sendToClient(ws, data) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        return false;
    }
    
    try {
        const message = typeof data === 'string' ? data : JSON.stringify(data);
        ws.send(message);
        return true;
    } catch (err) {
        console.error('[WS] Send error:', err.message);
        return false;
    }
}

function broadcastToGame(gameId, data, excludeOdilId = null) {
    const game = gameServers.get(gameId);
    if (!game) return 0;

    const message = typeof data === 'string' ? data : JSON.stringify(data);
    let sentCount = 0;
    
    game.players.forEach((player, odilId) => {
        if (excludeOdilId !== null && odilId === excludeOdilId) {
            return;
        }
        
        if (player.ws && player.ws.readyState === WebSocket.OPEN) {
            try {
                player.ws.send(message);
                sentCount++;
            } catch (err) {
                console.error(`[WS] Broadcast error to ${player.username}:`, err.message);
            }
        }
    });
    
    return sentCount;
}

function getOrCreateGameServer(gameId) {
    if (!gameServers.has(gameId)) {
        console.log(`[WS] Creating new game server: ${gameId}`);
        gameServers.set(gameId, {
            hostOdilId: null,
            players: new Map(),
            createdAt: Date.now(),
            buildData: null
        });
    }
    return gameServers.get(gameId);
}

function removePlayerFromGame(gameId, odilId) {
    const game = gameServers.get(gameId);
    if (!game) return;

    const player = game.players.get(odilId);
    if (!player) return;

    console.log(`[WS] Removing player ${player.username} (#${odilId}) from ${gameId}`);
    
    game.players.delete(odilId);
    connectedClients.delete(odilId);

    broadcastToGame(gameId, {
        type: PacketType.PLAYER_LEAVE,
        odilId: odilId
    });

    if (game.hostOdilId === odilId) {
        if (game.players.size > 0) {
            const newHostId = game.players.keys().next().value;
            game.hostOdilId = newHostId;
            
            const newHost = game.players.get(newHostId);
            if (newHost && newHost.ws) {
                sendToClient(newHost.ws, {
                    type: PacketType.HOST_ASSIGN,
                    isHost: true
                });
                console.log(`[WS] New host for ${gameId}: ${newHost.username}`);
            }
        } else {
            gameServers.delete(gameId);
            console.log(`[WS] Game server ${gameId} closed (empty)`);
        }
    }

    Game.findOneAndUpdate(
        { id: gameId },
        { activePlayers: game.players.size }
    ).catch(err => console.error('[DB] Update error:', err));

    console.log(`[WS] ${gameId} now has ${game.players.size} players`);
}

wss.on('connection', (ws, req) => {
    let clientOdilId = null;
    let clientGameId = null;
    let clientUsername = null;
    let isConnected = false;
    let messageQueue = [];
    let isProcessing = false;

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(`[WS] New connection from ${clientIp}`);

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    async function processMessageQueue() {
        if (isProcessing || messageQueue.length === 0) return;
        
        isProcessing = true;
        
        while (messageQueue.length > 0) {
            const data = messageQueue.shift();
            await handleMessage(data);
        }
        
        isProcessing = false;
    }

    async function handleMessage(data) {
        try {
            switch (data.type) {
                case PacketType.CONNECT_REQUEST: {
                    if (!data.odilId || typeof data.odilId !== 'number') {
                        console.error('[WS] Invalid odilId in CONNECT_REQUEST');
                        sendToClient(ws, {
                            type: PacketType.CONNECT_RESPONSE,
                            success: false,
                            message: 'Invalid odilId'
                        });
                        return;
                    }

                    const existingClient = connectedClients.get(data.odilId);
                    if (existingClient && existingClient.ws !== ws) {
                        console.log(`[WS] Closing old connection for ${data.odilId}`);
                        if (existingClient.gameId) {
                            removePlayerFromGame(existingClient.gameId, data.odilId);
                        }
                        if (existingClient.ws && existingClient.ws.readyState === WebSocket.OPEN) {
                            existingClient.ws.close(1000, 'Reconnecting');
                        }
                    }

                    clientOdilId = data.odilId;
                    clientGameId = data.gameId || 'tublox-world';
                    clientUsername = (data.username || `Player${clientOdilId}`).substring(0, 32);

                    console.log(`[WS] Connect: ${clientUsername} (#${clientOdilId}) -> ${clientGameId}`);

                    const game = getOrCreateGameServer(clientGameId);
                    
                    let isHost = false;
                    if (game.hostOdilId === null || game.players.size === 0) {
                        game.hostOdilId = clientOdilId;
                        isHost = true;
                        console.log(`[WS] ${clientUsername} is now HOST of ${clientGameId}`);
                        
                        try {
                            const gameDoc = await Game.findOne({ id: clientGameId });
                            if (gameDoc && gameDoc.buildData) {
                                game.buildData = gameDoc.buildData;
                            }
                        } catch (err) {
                            console.error('[DB] Load buildData error:', err);
                        }
                    }

                    const existingPlayers = [];
                    game.players.forEach((player, odilId) => {
                        if (odilId !== clientOdilId) {
                            existingPlayers.push({
                                odilId: odilId,
                                username: player.username,
                                position: { ...player.position }
                            });
                        }
                    });

                    const spawnPosition = { x: 0, y: 5, z: 0 };

                    game.players.set(clientOdilId, {
                        ws,
                        username: clientUsername,
                        position: { ...spawnPosition },
                        rotation: { x: 0, y: 0, z: 0 },
                        velocity: { x: 0, y: 0, z: 0 },
                        animationId: 0,
                        isGrounded: false,
                        isJumping: false,
                        isSprinting: false,
                        isInWater: false,
                        lastUpdate: Date.now(),
                        connectedAt: Date.now()
                    });

                    connectedClients.set(clientOdilId, { 
                        ws, 
                        gameId: clientGameId, 
                        username: clientUsername 
                    });

                    isConnected = true;

                    Game.findOneAndUpdate(
                        { id: clientGameId },
                        { activePlayers: game.players.size }
                    ).catch(err => console.error('[DB] Update error:', err));

                    sendToClient(ws, {
                        type: PacketType.CONNECT_RESPONSE,
                        success: true,
                        odilId: clientOdilId,
                        isHost: isHost,
                        spawnX: spawnPosition.x,
                        spawnY: spawnPosition.y,
                        spawnZ: spawnPosition.z,
                        message: 'Connected!'
                    });

                    if (isHost && game.buildData) {
                        sendToClient(ws, {
                            type: PacketType.BUILD_DATA,
                            buildData: game.buildData
                        });
                    }

                    setTimeout(() => {
                        if (ws.readyState !== WebSocket.OPEN) return;
                        
                        for (const player of existingPlayers) {
                            console.log(`[WS] Sending existing player ${player.username} to ${clientUsername}`);
                            
                            sendToClient(ws, {
                                type: PacketType.PLAYER_JOIN,
                                odilId: player.odilId,
                                username: player.username,
                                posX: player.position.x,
                                posY: player.position.y,
                                posZ: player.position.z
                            });
                        }
                        
                        setTimeout(() => {
                            const sentCount = broadcastToGame(clientGameId, {
                                type: PacketType.PLAYER_JOIN,
                                odilId: clientOdilId,
                                username: clientUsername,
                                posX: spawnPosition.x,
                                posY: spawnPosition.y,
                                posZ: spawnPosition.z
                            }, clientOdilId);
                            
                            console.log(`[WS] Notified ${sentCount} players about ${clientUsername}`);
                        }, 100);
                        
                    }, 200);

                    console.log(`[WS] ${clientGameId} now has ${game.players.size} players`);
                    break;
                }

                case PacketType.PLAYER_STATE: {
                    if (!clientGameId || !clientOdilId || !isConnected) break;

                    const game = gameServers.get(clientGameId);
                    if (!game) break;

                    const player = game.players.get(clientOdilId);
                    if (!player) break;

                    const posX = typeof data.posX === 'number' && isFinite(data.posX) ? data.posX : player.position.x;
                    const posY = typeof data.posY === 'number' && isFinite(data.posY) ? data.posY : player.position.y;
                    const posZ = typeof data.posZ === 'number' && isFinite(data.posZ) ? data.posZ : player.position.z;
                    
                    const rotX = typeof data.rotX === 'number' && isFinite(data.rotX) ? data.rotX : 0;
                    const rotY = typeof data.rotY === 'number' && isFinite(data.rotY) ? data.rotY : 0;
                    const rotZ = typeof data.rotZ === 'number' && isFinite(data.rotZ) ? data.rotZ : 0;
                    
                    const velX = typeof data.velX === 'number' && isFinite(data.velX) ? data.velX : 0;
                    const velY = typeof data.velY === 'number' && isFinite(data.velY) ? data.velY : 0;
                    const velZ = typeof data.velZ === 'number' && isFinite(data.velZ) ? data.velZ : 0;

                    player.position = { x: posX, y: posY, z: posZ };
                    player.rotation = { x: rotX, y: rotY, z: rotZ };
                    player.velocity = { x: velX, y: velY, z: velZ };
                    player.animationId = typeof data.animationId === 'number' ? data.animationId : 0;
                    player.isGrounded = !!data.isGrounded;
                    player.isJumping = !!data.isJumping;
                    player.isSprinting = !!data.isSprinting;
                    player.isInWater = !!data.isInWater;
                    player.lastUpdate = Date.now();

                    broadcastToGame(clientGameId, {
                        type: PacketType.PLAYER_STATE,
                        odilId: clientOdilId,
                        posX, posY, posZ,
                        rotX, rotY, rotZ,
                        velX, velY, velZ,
                        animationId: player.animationId,
                        isGrounded: player.isGrounded,
                        isJumping: player.isJumping,
                        isSprinting: player.isSprinting,
                        isInWater: player.isInWater
                    }, clientOdilId);
                    break;
                }

                // ═══════════════════════════════════════════════════════════
                // CHAT MESSAGE - ИСПРАВЛЕНО
                // ═══════════════════════════════════════════════════════════
                case PacketType.CHAT_MESSAGE: {
                    if (!clientGameId || !clientOdilId || !isConnected) {
                        console.log('[Chat] Rejected - not connected');
                        break;
                    }

                    const message = (data.message || '').trim();
                    if (!message || message.length === 0) {
                        console.log('[Chat] Rejected - empty message');
                        break;
                    }

                    const safeMessage = message.substring(0, 256);
                    const safeUsername = clientUsername || `Player${clientOdilId}`;
                    
                    console.log(`[Chat] ${safeUsername} (#${clientOdilId}): ${safeMessage}`);

                    // Отправляем ВСЕМ ДРУГИМ игрокам (исключая отправителя)
                    const sentCount = broadcastToGame(clientGameId, {
                        type: PacketType.CHAT_MESSAGE,
                        odilId: clientOdilId,
                        username: safeUsername,
                        message: safeMessage
                    }, clientOdilId);  // <-- excludeOdilId = clientOdilId

                    console.log(`[Chat] Sent to ${sentCount} other players`);
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
                    console.log(`[WS] Disconnect request from ${clientUsername}`);
                    isConnected = false;
                    ws.close(1000, 'Client disconnect');
                    break;
                }

                default:
                    // Игнорируем неизвестные пакеты
                    break;
            }
        } catch (err) {
            console.error('[WS] Handle message error:', err);
        }
    }

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            
            if (data.type === PacketType.CONNECT_REQUEST) {
                messageQueue.push(data);
                processMessageQueue();
            } else {
                handleMessage(data);
            }
        } catch (err) {
            console.error('[WS] Parse error:', err.message);
        }
    });

    ws.on('close', (code, reason) => {
        console.log(`[WS] Closed: ${clientUsername} (#${clientOdilId}), code: ${code}`);

        if (clientGameId && clientOdilId && isConnected) {
            removePlayerFromGame(clientGameId, clientOdilId);
        }
        
        isConnected = false;
        messageQueue = [];
    });

    ws.on('error', (err) => {
        console.error(`[WS] Error for ${clientUsername}:`, err.message);
    });
});

// Пинг клиентов
const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            console.log('[WS] Terminating dead connection');
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => {
    clearInterval(pingInterval);
});

// Таймауты
setInterval(() => {
    const now = Date.now();
    
    gameServers.forEach((game, gameId) => {
        const toRemove = [];
        
        game.players.forEach((player, odilId) => {
            if (now - player.lastUpdate > 60000) {
                console.log(`[WS] Timeout: ${player.username} in ${gameId}`);
                toRemove.push(odilId);
            }
        });

        toRemove.forEach(odilId => {
            const player = game.players.get(odilId);
            if (player && player.ws) {
                player.ws.close(1000, 'Timeout');
            }
            removePlayerFromGame(gameId, odilId);
        });
    });
}, 15000);

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
// GAME BUILD DATA
// ═══════════════════════════════════════════════════════════════

// Baseplate - простая платформа
const baseplateBuildData = {
    objects: [
        {
            type: 'cube',
            position: { x: 0, y: -0.5, z: 0 },
            scale: { x: 100, y: 1, z: 100 },
            color: { r: 0.3, g: 0.8, b: 0.3 },
            isStatic: true
        },
        {
            type: 'spawn',
            position: { x: 0, y: 2, z: 0 }
        }
    ],
    settings: {
        gravity: -20,
        skyColor: { r: 0.53, g: 0.81, b: 0.92 },
        ambientColor: { r: 0.4, g: 0.4, b: 0.5 },
        fogEnabled: false,
        spawnPoint: { x: 0, y: 2, z: 0 }
    },
    version: 1
};

// Obby - полоса препятствий
const obbyBuildData = {
    objects: [
        // Стартовая платформа
        {
            type: 'cube',
            position: { x: 0, y: 0, z: 0 },
            scale: { x: 8, y: 1, z: 8 },
            color: { r: 0.2, g: 0.6, b: 0.2 },
            isStatic: true
        },
        {
            type: 'spawn',
            position: { x: 0, y: 2, z: 0 }
        },
        // Платформа 1
        {
            type: 'cube',
            position: { x: 0, y: 0, z: 12 },
            scale: { x: 4, y: 1, z: 4 },
            color: { r: 0.9, g: 0.3, b: 0.3 },
            isStatic: true
        },
        // Платформа 2 (выше)
        {
            type: 'cube',
            position: { x: 0, y: 2, z: 20 },
            scale: { x: 4, y: 1, z: 4 },
            color: { r: 0.9, g: 0.6, b: 0.2 },
            isStatic: true
        },
        // Платформа 3
        {
            type: 'cube',
            position: { x: 6, y: 4, z: 20 },
            scale: { x: 3, y: 1, z: 3 },
            color: { r: 0.9, g: 0.9, b: 0.2 },
            isStatic: true
        },
        // Платформа 4
        {
            type: 'cube',
            position: { x: 12, y: 6, z: 20 },
            scale: { x: 3, y: 1, z: 3 },
            color: { r: 0.2, g: 0.9, b: 0.2 },
            isStatic: true
        },
        // Платформа 5
        {
            type: 'cube',
            position: { x: 12, y: 8, z: 12 },
            scale: { x: 3, y: 1, z: 3 },
            color: { r: 0.2, g: 0.7, b: 0.9 },
            isStatic: true
        },
        // Платформа 6
        {
            type: 'cube',
            position: { x: 12, y: 10, z: 4 },
            scale: { x: 3, y: 1, z: 3 },
            color: { r: 0.5, g: 0.2, b: 0.9 },
            isStatic: true
        },
        // Финишная платформа
        {
            type: 'cube',
            position: { x: 12, y: 12, z: -4 },
            scale: { x: 6, y: 1, z: 6 },
            color: { r: 1.0, g: 0.84, b: 0.0 },
            isStatic: true
        },
        // Трамплин
        {
            type: 'cube',
            position: { x: 6, y: 0.2, z: 6 },
            scale: { x: 3, y: 0.4, z: 3 },
            color: { r: 1.0, g: 0.4, b: 0.7 },
            isStatic: true,
            bounciness: 2.5
        }
    ],
    settings: {
        gravity: -25,
        skyColor: { r: 0.4, g: 0.6, b: 0.9 },
        ambientColor: { r: 0.5, g: 0.5, b: 0.6 },
        fogEnabled: false,
        spawnPoint: { x: 0, y: 2, z: 0 }
    },
    version: 1
};

// Hotel - красивое закрытое помещение
const hotelBuildData = {
    objects: [
        // Пол холла
        {
            type: 'cube',
            position: { x: 0, y: 0, z: 0 },
            scale: { x: 30, y: 0.5, z: 40 },
            color: { r: 0.15, g: 0.1, b: 0.08 },
            isStatic: true
        },
        // Ковёр в центре
        {
            type: 'cube',
            position: { x: 0, y: 0.26, z: 0 },
            scale: { x: 12, y: 0.02, z: 20 },
            color: { r: 0.6, g: 0.1, b: 0.15 },
            isStatic: true
        },
        // Потолок
        {
            type: 'cube',
            position: { x: 0, y: 10, z: 0 },
            scale: { x: 30, y: 0.5, z: 40 },
            color: { r: 0.95, g: 0.93, b: 0.88 },
            isStatic: true
        },
        // Стена левая
        {
            type: 'cube',
            position: { x: -15, y: 5, z: 0 },
            scale: { x: 0.5, y: 10, z: 40 },
            color: { r: 0.85, g: 0.8, b: 0.7 },
            isStatic: true
        },
        // Стена правая
        {
            type: 'cube',
            position: { x: 15, y: 5, z: 0 },
            scale: { x: 0.5, y: 10, z: 40 },
            color: { r: 0.85, g: 0.8, b: 0.7 },
            isStatic: true
        },
        // Стена задняя
        {
            type: 'cube',
            position: { x: 0, y: 5, z: -20 },
            scale: { x: 30, y: 10, z: 0.5 },
            color: { r: 0.85, g: 0.8, b: 0.7 },
            isStatic: true
        },
        // Стена передняя (с проёмом для входа)
        {
            type: 'cube',
            position: { x: -10, y: 5, z: 20 },
            scale: { x: 10, y: 10, z: 0.5 },
            color: { r: 0.85, g: 0.8, b: 0.7 },
            isStatic: true
        },
        {
            type: 'cube',
            position: { x: 10, y: 5, z: 20 },
            scale: { x: 10, y: 10, z: 0.5 },
            color: { r: 0.85, g: 0.8, b: 0.7 },
            isStatic: true
        },
        {
            type: 'cube',
            position: { x: 0, y: 8.5, z: 20 },
            scale: { x: 10, y: 3, z: 0.5 },
            color: { r: 0.85, g: 0.8, b: 0.7 },
            isStatic: true
        },
        // Стойка ресепшн
        {
            type: 'cube',
            position: { x: 0, y: 1.5, z: -15 },
            scale: { x: 10, y: 3, z: 2 },
            color: { r: 0.3, g: 0.2, b: 0.15 },
            isStatic: true
        },
        // Диван 1
        {
            type: 'cube',
            position: { x: -10, y: 0.8, z: 5 },
            scale: { x: 5, y: 1.6, z: 2 },
            color: { r: 0.2, g: 0.15, b: 0.4 },
            isStatic: true
        },
        // Диван 2
        {
            type: 'cube',
            position: { x: 10, y: 0.8, z: 5 },
            scale: { x: 5, y: 1.6, z: 2 },
            color: { r: 0.2, g: 0.15, b: 0.4 },
            isStatic: true
        },
        // Столик
        {
            type: 'cube',
            position: { x: 0, y: 0.6, z: 5 },
            scale: { x: 3, y: 1.2, z: 2 },
            color: { r: 0.4, g: 0.25, b: 0.15 },
            isStatic: true
        },
        // Колонна 1
        {
            type: 'cube',
            position: { x: -10, y: 5, z: -8 },
            scale: { x: 1.5, y: 10, z: 1.5 },
            color: { r: 0.9, g: 0.85, b: 0.75 },
            isStatic: true
        },
        // Колонна 2
        {
            type: 'cube',
            position: { x: 10, y: 5, z: -8 },
            scale: { x: 1.5, y: 10, z: 1.5 },
            color: { r: 0.9, g: 0.85, b: 0.75 },
            isStatic: true
        },
        // Колонна 3
        {
            type: 'cube',
            position: { x: -10, y: 5, z: 12 },
            scale: { x: 1.5, y: 10, z: 1.5 },
            color: { r: 0.9, g: 0.85, b: 0.75 },
            isStatic: true
        },
        // Колонна 4
        {
            type: 'cube',
            position: { x: 10, y: 5, z: 12 },
            scale: { x: 1.5, y: 10, z: 1.5 },
            color: { r: 0.9, g: 0.85, b: 0.75 },
            isStatic: true
        },
        // Люстра (центр)
        {
            type: 'cube',
            position: { x: 0, y: 8, z: 0 },
            scale: { x: 4, y: 0.3, z: 4 },
            color: { r: 1.0, g: 0.9, b: 0.6 },
            isStatic: true
        },
        // Spawn
        {
            type: 'spawn',
            position: { x: 0, y: 2, z: 15 }
        }
    ],
    settings: {
        gravity: -20,
        skyColor: { r: 0.1, g: 0.1, b: 0.15 },
        ambientColor: { r: 0.6, g: 0.55, b: 0.5 },
        fogEnabled: false,
        spawnPoint: { x: 0, y: 2, z: 15 }
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
        
        // Удаляем старые игры и создаём новые
        await Game.deleteMany({});
        console.log('Cleared old games');
        
        const games = [
            {
                id: 'baseplate',
                title: 'Baseplate',
                description: 'A simple green baseplate. Perfect for hanging out with friends!',
                creator: 'Today_Idk',
                creatorId: 1,
                thumbnail: '',
                featured: true,
                category: 'sandbox',
                visits: 1,
                maxPlayers: 50,
                buildData: baseplateBuildData
            },
            {
                id: 'obby',
                title: 'Obby',
                description: 'Jump through colorful platforms and reach the golden finish! Can you complete it?',
                creator: 'Today_Idk',
                creatorId: 1,
                thumbnail: '',
                featured: true,
                category: 'obby',
                visits: 1,
                maxPlayers: 30,
                buildData: obbyBuildData
            },
            {
                id: 'hotel',
                title: 'Hotel',
                description: 'A beautiful hotel lobby. Relax on the sofas and meet new people!',
                creator: 'Today_Idk',
                creatorId: 1,
                thumbnail: '',
                featured: true,
                category: 'roleplay',
                visits: 1,
                maxPlayers: 40,
                buildData: hotelBuildData
            }
        ];
        
        await Game.insertMany(games);
        console.log(`Created ${games.length} games: Baseplate, Obby, Hotel`);
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

// GET /api/version
app.get('/api/version', (req, res) => {
    res.json({
        version: "0.2",
        downloadUrl: "https://tublox.onrender.com/download/TuClient.zip",
        message: "Patch 0.2"
    });
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

        const hostPlayer = game.players.get(game.hostOdilId);
        
        res.json({
            success: true,
            servers: [{
                id: gameId,
                name: `${hostPlayer?.username || 'Unknown'}'s Server`,
                players: game.players.size,
                maxPlayers: 50,
                hostOdilId: game.hostOdilId,
                hostUsername: hostPlayer?.username || 'Unknown'
            }]
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================
// AUTH MIDDLEWARE
// ============================================
function requireAuth(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.json({ success: false, message: 'Not authenticated' });
    }
    next();
}

// Альтернативная версия с редиректом для страниц
function requireAuthPage(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.redirect('/');
    }
    next();
}

app.post('/api/game/launch', requireAuth, async (req, res) => {
    try {
        const { gameId } = req.body;
        const user = req.session.user;
        
        // Получаем данные игры
        const game = await getGameById(gameId); // твоя функция
        
        if (!game) {
            return res.json({ success: false, message: 'Game not found' });
        }
        
        // Создаём токен сессии
        const token = generateLaunchToken(user, gameId);
        
        // Сохраняем токен для валидации
        await saveLaunchToken(token, {
            odilId: user.odilId,
            username: user.username,
            gameId: gameId,
            createdAt: Date.now()
        });
        
        res.json({
            success: true,
            token: token,
            wsHost: process.env.WS_HOST || 'tublox.onrender.com',
            wsPort: process.env.WS_PORT || 443,
            gameId: gameId,
            // ═══════════════════════════════════════════════════════════
            // ДОБАВЛЯЕМ ДАННЫЕ ИГРЫ
            // ═══════════════════════════════════════════════════════════
            gameName: game.title || game.name || 'TuBlox World',
            creatorName: game.creator || game.creatorName || '',
            description: game.description || '',
            maxPlayers: game.maxPlayers || 10,
            thumbnail: game.thumbnail || ''
        });
        
    } catch (e) {
        console.error('Launch error:', e);
        res.json({ success: false, message: 'Server error' });
    }
});

app.get('/api/game/validate/:token', async (req, res) => {
    try {
        const { token } = req.params;
        
        // Проверяем токен
        const session = await getLaunchToken(token);
        
        if (!session) {
            return res.json({ success: false, message: 'Invalid or expired token' });
        }
        
        // Получаем данные игры
        const game = await getGameById(session.gameId);
        
        // Получаем данные пользователя
        const user = await getUserByOdilId(session.odilId);
        
        res.json({
            success: true,
            username: user.username,
            odilId: user.odilId,
            gameId: session.gameId,
            // ═══════════════════════════════════════════════════════════
            // ДАННЫЕ ИГРЫ
            // ═══════════════════════════════════════════════════════════
            gameName: game?.title || game?.name || 'TuBlox World',
            creatorName: game?.creator || game?.creatorName || '',
            description: game?.description || '',
            maxPlayers: game?.maxPlayers || 10,
            // WebSocket
            wsHost: process.env.WS_HOST || 'tublox.onrender.com',
            wsPort: parseInt(process.env.WS_PORT) || 443,
            // Build data если есть
            buildData: game?.buildData || null
        });
        
    } catch (e) {
        console.error('Validate error:', e);
        res.json({ success: false, message: 'Server error' });
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
    console.log(`Server running on port ${PORT}`);
    console.log(`WebSocket path: /ws`);
});