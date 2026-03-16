// ServerAntiCheat.js - TuBlox Server-Side AntiCheat v1.0
// ПОЛНАЯ СЕРВЕРНАЯ ЗАЩИТА

class ServerAntiCheat {
    constructor() {
        // ═══════════════════════════════════════════════════════════════
        // КОНФИГУРАЦИЯ
        // ═══════════════════════════════════════════════════════════════
        this.config = {
            // Movement limits
            maxWalkSpeed: 8.0,           // blocks/sec
            maxSprintSpeed: 14.0,        // blocks/sec
            maxSwimSpeed: 6.0,           // blocks/sec
            maxFallSpeed: 60.0,          // blocks/sec (terminal velocity)
            maxJumpVelocity: 12.0,       // initial jump velocity
            
            // Fly detection
            maxAirTime: 3.0,             // seconds without ground
            maxHoverTime: 1.5,           // seconds with near-zero Y velocity in air
            minFallSpeed: 0.5,           // minimum fall speed after 0.5s in air
            
            // Teleport detection
            maxTeleportDistance: 15.0,   // blocks per tick (client sends ~20 ticks/sec)
            maxTeleportDistanceSprint: 20.0,
            
            // Packet limits (anti-spam/DDoS)
            maxPacketsPerSecond: 60,
            maxStateUpdatesPerSecond: 30,
            maxChatMessagesPerMinute: 20,
            maxConnectionsPerIP: 3,
            
            // Violation thresholds
            warnThreshold: 10,
            kickThreshold: 30,
            banThreshold: 50,
            
            // Score decay
            scoreDecayPerSecond: 0.5,
            
            // Timing
            minTimeBetweenUpdates: 16,   // ms (~60fps max)
            maxTimeBetweenUpdates: 5000, // ms (5 sec timeout)
            
            // Gravity simulation
            gravity: 20.0,               // blocks/sec²
            
            // Grace period after spawn/teleport
            gracePeriod: 3000,           // ms
        };
        
        // ═══════════════════════════════════════════════════════════════
        // PLAYER DATA
        // ═══════════════════════════════════════════════════════════════
        this.players = new Map();        // odilId -> PlayerACData
        this.ipConnections = new Map();  // IP -> Set of odilIds
        this.bannedIPs = new Set();
        this.bannedOdilIds = new Set();
        
        // ═══════════════════════════════════════════════════════════════
        // RATE LIMITING
        // ═══════════════════════════════════════════════════════════════
        this.packetCounts = new Map();   // odilId -> { count, resetTime }
        this.chatCounts = new Map();     // odilId -> { count, resetTime }
        
        // ═══════════════════════════════════════════════════════════════
        // CALLBACKS
        // ═══════════════════════════════════════════════════════════════
        this.onKick = null;              // (odilId, reason) => void
        this.onBan = null;               // (odilId, reason, ip) => void
        this.onWarn = null;              // (odilId, reason) => void
        this.onCorrectPosition = null;   // (odilId, position) => void
        this.onLog = null;               // (message) => void
        
        // Start decay timer
        this.startDecayTimer();
        
        this.log('[AC] ServerAntiCheat v1.0 initialized');
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // LOGGING
    // ═══════════════════════════════════════════════════════════════════════
    
    log(message) {
        const timestamp = new Date().toISOString();
        const logMsg = `[${timestamp}] ${message}`;
        console.log(logMsg);
        if (this.onLog) this.onLog(logMsg);
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // PLAYER MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════
    
    registerPlayer(odilId, username, ip, spawnPosition) {
        // Check bans
        if (this.bannedOdilIds.has(odilId)) {
            this.log(`[AC] BLOCKED: Banned player #${odilId} tried to connect`);
            return { allowed: false, reason: 'You are banned' };
        }
        
        if (this.bannedIPs.has(ip)) {
            this.log(`[AC] BLOCKED: Banned IP ${ip} tried to connect`);
            return { allowed: false, reason: 'Your IP is banned' };
        }
        
        // Check IP connection limit
        if (!this.ipConnections.has(ip)) {
            this.ipConnections.set(ip, new Set());
        }
        const ipConns = this.ipConnections.get(ip);
        
        if (ipConns.size >= this.config.maxConnectionsPerIP) {
            this.log(`[AC] BLOCKED: Too many connections from IP ${ip}`);
            return { allowed: false, reason: 'Too many connections from your IP' };
        }
        
        ipConns.add(odilId);
        
        // Create player data
        const now = Date.now();
        this.players.set(odilId, {
            odilId,
            username,
            ip,
            
            // Position tracking
            position: { ...spawnPosition },
            lastValidPosition: { ...spawnPosition },
            rotation: { x: 0, y: 0, z: 0 },
            velocity: { x: 0, y: 0, z: 0 },
            
            // State
            isGrounded: true,
            isJumping: false,
            isSprinting: false,
            isInWater: false,
            
            // Timing
            lastUpdateTime: now,
            connectedAt: now,
            lastGroundedTime: now,
            graceUntil: now + this.config.gracePeriod,
            
            // Fly detection
            airTime: 0,
            hoverTime: 0,
            lastYVelocity: 0,
            
            // Violation tracking
            violationScore: 0,
            violations: {
                speed: 0,
                fly: 0,
                teleport: 0,
                packet: 0,
                invalid: 0
            },
            
            // Packet counting
            packetsThisSecond: 0,
            packetCountResetTime: now,
            statesThisSecond: 0,
            stateCountResetTime: now,
            
            // History for pattern detection
            positionHistory: [],
            velocityHistory: [],
            
            // Flags
            isFrozen: false,
            isAdmin: false
        });
        
        this.log(`[AC] Player registered: ${username} (#${odilId}) from ${ip}`);
        return { allowed: true };
    }
    
    unregisterPlayer(odilId) {
        const player = this.players.get(odilId);
        if (player) {
            // Remove from IP tracking
            const ipConns = this.ipConnections.get(player.ip);
            if (ipConns) {
                ipConns.delete(odilId);
                if (ipConns.size === 0) {
                    this.ipConnections.delete(player.ip);
                }
            }
            
            this.log(`[AC] Player unregistered: ${player.username} (#${odilId}), violations: ${JSON.stringify(player.violations)}`);
            this.players.delete(odilId);
        }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // PACKET RATE LIMITING
    // ═══════════════════════════════════════════════════════════════════════
    
    checkPacketRate(odilId, packetType) {
        const player = this.players.get(odilId);
        if (!player) return { allowed: false, reason: 'Unknown player' };
        
        const now = Date.now();
        
        // Reset counters if second passed
        if (now - player.packetCountResetTime > 1000) {
            player.packetsThisSecond = 0;
            player.packetCountResetTime = now;
        }
        
        player.packetsThisSecond++;
        
        // Check packet spam
        if (player.packetsThisSecond > this.config.maxPacketsPerSecond) {
            this.addViolation(odilId, 'packet', 5, 'Packet spam detected');
            return { allowed: false, reason: 'Rate limited' };
        }
        
        // Additional check for state updates
        if (packetType === 'PLAYER_STATE') {
            if (now - player.stateCountResetTime > 1000) {
                player.statesThisSecond = 0;
                player.stateCountResetTime = now;
            }
            
            player.statesThisSecond++;
            
            if (player.statesThisSecond > this.config.maxStateUpdatesPerSecond) {
                return { allowed: false, reason: 'State update rate limited' };
            }
        }
        
        return { allowed: true };
    }
    
    checkChatRate(odilId) {
        const now = Date.now();
        
        if (!this.chatCounts.has(odilId)) {
            this.chatCounts.set(odilId, { count: 0, resetTime: now });
        }
        
        const chatData = this.chatCounts.get(odilId);
        
        // Reset if minute passed
        if (now - chatData.resetTime > 60000) {
            chatData.count = 0;
            chatData.resetTime = now;
        }
        
        chatData.count++;
        
        if (chatData.count > this.config.maxChatMessagesPerMinute) {
            this.addViolation(odilId, 'packet', 2, 'Chat spam');
            return { allowed: false, reason: 'Chat rate limited' };
        }
        
        return { allowed: true };
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // MAIN VALIDATION
    // ═══════════════════════════════════════════════════════════════════════
    
    validatePlayerState(odilId, clientData) {
        const player = this.players.get(odilId);
        if (!player) {
            return { valid: false, reason: 'Unknown player', action: 'kick' };
        }
        
        const now = Date.now();
        const deltaTime = (now - player.lastUpdateTime) / 1000; // seconds
        
        // Skip validation during grace period
        if (now < player.graceUntil) {
            this.updatePlayerState(player, clientData, now);
            return { valid: true };
        }
        
        // Skip if frozen
        if (player.isFrozen) {
            return { 
                valid: false, 
                reason: 'You are frozen',
                action: 'rollback',
                correctedPosition: player.lastValidPosition
            };
        }
        
        // Skip if admin
        if (player.isAdmin) {
            this.updatePlayerState(player, clientData, now);
            return { valid: true };
        }
        
        // Validate time between updates
        if (deltaTime < this.config.minTimeBetweenUpdates / 1000) {
            // Too fast, but don't punish heavily
            return { valid: false, reason: 'Update too fast', action: 'ignore' };
        }
        
        if (deltaTime > this.config.maxTimeBetweenUpdates / 1000) {
            // Timeout - reset position
            player.graceUntil = now + this.config.gracePeriod;
            return { valid: true };
        }
        
        // ═══════════════════════════════════════════════════════════════
        // DATA VALIDATION
        // ═══════════════════════════════════════════════════════════════
        
        const validation = this.validateData(clientData);
        if (!validation.valid) {
            this.addViolation(odilId, 'invalid', 10, validation.reason);
            return { 
                valid: false, 
                reason: validation.reason,
                action: 'rollback',
                correctedPosition: player.lastValidPosition
            };
        }
        
        const newPos = {
            x: clientData.posX,
            y: clientData.posY,
            z: clientData.posZ
        };
        
        const newVel = {
            x: clientData.velX || 0,
            y: clientData.velY || 0,
            z: clientData.velZ || 0
        };
        
        // ═══════════════════════════════════════════════════════════════
        // TELEPORT CHECK
        // ═══════════════════════════════════════════════════════════════
        
        const teleportResult = this.checkTeleport(player, newPos, deltaTime);
        if (!teleportResult.valid) {
            this.addViolation(odilId, 'teleport', teleportResult.severity, teleportResult.reason);
            
            if (teleportResult.severity >= 10) {
                return {
                    valid: false,
                    reason: teleportResult.reason,
                    action: 'rollback',
                    correctedPosition: player.lastValidPosition
                };
            }
        }
        
        // ═══════════════════════════════════════════════════════════════
        // SPEED CHECK
        // ═══════════════════════════════════════════════════════════════
        
        const speedResult = this.checkSpeed(player, newPos, newVel, deltaTime, clientData);
        if (!speedResult.valid) {
            this.addViolation(odilId, 'speed', speedResult.severity, speedResult.reason);
            
            if (speedResult.severity >= 5) {
                return {
                    valid: false,
                    reason: speedResult.reason,
                    action: 'rollback',
                    correctedPosition: player.lastValidPosition
                };
            }
        }
        
        // ═══════════════════════════════════════════════════════════════
        // FLY CHECK
        // ═══════════════════════════════════════════════════════════════
        
        const flyResult = this.checkFly(player, newPos, newVel, deltaTime, clientData);
        if (!flyResult.valid) {
            this.addViolation(odilId, 'fly', flyResult.severity, flyResult.reason);
            
            if (flyResult.severity >= 10) {
                return {
                    valid: false,
                    reason: flyResult.reason,
                    action: 'rollback',
                    correctedPosition: player.lastValidPosition
                };
            }
        }
        
        // ═══════════════════════════════════════════════════════════════
        // UPDATE STATE
        // ═══════════════════════════════════════════════════════════════
        
        this.updatePlayerState(player, clientData, now);
        
        // Check thresholds
        const action = this.checkThresholds(odilId);
        if (action) {
            return { valid: false, reason: action.reason, action: action.type };
        }
        
        return { valid: true };
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // DATA VALIDATION
    // ═══════════════════════════════════════════════════════════════════════
    
    validateData(data) {
        // Check for NaN, Infinity
        const numericFields = ['posX', 'posY', 'posZ', 'rotX', 'rotY', 'rotZ', 'velX', 'velY', 'velZ'];
        
        for (const field of numericFields) {
            const value = data[field];
            if (value !== undefined && value !== null) {
                if (typeof value !== 'number' || !isFinite(value)) {
                    return { valid: false, reason: `Invalid ${field}: ${value}` };
                }
            }
        }
        
        // Check position bounds (prevent players from going to infinity)
        const MAX_COORD = 10000;
        if (Math.abs(data.posX) > MAX_COORD || Math.abs(data.posY) > MAX_COORD || Math.abs(data.posZ) > MAX_COORD) {
            return { valid: false, reason: 'Position out of bounds' };
        }
        
        // Check Y position (underground check)
        const MIN_Y = -100;
        if (data.posY < MIN_Y) {
            return { valid: false, reason: 'Position below world' };
        }
        
        return { valid: true };
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // TELEPORT DETECTION
    // ═══════════════════════════════════════════════════════════════════════
    
    checkTeleport(player, newPos, deltaTime) {
        const dx = newPos.x - player.position.x;
        const dy = newPos.y - player.position.y;
        const dz = newPos.z - player.position.z;
        
        const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
        const horizontalDist = Math.sqrt(dx*dx + dz*dz);
        
        // Calculate max possible distance
        const maxSpeed = player.isSprinting ? 
            this.config.maxSprintSpeed : this.config.maxWalkSpeed;
        
        // Add some tolerance
        const maxPossibleDist = maxSpeed * deltaTime * 2.0 + 2.0;
        
        // Blatant teleport
        if (distance > this.config.maxTeleportDistance) {
            return {
                valid: false,
                severity: 20,
                reason: `Teleport: ${distance.toFixed(1)} blocks`
            };
        }
        
        // Suspicious movement
        if (distance > maxPossibleDist && deltaTime < 1.0) {
            return {
                valid: false,
                severity: 5,
                reason: `Speed anomaly: ${(distance/deltaTime).toFixed(1)} b/s`
            };
        }
        
        return { valid: true };
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // SPEED DETECTION
    // ═══════════════════════════════════════════════════════════════════════
    
    checkSpeed(player, newPos, newVel, deltaTime, clientData) {
        if (deltaTime <= 0) return { valid: true };
        
        const dx = newPos.x - player.position.x;
        const dz = newPos.z - player.position.z;
        
        const horizontalDist = Math.sqrt(dx*dx + dz*dz);
        const horizontalSpeed = horizontalDist / deltaTime;
        
        // Determine max allowed speed
        let maxSpeed = this.config.maxWalkSpeed;
        if (clientData.isSprinting) maxSpeed = this.config.maxSprintSpeed;
        if (clientData.isInWater) maxSpeed = this.config.maxSwimSpeed;
        
        // Add tolerance
        maxSpeed *= 1.3;
        
        // Blatant speed hack
        if (horizontalSpeed > maxSpeed * 2) {
            return {
                valid: false,
                severity: 15,
                reason: `Speed hack: ${horizontalSpeed.toFixed(1)} b/s (max: ${maxSpeed.toFixed(1)})`
            };
        }
        
        // Minor speed violation
        if (horizontalSpeed > maxSpeed) {
            return {
                valid: false,
                severity: 3,
                reason: `Speed: ${horizontalSpeed.toFixed(1)} b/s`
            };
        }
        
        return { valid: true };
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // FLY DETECTION
    // ═══════════════════════════════════════════════════════════════════════
    
    checkFly(player, newPos, newVel, deltaTime, clientData) {
        const now = Date.now();
        
        if (clientData.isInWater) {
            // Reset air tracking when in water
            player.airTime = 0;
            player.hoverTime = 0;
            return { valid: true };
        }
        
        if (clientData.isGrounded) {
            // Reset when grounded
            player.airTime = 0;
            player.hoverTime = 0;
            player.lastGroundedTime = now;
            return { valid: true };
        }
        
        // Player is in air
        player.airTime += deltaTime;
        
        // Check for hover (Y velocity near 0 while in air)
        const absVelY = Math.abs(newVel.y);
        if (absVelY < 0.5 && player.airTime > 0.5) {
            player.hoverTime += deltaTime;
        } else {
            player.hoverTime = Math.max(0, player.hoverTime - deltaTime * 2);
        }
        
        // Check for flying up without jumping
        if (newVel.y > this.config.maxJumpVelocity && !clientData.isJumping) {
            return {
                valid: false,
                severity: 10,
                reason: `Fly up: velY=${newVel.y.toFixed(1)}`
            };
        }
        
        // Check for not falling (should have negative Y velocity after a while)
        if (player.airTime > 1.0 && !clientData.isJumping) {
            // After 1 second in air, player should be falling
            if (newVel.y > -this.config.minFallSpeed) {
                return {
                    valid: false,
                    severity: 8,
                    reason: `Not falling: velY=${newVel.y.toFixed(1)} after ${player.airTime.toFixed(1)}s`
                };
            }
        }
        
        // Blatant hover
        if (player.hoverTime > this.config.maxHoverTime) {
            return {
                valid: false,
                severity: 15,
                reason: `Hover: ${player.hoverTime.toFixed(1)}s`
            };
        }
        
        // Blatant fly (too long in air)
        if (player.airTime > this.config.maxAirTime) {
            return {
                valid: false,
                severity: 20,
                reason: `Fly: ${player.airTime.toFixed(1)}s in air`
            };
        }
        
        return { valid: true };
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // VIOLATION HANDLING
    // ═══════════════════════════════════════════════════════════════════════
    
    addViolation(odilId, type, severity, reason) {
        const player = this.players.get(odilId);
        if (!player) return;
        
        player.violationScore += severity;
        player.violations[type] = (player.violations[type] || 0) + 1;
        
        this.log(`[AC] VIOLATION: ${player.username} (#${odilId}) - ${type}: ${reason} (+${severity}, total: ${player.violationScore.toFixed(1)})`);
        
        if (this.onWarn && severity >= 5) {
            this.onWarn(odilId, reason);
        }
    }
    
    checkThresholds(odilId) {
        const player = this.players.get(odilId);
        if (!player) return null;
        
        if (player.violationScore >= this.config.banThreshold) {
            this.banPlayer(odilId, 'Too many violations');
            return { type: 'ban', reason: 'Banned for cheating' };
        }
        
        if (player.violationScore >= this.config.kickThreshold) {
            this.kickPlayer(odilId, 'Too many violations');
            return { type: 'kick', reason: 'Kicked for suspicious activity' };
        }
        
        return null;
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // ACTIONS
    // ═══════════════════════════════════════════════════════════════════════
    
    kickPlayer(odilId, reason) {
        const player = this.players.get(odilId);
        if (!player) return;
        
        this.log(`[AC] KICK: ${player.username} (#${odilId}) - ${reason}`);
        
        if (this.onKick) {
            this.onKick(odilId, reason);
        }
    }
    
    banPlayer(odilId, reason) {
        const player = this.players.get(odilId);
        if (!player) return;
        
        this.log(`[AC] BAN: ${player.username} (#${odilId}) from IP ${player.ip} - ${reason}`);
        
        this.bannedOdilIds.add(odilId);
        this.bannedIPs.add(player.ip);
        
        if (this.onBan) {
            this.onBan(odilId, reason, player.ip);
        }
    }
    
    freezePlayer(odilId, freeze) {
        const player = this.players.get(odilId);
        if (player) {
            player.isFrozen = freeze;
            this.log(`[AC] ${freeze ? 'FREEZE' : 'UNFREEZE'}: ${player.username} (#${odilId})`);
        }
    }
    
    setAdmin(odilId, isAdmin) {
        const player = this.players.get(odilId);
        if (player) {
            player.isAdmin = isAdmin;
            this.log(`[AC] ADMIN ${isAdmin ? 'GRANTED' : 'REVOKED'}: ${player.username} (#${odilId})`);
        }
    }
    
    resetPlayer(odilId) {
        const player = this.players.get(odilId);
        if (player) {
            player.violationScore = 0;
            player.violations = { speed: 0, fly: 0, teleport: 0, packet: 0, invalid: 0 };
            player.airTime = 0;
            player.hoverTime = 0;
            player.graceUntil = Date.now() + this.config.gracePeriod;
            this.log(`[AC] RESET: ${player.username} (#${odilId})`);
        }
    }
    
    grantGracePeriod(odilId, duration = null) {
        const player = this.players.get(odilId);
        if (player) {
            player.graceUntil = Date.now() + (duration || this.config.gracePeriod);
            player.airTime = 0;
            player.hoverTime = 0;
        }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // STATE UPDATE
    // ═══════════════════════════════════════════════════════════════════════
    
    updatePlayerState(player, clientData, now) {
        // Save valid position
        player.lastValidPosition = { ...player.position };
        
        // Update position
        player.position = {
            x: clientData.posX,
            y: clientData.posY,
            z: clientData.posZ
        };
        
        player.rotation = {
            x: clientData.rotX || 0,
            y: clientData.rotY || 0,
            z: clientData.rotZ || 0
        };
        
        player.velocity = {
            x: clientData.velX || 0,
            y: clientData.velY || 0,
            z: clientData.velZ || 0
        };
        
        player.isGrounded = !!clientData.isGrounded;
        player.isJumping = !!clientData.isJumping;
        player.isSprinting = !!clientData.isSprinting;
        player.isInWater = !!clientData.isInWater;
        
        player.lastUpdateTime = now;
        player.lastYVelocity = clientData.velY || 0;
        
        // Update history (keep last 20 entries)
        player.positionHistory.push({ ...player.position, time: now });
        if (player.positionHistory.length > 20) {
            player.positionHistory.shift();
        }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // SCORE DECAY
    // ═══════════════════════════════════════════════════════════════════════
    
    startDecayTimer() {
        setInterval(() => {
            const decay = this.config.scoreDecayPerSecond;
            
            this.players.forEach((player, odilId) => {
                if (player.violationScore > 0) {
                    player.violationScore = Math.max(0, player.violationScore - decay);
                }
            });
        }, 1000);
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // STATS
    // ═══════════════════════════════════════════════════════════════════════
    
    getPlayerStats(odilId) {
        const player = this.players.get(odilId);
        if (!player) return null;
        
        return {
            odilId: player.odilId,
            username: player.username,
            violationScore: player.violationScore,
            violations: { ...player.violations },
            airTime: player.airTime,
            isFrozen: player.isFrozen,
            isAdmin: player.isAdmin
        };
    }
    
    getAllStats() {
        const stats = [];
        this.players.forEach((player, odilId) => {
            stats.push(this.getPlayerStats(odilId));
        });
        return stats;
    }
    
    getServerStats() {
        return {
            playersTracked: this.players.size,
            bannedIPs: this.bannedIPs.size,
            bannedOdilIds: this.bannedOdilIds.size,
            ipConnections: this.ipConnections.size
        };
    }
}

module.exports = ServerAntiCheat;