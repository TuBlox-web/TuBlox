console.clear();

let currentUser = null;
let currentLaunchGameId = null;
let currentGameServers = [];
let heartbeatInterval = null;
let profileRefreshInterval = null;

// ============================================
// NAVIGATION BUILDER
// ============================================

function buildNavigation() {
    // Skip for auth, landing, countdown pages
    if (document.querySelector('.auth-page') || 
        document.querySelector('.landing-hero') || 
        document.querySelector('.countdown-page')) {
        return;
    }
    
    var navRight = document.querySelector('.nav-right');
    if (!navRight) return;
    
    // Clear existing content
    navRight.innerHTML = '';
    
    // Get current page
    var path = window.location.pathname;
    
    // Navigation items
    var navItems = [
        { href: '/home', label: 'Home', match: ['/home'] },
        { href: '/games', label: 'Games', match: ['/games', '/game/'] },
        { href: '/TuForums', label: 'Forums', match: ['/TuForums'] },
        { href: '/users', label: 'Players', match: ['/users', '/user/'] },
        { href: '/settings', label: 'Settings', match: ['/settings'] }
    ];
    
    // Build navigation links
    navItems.forEach(function(item) {
        var a = document.createElement('a');
        a.href = item.href;
        a.className = 'btn btn-ghost';
        a.textContent = item.label;
        
        // Check if current page matches
        var isActive = item.match.some(function(m) {
            if (m.endsWith('/')) {
                return path.startsWith(m);
            }
            return path === m;
        });
        
        if (isActive) {
            a.classList.add('active');
        }
        
        navRight.appendChild(a);
    });
}

// ============================================
// BADGE TOOLTIP CSS (injected once)
// ============================================

function injectBadgeStyles() {
    if (document.getElementById('badge-extra-css')) return;
    var style = document.createElement('style');
    style.id = 'badge-extra-css';
    style.textContent =
        '.profile-badge{position:relative;cursor:pointer;transition:transform .2s;}' +
        '.profile-badge:hover{transform:scale(1.15);}' +
        '.profile-badge .profile-badge-img{width:52px;height:52px;background-size:contain;background-repeat:no-repeat;background-position:center;border-radius:10px;transition:box-shadow .2s;}' +
        '.profile-badge:hover .profile-badge-img{box-shadow:0 0 12px rgba(255,255,255,.25);}' +
        '.profile-badge::after{content:attr(data-tooltip);position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%) scale(.9);background:rgba(0,0,0,.88);color:#fff;padding:5px 12px;border-radius:8px;font-size:12px;font-weight:600;letter-spacing:.3px;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .2s,transform .2s;z-index:50;backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,.1);}' +
        '.profile-badge:hover::after{opacity:1;transform:translateX(-50%) scale(1);}' +
        '.profile-badge::before{content:"";position:absolute;bottom:calc(100% + 2px);left:50%;transform:translateX(-50%);border:5px solid transparent;border-top-color:rgba(0,0,0,.88);opacity:0;transition:opacity .2s;pointer-events:none;z-index:50;}' +
        '.profile-badge:hover::before{opacity:1;}' +
        '.profile-avatar-badges{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:8px;}';
    document.head.appendChild(style);
}

function injectNavStyles() {
    if (document.getElementById('nav-active-css')) return;
    var style = document.createElement('style');
    style.id = 'nav-active-css';
    style.textContent =
        '.nav-right .btn-ghost.active{color:var(--white);background:rgba(255,255,255,0.08);}';
    document.head.appendChild(style);
}

function getBadgeTooltip(badgeId) {
    var map = {
        'Staff': 'Staff',
        'TuBloxUser': 'User'
    };
    return map[badgeId] || badgeId;
}

// ============================================
// THEME
// ============================================

function initTheme() {
    var savedTheme = localStorage.getItem('tublox-theme') || 'dark';
    document.body.classList.remove('theme-dark', 'theme-super-dark');
    document.body.classList.add('theme-' + savedTheme);
}

// ============================================
// UTILS
// ============================================

(function setFavicon() {
    var existing = document.querySelector('link[rel="icon"]');
    if (existing) existing.remove();
    var link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    link.href = '/img/logo.svg';
    document.head.appendChild(link);
    var apple = document.querySelector('link[rel="apple-touch-icon"]');
    if (apple) apple.remove();
    var appleLink = document.createElement('link');
    appleLink.rel = 'apple-touch-icon';
    appleLink.href = '/img/logo.svg';
    document.head.appendChild(appleLink);
})();

function toast(msg, type) {
    type = type || 'success';
    var c = document.querySelector('.toast-container');
    if (!c) {
        c = document.createElement('div');
        c.className = 'toast-container';
        document.body.appendChild(c);
    }
    var icon;
    if (type === 'success') {
        icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
    } else {
        icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    }
    var el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = icon + '<span>' + msg + '</span>';
    c.appendChild(el);
    setTimeout(function () {
        el.style.opacity = '0';
        setTimeout(function () { el.remove(); }, 200);
    }, 3000);
}

function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatNumber(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
}

function formatDate(dateStr) {
    if (!dateStr) return 'Unknown';
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Unknown';
    var months = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}

function gamePlaceholder() {
    return '<div class="placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 12h4M8 10v4M14 10l4 4M14 14l4-4"/></svg></div>';
}

// ============================================
// AUTH
// ============================================

function initTabs() {
    document.querySelectorAll('.auth-tab').forEach(function (tab) {
        tab.onclick = function () {
            var t = tab.dataset.tab;
            document.querySelectorAll('.auth-tab').forEach(function (x) { x.classList.remove('active'); });
            document.querySelectorAll('.auth-form').forEach(function (x) { x.classList.remove('active'); });
            tab.classList.add('active');
            document.getElementById(t + '-form').classList.add('active');
        };
    });
}

async function register(e) {
    e.preventDefault();
    var btn = e.target.querySelector('button');
    var html = btn.innerHTML;
    btn.innerHTML = '<div class="loader"></div>';
    btn.disabled = true;
    try {
        var res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: document.getElementById('reg-username').value,
                password: document.getElementById('reg-password').value
            })
        });
        var data = await res.json();
        if (data.success) {
            toast('Account created! ID: #' + data.odilId);
            setTimeout(function () { location.href = '/home'; }, 1000);
        } else {
            toast(data.message, 'error');
        }
    } catch (err) {
        toast('Connection error', 'error');
    }
    btn.innerHTML = html;
    btn.disabled = false;
}

async function login(e) {
    e.preventDefault();
    var btn = e.target.querySelector('button');
    var html = btn.innerHTML;
    btn.innerHTML = '<div class="loader"></div>';
    btn.disabled = true;
    try {
        var res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: document.getElementById('login-username').value,
                password: document.getElementById('login-password').value
            })
        });
        var data = await res.json();
        if (data.success) {
            toast('Welcome back');
            setTimeout(function () { location.href = '/home'; }, 600);
        } else {
            toast(data.message, 'error');
        }
    } catch (err) {
        toast('Connection error', 'error');
    }
    btn.innerHTML = html;
    btn.disabled = false;
}

async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    location.href = '/';
}

async function loadUser() {
    try {
        var res = await fetch('/api/user');
        var data = await res.json();
        if (data.success) {
            currentUser = data.user;
            document.querySelectorAll('.username').forEach(function (el) {
                el.textContent = data.user.username;
            });
            document.querySelectorAll('.odil-id').forEach(function (el) {
                el.textContent = '#' + data.user.odilId;
            });
            var level = document.getElementById('user-level');
            var coins = document.getElementById('user-coins');
            var time = document.getElementById('user-playtime');
            if (level) level.textContent = data.user.gameData.level;
            if (coins) coins.textContent = data.user.gameData.coins;
            if (time) time.textContent = Math.floor(data.user.gameData.playTime / 60) + 'h';
        }
    } catch (err) {
        console.error(err);
    }
}

// ============================================
// GAME CARDS
// ============================================

function gameCardHTML(game, large) {
    return '<div class="game-card ' + (large ? 'large' : '') + '" onclick="location.href=\'/game/' + game.id + '\'">' +
        '<div class="game-card-image">' +
            (game.thumbnail ? '<img src="' + game.thumbnail + '" alt="' + game.title + '">' : gamePlaceholder()) +
            '<div class="game-card-players"><span class="dot"></span><span>' + (game.activePlayers || 0) + ' playing</span></div>' +
        '</div>' +
        '<div class="game-card-info">' +
            '<div class="game-card-title">' + game.title + '</div>' +
            '<div class="game-card-creator">by ' + game.creator + '</div>' +
        '</div>' +
    '</div>';
}

function featuredGameHTML(game) {
    return '<div class="featured-game" onclick="location.href=\'/game/' + game.id + '\'">' +
        '<div class="featured-game-image">' +
            (game.thumbnail ? '<img src="' + game.thumbnail + '" alt="' + game.title + '">' : gamePlaceholder()) +
        '</div>' +
        '<div class="featured-game-info">' +
            '<div class="featured-game-badge">Featured</div>' +
            '<h3 class="featured-game-title">' + game.title + '</h3>' +
            '<p class="featured-game-desc">' + (game.description || 'No description') + '</p>' +
            '<div class="featured-game-stats">' +
                '<span><strong>' + (game.activePlayers || 0) + '</strong> playing</span>' +
                '<span><strong>' + formatNumber(game.visits || 0) + '</strong> visits</span>' +
            '</div>' +
            '<button class="btn btn-primary" onclick="event.stopPropagation(); playGame(\'' + game.id + '\')">' +
                '<svg viewBox="0 0 24 24" fill="currentColor" style="width:18px;height:18px;"><polygon points="5 3 19 12 5 21 5 3"/></svg> Play Now' +
            '</button>' +
        '</div>' +
    '</div>';
}

async function loadFeaturedGame() {
    var container = document.getElementById('featured-game');
    if (!container) return;
    try {
        var res = await fetch('/api/games?featured=true&limit=1');
        var data = await res.json();
        if (data.success && data.games.length > 0) {
            container.innerHTML = featuredGameHTML(data.games[0]);
        } else {
            container.innerHTML = '<p class="no-content">No games available</p>';
        }
    } catch (err) {
        container.innerHTML = '<p class="no-content">Error loading games</p>';
    }
}

async function loadAllGames() {
    var container = document.getElementById('all-games');
    if (!container) return;
    try {
        var res = await fetch('/api/games');
        var data = await res.json();
        if (data.success && data.games.length > 0) {
            container.innerHTML = data.games.map(function (g) {
                return gameCardHTML(g, true);
            }).join('');
        } else {
            container.innerHTML = '<p class="no-content">No games available</p>';
        }
    } catch (err) {
        container.innerHTML = '<p class="no-content">Error loading games</p>';
    }
}

// ============================================
// GAME PAGE
// ============================================

async function loadGamePage() {
    var container = document.getElementById('game-content');
    if (!container) return;
    var gameId = location.pathname.split('/').pop();
    try {
        var res = await fetch('/api/game/' + gameId);
        var data = await res.json();
        if (data.success) {
            var g = data.game;
            container.innerHTML =
                '<div class="game-hero">' +
                    '<div class="game-media">' +
                        (g.thumbnail ? '<img src="' + g.thumbnail + '" alt="' + g.title + '">' : gamePlaceholder()) +
                    '</div>' +
                    '<div class="game-sidebar">' +
                        '<div class="game-main-card">' +
                            '<h1 class="game-title">' + g.title + '</h1>' +
                            '<p class="game-creator">by <a href="/user/' + g.creatorId + '">' + g.creator + '</a></p>' +
                            '<div class="game-stats">' +
                                '<div class="game-stat"><div class="game-stat-value">' + (g.activePlayers || 0) + '</div><div class="game-stat-label">Playing</div></div>' +
                                '<div class="game-stat"><div class="game-stat-value">' + formatNumber(g.visits || 0) + '</div><div class="game-stat-label">Visits</div></div>' +
                                '<div class="game-stat"><div class="game-stat-value">' + (g.maxPlayers || 50) + '</div><div class="game-stat-label">Max</div></div>' +
                            '</div>' +
                            '<button class="btn btn-primary play-button" onclick="playGame(\'' + g.id + '\')">' +
                                '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> Play' +
                            '</button>' +
                            '<div class="game-actions">' +
                                '<button class="btn btn-secondary" onclick="openServersModal()">' +
                                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> Servers' +
                                '</button>' +
                                '<button class="btn btn-secondary" onclick="shareGame(\'' + g.id + '\')">🔗 Share</button>' +
                            '</div>' +
                        '</div>' +
                        '<div class="game-description"><h3>About</h3><p>' + (g.description || 'No description provided.') + '</p></div>' +
                    '</div>' +
                '</div>';
            document.title = 'TuBlox — ' + g.title;
        } else {
            container.innerHTML = '<div class="not-found"><h2>Game not found</h2><a href="/games" class="btn btn-secondary">Browse Games</a></div>';
        }
    } catch (err) {
        container.innerHTML = '<p class="error">Error loading game</p>';
    }
}

// ============================================
// GAME LAUNCH
// ============================================

function playGame(gameId) {
    if (!currentUser) {
        toast('Please log in to play', 'error');
        setTimeout(function () { location.href = '/'; }, 1000);
        return;
    }
    openPlayModal();
    launchGame(gameId);
}

function setLaunchState(state) {
    document.querySelectorAll('.launch-state').forEach(function (el) {
        el.classList.remove('active');
    });
    var el = document.getElementById('state-' + state);
    if (el) el.classList.add('active');
    var title = document.getElementById('modal-title');
    if (title) {
        var titles = {
            connecting: 'Launching Game',
            success: 'Game Started',
            notfound: 'Install Required',
            error: 'Launch Failed'
        };
        title.textContent = titles[state] || 'Launching Game';
    }
}

function openPlayModal() {
    var modal = document.getElementById('play-modal');
    if (modal) {
        modal.classList.add('active');
        setLaunchState('connecting');
    }
}

function closePlayModal() {
    var modal = document.getElementById('play-modal');
    if (modal) modal.classList.remove('active');
    setTimeout(function () { setLaunchState('connecting'); }, 300);
}

function retryLaunch() {
    if (currentLaunchGameId) {
        setLaunchState('connecting');
        launchGame(currentLaunchGameId);
    }
}

function detectClientLaunch(launchUrl) {
    return new Promise(function (resolve) {
        var detected = false;

        function onBlur() {
            if (!detected) {
                detected = true;
                cleanup();
                resolve(true);
            }
        }

        function onVisibility() {
            if (document.hidden && !detected) {
                detected = true;
                cleanup();
                resolve(true);
            }
        }

        function cleanup() {
            window.removeEventListener('blur', onBlur);
            document.removeEventListener('visibilitychange', onVisibility);
        }

        window.addEventListener('blur', onBlur);
        document.addEventListener('visibilitychange', onVisibility);
        window.location.href = launchUrl;

        setTimeout(function () {
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
        var res = await fetch('/api/game/launch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId: gameId })
        });
        var data = await res.json();
        if (!data.success) {
            setLaunchState('error');
            var errMsg = document.getElementById('error-message');
            if (errMsg) errMsg.textContent = data.message || 'Failed to create launch session';
            return;
        }

        var gameName = data.gameName || 'TuBlox World';
        var gameCreator = data.creatorName || '';

        if (!gameName || gameName === 'TuBlox World') {
            try {
                var gameRes = await fetch('/api/game/' + gameId);
                var gameData = await gameRes.json();
                if (gameData.success && gameData.game) {
                    gameName = gameData.game.title || gameName;
                    gameCreator = gameData.game.creator || gameCreator;
                }
            } catch (e) { }
        }

        var launchData = {
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

        var base64 = btoa(unescape(encodeURIComponent(JSON.stringify(launchData))))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
        var launchUrl = 'tublox://play/' + base64;

        var clientFound = await detectClientLaunch(launchUrl);

        if (clientFound) {
            setLaunchState('success');
            setTimeout(function () {
                closePlayModal();
                toast('Game launched!');
            }, 3000);
        } else {
            setLaunchState('notfound');
        }
    } catch (e) {
        setLaunchState('error');
        var errEl = document.getElementById('error-message');
        if (errEl) errEl.textContent = 'Connection error. Please try again.';
    }
}

function shareGame(gameId) {
    navigator.clipboard.writeText(location.origin + '/game/' + gameId);
    toast('Link copied!');
}

// ============================================
// SERVERS MODAL
// ============================================

function openServersModal() {
    var modal = document.getElementById('servers-modal');
    if (modal) {
        modal.classList.add('active');
        loadGameServers();
    }
}

function closeServersModal() {
    var modal = document.getElementById('servers-modal');
    if (modal) modal.classList.remove('active');
}

async function loadGameServers() {
    var body = document.getElementById('servers-body');
    if (!body) return;
    var gameId = location.pathname.split('/').pop();
    body.innerHTML = '<div class="servers-loading"><div class="spinner"></div><p>Loading servers...</p></div>';

    try {
        var res = await fetch('/api/game/' + gameId + '/servers');
        var data = await res.json();
        if (!data.success) throw new Error(data.message);
        currentGameServers = data.servers || [];

        if (currentGameServers.length === 0) {
            body.innerHTML =
                '<div class="servers-empty">' +
                    '<div class="servers-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></div>' +
                    '<h4>No Active Servers</h4>' +
                    '<p>Be the first to play! Click Play to start a new server.</p>' +
                    '<button class="btn btn-primary" onclick="closeServersModal(); playGame(\'' + gameId + '\')">' +
                        '<svg viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px;"><polygon points="5 3 19 12 5 21 5 3"/></svg> Start Playing' +
                    '</button>' +
                '</div>';
            return;
        }

        var html =
            '<div class="servers-refresh">' +
                '<span class="servers-count">' + currentGameServers.length + ' server' + (currentGameServers.length !== 1 ? 's' : '') + ' found</span>' +
                '<button class="btn btn-secondary btn-refresh" onclick="loadGameServers()">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></svg> Refresh' +
                '</button>' +
            '</div>' +
            '<div class="servers-list">';

        for (var i = 0; i < currentGameServers.length; i++) {
            var srv = currentGameServers[i];
            html +=
                '<div class="server-item" onclick="joinServer(\'' + srv.id + '\')">' +
                    '<div class="server-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></div>' +
                    '<div class="server-info">' +
                        '<div class="server-name">' + escapeHtml(srv.name) + '</div>' +
                        '<div class="server-meta">' +
                            '<span class="server-players"><span class="dot"></span>' + srv.players + '/' + srv.maxPlayers + ' players</span>' +
                            (srv.ping ? '<span class="server-ping">' + srv.ping + 'ms</span>' : '') +
                        '</div>' +
                    '</div>' +
                    '<button class="btn btn-primary server-join-btn">Join</button>' +
                '</div>';
        }

        html += '</div>';
        body.innerHTML = html;
    } catch (err) {
        body.innerHTML =
            '<div class="servers-empty">' +
                '<div class="servers-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>' +
                '<h4>Failed to Load</h4>' +
                '<p>Could not load server list. Please try again.</p>' +
                '<button class="btn btn-secondary" onclick="loadGameServers()">Retry</button>' +
            '</div>';
    }
}

function joinServer(serverId) {
    closeServersModal();
    playGame(serverId);
}

// ============================================
// USERS LIST
// ============================================

async function loadUsers() {
    var grid = document.getElementById('users-grid');
    if (!grid) return;
    try {
        var res = await fetch('/api/users');
        var data = await res.json();
        if (data.success && data.users.length > 0) {
            grid.innerHTML = data.users.map(function (u) {
                var statusClass = u.currentGame ? 'in-game' : (u.isOnline ? 'online' : 'offline');
                return '<div class="user-card" onclick="location.href=\'/user/' + u.odilId + '\'">' +
                    '<div class="user-avatar"><span class="user-status-dot ' + statusClass + '"></span></div>' +
                    '<div class="user-info">' +
                        '<div class="user-name">' + escapeHtml(u.username) + '</div>' +
                        '<div class="user-id">#' + u.odilId + '</div>' +
                    '</div>' +
                    '<div class="user-level">Lv.' + u.gameData.level + '</div>' +
                '</div>';
            }).join('');
        } else {
            grid.innerHTML = '<p class="no-content">No players yet</p>';
        }
    } catch (err) {
        grid.innerHTML = '<p class="no-content">Error loading</p>';
    }
}

// ============================================
// PROFILE
// ============================================

function buildProfileHTML(u) {
    var badgesHtml = '';
    if (u.badges && u.badges.length > 0) {
        var badgeItems = '';
        for (var i = 0; i < u.badges.length; i++) {
            var badge = u.badges[i];
            var tooltipName = getBadgeTooltip(badge.id);
            badgeItems +=
                '<div class="profile-badge badge-' + escapeHtml(badge.id) + '" data-tooltip="' + escapeHtml(tooltipName) + '">' +
                    '<div class="profile-badge-img" style="background-image:url(\'' + escapeHtml(badge.icon) + '\')"></div>' +
                '</div>';
        }
        badgesHtml = '<div class="profile-avatar-badges">' + badgeItems + '</div>';
    }

    var playingHtml = '';
    if (u.currentGame) {
        var game = u.currentGame;
        var thumbHtml = game.thumbnail
            ? '<img src="' + escapeHtml(game.thumbnail) + '" alt="' + escapeHtml(game.title || 'Game') + '">'
            : '<div class="placeholder-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 12h4M8 10v4M14 10l4 4M14 14l4-4"/></svg></div>';

        playingHtml =
            '<div class="profile-playing">' +
                '<div class="profile-playing-thumb">' + thumbHtml + '</div>' +
                '<div class="profile-playing-info">' +
                    '<div class="profile-playing-label"><span class="playing-dot"></span>Currently Playing</div>' +
                    '<div class="profile-playing-name">' + escapeHtml(game.title || 'Unknown Game') + '</div>' +
                '</div>' +
                '<div class="profile-playing-join">' +
                    '<button class="btn btn-primary btn-sm" onclick="joinPlayerGame(\'' + escapeHtml(game.gameId || game.serverId || '') + '\')">' +
                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><polygon points="5 3 19 12 5 21 5 3"/></svg> Join' +
                    '</button>' +
                '</div>' +
            '</div>';
    }

    var lastSeenValue;
    if (u.isOnline || u.currentGame) {
        lastSeenValue = '<span class="profile-info-value">Now</span>';
    } else if (u.lastSeen) {
        lastSeenValue = '<span class="profile-info-value">' + formatDate(u.lastSeen) + '</span>';
    } else {
        lastSeenValue = '<span class="profile-info-value">Unknown</span>';
    }

    var frame1 =
        '<div class="profile-avatar-frame">' +
            '<div class="profile-frame-top">' +
                '<div class="profile-name">' + escapeHtml(u.username) + '</div>' +
                '<div class="profile-id">#' + u.odilId + '</div>' +
            '</div>' +
            '<div class="profile-avatar" id="profile-avatar-container"></div>' +
            '<div class="profile-frame-bottom">' +
                (badgesHtml || '<div></div>') +
            '</div>' +
        '</div>';

    var frame2 =
        '<div class="profile-info-card">' +
            '<div class="profile-info-header">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
                '<span>Info</span>' +
            '</div>' +
            '<div class="profile-info-rows">' +
                '<div class="profile-info-row">' +
                    '<span class="profile-info-label">' +
                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' +
                        'Join date' +
                    '</span>' +
                    '<span class="profile-info-value">' + formatDate(u.createdAt) + '</span>' +
                '</div>' +
                '<div class="profile-info-row" id="profile-lastseen-row">' +
                    '<span class="profile-info-label">' +
                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
                        'Last seen' +
                    '</span>' +
                    lastSeenValue +
                '</div>' +
            '</div>' +
        '</div>';

    return frame1 + playingHtml + frame2;
}

async function loadProfile() {
    var content = document.getElementById('profile-content');
    if (!content) return;
    var id = location.pathname.split('/').pop();
    content.innerHTML = '<div class="loading-placeholder large"><div class="spinner"></div></div>';

    injectBadgeStyles();

    try {
        var res = await fetch('/api/user/' + id);
        var data = await res.json();
        if (data.success) {
            content.innerHTML = buildProfileHTML(data.user);
            startProfileRefresh(id);
        } else {
            content.innerHTML =
                '<div class="profile-not-found">' +
                    '<h2>User not found</h2>' +
                    '<p>This player doesn\'t exist.</p>' +
                    '<a href="/users" class="btn btn-secondary">Browse Players</a>' +
                '</div>';
        }
    } catch (err) {
        content.innerHTML = '<p class="error">Error loading profile</p>';
    }
}

function startProfileRefresh(userId) {
    stopProfileRefresh();
    profileRefreshInterval = setInterval(async function () {
        try {
            var res = await fetch('/api/user/' + userId);
            var data = await res.json();
            if (!data.success) return;
            var u = data.user;

            var lastSeenRow = document.getElementById('profile-lastseen-row');
            if (lastSeenRow) {
                var lsVal;
                if (u.isOnline || u.currentGame) {
                    lsVal = '<span class="profile-info-value">Now</span>';
                } else if (u.lastSeen) {
                    lsVal = '<span class="profile-info-value">' + formatDate(u.lastSeen) + '</span>';
                } else {
                    lsVal = '<span class="profile-info-value">Unknown</span>';
                }
                var labelEl = lastSeenRow.querySelector('.profile-info-label');
                if (labelEl) {
                    var labelClone = labelEl.cloneNode(true);
                    lastSeenRow.innerHTML = '';
                    lastSeenRow.appendChild(labelClone);
                    lastSeenRow.insertAdjacentHTML('beforeend', lsVal);
                }
            }

            var playingEl = document.querySelector('.profile-playing');
            if (u.currentGame) {
                var game = u.currentGame;
                var thumbContent = game.thumbnail
                    ? '<img src="' + escapeHtml(game.thumbnail) + '" alt="' + escapeHtml(game.title || 'Game') + '">'
                    : '<div class="placeholder-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 12h4M8 10v4M14 10l4 4M14 14l4-4"/></svg></div>';

                var ph =
                    '<div class="profile-playing-thumb">' + thumbContent + '</div>' +
                    '<div class="profile-playing-info">' +
                        '<div class="profile-playing-label"><span class="playing-dot"></span>Currently Playing</div>' +
                        '<div class="profile-playing-name">' + escapeHtml(game.title || 'Unknown Game') + '</div>' +
                    '</div>' +
                    '<div class="profile-playing-join">' +
                        '<button class="btn btn-primary btn-sm" onclick="joinPlayerGame(\'' + escapeHtml(game.gameId || game.serverId || '') + '\')">' +
                            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><polygon points="5 3 19 12 5 21 5 3"/></svg> Join' +
                        '</button>' +
                    '</div>';

                if (playingEl) {
                    playingEl.innerHTML = ph;
                } else {
                    var frame1 = document.querySelector('.profile-avatar-frame');
                    if (frame1) {
                        var d = document.createElement('div');
                        d.className = 'profile-playing';
                        d.innerHTML = ph;
                        frame1.insertAdjacentElement('afterend', d);
                    }
                }
            } else if (playingEl) {
                playingEl.remove();
            }

        } catch (e) { }
    }, 5000);
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
// HEARTBEAT
// ============================================

async function sendHeartbeat() {
    try { await fetch('/api/heartbeat', { method: 'POST' }); } catch (e) { }
}

function startHeartbeat() {
    if (heartbeatInterval) return;
    sendHeartbeat();
    heartbeatInterval = setInterval(sendHeartbeat, 20000);
}

function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

// ============================================
// FOOTER
// ============================================

function createFooter() {
    if (document.querySelector('.auth-page') || 
        document.querySelector('.countdown-page') ||
        document.querySelector('.landing-hero')) return;
    
    var footer = document.createElement('footer');
    footer.className = 'site-footer';
    footer.innerHTML =
        '<div class="footer-inner">' +
            '<div class="footer-cta">' +
                '<a href="/whitelist" class="btn btn-primary btn-lg">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> Whitelist Now' +
                '</a>' +
            '</div>' +
            '<div class="footer-main">' +
                '<div class="footer-brand">' +
                    '<a href="/home" class="logo"><img src="/img/logo.svg" alt="TuBlox"><span>TuBlox</span></a>' +
                    '<p class="footer-copyright">© 2025-2026 TuBlox</p>' +
                '</div>' +
                '<div class="footer-links">' +
                    '<div class="footer-column">' +
                        '<h4>Navigation</h4>' +
                        '<ul>' +
                            '<li><a href="/home">Home</a></li>' +
                            '<li><a href="/games">Games</a></li>' +
                            '<li><a href="/users">Users</a></li>' +
                            '<li><a href="/TuForums">TuForums</a></li>' +
                        '</ul>' +
                    '</div>' +
                    '<div class="footer-column">' +
                        '<h4>Social</h4>' +
                        '<ul>' +
                            '<li>' +
                                '<a href="https://discord.gg/fRRQy7pAHY" target="_blank" rel="noopener noreferrer">' +
                                    '<svg viewBox="0 0 24 24" fill="currentColor" class="footer-icon"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>' +
                                    ' Discord' +
                                '</a>' +
                            '</li>' +
                        '</ul>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="footer-bottom"><p>Made with ❤️ for the TuBlox community</p></div>' +
        '</div>';
    document.body.appendChild(footer);
}

// ============================================
// INIT
// ============================================

document.addEventListener('DOMContentLoaded', function () {
    // Apply saved theme
    initTheme();
    
    // Inject nav styles
    injectNavStyles();
    
    // Build navigation
    buildNavigation();
    
    startHeartbeat();
    createFooter();

    if (document.querySelector('.auth-tabs')) {
        initTabs();
        var regForm = document.getElementById('register-form');
        if (regForm) regForm.addEventListener('submit', register);
        var logForm = document.getElementById('login-form');
        if (logForm) logForm.addEventListener('submit', login);
    }

    // Landing register form
    var landingRegForm = document.getElementById('landing-register-form');
    if (landingRegForm) {
        landingRegForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            var btn = e.target.querySelector('button');
            var html = btn.innerHTML;
            btn.innerHTML = '<div class="loader"></div>';
            btn.disabled = true;
            try {
                var res = await fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: document.getElementById('landing-username').value,
                        password: document.getElementById('landing-password').value
                    })
                });
                var data = await res.json();
                if (data.success) {
                    toast('Account created! Welcome to TuBlox!');
                    setTimeout(function() { location.href = '/home'; }, 1000);
                } else {
                    toast(data.message, 'error');
                }
            } catch (err) {
                toast('Connection error', 'error');
            }
            btn.innerHTML = html;
            btn.disabled = false;
        });
    }

    if (document.querySelector('.home-page')) {
        loadUser();
        loadFeaturedGame();
        var logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) logoutBtn.addEventListener('click', logout);
    }

    if (document.querySelector('.games-page')) {
        loadUser();
        loadAllGames();
        var logoutBtn2 = document.getElementById('logout-btn');
        if (logoutBtn2) logoutBtn2.addEventListener('click', logout);
    }

    if (document.querySelector('.game-page')) {
        loadUser();
        loadGamePage();
        var logoutBtn3 = document.getElementById('logout-btn');
        if (logoutBtn3) logoutBtn3.addEventListener('click', logout);
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
        var logoutBtn4 = document.getElementById('logout-btn');
        if (logoutBtn4) logoutBtn4.addEventListener('click', logout);
    }

    if (document.querySelector('.settings-page')) {
        loadUser();
    }

    if (document.querySelector('.whitelist-page')) {
        loadUser();
    }

    document.querySelectorAll('.modal-backdrop').forEach(function (el) {
        el.onclick = function () {
            var modal = el.closest('.modal');
            if (modal) modal.classList.remove('active');
        };
    });
});

document.addEventListener('visibilitychange', function () {
    if (!document.hidden) sendHeartbeat();
});

window.addEventListener('beforeunload', function () {
    stopHeartbeat();
    stopProfileRefresh();
});

// Globals
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
window.toast = toast;