// ============================================
// Console
// ============================================
console.clear();
console.log('%cTUBLOX', 'font-size:52px;font-weight:800;color:#fff;');
console.log('%c⛔ STOP!', 'font-size:24px;font-weight:bold;color:#f00;');
console.log('%cDo not paste code here.', 'font-size:14px;color:#ff4444;');

// ============================================
// Toast
// ============================================
function toast(msg, type = 'success') {
    let c = document.querySelector('.toast-container');
    if (!c) {
        c = document.createElement('div');
        c.className = 'toast-container';
        document.body.appendChild(c);
    }
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
// Current User
// ============================================
let currentUser = null;
let currentLaunchGameId = null;
let currentGameServers = [];

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
    btn.innerHTML = '<div class="loader"></div>';
    btn.disabled = true;
    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: document.getElementById('reg-username').value,
                password: document.getElementById('reg-password').value
            })
        });
        const data = await res.json();
        if (data.success) {
            toast(`Account created! ID: #${data.odilId}`);
            setTimeout(() => location.href = '/home', 1000);
        } else {
            toast(data.message, 'error');
        }
    } catch { toast('Connection error', 'error'); }
    btn.innerHTML = html;
    btn.disabled = false;
}

async function login(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const html = btn.innerHTML;
    btn.innerHTML = '<div class="loader"></div>';
    btn.disabled = true;
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: document.getElementById('login-username').value,
                password: document.getElementById('login-password').value
            })
        });
        const data = await res.json();
        if (data.success) {
            toast('Welcome back');
            setTimeout(() => location.href = '/home', 600);
        } else {
            toast(data.message, 'error');
        }
    } catch { toast('Connection error', 'error'); }
    btn.innerHTML = html;
    btn.disabled = false;
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
            
            document.querySelectorAll('.username').forEach(el => el.textContent = data.user.username);
            document.querySelectorAll('.odil-id').forEach(el => el.textContent = `#${data.user.odilId}`);

            const level = document.getElementById('user-level');
            const coins = document.getElementById('user-coins');
            const time = document.getElementById('user-playtime');
            if (level) level.textContent = data.user.gameData.level;
            if (coins) coins.textContent = data.user.gameData.coins;
            if (time) time.textContent = Math.floor(data.user.gameData.playTime / 60) + 'h';
        }
    } catch (e) { console.error(e); }
}

// ============================================
// Games
// ============================================
function gameCardHTML(game, large = false) {
    const placeholder = `
        <div class="placeholder">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="2" y="6" width="20" height="12" rx="2"/>
                <path d="M6 12h4M8 10v4M14 10l4 4M14 14l4-4"/>
            </svg>
        </div>
    `;
    
    return `
        <div class="game-card ${large ? 'large' : ''}" onclick="location.href='/game/${game.id}'">
            <div class="game-card-image">
                ${game.thumbnail ? `<img src="${game.thumbnail}" alt="${game.title}">` : placeholder}
                <div class="game-card-players">
                    <span class="dot"></span>
                    <span>${game.activePlayers || 0} playing</span>
                </div>
            </div>
            <div class="game-card-info">
                <div class="game-card-title">${game.title}</div>
                <div class="game-card-creator">by ${game.creator}</div>
            </div>
        </div>
    `;
}

function featuredGameHTML(game) {
    const placeholder = `
        <div class="placeholder">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="2" y="6" width="20" height="12" rx="2"/>
                <path d="M6 12h4M8 10v4M14 10l4 4M14 14l4-4"/>
            </svg>
        </div>
    `;
    
    return `
        <div class="featured-game" onclick="location.href='/game/${game.id}'">
            <div class="featured-game-image">
                ${game.thumbnail ? `<img src="${game.thumbnail}" alt="${game.title}">` : placeholder}
            </div>
            <div class="featured-game-info">
                <div class="featured-game-badge">Featured</div>
                <h3 class="featured-game-title">${game.title}</h3>
                <p class="featured-game-desc">${game.description || 'No description'}</p>
                <div class="featured-game-stats">
                    <span><strong>${game.activePlayers || 0}</strong> playing</span>
                    <span><strong>${formatNumber(game.visits || 0)}</strong> visits</span>
                </div>
                <button class="btn btn-primary" onclick="event.stopPropagation(); playGame('${game.id}')">
                    <svg viewBox="0 0 24 24" fill="currentColor" style="width:18px;height:18px;">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    Play Now
                </button>
            </div>
        </div>
    `;
}

async function loadFeaturedGame() {
    const container = document.getElementById('featured-game');
    if (!container) return;
    
    try {
        const res = await fetch('/api/games?featured=true&limit=1');
        const data = await res.json();
        
        if (data.success && data.games.length > 0) {
            container.innerHTML = featuredGameHTML(data.games[0]);
        } else {
            container.innerHTML = '<p class="no-content">No games available</p>';
        }
    } catch (e) {
        container.innerHTML = '<p class="no-content">Error loading games</p>';
    }
}

async function loadAllGames() {
    const container = document.getElementById('all-games');
    if (!container) return;
    
    try {
        const res = await fetch('/api/games');
        const data = await res.json();
        
        if (data.success && data.games.length > 0) {
            container.innerHTML = data.games.map(g => gameCardHTML(g, true)).join('');
        } else {
            container.innerHTML = '<p class="no-content">No games available</p>';
        }
    } catch (e) {
        container.innerHTML = '<p class="no-content">Error loading games</p>';
    }
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
            const placeholder = `
                <div class="placeholder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <rect x="2" y="6" width="20" height="12" rx="2"/>
                        <path d="M6 12h4M8 10v4M14 10l4 4M14 14l4-4"/>
                    </svg>
                </div>
            `;
            
            container.innerHTML = `
                <div class="game-hero">
                    <div class="game-media">
                        ${g.thumbnail ? `<img src="${g.thumbnail}" alt="${g.title}">` : placeholder}
                    </div>
                    <div class="game-sidebar">
                        <div class="game-main-card">
                            <h1 class="game-title">${g.title}</h1>
                            <p class="game-creator">by <a href="/user/${g.creatorId}">${g.creator}</a></p>
                            
                            <div class="game-stats">
                                <div class="game-stat">
                                    <div class="game-stat-value">${g.activePlayers || 0}</div>
                                    <div class="game-stat-label">Playing</div>
                                </div>
                                <div class="game-stat">
                                    <div class="game-stat-value">${formatNumber(g.visits || 0)}</div>
                                    <div class="game-stat-label">Visits</div>
                                </div>
                                <div class="game-stat">
                                    <div class="game-stat-value">${g.maxPlayers || 50}</div>
                                    <div class="game-stat-label">Max</div>
                                </div>
                            </div>
                            
                            <button class="btn btn-primary play-button" onclick="playGame('${g.id}')">
                                <svg viewBox="0 0 24 24" fill="currentColor">
                                    <polygon points="5 3 19 12 5 21 5 3"/>
                                </svg>
                                Play
                            </button>
                            
                            <div class="game-actions">
                                <button class="btn btn-secondary" onclick="openServersModal()">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
                                        <rect x="2" y="3" width="20" height="14" rx="2"/>
                                        <line x1="8" y1="21" x2="16" y2="21"/>
                                        <line x1="12" y1="17" x2="12" y2="21"/>
                                    </svg>
                                    Servers
                                </button>
                                <button class="btn btn-secondary" onclick="shareGame('${g.id}')">
                                    🔗 Share
                                </button>
                            </div>
                        </div>
                        
                        <div class="game-description">
                            <h3>About</h3>
                            <p>${g.description || 'No description provided.'}</p>
                        </div>
                    </div>
                </div>
            `;
            
            document.title = `TuBlox — ${g.title}`;
        } else {
            container.innerHTML = `
                <div class="not-found">
                    <h2>Game not found</h2>
                    <a href="/games" class="btn btn-secondary">Browse Games</a>
                </div>
            `;
        }
    } catch (e) {
        container.innerHTML = '<p class="error">Error loading game</p>';
    }
}

// ============================================
// Play Game
// ============================================
function playGame(gameId) {
    if (!currentUser) {
        toast('Please log in to play', 'error');
        setTimeout(() => { location.href = '/'; }, 1000);
        return;
    }
    
    openPlayModal();
    launchGame(gameId);
}

// ============================================
// Launch System
// ============================================
function setLaunchState(state) {
    document.querySelectorAll('.launch-state').forEach(el => el.classList.remove('active'));
    
    const el = document.getElementById(`state-${state}`);
    if (el) el.classList.add('active');
    
    const title = document.getElementById('modal-title');
    if (title) {
        const titles = {
            connecting: 'Launching Game',
            success: 'Game Started',
            notfound: 'Install Required',
            error: 'Launch Failed'
        };
        title.textContent = titles[state] || 'Launching Game';
    }
}

function openPlayModal() {
    const modal = document.getElementById('play-modal');
    if (modal) {
        modal.classList.add('active');
        setLaunchState('connecting');
    }
}

function closePlayModal() {
    const modal = document.getElementById('play-modal');
    if (modal) modal.classList.remove('active');
    setTimeout(() => setLaunchState('connecting'), 300);
}

function retryLaunch() {
    if (currentLaunchGameId) {
        setLaunchState('connecting');
        launchGame(currentLaunchGameId);
    }
}

function detectClientLaunch(launchUrl) {
    return new Promise((resolve) => {
        let detected = false;
        
        const onBlur = () => {
            if (!detected) {
                detected = true;
                cleanup();
                resolve(true);
            }
        };
        
        const onVisibility = () => {
            if (document.hidden && !detected) {
                detected = true;
                cleanup();
                resolve(true);
            }
        };
        
        function cleanup() {
            window.removeEventListener('blur', onBlur);
            document.removeEventListener('visibilitychange', onVisibility);
        }
        
        window.addEventListener('blur', onBlur);
        document.addEventListener('visibilitychange', onVisibility);
        
        window.location.href = launchUrl;
        
        setTimeout(() => {
            if (!detected) {
                cleanup();
                resolve(false);
            }
        }, 3500);
    });
}

async function launchGame(gameId) {
    currentLaunchGameId = gameId;
    
    try {
        const res = await fetch('/api/game/launch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId })
        });
        const data = await res.json();
        
        if (!data.success) {
            setLaunchState('error');
            const errMsg = document.getElementById('error-message');
            if (errMsg) errMsg.textContent = data.message || 'Failed to create launch session';
            return;
        }
        
        let gameName = data.gameName || 'TuBlox World';
        let gameCreator = data.creatorName || '';
        
        if (!gameName || gameName === 'TuBlox World') {
            try {
                const gameRes = await fetch(`/api/game/${gameId}`);
                const gameData = await gameRes.json();
                if (gameData.success && gameData.game) {
                    gameName = gameData.game.title || gameName;
                    gameCreator = gameData.game.creator || gameCreator;
                }
            } catch (e) {
                console.warn('Could not fetch game info:', e);
            }
        }
        
        const launchData = {
            username: currentUser.username,
            odilId: currentUser.odilId,
            host: data.wsHost || window.location.hostname || 'localhost',
            port: data.wsPort || 3000,
            gameId: gameId,
            token: data.token,
            gameName: gameName,
            creatorName: gameCreator,
            description: data.description || '',
            maxPlayers: data.maxPlayers || 10
        };
        
        const jsonStr = JSON.stringify(launchData);
        const base64 = btoa(unescape(encodeURIComponent(jsonStr)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
        const launchUrl = 'tublox://play/' + base64;
        
        console.log('[Launch] URL:', launchUrl);
        console.log('[Launch] Data:', launchData);
        
        const clientFound = await detectClientLaunch(launchUrl);
        
        if (clientFound) {
            setLaunchState('success');
            setTimeout(() => {
                closePlayModal();
                toast('Game launched!');
            }, 3000);
        } else {
            setLaunchState('notfound');
        }
        
    } catch (e) {
        console.error('Launch error:', e);
        setLaunchState('error');
        const errMsg = document.getElementById('error-message');
        if (errMsg) errMsg.textContent = 'Connection error. Please try again.';
    }
}

function shareGame(gameId) {
    navigator.clipboard.writeText(`${location.origin}/game/${gameId}`);
    toast('Link copied!');
}

// ============================================
// Servers Modal
// ============================================
function openServersModal() {
    const modal = document.getElementById('servers-modal');
    if (modal) {
        modal.classList.add('active');
        loadGameServers();
    }
}

function closeServersModal() {
    const modal = document.getElementById('servers-modal');
    if (modal) modal.classList.remove('active');
}

async function loadGameServers() {
    const body = document.getElementById('servers-body');
    if (!body) return;

    const gameId = location.pathname.split('/').pop();

    body.innerHTML = `
        <div class="servers-loading">
            <div class="spinner"></div>
            <p>Loading servers...</p>
        </div>
    `;

    try {
        const res = await fetch(`/api/game/${gameId}/servers`);
        const data = await res.json();

        if (!data.success) {
            throw new Error(data.message);
        }

        currentGameServers = data.servers || [];

        if (currentGameServers.length === 0) {
            body.innerHTML = `
                <div class="servers-empty">
                    <div class="servers-empty-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <rect x="2" y="3" width="20" height="14" rx="2"/>
                            <line x1="8" y1="21" x2="16" y2="21"/>
                            <line x1="12" y1="17" x2="12" y2="21"/>
                        </svg>
                    </div>
                    <h4>No Active Servers</h4>
                    <p>Be the first to play! Click Play to start a new server.</p>
                    <button class="btn btn-primary" onclick="closeServersModal(); playGame('${gameId}')">
                        <svg viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px;">
                            <polygon points="5 3 19 12 5 21 5 3"/>
                        </svg>
                        Start Playing
                    </button>
                </div>
            `;
            return;
        }

        let html = `
            <div class="servers-refresh">
                <span class="servers-count">${currentGameServers.length} server${currentGameServers.length !== 1 ? 's' : ''} found</span>
                <button class="btn btn-secondary btn-refresh" onclick="loadGameServers()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M23 4v6h-6"/>
                        <path d="M1 20v-6h6"/>
                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/>
                        <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/>
                    </svg>
                    Refresh
                </button>
            </div>
            <div class="servers-list">
        `;

        for (const server of currentGameServers) {
            html += `
                <div class="server-item" onclick="joinServer('${server.id}')">
                    <div class="server-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <rect x="2" y="3" width="20" height="14" rx="2"/>
                            <line x1="8" y1="21" x2="16" y2="21"/>
                            <line x1="12" y1="17" x2="12" y2="21"/>
                        </svg>
                    </div>
                    <div class="server-info">
                        <div class="server-name">${escapeHtml(server.name)}</div>
                        <div class="server-meta">
                            <span class="server-players">
                                <span class="dot"></span>
                                ${server.players}/${server.maxPlayers} players
                            </span>
                            ${server.ping ? `<span class="server-ping">${server.ping}ms</span>` : ''}
                        </div>
                    </div>
                    <button class="btn btn-primary server-join-btn">Join</button>
                </div>
            `;
        }

        html += '</div>';
        body.innerHTML = html;

    } catch (err) {
        console.error('Load servers error:', err);
        body.innerHTML = `
            <div class="servers-empty">
                <div class="servers-empty-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="12"/>
                        <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                </div>
                <h4>Failed to Load</h4>
                <p>Could not load server list. Please try again.</p>
                <button class="btn btn-secondary" onclick="loadGameServers()">Retry</button>
            </div>
        `;
    }
}

function joinServer(serverId) {
    closeServersModal();
    playGame(serverId);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// Users
// ============================================
async function loadUsers() {
    const grid = document.getElementById('users-grid');
    if (!grid) return;
    
    try {
        const res = await fetch('/api/users');
        const data = await res.json();
        
        if (data.success && data.users.length > 0) {
            grid.innerHTML = data.users.map(u => {
                const statusClass = u.currentGame ? 'in-game' : (u.isOnline ? 'online' : 'offline');
                return `
                    <div class="user-card" onclick="location.href='/user/${u.odilId}'">
                        <div class="user-avatar">
                            <span class="user-status-dot ${statusClass}"></span>
                        </div>
                        <div class="user-info">
                            <div class="user-name">${escapeHtml(u.username)}</div>
                            <div class="user-id">#${u.odilId}</div>
                        </div>
                        <div class="user-level">Lv.${u.gameData.level}</div>
                    </div>
                `;
            }).join('');
        } else {
            grid.innerHTML = '<p class="no-content">No players yet</p>';
        }
    } catch (e) {
        grid.innerHTML = '<p class="no-content">Error loading</p>';
    }
}

// ============================================
// Profile
// ============================================

let profileRefreshInterval = null;

function formatDate(dateStr) {
    if (!dateStr) return 'Unknown';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Unknown';
    
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatLastSeen(dateStr) {
    if (!dateStr) return 'Unknown';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Unknown';
    
    const now = new Date();
    const diffMs = now - d;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    
    if (diffSec < 30) return 'Just now';
    if (diffMin < 1) return 'Less than a minute ago';
    if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
    if (diffHour < 24) return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`;
    if (diffDay < 7) return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
    
    return formatDate(dateStr);
}

function buildProfileHTML(u) {
    // Status badge
    let statusHtml = '';
    if (u.currentGame) {
        statusHtml = `
            <div class="profile-status in-game">
                <span class="status-dot"></span>
                In Game
            </div>
        `;
    } else if (u.isOnline) {
        statusHtml = `
            <div class="profile-status online">
                <span class="status-dot"></span>
                Online
            </div>
        `;
    } else {
        statusHtml = `
            <div class="profile-status offline">
                <span class="status-dot"></span>
                Offline
            </div>
        `;
    }
    
    // Last seen (only if offline)
    let lastSeenHtml = '';
    if (!u.isOnline && u.lastSeen) {
        lastSeenHtml = `
            <div class="profile-last-seen">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                </svg>
                Last seen ${formatLastSeen(u.lastSeen)}
            </div>
        `;
    }
    
    // Currently playing card
    let playingHtml = '';
    if (u.currentGame) {
        const game = u.currentGame;
        playingHtml = `
            <div class="profile-playing">
                <div class="profile-playing-thumb">
                    ${game.thumbnail 
                        ? `<img src="${escapeHtml(game.thumbnail)}" alt="${escapeHtml(game.title || 'Game')}">` 
                        : `<div class="placeholder-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                <rect x="2" y="6" width="20" height="12" rx="2"/>
                                <path d="M6 12h4M8 10v4M14 10l4 4M14 14l4-4"/>
                            </svg>
                        </div>`
                    }
                </div>
                <div class="profile-playing-info">
                    <div class="profile-playing-label">
                        <span class="playing-dot"></span>
                        Currently Playing
                    </div>
                    <div class="profile-playing-name">${escapeHtml(game.title || 'Unknown Game')}</div>
                </div>
                <div class="profile-playing-join">
                    <button class="btn btn-blue btn-sm" onclick="joinPlayerGame('${escapeHtml(game.gameId || game.serverId || '')}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;">
                            <polygon points="5 3 19 12 5 21 5 3"/>
                        </svg>
                        Join
                    </button>
                </div>
            </div>
        `;
    }
    
    return `
        <div class="profile-header">
            <div class="profile-avatar"></div>
            <h1 class="profile-name">${escapeHtml(u.username)}</h1>
            <div class="profile-id">#${u.odilId}</div>
            ${statusHtml}
            ${lastSeenHtml}
        </div>
        
        ${playingHtml}
        
        <div class="profile-joined">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            Joined ${formatDate(u.createdAt)}
        </div>
    `;
}

async function loadProfile() {
    const content = document.getElementById('profile-content');
    if (!content) return;
    
    const id = location.pathname.split('/').pop();
    
    // Show loading
    content.innerHTML = `
        <div class="loading-placeholder large">
            <div class="spinner"></div>
        </div>
    `;
    
    try {
        const res = await fetch(`/api/user/${id}`);
        const data = await res.json();
        
        if (data.success) {
            content.innerHTML = buildProfileHTML(data.user);
            startProfileRefresh(id);
        } else {
            content.innerHTML = `
                <div class="profile-not-found">
                    <h2>User not found</h2>
                    <p>This player doesn't exist.</p>
                    <a href="/users" class="btn btn-secondary">Browse Players</a>
                </div>
            `;
        }
    } catch (e) {
        content.innerHTML = '<p class="error">Error loading profile</p>';
    }
}

function startProfileRefresh(userId) {
    stopProfileRefresh();
    
    profileRefreshInterval = setInterval(async () => {
        try {
            const res = await fetch(`/api/user/${userId}`);
            const data = await res.json();
            
            if (!data.success) return;
            
            const u = data.user;
            
            // Update status badge
            const statusEl = document.querySelector('.profile-status');
            if (statusEl) {
                let newClass = 'profile-status';
                let newContent = '';
                
                if (u.currentGame) {
                    newClass += ' in-game';
                    newContent = '<span class="status-dot"></span>In Game';
                } else if (u.isOnline) {
                    newClass += ' online';
                    newContent = '<span class="status-dot"></span>Online';
                } else {
                    newClass += ' offline';
                    newContent = '<span class="status-dot"></span>Offline';
                }
                
                statusEl.className = newClass;
                statusEl.innerHTML = newContent;
            }
            
            // Update last seen
            const lastSeenEl = document.querySelector('.profile-last-seen');
            if (!u.isOnline && u.lastSeen) {
                const newHtml = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    Last seen ${formatLastSeen(u.lastSeen)}
                `;
                if (lastSeenEl) {
                    lastSeenEl.innerHTML = newHtml;
                } else {
                    const header = document.querySelector('.profile-header');
                    if (header) {
                        const div = document.createElement('div');
                        div.className = 'profile-last-seen';
                        div.innerHTML = newHtml;
                        header.appendChild(div);
                    }
                }
            } else if (lastSeenEl) {
                lastSeenEl.remove();
            }
            
            // Update playing card
            const playingEl = document.querySelector('.profile-playing');
            if (u.currentGame) {
                const game = u.currentGame;
                const playingHtml = `
                    <div class="profile-playing-thumb">
                        ${game.thumbnail 
                            ? `<img src="${escapeHtml(game.thumbnail)}" alt="${escapeHtml(game.title || 'Game')}">` 
                            : `<div class="placeholder-icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                    <rect x="2" y="6" width="20" height="12" rx="2"/>
                                    <path d="M6 12h4M8 10v4M14 10l4 4M14 14l4-4"/>
                                </svg>
                            </div>`
                        }
                    </div>
                    <div class="profile-playing-info">
                        <div class="profile-playing-label">
                            <span class="playing-dot"></span>
                            Currently Playing
                        </div>
                        <div class="profile-playing-name">${escapeHtml(game.title || 'Unknown Game')}</div>
                    </div>
                    <div class="profile-playing-join">
                        <button class="btn btn-blue btn-sm" onclick="joinPlayerGame('${escapeHtml(game.gameId || game.serverId || '')}')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;">
                                <polygon points="5 3 19 12 5 21 5 3"/>
                            </svg>
                            Join
                        </button>
                    </div>
                `;
                
                if (playingEl) {
                    playingEl.innerHTML = playingHtml;
                } else {
                    const header = document.querySelector('.profile-header');
                    if (header) {
                        const div = document.createElement('div');
                        div.className = 'profile-playing';
                        div.innerHTML = playingHtml;
                        header.insertAdjacentElement('afterend', div);
                    }
                }
            } else if (playingEl) {
                playingEl.remove();
            }
            
        } catch (e) {
            // ignore refresh errors
        }
    }, 5000); // Refresh every 5 seconds
}

function stopProfileRefresh() {
    if (profileRefreshInterval) {
        clearInterval(profileRefreshInterval);
        profileRefreshInterval = null;
    }
}

function joinPlayerGame(gameId) {
    if (!gameId) {
        toast('Cannot join this game', 'error');
        return;
    }
    playGame(gameId);
}

// ============================================
// Helpers
// ============================================
function formatNumber(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
}

// ============================================
// Heartbeat - keep online status
// ============================================

let heartbeatInterval = null;

async function sendHeartbeat() {
    try {
        await fetch('/api/heartbeat', { method: 'POST' });
    } catch (e) {
        // ignore
    }
}

function startHeartbeat() {
    if (heartbeatInterval) return;
    
    // Send immediately
    sendHeartbeat();
    
    // Then every 20 seconds
    heartbeatInterval = setInterval(sendHeartbeat, 20000);
}

function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

// ============================================
// Init
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // Start heartbeat on any page
    startHeartbeat();
    
    if (document.querySelector('.auth-tabs')) {
        initTabs();
        document.getElementById('register-form')?.addEventListener('submit', register);
        document.getElementById('login-form')?.addEventListener('submit', login);
    }
    
    if (document.querySelector('.home-page')) { 
        loadUser(); 
        loadFeaturedGame(); 
        document.getElementById('logout-btn')?.addEventListener('click', logout); 
    }
    
    if (document.querySelector('.games-page')) { 
        loadUser(); 
        loadAllGames(); 
        document.getElementById('logout-btn')?.addEventListener('click', logout); 
    }
    
    if (document.querySelector('.game-page')) { 
        loadUser(); 
        loadGamePage(); 
        document.getElementById('logout-btn')?.addEventListener('click', logout); 
    }
    
    if (document.querySelector('.users-page')) { 
        loadUser(); 
        loadUsers(); 
    }
    
    if (document.querySelector('.profile-page')) { 
        loadUser(); 
        loadProfile(); 
    }
    
    if (document.querySelector('.forum-page')) { 
        loadUser(); 
        document.getElementById('logout-btn')?.addEventListener('click', logout); 
    }
    
    document.querySelectorAll('.modal-backdrop').forEach(el => {
        el.onclick = () => el.closest('.modal')?.classList.remove('active');
    });
    
    const disconnectBtn = document.getElementById('hud-disconnect');
    if (disconnectBtn) {
        disconnectBtn.addEventListener('click', disconnectGame);
    }
});

// Visibility change - send heartbeat when user returns
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        sendHeartbeat();
    }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    stopHeartbeat();
    stopProfileRefresh();
});

// ============================================
// Expose functions to global scope
// ============================================
window.playGame = playGame;
window.shareGame = shareGame;
window.openServersModal = openServersModal;
window.closeServersModal = closeServersModal;
window.joinServer = joinServer;
window.closePlayModal = closePlayModal;
window.retryLaunch = retryLaunch;
window.loadGameServers = loadGameServers;
window.logout = logout;
window.joinPlayerGame = joinPlayerGame;
window.loadProfile = loadProfile;