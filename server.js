// server.js - ПОЛНАЯ ВЕРСИЯ С TUFORUMS

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
// BANNED WORDS & DOMAIN PATTERNS
// ═══════════════════════════════════════════════════════════════

const BANNED_WORDS = [
    // English profanity
    'fuck', 'fucking', 'fucker', 'fucked', 'fuk', 'fck', 'fuk', 'phuck',
    'shit', 'shitting', 'shitty', 'crap', 'bullshit',
    'bitch', 'bitching', 'bastard', 'whore', 'slut', 'hoe',
    'ass', 'asshole', 'arse', 'arsehole', 'butt', 'butthole',
    'dick', 'cock', 'penis', 'prick', 'dong', 'schlong',
    'pussy', 'vagina', 'cunt', 'twat', 'beaver',
    'tits', 'boobs', 'titties', 'breasts', 'nipple',
    'porn', 'porno', 'pornography', 'xxx', 'nsfw',
    'sex', 'sexy', 'sexual', 'rape', 'molest',
    'nude', 'naked', 'nudes', 'strip', 'stripper',
    'nigger', 'nigga', 'negro', 'nig', 'nigg',
    'faggot', 'fag', 'homo', 'queer', 'gay', 'lesbian', 'tranny',
    'retard', 'retarded', 'idiot', 'moron', 'stupid',
    'kill', 'murder', 'suicide', 'kms', 'kys', 'die', 'death',
    'nazi', 'hitler', 'holocaust', 'terrorist', 'terrorism',
    'bomb', 'bombing', 'attack', 'shooter', 'shooting',
    'drug', 'drugs', 'cocaine', 'heroin', 'meth', 'weed', 'marijuana',
    'crack', 'lsd', 'ecstasy', 'molly', 'pills',
    
    // System/Admin words
    'admin', 'administrator', 'moderator', 'mod', 'staff', 'owner',
    'official', 'tublox', 'system', 'support', 'help', 'bot',
    'server', 'console', 'root', 'superuser', 'sysadmin',
    
    // Russian profanity
    'хуй', 'хуя', 'хуи', 'хую', 'хуё', 'хуе', 'хер', 'хрен',
    'пизд', 'пизде', 'пизду', 'пиздец', 'пиздюк', 'писюн',
    'ебл', 'ебал', 'ебать', 'ебу', 'ебёт', 'ебет', 'ебля', 'еби',
    'ебан', 'ебануть', 'ебанутый', 'ебаный', 'наебать', 'проебать',
    'блят', 'блядь', 'бляд', 'блять', 'блять', 'бля',
    'сука', 'суки', 'суку', 'сучка', 'сучий',
    'член', 'члена', 'члену', 'членом',
    'жопа', 'жопу', 'жопой', 'жопе', 'жоп',
    'залупа', 'залупы', 'залупу',
    'мудак', 'мудака', 'мудаков', 'мудила', 'мудило',
    'гандон', 'гондон', 'презерватив',
    'шлюха', 'шлюхи', 'шлюху', 'шалава', 'путана',
    'курва', 'курвы', 'курву',
    'педик', 'педики', 'педиков', 'пидор', 'пидорас', 'пидр',
    'гей', 'геи', 'гея', 'лесби', 'лесбиянка', 'трансвестит',
    'дебил', 'дебилы', 'дебила', 'дебилизм',
    'идиот', 'идиота', 'идиоты', 'идиотизм',
    'даун', 'дауны', 'дауна',
    'порно', 'порнуха', 'порнография',
    'секс', 'сексом', 'сексуальный',
    'трах', 'трахать', 'трахал', 'трахнуть',
    'ссал', 'ссать', 'ссу', 'ссыт',
    'срал', 'срать', 'сру', 'срёт', 'срет',
    'говно', 'говна', 'говну', 'гавно',
    'дерьмо', 'дерьма', 'дерьму',
    'убить', 'убийство', 'убийца',
    'террор', 'терроризм', 'террорист',
    'взрыв', 'взрывать', 'бомба', 'бомбить',
    'наркот', 'наркота', 'наркотик', 'наркоман',
    'героин', 'кокаин', 'план', 'травка', 'анаша', 'спайс',
    'админ', 'модер', 'модератор', 'персонал', 'поддержка', 'владелец',
    'p0rn', 's3x', 'fvck', 'fuk', 'azz', 'd1ck', 'b1tch',
    'хyй', 'пиzда', 'блyть', 'сyка'
];

const DOMAIN_PATTERNS = [
    '.com', '.net', '.org', '.ru', '.info', '.biz', '.co', '.io', '.gg',
    '.me', '.tv', '.cc', '.us', '.uk', '.de', '.fr', '.it', '.es', '.cn',
    '.jp', '.kr', '.in', '.au', '.ca', '.br', '.mx', '.nl', '.se', '.no',
    '.dk', '.fi', '.pl', '.cz', '.at', '.ch', '.be', '.pt', '.gr', '.tr',
    '.xyz', '.online', '.site', '.website', '.store', '.app', '.dev', '.ai',
    '.tech', '.pro', '.club', '.vip', '.lol', '.game', '.games', '.fun',
    '.zone', '.space', '.live', '.world', '.today', '.life', '.link',
    'http://', 'https://', 'www.', 'ftp://', '://', 'discord.gg',
    'bit.ly', 't.me', 'youtu.be', 'goo.gl', 'tinyurl'
];

// ═══════════════════════════════════════════════════════════════
// STAFF USERS
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// TUFORUMS - STAFF
// ═══════════════════════════════════════════════════════════════

const STAFF_USERNAMES = ['today_idk'];

function isStaffUser(username) {
    if (!username) return false;
    return STAFF_USERNAMES.includes(username.toLowerCase());
}



// ═══════════════════════════════════════════════════════════════
// VALIDATION & CENSORSHIP FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function validateUsername(username) {
    if (!username || typeof username !== 'string') {
        return { valid: false, error: 'Username is required' };
    }

    username = username.trim();
    
    if (username.length < 3) {
        return { valid: false, error: 'Username must be at least 3 characters' };
    }
    
    if (username.length > 20) {
        return { valid: false, error: 'Username must be 20 characters or less' };
    }
    
    const formatRegex = /^[a-zA-Z0-9_]+$/;
    if (!formatRegex.test(username)) {
        return { valid: false, error: 'Username can only contain letters, numbers and underscore' };
    }
    
    if (/__/.test(username)) {
        return { valid: false, error: 'Username cannot contain consecutive underscores' };
    }
    
    if (username.startsWith('_') || username.endsWith('_')) {
        return { valid: false, error: 'Username cannot start or end with underscore' };
    }
    
    if (/(.)\1{3,}/.test(username)) {
        return { valid: false, error: 'Username contains too many repeated characters' };
    }
    
    const lowerUsername = username.toLowerCase();
    
    for (const pattern of DOMAIN_PATTERNS) {
        if (lowerUsername.includes(pattern.toLowerCase())) {
            return { valid: false, error: 'Username cannot contain links or domains' };
        }
    }
    
    for (const word of BANNED_WORDS) {
        if (lowerUsername.includes(word.toLowerCase())) {
            return { valid: false, error: 'Username contains inappropriate content' };
        }
    }
    
    const leetspeakMap = {
        '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's',
        '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i'
    };
    
    let normalizedUsername = lowerUsername;
    for (const [leet, normal] of Object.entries(leetspeakMap)) {
        normalizedUsername = normalizedUsername.replace(new RegExp(leet, 'g'), normal);
    }
    
    for (const word of BANNED_WORDS) {
        if (normalizedUsername.includes(word.toLowerCase())) {
            return { valid: false, error: 'Username contains inappropriate content' };
        }
    }
    
    const bypassPatterns = [
        /p+o+r+n+/i, /s+e+x+/i, /f+u+c+k+/i, /d+i+c+k+/i,
        /a+s+s+/i, /b+i+t+c+h+/i, /n+i+g+g+/i,
        /х+у+й+/i, /п+и+з+д+/i, /е+б+л+/i, /б+л+я+т+/i
    ];
    
    for (const pattern of bypassPatterns) {
        if (pattern.test(username)) {
            return { valid: false, error: 'Username contains inappropriate content' };
        }
    }
    
    const suspiciousChars = /[ΑΒΕΖΗΙΚΜΝΟΡΤΥΧ]/i;
    if (suspiciousChars.test(username)) {
        return { valid: false, error: 'Username contains invalid characters' };
    }
    
    return { valid: true };
}

function censorText(text) {
    if (!text) return '';
    
    let censored = text;
    
    for (const word of BANNED_WORDS) {
        const regex = new RegExp(word, 'gi');
        censored = censored.replace(regex, '*'.repeat(word.length));
    }
    
    for (const pattern of DOMAIN_PATTERNS) {
        const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, 'gi');
        censored = censored.replace(regex, '[link]');
    }
    
    return censored;
}

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
        connections: connectedClients.size,
        forumClients: forumClients.size
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
const forumClients = new Set();

// Game Packet Types
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

// Forum Packet Types
const ForumPacketType = {
    FORUM_CONNECT: 100,
    FORUM_DISCONNECT: 101,
    FORUM_GET_POSTS: 102,
    FORUM_POSTS_LIST: 103,
    FORUM_NEW_POST: 104,
    FORUM_POST_CREATED: 105,
    FORUM_NEW_REPLY: 106,
    FORUM_POST_UPDATED: 107,
    FORUM_LIKE_POST: 108,
    FORUM_DELETE_POST: 109,
    FORUM_POST_DELETED: 110,
    FORUM_PIN_POST: 111,
    FORUM_ERROR: 199
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

function broadcastToForum(data, excludeWs = null) {
    const message = JSON.stringify(data);
    forumClients.forEach(client => {
        if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
            try {
                client.send(message);
            } catch (err) {
                console.error('[Forum] Broadcast error:', err.message);
            }
        }
    });
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

// ═══════════════════════════════════════════════════════════════
// WEBSOCKET CONNECTION HANDLER
// ═══════════════════════════════════════════════════════════════

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
    ws.isForumClient = false;
    ws.forumUser = null;
    
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
            // ═══════════════════════════════════════════════════════════
            // FORUM PACKETS (100-199)
            // ═══════════════════════════════════════════════════════════
            
            if (data.type >= 100 && data.type < 200) {
                await handleForumMessage(data);
                return;
            }
            
            // ═══════════════════════════════════════════════════════════
            // GAME PACKETS
            // ═══════════════════════════════════════════════════════════
            
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
                            broadcastToGame(clientGameId, {
                                type: PacketType.PLAYER_JOIN,
                                odilId: clientOdilId,
                                username: clientUsername,
                                posX: spawnPosition.x,
                                posY: spawnPosition.y,
                                posZ: spawnPosition.z
                            }, clientOdilId);
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

                case PacketType.CHAT_MESSAGE: {
                    if (!clientGameId || !clientOdilId || !isConnected) {
                        break;
                    }

                    const message = (data.message || '').trim();
                    if (!message || message.length === 0) {
                        break;
                    }

                    const safeMessage = censorText(message.substring(0, 256));
                    const safeUsername = clientUsername || `Player${clientOdilId}`;
                    
                    console.log(`[Chat] ${safeUsername} (#${clientOdilId}): ${safeMessage}`);

                    broadcastToGame(clientGameId, {
                        type: PacketType.CHAT_MESSAGE,
                        odilId: clientOdilId,
                        username: safeUsername,
                        message: safeMessage
                    }, clientOdilId);
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
                    break;
            }
        } catch (err) {
            console.error('[WS] Handle message error:', err);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // FORUM MESSAGE HANDLER
    // ═══════════════════════════════════════════════════════════════
    
    async function handleForumMessage(data) {
        try {
            switch (data.type) {
                case ForumPacketType.FORUM_CONNECT: {
                    forumClients.add(ws);
                    ws.isForumClient = true;
                    ws.forumUser = {
                        odilId: data.odilId,
                        username: data.username
                    };
                    console.log(`[Forum] Client connected: ${data.username} (#${data.odilId}). Total: ${forumClients.size}`);
                    break;
                }
                
                case ForumPacketType.FORUM_DISCONNECT: {
                    forumClients.delete(ws);
                    ws.isForumClient = false;
                    ws.forumUser = null;
                    console.log(`[Forum] Client disconnected. Total: ${forumClients.size}`);
                    break;
                }
                
                case ForumPacketType.FORUM_GET_POSTS: {
                    try {
                        const filter = {};
                        if (data.category && data.category !== 'all') {
                            filter.category = data.category;
                        }
                        
                        const posts = await ForumPost.find(filter)
                            .sort({ isPinned: -1, createdAt: -1 })
                            .limit(50)
                            .lean();
                        
                        sendToClient(ws, {
                            type: ForumPacketType.FORUM_POSTS_LIST,
                            posts: posts
                        });
                    } catch (err) {
                        console.error('[Forum] Get posts error:', err);
                        sendToClient(ws, { 
                            type: ForumPacketType.FORUM_ERROR, 
                            message: 'Failed to load posts' 
                        });
                    }
                    break;
                }
                
                case ForumPacketType.FORUM_NEW_POST: {
                    if (!ws.forumUser) {
                        sendToClient(ws, { 
                            type: ForumPacketType.FORUM_ERROR, 
                            message: 'Not authenticated' 
                        });
                        break;
                    }
                    
                    const content = (data.content || '').trim();
                    if (!content || content.length === 0) {
                        sendToClient(ws, { 
                            type: ForumPacketType.FORUM_ERROR, 
                            message: 'Content required' 
                        });
                        break;
                    }
                    
                    if (content.length > 2000) {
                        sendToClient(ws, { 
                            type: ForumPacketType.FORUM_ERROR, 
                            message: 'Content too long (max 2000)' 
                        });
                        break;
                    }
                    
                    try {
                        const isStaff = isStaffUser(ws.forumUser.username);
                        const censoredContent = censorText(content);
                        
                        const post = new ForumPost({
                            author: ws.forumUser.username,
                            authorId: ws.forumUser.odilId,
                            content: censoredContent,
                            category: data.category || 'general',
                            isStaffPost: isStaff && data.isStaffPost === true,
                            isPinned: isStaff && data.isPinned === true
                        });
                        
                        await post.save();
                        
                        const savedPost = post.toObject();
                        
                        broadcastToForum({
                            type: ForumPacketType.FORUM_POST_CREATED,
                            post: savedPost
                        });
                        
                        console.log(`[Forum] New post by ${ws.forumUser.username}: "${censoredContent.substring(0, 50)}..."`);
                    } catch (err) {
                        console.error('[Forum] Create post error:', err);
                        sendToClient(ws, { 
                            type: ForumPacketType.FORUM_ERROR, 
                            message: 'Failed to create post' 
                        });
                    }
                    break;
                }
                
                case ForumPacketType.FORUM_NEW_REPLY: {
                    if (!ws.forumUser) {
                        sendToClient(ws, { 
                            type: ForumPacketType.FORUM_ERROR, 
                            message: 'Not authenticated' 
                        });
                        break;
                    }
                    
                    const replyContent = (data.content || '').trim();
                    if (!replyContent || !data.postId) {
                        sendToClient(ws, { 
                            type: ForumPacketType.FORUM_ERROR, 
                            message: 'Content and postId required' 
                        });
                        break;
                    }
                    
                    if (replyContent.length > 1000) {
                        sendToClient(ws, { 
                            type: ForumPacketType.FORUM_ERROR, 
                            message: 'Reply too long (max 1000)' 
                        });
                        break;
                    }
                    
                    try {
                        const censoredReply = censorText(replyContent);
                        const isStaff = isStaffUser(ws.forumUser.username);
                        
                        const reply = {
                            author: ws.forumUser.username,
                            authorId: ws.forumUser.odilId,
                            content: censoredReply,
                            isStaffReply: isStaff,
                            createdAt: new Date()
                        };
                        
                        const updatedPost = await ForumPost.findByIdAndUpdate(
                            data.postId,
                            { $push: { replies: reply } },
                            { new: true }
                        ).lean();
                        
                        if (updatedPost) {
                            broadcastToForum({
                                type: ForumPacketType.FORUM_POST_UPDATED,
                                post: updatedPost
                            });
                            console.log(`[Forum] Reply by ${ws.forumUser.username} on post ${data.postId}`);
                        }
                    } catch (err) {
                        console.error('[Forum] Reply error:', err);
                        sendToClient(ws, { 
                            type: ForumPacketType.FORUM_ERROR, 
                            message: 'Failed to add reply' 
                        });
                    }
                    break;
                }
                
                case ForumPacketType.FORUM_LIKE_POST: {
                    if (!ws.forumUser || !data.postId) break;
                    
                    try {
                        const post = await ForumPost.findById(data.postId);
                        if (!post) break;
                        
                        const odilId = ws.forumUser.odilId;
                        const likeIndex = post.likes.indexOf(odilId);
                        
                        if (likeIndex === -1) {
                            post.likes.push(odilId);
                        } else {
                            post.likes.splice(likeIndex, 1);
                        }
                        
                        await post.save();
                        
                        broadcastToForum({
                            type: ForumPacketType.FORUM_POST_UPDATED,
                            post: post.toObject()
                        });
                    } catch (err) {
                        console.error('[Forum] Like error:', err);
                    }
                    break;
                }
                
                case ForumPacketType.FORUM_DELETE_POST: {
                    if (!ws.forumUser || !data.postId) break;
                    
                    try {
                        const post = await ForumPost.findById(data.postId);
                        if (!post) break;
                        
                        const isStaff = isStaffUser(ws.forumUser.username);
                        const isAuthor = post.authorId === ws.forumUser.odilId;
                        
                        if (!isStaff && !isAuthor) {
                            sendToClient(ws, { 
                                type: ForumPacketType.FORUM_ERROR, 
                                message: 'Not authorized to delete' 
                            });
                            break;
                        }
                        
                        await ForumPost.findByIdAndDelete(data.postId);
                        
                        broadcastToForum({
                            type: ForumPacketType.FORUM_POST_DELETED,
                            postId: data.postId
                        });
                        
                        console.log(`[Forum] Post ${data.postId} deleted by ${ws.forumUser.username}`);
                    } catch (err) {
                        console.error('[Forum] Delete error:', err);
                    }
                    break;
                }
                
                case ForumPacketType.FORUM_PIN_POST: {
                    if (!ws.forumUser || !data.postId) break;
                    
                    const isStaff = isStaffUser(ws.forumUser.username);
                    if (!isStaff) {
                        sendToClient(ws, { 
                            type: ForumPacketType.FORUM_ERROR, 
                            message: 'Staff only' 
                        });
                        break;
                    }
                    
                    try {
                        const post = await ForumPost.findById(data.postId);
                        if (!post) break;
                        
                        post.isPinned = !post.isPinned;
                        await post.save();
                        
                        broadcastToForum({
                            type: ForumPacketType.FORUM_POST_UPDATED,
                            post: post.toObject()
                        });
                        
                        console.log(`[Forum] Post ${data.postId} ${post.isPinned ? 'pinned' : 'unpinned'} by ${ws.forumUser.username}`);
                    } catch (err) {
                        console.error('[Forum] Pin error:', err);
                    }
                    break;
                }
            }
        } catch (err) {
            console.error('[Forum] Handle message error:', err);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // MESSAGE LISTENER
    // ═══════════════════════════════════════════════════════════════

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
        console.log(`[WS] Closed: ${clientUsername || 'unknown'} (#${clientOdilId || '?'}), code: ${code}`);

        if (clientGameId && clientOdilId && isConnected) {
            removePlayerFromGame(clientGameId, clientOdilId);
        }
        
        if (ws.isForumClient) {
            forumClients.delete(ws);
            console.log(`[Forum] Client removed on close. Total: ${forumClients.size}`);
        }
        
        isConnected = false;
        messageQueue = [];
    });

    ws.on('error', (err) => {
        console.error(`[WS] Error for ${clientUsername}:`, err.message);
    });
});

// Ping clients
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

// Timeouts
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
// FORUM SCHEMA
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// TUFORUMS - SCHEMA
// ═══════════════════════════════════════════════════════════════

const forumPostSchema = new mongoose.Schema({
    author: { type: String, required: true },
    authorId: { type: Number, required: true },
    content: { type: String, required: true, maxlength: 2000 },
    category: { 
        type: String, 
        default: 'general',
        enum: ['updates', 'general', 'offtopic']
    },
    isStaffPost: { type: Boolean, default: false },
    isPinned: { type: Boolean, default: false },
    replies: [{
        author: String,
        authorId: Number,
        content: String,
        isStaffReply: Boolean,
        createdAt: { type: Date, default: Date.now }
    }],
    createdAt: { type: Date, default: Date.now }
});

forumPostSchema.index({ category: 1, createdAt: -1 });
forumPostSchema.index({ isPinned: -1, createdAt: -1 });

const ForumPost = mongoose.model('ForumPost', forumPostSchema);

// ═══════════════════════════════════════════════════════════════
// GAME BUILD DATA
// ═══════════════════════════════════════════════════════════════

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

const obbyBuildData = {
    objects: [
        {
            type: 'cube',
            position: { x: 0, y: 0, z: 0 },
            scale: { x: 8, y: 1, z: 8 },
            color: { r: 0.2, g: 0.6, b: 0.2 },
            isStatic: true
        },
        { type: 'spawn', position: { x: 0, y: 2, z: 0 } },
        {
            type: 'cube',
            position: { x: 0, y: 0, z: 12 },
            scale: { x: 4, y: 1, z: 4 },
            color: { r: 0.9, g: 0.3, b: 0.3 },
            isStatic: true
        },
        {
            type: 'cube',
            position: { x: 0, y: 2, z: 20 },
            scale: { x: 4, y: 1, z: 4 },
            color: { r: 0.9, g: 0.6, b: 0.2 },
            isStatic: true
        },
        {
            type: 'cube',
            position: { x: 6, y: 4, z: 20 },
            scale: { x: 3, y: 1, z: 3 },
            color: { r: 0.9, g: 0.9, b: 0.2 },
            isStatic: true
        },
        {
            type: 'cube',
            position: { x: 12, y: 6, z: 20 },
            scale: { x: 3, y: 1, z: 3 },
            color: { r: 0.2, g: 0.9, b: 0.2 },
            isStatic: true
        },
        {
            type: 'cube',
            position: { x: 12, y: 8, z: 12 },
            scale: { x: 3, y: 1, z: 3 },
            color: { r: 0.2, g: 0.7, b: 0.9 },
            isStatic: true
        },
        {
            type: 'cube',
            position: { x: 12, y: 10, z: 4 },
            scale: { x: 3, y: 1, z: 3 },
            color: { r: 0.5, g: 0.2, b: 0.9 },
            isStatic: true
        },
        {
            type: 'cube',
            position: { x: 12, y: 12, z: -4 },
            scale: { x: 6, y: 1, z: 6 },
            color: { r: 1.0, g: 0.84, b: 0.0 },
            isStatic: true
        },
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

const hotelBuildData = {
    objects: [
        {
            type: 'cube',
            position: { x: 0, y: 0, z: 0 },
            scale: { x: 30, y: 0.5, z: 40 },
            color: { r: 0.15, g: 0.1, b: 0.08 },
            isStatic: true
        },
        {
            type: 'cube',
            position: { x: 0, y: 0.26, z: 0 },
            scale: { x: 12, y: 0.02, z: 20 },
            color: { r: 0.6, g: 0.1, b: 0.15 },
            isStatic: true
        },
        {
            type: 'cube',
            position: { x: 0, y: 10, z: 0 },
            scale: { x: 30, y: 0.5, z: 40 },
            color: { r: 0.95, g: 0.93, b: 0.88 },
            isStatic: true
        },
        {
            type: 'cube',
            position: { x: -15, y: 5, z: 0 },
            scale: { x: 0.5, y: 10, z: 40 },
            color: { r: 0.85, g: 0.8, b: 0.7 },
            isStatic: true
        },
        {
            type: 'cube',
            position: { x: 15, y: 5, z: 0 },
            scale: { x: 0.5, y: 10, z: 40 },
            color: { r: 0.85, g: 0.8, b: 0.7 },
            isStatic: true
        },
        {
            type: 'cube',
            position: { x: 0, y: 5, z: -20 },
            scale: { x: 30, y: 10, z: 0.5 },
            color: { r: 0.85, g: 0.8, b: 0.7 },
            isStatic: true
        },
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
        {
            type: 'cube',
            position: { x: -2.5, y: 3, z: 19.8 },
            scale: { x: 2.5, y: 6, z: 0.2 },
            color: { r: 0.3, g: 0.2, b: 0.15 },
            isStatic: true
        },
        {
            type: 'cube',
            position: { x: 2.5, y: 3, z: 19.8 },
            scale: { x: 2.5, y: 6, z: 0.2 },
            color: { r: 0.3, g: 0.2, b: 0.15 },
            isStatic: true
        },
        {
            type: 'cube',
            position: { x: 0, y: 1.5, z: -15 },
            scale: { x: 10, y: 3, z: 2 },
            color: { r: 0.3, g: 0.2, b: 0.15 },
            isStatic: true
        },
        {
            type: 'cube',
            position: { x: 0, y: 3.1, z: -15 },
            scale: { x: 10.2, y: 0.2, z: 2.2 },
            color: { r: 0.85, g: 0.85, b: 0.8 },
            isStatic: true
        },
        {
            type: 'cube',
            position: { x: -10, y: 0.8, z: 5 },
            scale: { x: 5, y: 1.6, z: 2 },
            color: { r: 0.2, g: 0.15, b: 0.4 },
            isStatic: true
        },
        {
            type: 'cube',
            position: { x: 10, y: 0.8, z: 5 },
            scale: { x: 5, y: 1.6, z: 2 },
            color: { r: 0.2, g: 0.15, b: 0.4 },
            isStatic: true
        },
        {
            type: 'cube',
            position: { x: -10, y: 5, z: -8 },
            scale: { x: 1.5, y: 10, z: 1.5 },
            color: { r: 0.9, g: 0.85, b: 0.75 },
            isStatic: true
        },
        {
            type: 'cube',
            position: { x: 10, y: 5, z: -8 },
            scale: { x: 1.5, y: 10, z: 1.5 },
            color: { r: 0.9, g: 0.85, b: 0.75 },
            isStatic: true
        },
        {
            type: 'cube',
            position: { x: -10, y: 5, z: 12 },
            scale: { x: 1.5, y: 10, z: 1.5 },
            color: { r: 0.9, g: 0.85, b: 0.75 },
            isStatic: true
        },
        {
            type: 'cube',
            position: { x: 10, y: 5, z: 12 },
            scale: { x: 1.5, y: 10, z: 1.5 },
            color: { r: 0.9, g: 0.85, b: 0.75 },
            isStatic: true
        },
        {
            type: 'cube',
            position: { x: 0, y: 8.0, z: 0 },
            scale: { x: 4, y: 0.3, z: 4 },
            color: { r: 1.0, g: 0.9, b: 0.6 },
            isStatic: true
        },
        {
            type: 'point_light',
            position: { x: 0, y: 7.5, z: 0 },
            color: { r: 1.0, g: 0.9, b: 0.7 },
            intensity: 2.5,
            radius: 28
        },
        { type: 'spawn', position: { x: 0, y: 1.5, z: 10 } }
    ],
    settings: {
        gravity: -20,
        timeOfDay: "night",
        ambientColor: { r: 0.25, g: 0.22, b: 0.2 },
        ambientIntensity: 0.8,
        fogEnabled: false,
        spawnPoint: { x: 0, y: 1.5, z: 10 }
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
        console.log(`Created ${games.length} games`);
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
// TUFORUMS PAGE
// ═══════════════════════════════════════════════════════════════

app.get('/TuForums', auth, (req, res) => {
    res.sendFile(path.join(__dirname, 'pages', 'forums.html'));
});

app.get('/TuForums/', auth, (req, res) => {
    res.sendFile(path.join(__dirname, 'pages', 'forums.html'));
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

app.get('/api/version', (req, res) => {
    res.json({
        version: "0.4",
        downloadUrl: "https://tublox.onrender.com/download/TuClient.zip",
        message: "Patch 0.4"
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

        const validation = validateUsername(username);
        if (!validation.valid) {
            return res.status(400).json({ 
                success: false, 
                message: validation.error 
            });
        }

        const cleanUsername = username.toLowerCase().trim();

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
        
        console.log(`[Register] New user: ${cleanUsername} (#${odilId})`);
        
        res.json({ success: true, odilId });

    } catch (err) {
        console.error('[Register] Error:', err);
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
        console.error('[Login] Error:', err);
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

// ═══════════════════════════════════════════════════════════════
// API - GAME LAUNCH
// ═══════════════════════════════════════════════════════════════

app.post('/api/game/launch', authAPI, async (req, res) => {
    try {
        const { gameId } = req.body;
        const user = req.user;
        
        if (!gameId) {
            return res.json({ success: false, message: 'Game ID required' });
        }
        
        const game = await Game.findOne({ id: gameId });
        
        if (!game) {
            return res.json({ success: false, message: 'Game not found' });
        }
        
        const token = crypto.randomBytes(32).toString('hex');
        
        await LaunchToken.create({
            token: token,
            odilId: user.odilId,
            username: user.username,
            gameId: gameId
        });
        
        await Game.findOneAndUpdate(
            { id: gameId },
            { $inc: { visits: 1 } }
        );
        
        console.log(`[Launch] ${user.username} (#${user.odilId}) -> ${gameId}`);
        
        res.json({
            success: true,
            token: token,
            wsHost: process.env.WS_HOST || 'tublox.onrender.com',
            wsPort: parseInt(process.env.WS_PORT) || 443,
            gameId: gameId,
            gameName: game.title || 'TuBlox World',
            creatorName: game.creator || '',
            description: game.description || '',
            maxPlayers: game.maxPlayers || 50,
            thumbnail: game.thumbnail || ''
        });
        
    } catch (e) {
        console.error('[Launch] Error:', e);
        res.json({ success: false, message: 'Server error' });
    }
});

app.get('/api/game/validate/:token', async (req, res) => {
    try {
        const { token } = req.params;
        
        if (!token) {
            return res.json({ success: false, message: 'Token required' });
                }
        
        const session = await LaunchToken.findOne({ token: token });
        
        if (!session) {
            return res.json({ success: false, message: 'Invalid or expired token' });
        }
        
        const game = await Game.findOne({ id: session.gameId });
        const user = await User.findOne({ odilId: session.odilId });
        
        if (!user) {
            return res.json({ success: false, message: 'User not found' });
        }
        
        console.log(`[Validate] ${user.username} (#${user.odilId}) -> ${session.gameId}`);
        
        await LaunchToken.deleteOne({ token: token });
        
        res.json({
            success: true,
            username: user.username,
            odilId: user.odilId,
            gameId: session.gameId,
            gameName: game?.title || 'TuBlox World',
            creatorName: game?.creator || '',
            description: game?.description || '',
            maxPlayers: game?.maxPlayers || 50,
            wsHost: process.env.WS_HOST || 'tublox.onrender.com',
            wsPort: parseInt(process.env.WS_PORT) || 443,
            buildData: game?.buildData || null
        });
        
    } catch (e) {
        console.error('[Validate] Error:', e);
        res.json({ success: false, message: 'Server error' });
    }
});

// ═══════════════════════════════════════════════════════════════
// API - FORUM (HTTP FALLBACK)
// ═══════════════════════════════════════════════════════════════
// Get forum stats
app.get('/api/forum/stats', async (req, res) => {
    try {
        const stats = await ForumPost.aggregate([
            {
                $group: {
                    _id: '$category',
                    threads: { $sum: 1 },
                    posts: { $sum: { $add: [1, { $size: '$replies' }] } }
                }
            }
        ]);
        
        const totalPosts = await ForumPost.countDocuments();
        const totalReplies = await ForumPost.aggregate([
            { $project: { replyCount: { $size: '$replies' } } },
            { $group: { _id: null, total: { $sum: '$replyCount' } } }
        ]);
        
        const categoryStats = {};
        stats.forEach(s => {
            categoryStats[s._id] = { threads: s.threads, posts: s.posts };
        });
        
        res.json({
            success: true,
            total: {
                posts: totalPosts,
                replies: totalReplies[0]?.total || 0
            },
            categories: categoryStats
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get posts by category
app.get('/api/forum/posts', authAPI, async (req, res) => {
    try {
        const { category, page = 1, limit = 20 } = req.query;
        const filter = {};
        
        if (category && category !== 'all') {
            filter.category = category;
        }
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const posts = await ForumPost.find(filter)
            .sort({ isPinned: -1, createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();
        
        const total = await ForumPost.countDocuments(filter);
        
        res.json({ 
            success: true, 
            posts,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get single post with replies
app.get('/api/forum/posts/:postId', authAPI, async (req, res) => {
    try {
        const post = await ForumPost.findById(req.params.postId).lean();
        
        if (!post) {
            return res.status(404).json({ success: false, message: 'Post not found' });
        }
        
        res.json({ success: true, post });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get recent activity
app.get('/api/forum/recent', async (req, res) => {
    try {
        const recentPosts = await ForumPost.find()
            .sort({ createdAt: -1 })
            .limit(15)
            .select('author authorId content category createdAt replies')
            .lean();
        
        // Также включаем посты с недавними реплаями
        const postsWithRecentReplies = await ForumPost.aggregate([
            { $unwind: '$replies' },
            { $sort: { 'replies.createdAt': -1 } },
            { $limit: 15 },
            {
                $project: {
                    author: '$replies.author',
                    authorId: '$replies.authorId',
                    content: '$replies.content',
                    category: 1,
                    createdAt: '$replies.createdAt',
                    isReply: { $literal: true },
                    originalPostId: '$_id',
                    originalContent: '$content'
                }
            }
        ]);
        
        // Объединяем и сортируем
        const allActivity = [...recentPosts.map(p => ({
            ...p,
            isReply: false
        })), ...postsWithRecentReplies]
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 15);
        
        res.json({ success: true, activity: allActivity });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Create post
app.post('/api/forum/posts', authAPI, async (req, res) => {
    try {
        const { content, category } = req.body;
        
        if (!content || content.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'Content required' });
        }
        
        if (content.length > 2000) {
            return res.status(400).json({ success: false, message: 'Content too long' });
        }
        
        const isStaff = isStaffUser(req.user.username);
        
        // Only staff can post in updates
        if (category === 'updates' && !isStaff) {
            return res.status(403).json({ success: false, message: 'Staff only' });
        }
        
        const censoredContent = censorText(content.trim());
        
        const post = new ForumPost({
            author: req.user.username,
            authorId: req.user.odilId,
            content: censoredContent,
            category: category || 'general',
            isStaffPost: isStaff
        });
        
        await post.save();
        
        res.json({ success: true, post: post.toObject() });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Reply to post
app.post('/api/forum/posts/:postId/reply', authAPI, async (req, res) => {
    try {
        const { postId } = req.params;
        const { content } = req.body;
        
        if (!content || content.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'Content required' });
        }
        
        if (content.length > 1000) {
            return res.status(400).json({ success: false, message: 'Reply too long' });
        }
        
        const censoredContent = censorText(content.trim());
        const isStaff = isStaffUser(req.user.username);
        
        const reply = {
            author: req.user.username,
            authorId: req.user.odilId,
            content: censoredContent,
            isStaffReply: isStaff,
            createdAt: new Date()
        };
        
        const updatedPost = await ForumPost.findByIdAndUpdate(
            postId,
            { $push: { replies: reply } },
            { new: true }
        ).lean();
        
        if (!updatedPost) {
            return res.status(404).json({ success: false, message: 'Post not found' });
        }
        
        res.json({ success: true, post: updatedPost });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Delete post
app.delete('/api/forum/posts/:postId', authAPI, async (req, res) => {
    try {
        const { postId } = req.params;
        
        const post = await ForumPost.findById(postId);
        if (!post) {
            return res.status(404).json({ success: false, message: 'Post not found' });
        }
        
        const isStaff = isStaffUser(req.user.username);
        const isAuthor = post.authorId === req.user.odilId;
        
        if (!isStaff && !isAuthor) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }
        
        await ForumPost.findByIdAndDelete(postId);
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Pin post (staff only)
app.post('/api/forum/posts/:postId/pin', authAPI, async (req, res) => {
    try {
        if (!isStaffUser(req.user.username)) {
            return res.status(403).json({ success: false, message: 'Staff only' });
        }
        
        const post = await ForumPost.findById(req.params.postId);
        if (!post) {
            return res.status(404).json({ success: false, message: 'Post not found' });
        }
        
        post.isPinned = !post.isPinned;
        await post.save();
        
        res.json({ success: true, isPinned: post.isPinned });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});
// ═══════════════════════════════════════════════════════════════
// API - ADMIN
// ═══════════════════════════════════════════════════════════════

app.post('/api/admin/delete-user', async (req, res) => {
    try {
        const { username, adminKey } = req.body;
        
        if (adminKey !== 'ASFLSDHJKL@#$YH%(*DSHGJDSH$@#(*%YKSFDJHGJKSDH#@($DHSGKjds') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        
        if (!username) {
            return res.json({ success: false, message: 'Username required' });
        }
        
        const user = await User.findOneAndDelete({ username: username.toLowerCase() });
        
        if (!user) {
            return res.json({ success: false, message: 'User not found' });
        }
        
        console.log(`[Admin] Deleted user: ${user.username} (#${user.odilId})`);
        
        res.json({ 
            success: true, 
            message: `Deleted ${user.username} (#${user.odilId})` 
        });
        
    } catch (e) {
        console.error('[Admin] Delete error:', e);
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
    console.log(`TuForums: /TuForums`);
});