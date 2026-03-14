// ============================================
// Console
// ============================================
console.clear();
console.log('%cTUBLOX', 'font-size:48px;font-weight:800;color:#fff;');

// ============================================
// Toast
// ============================================
function toast(msg, type = 'success') {
    let c = document.querySelector('.toast-container');
    if (!c) { c = document.createElement('div'); c.className = 'toast-container'; document.body.appendChild(c); }
    const icon = type === 'success'
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `${icon}<span>${msg}</span>`;
    c.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 200); }, 3000);
}

// ============================================
// Globals
// ============================================
let currentUser = null;
let currentGameId = null;

// Game State
let gameWS = null;
let gameActive = false;
let myOdilId = 0;
let myPlayerId = 0;
let isHost = false;
let remotePlayers = {}; // odilId -> playerData
let myPos = { x: 0, y: 5, z: 0 };
let myRot = { x: 0, y: 0, z: 0 };
let myVel = { x: 0, y: 0, z: 0 };
let buildData = null;

// Intervals
let stateInterval = null;
let pingInterval = null;
let keys = {};

// ============================================
// Auth
// ============================================
function initTabs() {
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.onclick = () => {
            const t = tab.dataset.tab;
            document.querySelectorAll('.auth-tab').forEach(x => x.classList.remove('active'));
            document.querySelectorAll('.auth-form').forEach(x => x.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`${t}-form`).classList.add('active');
        };
    });
}

async function register(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const html = btn.innerHTML;
    btn.innerHTML = '<div class="loader"></div>'; btn.disabled = true;
    try {
        const res = await fetch('/api/register', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                username: document.getElementById('reg-username').value, 
                password: document.getElementById('reg-password').value 
            })
        });
        const data = await res.json();
        if (data.success) { toast(`Account created! ID: #${data.odilId}`); setTimeout(() => location.href = '/home', 1000); }
        else { toast(data.message, 'error'); }
    } catch { toast('Connection error', 'error'); }
    btn.innerHTML = html; btn.disabled = false;
}

async function login(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const html = btn.innerHTML;
    btn.innerHTML = '<div class="loader"></div>'; btn.disabled = true;
    try {
        const res = await fetch('/api/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                username: document.getElementById('login-username').value, 
                password: document.getElementById('login-password').value 
            })
        });
        const data = await res.json();
        if (data.success) { toast('Welcome back'); setTimeout(() => location.href = '/home', 600); }
        else { toast(data.message, 'error'); }
    } catch { toast('Connection error', 'error'); }
    btn.innerHTML = html; btn.disabled = false;
}

async function logout() { 
    await fetch('/api/logout', { method: 'POST' }); 
    location.href = '/'; 
}

// ============================================
// User Data
// ============================================
async function loadUser() {
    try {
        const res = await fetch('/api/user');
        const data = await res.json();
        if (data.success) {
            currentUser = data.user;
            myOdilId = data.user.odilId;
            document.querySelectorAll('.username').forEach(el => el.textContent = data.user.username);
            document.querySelectorAll('.odil-id').forEach(el => el.textContent = `#${data.user.odilId}`);
        }
    } catch (e) { console.error(e); }
}

// ============================================
// Games List
// ============================================
function gameCardHTML(game, large = false) {
    const placeholder = `<div class="placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="6" width="20" height="12" rx="2"/></svg></div>`;
    return `
        <div class="game-card ${large ? 'large' : ''}" onclick="location.href='/game/${game.id}'">
            <div class="game-card-image">
                ${game.thumbnail ? `<img src="${game.thumbnail}" alt="${game.title}">` : placeholder}
                <div class="game-card-players"><span class="dot"></span><span>${game.activePlayers || 0} playing</span></div>
            </div>
            <div class="game-card-info">
                <div class="game-card-title">${game.title}</div>
                <div class="game-card-creator">by ${game.creator}</div>
            </div>
        </div>`;
}

function featuredGameHTML(game) {
    const placeholder = `<div class="placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="6" width="20" height="12" rx="2"/></svg></div>`;
    return `
        <div class="featured-game" onclick="location.href='/game/${game.id}'">
            <div class="featured-game-image">${game.thumbnail ? `<img src="${game.thumbnail}" alt="${game.title}">` : placeholder}</div>
            <div class="featured-game-info">
                <div class="featured-game-badge">Featured</div>
                <h3 class="featured-game-title">${game.title}</h3>
                <p class="featured-game-desc">${game.description || 'No description'}</p>
                <div class="featured-game-stats">
                    <span><strong>${game.activePlayers || 0}</strong> playing</span>
                    <span><strong>${formatNumber(game.visits || 0)}</strong> visits</span>
                </div>
                <button class="btn btn-primary" onclick="event.stopPropagation(); playGame('${game.id}')">
                    <svg viewBox="0 0 24 24" fill="currentColor" style="width:18px;height:18px;"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    Play Now
                </button>
            </div>
        </div>`;
}

async function loadFeaturedGame() {
    const container = document.getElementById('featured-game');
    if (!container) return;
    try {
        const res = await fetch('/api/games?featured=true&limit=1');
        const data = await res.json();
        if (data.success && data.games.length > 0) container.innerHTML = featuredGameHTML(data.games[0]);
        else container.innerHTML = '<p class="no-content">No games available</p>';
    } catch { container.innerHTML = '<p class="no-content">Error loading</p>'; }
}

async function loadAllGames() {
    const container = document.getElementById('all-games');
    if (!container) return;
    try {
        const res = await fetch('/api/games');
        const data = await res.json();
        if (data.success && data.games.length > 0) container.innerHTML = data.games.map(g => gameCardHTML(g, true)).join('');
        else container.innerHTML = '<p class="no-content">No games available</p>';
    } catch { container.innerHTML = '<p class="no-content">Error loading</p>'; }
}

async function loadGamePage() {
    const container = document.getElementById('game-content');
    if (!container) return;
    const gameId = location.pathname.split('/').pop();
    try {
        const res = await fetch(`/api/game/${gameId}`);
        const data = await res.json();
        if (data.success) {
            const g = data.game;
            const placeholder = `<div class="placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="6" width="20" height="12" rx="2"/></svg></div>`;
            container.innerHTML = `
                <div class="game-hero">
                    <div class="game-media">${g.thumbnail ? `<img src="${g.thumbnail}" alt="${g.title}">` : placeholder}</div>
                    <div class="game-sidebar">
                        <div class="game-main-card">
                            <h1 class="game-title">${g.title}</h1>
                            <p class="game-creator">by <a href="/user/${g.creatorId}">${g.creator}</a></p>
                            <div class="game-stats">
                                <div class="game-stat"><div class="game-stat-value">${g.activePlayers || 0}</div><div class="game-stat-label">Playing</div></div>
                                <div class="game-stat"><div class="game-stat-value">${formatNumber(g.visits || 0)}</div><div class="game-stat-label">Visits</div></div>
                            </div>
                            <button class="btn btn-primary play-button" onclick="playGame('${g.id}')">
                                <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> Play
                            </button>
                        </div>
                        <div class="game-description"><h3>About</h3><p>${g.description || 'No description.'}</p></div>
                    </div>
                </div>`;
            document.title = `TuBlox — ${g.title}`;
        } else {
            container.innerHTML = `<div class="not-found"><h2>Game not found</h2></div>`;
        }
    } catch { container.innerHTML = '<p class="error">Error loading</p>'; }
}

// ============================================
// Play Game
// ============================================
function setLaunchState(state) {
    document.querySelectorAll('.launch-state').forEach(el => el.classList.remove('active'));
    const el = document.getElementById(`state-${state}`);
    if (el) el.classList.add('active');
}

function openPlayModal() {
    const modal = document.getElementById('play-modal');
    if (modal) { modal.classList.add('active'); setLaunchState('connecting'); }
}

function closePlayModal() {
    const modal = document.getElementById('play-modal');
    if (modal) modal.classList.remove('active');
}

function playGame(gameId) {
    if (!currentUser) { toast('Please log in', 'error'); return; }
    currentGameId = gameId;
    openPlayModal();
    connectToGame(gameId);
}

function retryPlay() {
    if (currentGameId) {
        setLaunchState('connecting');
        connectToGame(currentGameId);
    }
}

// ============================================
// WebSocket Connection
// ============================================
function connectToGame(gameId) {
    if (gameWS) {
        try { gameWS.close(); } catch {}
        gameWS = null;
    }

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}`;
    console.log('[Game] Connecting:', url);

    gameWS = new WebSocket(url);

    gameWS.onopen = () => {
        console.log('[Game] WebSocket connected, joining game...');
        gameWS.send(JSON.stringify({ type: 'join', gameId }));
    };

    gameWS.onmessage = (e) => {
        try {
            const data = JSON.parse(e.data);
            handleGameMessage(data);
        } catch (err) {
            console.error('[Game] Parse error:', err);
        }
    };

    gameWS.onclose = () => {
        console.log('[Game] WebSocket closed');
        if (gameActive) handleDisconnect('Connection lost');
    };

    gameWS.onerror = (e) => {
        console.error('[Game] WebSocket error');
        setLaunchState('error');
        document.getElementById('error-message').textContent = 'Connection failed';
    };
}

function handleGameMessage(data) {
    switch (data.type) {
        case 'join_response':
            if (data.success) {
                myPlayerId = data.playerId;
                myOdilId = data.odilId;
                isHost = data.isHost;
                myPos = data.spawn || { x: 0, y: 5, z: 0 };
                buildData = data.buildData;
                
                console.log('[Game] Joined!', { playerId: myPlayerId, isHost });
                setLaunchState('success');
                setTimeout(() => enterGame(), 300);
            } else {
                setLaunchState('error');
                document.getElementById('error-message').textContent = data.message || 'Failed to join';
            }
            break;

        case 'player_joined':
            console.log('[Game] Player joined:', data.username);
            remotePlayers[data.odilId] = {
                odilId: data.odilId,
                username: data.username,
                playerId: data.playerId,
                position: data.position || { x: 0, y: 0, z: 0 },
                rotation: { x: 0, y: 0, z: 0 },
                velocity: { x: 0, y: 0, z: 0 },
                animationId: 0
            };
            addChat(null, `${data.username} joined`, true);
            updateHUD();
            break;

        case 'player_left':
            if (remotePlayers[data.odilId]) {
                addChat(null, `${data.username || remotePlayers[data.odilId].username} left`, true);
                delete remotePlayers[data.odilId];
                updateHUD();
            }
            break;

        case 'player_state':
            if (remotePlayers[data.odilId]) {
                const p = remotePlayers[data.odilId];
                p.position = data.position || p.position;
                p.rotation = data.rotation || p.rotation;
                p.velocity = data.velocity || p.velocity;
                p.animationId = data.animationId ?? p.animationId;
                renderPlayers();
            }
            break;

        case 'players_update':
            // Batch update
            if (data.players) {
                data.players.forEach(p => {
                    if (p.odilId !== myOdilId && remotePlayers[p.odilId]) {
                        Object.assign(remotePlayers[p.odilId], p);
                    }
                });
                renderPlayers();
            }
            break;

        case 'chat_message':
            addChat(data.username, data.message, false);
            break;

        case 'pong':
            const ping = Date.now() - (data.clientTime || 0);
            document.getElementById('hud-ping').textContent = `${ping}ms`;
            break;

        case 'error':
            console.error('[Game] Error:', data.message);
            toast(data.message, 'error');
            break;
    }
}

// ============================================
// Enter Game
// ============================================
function enterGame() {
    console.log('[Game] Entering game');
    gameActive = true;
    closePlayModal();

    document.getElementById('main-navbar').style.display = 'none';
    document.getElementById('game-page').style.display = 'none';
    document.getElementById('game-hud').classList.add('active');

    document.getElementById('hud-title').textContent = currentGameId || 'Game';
    document.getElementById('hud-name').textContent = currentUser.username;
    document.getElementById('hud-host').textContent = isHost ? '(Host)' : '';

    addChat(null, 'Welcome to TuBlox!', true);
    addChat(null, `You are ${currentUser.username}` + (isHost ? ' (Host)' : ''), true);

    updateHUD();
    startGameLoop();
    toast('Connected!');
}

function startGameLoop() {
    if (stateInterval) clearInterval(stateInterval);
    if (pingInterval) clearInterval(pingInterval);

    // Send state 20 times/sec
    stateInterval = setInterval(() => {
        if (!gameWS || gameWS.readyState !== WebSocket.OPEN || !gameActive) return;
        
        gameWS.send(JSON.stringify({
            type: 'player_state',
            position: myPos,
            rotation: myRot,
            velocity: myVel,
            isGrounded: true,
            isJumping: false,
            isSprinting: !!keys['shift'],
            isInWater: false,
            animationId: isMoving() ? 1 : 0
        }));

        document.getElementById('hud-coords').textContent = 
            `${myPos.x.toFixed(1)}, ${myPos.y.toFixed(1)}, ${myPos.z.toFixed(1)}`;
    }, 50);

    // Ping every 2 sec
    pingInterval = setInterval(() => {
        if (gameWS && gameWS.readyState === WebSocket.OPEN) {
            gameWS.send(JSON.stringify({ type: 'ping', clientTime: Date.now() }));
        }
    }, 2000);
}

function isMoving() {
    return keys['w'] || keys['a'] || keys['s'] || keys['d'] ||
           keys['arrowup'] || keys['arrowdown'] || keys['arrowleft'] || keys['arrowright'];
}

// ============================================
// Disconnect
// ============================================
function disconnectGame() {
    if (gameWS && gameWS.readyState === WebSocket.OPEN) {
        gameWS.send(JSON.stringify({ type: 'leave' }));
        gameWS.close();
    }
    handleDisconnect('Disconnected');
}

function handleDisconnect(reason) {
    gameActive = false;
    if (stateInterval) { clearInterval(stateInterval); stateInterval = null; }
    if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
    remotePlayers = {};
    gameWS = null;
    isHost = false;

    document.getElementById('game-hud').classList.remove('active');
    document.getElementById('main-navbar').style.display = '';
    document.getElementById('game-page').style.display = '';

    toast(reason, 'error');
}

// ============================================
// HUD
// ============================================
function updateHUD() {
    const entries = document.getElementById('hud-player-entries');
    if (entries) {
        let html = `<div class="hud-player-entry self">${currentUser?.username || 'You'} (you)${isHost ? ' 👑' : ''}</div>`;
        for (const p of Object.values(remotePlayers)) {
            html += `<div class="hud-player-entry">${p.username}</div>`;
        }
        entries.innerHTML = html;
    }
    const count = 1 + Object.keys(remotePlayers).length;
    document.getElementById('hud-count').textContent = `${count} player${count !== 1 ? 's' : ''}`;
    renderPlayers();
}

function renderPlayers() {
    const vp = document.getElementById('hud-viewport');
    if (!vp) return;
    vp.querySelectorAll('.viewport-dot').forEach(d => d.remove());

    const w = vp.clientWidth, h = vp.clientHeight;
    const cx = w / 2, cy = h / 2, scale = 8;

    createDot(vp, currentUser?.username, myPos, false, cx, cy, scale, w, h);
    for (const p of Object.values(remotePlayers)) {
        createDot(vp, p.username, p.position, true, cx, cy, scale, w, h);
    }
}

function createDot(vp, name, pos, remote, cx, cy, scale, w, h) {
    const dot = document.createElement('div');
    dot.className = 'viewport-dot ' + (remote ? 'remote' : 'self');
    const sx = cx + (pos.x || 0) * scale;
    const sy = cy - (pos.z || 0) * scale;
    dot.style.left = Math.max(10, Math.min(w - 10, sx)) + 'px';
    dot.style.top = Math.max(30, Math.min(h - 30, sy)) + 'px';
    const label = document.createElement('div');
    label.className = 'dot-label';
    label.textContent = name || '?';
    dot.appendChild(label);
    vp.appendChild(dot);
}

// ============================================
// Chat
// ============================================
function addChat(sender, message, system) {
    const c = document.getElementById('hud-chat-messages');
    if (!c) return;
    const el = document.createElement('div');
    el.className = 'hud-chat-msg' + (system ? ' system' : '');
    if (system) el.textContent = `* ${message}`;
    else el.innerHTML = `<span class="name">${escapeHtml(sender)}:</span> ${escapeHtml(message)}`;
    c.appendChild(el);
    c.scrollTop = c.scrollHeight;
    while (c.children.length > 100) c.removeChild(c.firstChild);
}

function sendChat() {
    const input = document.getElementById('hud-chat-input');
    const msg = input.value.trim();
    if (!msg || !gameWS) return;
    gameWS.send(JSON.stringify({ type: 'chat', message: msg }));
    input.value = '';
}

// ============================================
// Input
// ============================================
document.addEventListener('keydown', (e) => {
    if (document.activeElement?.id === 'hud-chat-input') return;
    keys[e.key.toLowerCase()] = true;
});

document.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
});

// Movement
setInterval(() => {
    if (!gameActive) return;
    const speed = keys['shift'] ? 0.5 : 0.25;
    if (keys['w'] || keys['arrowup']) myPos.z -= speed;
    if (keys['s'] || keys['arrowdown']) myPos.z += speed;
    if (keys['a'] || keys['arrowleft']) myPos.x -= speed;
    if (keys['d'] || keys['arrowright']) myPos.x += speed;
    renderPlayers();
}, 50);

// ============================================
// Users & Profile
// ============================================
async function loadUsers() {
    const grid = document.getElementById('users-grid');
    if (!grid) return;
    try {
        const res = await fetch('/api/users');
        const data = await res.json();
        if (data.success && data.users.length > 0) {
            grid.innerHTML = data.users.map(u => `
                <div class="user-card" onclick="location.href='/user/${u.odilId}'">
                    <div class="user-avatar"></div>
                    <div class="user-info"><div class="user-name">${u.username}</div><div class="user-id">#${u.odilId}</div></div>
                    <div class="user-level">Lv.${u.gameData.level}</div>
                </div>`).join('');
        } else grid.innerHTML = '<p class="no-content">No players</p>';
    } catch { grid.innerHTML = '<p class="no-content">Error</p>'; }
}

async function loadProfile() {
    const content = document.getElementById('profile-content');
    if (!content) return;
    const id = location.pathname.split('/').pop();
    try {
        const res = await fetch(`/api/user/${id}`);
        const data = await res.json();
        if (data.success) {
            const u = data.user;
            content.innerHTML = `
                <div class="profile-header">
                    <div class="profile-avatar"></div>
                    <h1 class="profile-name">${u.username}</h1>
                    <div class="profile-id">#${u.odilId}</div>
                </div>`;
        } else content.innerHTML = '<div class="not-found"><h2>Not found</h2></div>';
    } catch { content.innerHTML = '<p class="error">Error</p>'; }
}

// ============================================
// Helpers
// ============================================
function formatNumber(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

// ============================================
// Init
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('.auth-tabs')) {
        initTabs();
        document.getElementById('register-form')?.addEventListener('submit', register);
        document.getElementById('login-form')?.addEventListener('submit', login);
    }
    if (document.querySelector('.home-page')) { loadUser(); loadFeaturedGame(); document.getElementById('logout-btn')?.addEventListener('click', logout); }
    if (document.querySelector('.games-page')) { loadUser(); loadAllGames(); document.getElementById('logout-btn')?.addEventListener('click', logout); }
    if (document.querySelector('.game-page')) { loadUser(); loadGamePage(); document.getElementById('logout-btn')?.addEventListener('click', logout); }
    if (document.querySelector('.users-page')) { loadUser(); loadUsers(); }
    if (document.querySelector('.profile-page')) { loadUser(); loadProfile(); }
    
    document.querySelectorAll('.modal-backdrop').forEach(el => {
        el.onclick = () => el.closest('.modal')?.classList.remove('active');
    });
});