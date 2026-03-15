// ============================================
// TuForums Client
// ============================================

(function() {
    'use strict';

    // ============================================
    // CONFIG
    // ============================================
    
    const STAFF_USERS = ['today_idk'];
    const WS_PATH = '/ws';
    
    const PacketType = {
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

    // ============================================
    // STATE
    // ============================================
    
    let ws = null;
    let forumUser = null;
    let currentCategory = 'all';
    let posts = [];
    let replyTargetId = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT = 5;

    // ============================================
    // DOM ELEMENTS
    // ============================================
    
    const $feed = document.getElementById('posts-feed');
    const $postContent = document.getElementById('post-content');
    const $postCategory = document.getElementById('post-category');
    const $submitPost = document.getElementById('submit-post');
    const $charCount = document.getElementById('char-count');
    const $connectionStatus = document.getElementById('connection-status');
    const $staffOptions = document.getElementById('staff-options');
    const $staffPostToggle = document.getElementById('staff-post-toggle');
    const $pinPostToggle = document.getElementById('pin-post-toggle');
    const $postsCount = document.getElementById('posts-count');
    const $replyModal = document.getElementById('reply-modal');
    const $replyContent = document.getElementById('reply-content');
    const $replyCharCount = document.getElementById('reply-char-count');
    const $submitReply = document.getElementById('submit-reply');
    const $replyPreview = document.getElementById('reply-preview');

    // ============================================
    // INIT
    // ============================================
    
    async function init() {
        await loadForumUser();
        setupEventListeners();
        connectWebSocket();
    }

    async function loadForumUser() {
        try {
            const res = await fetch('/api/user');
            const data = await res.json();
            
            if (data.success) {
                forumUser = {
                    odilId: data.user.odilId,
                    username: data.user.username
                };
                
                document.querySelectorAll('.username').forEach(el => {
                    el.textContent = data.user.username;
                });
                document.querySelectorAll('.odil-id').forEach(el => {
                    el.textContent = `#${data.user.odilId}`;
                });
                
                // Show staff options
                if (isStaff(data.user.username)) {
                    $staffOptions.style.display = 'flex';
                }
            }
        } catch (err) {
            console.error('[Forum] Load user error:', err);
        }
    }

    function isStaff(username) {
        return STAFF_USERS.includes(username.toLowerCase());
    }

    // ============================================
    // WEBSOCKET
    // ============================================
    
    function connectWebSocket() {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${location.host}${WS_PATH}`;
        
        setConnectionStatus('connecting');
        
        ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
            console.log('[Forum] WebSocket connected');
            reconnectAttempts = 0;
            setConnectionStatus('connected');
            
            // Send forum connect
            if (forumUser) {
                send({
                    type: PacketType.FORUM_CONNECT,
                    odilId: forumUser.odilId,
                    username: forumUser.username
                });
            }
            
            // Request posts
            requestPosts();
        };
        
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleMessage(data);
            } catch (err) {
                console.error('[Forum] Parse error:', err);
            }
        };
        
        ws.onclose = () => {
            console.log('[Forum] WebSocket closed');
            setConnectionStatus('disconnected');
            attemptReconnect();
        };
        
        ws.onerror = (err) => {
            console.error('[Forum] WebSocket error:', err);
        };
    }

    function attemptReconnect() {
        if (reconnectAttempts >= MAX_RECONNECT) {
            console.log('[Forum] Max reconnect attempts reached');
            return;
        }
        
        reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
        
        console.log(`[Forum] Reconnecting in ${delay}ms...`);
        setTimeout(connectWebSocket, delay);
    }

    function setConnectionStatus(status) {
        $connectionStatus.className = 'connection-status ' + status;
        
        const texts = {
            connecting: 'Connecting...',
            connected: 'Connected — Real-time updates',
            disconnected: 'Disconnected — Reconnecting...'
        };
        
        $connectionStatus.querySelector('span').textContent = texts[status] || status;
    }

    function send(data) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(data));
        }
    }

    function requestPosts() {
        send({
            type: PacketType.FORUM_GET_POSTS,
            category: currentCategory
        });
    }

    // ============================================
    // MESSAGE HANDLER
    // ============================================
    
    function handleMessage(data) {
        switch (data.type) {
            case PacketType.FORUM_POSTS_LIST:
                posts = data.posts || [];
                $postsCount.textContent = posts.length;
                renderAllPosts();
                break;
                
            case PacketType.FORUM_POST_CREATED:
                addPostToFeed(data.post);
                break;
                
            case PacketType.FORUM_POST_UPDATED:
                updatePostInFeed(data.post);
                break;
                
            case PacketType.FORUM_POST_DELETED:
                removePostFromFeed(data.postId);
                break;
                
            case PacketType.FORUM_ERROR:
                toast(data.message || 'Error', 'error');
                break;
        }
    }

    // ============================================
    // RENDERING
    // ============================================
    
    function renderAllPosts() {
        if (posts.length === 0) {
            $feed.innerHTML = `
                <div class="posts-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                    <h3>No posts yet</h3>
                    <p>Be the first to start a conversation!</p>
                </div>
            `;
            return;
        }
        
        $feed.innerHTML = '';
        posts.forEach(post => {
            $feed.appendChild(createPostElement(post));
        });
    }

    function addPostToFeed(post) {
        // Filter by category
        if (currentCategory !== 'all' && post.category !== currentCategory) {
            return;
        }
        
        // Check if exists
        if (document.querySelector(`[data-post-id="${post._id}"]`)) {
            return;
        }
        
        // Remove empty state
        const empty = $feed.querySelector('.posts-empty');
        if (empty) empty.remove();
        
        // Add to array
        posts.unshift(post);
        $postsCount.textContent = posts.length;
        
        // Insert element
        const el = createPostElement(post);
        
        if (post.isPinned) {
            $feed.prepend(el);
        } else {
            const firstNonPinned = $feed.querySelector('.post-card:not(.pinned)');
            if (firstNonPinned) {
                $feed.insertBefore(el, firstNonPinned);
            } else {
                $feed.appendChild(el);
            }
        }
    }

    function updatePostInFeed(post) {
        const idx = posts.findIndex(p => p._id === post._id);
        if (idx !== -1) posts[idx] = post;
        
        const existing = document.querySelector(`[data-post-id="${post._id}"]`);
        if (existing) {
            const newEl = createPostElement(post);
            existing.replaceWith(newEl);
        }
    }

    function removePostFromFeed(postId) {
        posts = posts.filter(p => p._id !== postId);
        $postsCount.textContent = posts.length;
        
        const el = document.querySelector(`[data-post-id="${postId}"]`);
        if (el) {
            el.style.opacity = '0';
            el.style.transform = 'translateY(-10px)';
            setTimeout(() => el.remove(), 200);
        }
        
        if (posts.length === 0) {
            renderAllPosts();
        }
    }

    function createPostElement(post) {
        const div = document.createElement('div');
        div.className = 'post-card';
        div.dataset.postId = post._id;
        
        if (post.isStaffPost) div.classList.add('staff-post');
        if (post.isPinned) div.classList.add('pinned');
        
        const authorIsStaff = isStaff(post.author);
        const userLiked = forumUser && post.likes && post.likes.includes(forumUser.odilId);
        const canDelete = forumUser && (
            isStaff(forumUser.username) || post.authorId === forumUser.odilId
        );
        const canPin = forumUser && isStaff(forumUser.username);
        
        const timeAgo = formatTimeAgo(post.createdAt);
        
        // Badges
        let badgesHtml = '';
        if (post.isPinned) {
            badgesHtml += '<span class="badge badge-pinned">Pinned</span>';
        }
        if (post.isStaffPost) {
            badgesHtml += '<span class="badge badge-staff">Staff</span>';
        }
        badgesHtml += `<span class="badge badge-category">${escapeHtml(post.category)}</span>`;
        
        // Replies
        let repliesHtml = '';
        if (post.replies && post.replies.length > 0) {
            repliesHtml = `
                <div class="replies-section">
                    <button class="replies-toggle" onclick="toggleReplies(this)">
                        ${post.replies.length} repl${post.replies.length === 1 ? 'y' : 'ies'} — Show
                    </button>
                    <div class="replies-list" style="display: none;">
                        ${post.replies.map(reply => `
                            <div class="reply-item">
                                <div class="reply-avatar"></div>
                                <div class="reply-body">
                                    <div class="reply-author">
                                        <span class="reply-author-name ${isStaff(reply.author) ? 'staff' : ''}">
                                            ${escapeHtml(reply.author)}
                                        </span>
                                        <span class="reply-time">${formatTimeAgo(reply.createdAt)}</span>
                                    </div>
                                    <div class="reply-text">${escapeHtml(reply.content)}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        div.innerHTML = `
            <div class="post-header">
                <div class="post-avatar"></div>
                <div class="post-meta">
                    <div class="post-author">
                        <span class="post-author-name ${authorIsStaff ? 'staff' : ''}">
                            ${escapeHtml(post.author)}
                        </span>
                        <div class="post-badges">${badgesHtml}</div>
                    </div>
                    <div class="post-time">${timeAgo}</div>
                </div>
            </div>
            <div class="post-content">${escapeHtml(post.content)}</div>
            <div class="post-actions">
                <button class="post-action-btn ${userLiked ? 'liked' : ''}" onclick="likePost('${post._id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                    </svg>
                    ${post.likes ? post.likes.length : 0}
                </button>
                <button class="post-action-btn" onclick="openReplyModal('${post._id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                    ${post.replies ? post.replies.length : 0}
                </button>
                ${canPin ? `
                    <button class="post-action-btn pin-btn" onclick="pinPost('${post._id}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 2v10M12 22v-4M4.93 10.93l1.41 1.41M17.66 10.93l-1.41 1.41M2 18h20"/>
                        </svg>
                        ${post.isPinned ? 'Unpin' : 'Pin'}
                    </button>
                ` : ''}
                ${canDelete ? `
                    <button class="post-action-btn delete-btn" onclick="deletePost('${post._id}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                ` : ''}
            </div>
            ${repliesHtml}
        `;
        
        return div;
    }

    // ============================================
    // ACTIONS
    // ============================================
    
    window.likePost = function(postId) {
        if (!forumUser) {
            toast('Please log in', 'error');
            return;
        }
        send({
            type: PacketType.FORUM_LIKE_POST,
            postId: postId
        });
    };

    window.openReplyModal = function(postId) {
        if (!forumUser) {
            toast('Please log in', 'error');
            return;
        }
        
        replyTargetId = postId;
        const post = posts.find(p => p._id === postId);
        
        if (post) {
            $replyPreview.textContent = post.content.substring(0, 200) + 
                (post.content.length > 200 ? '...' : '');
        }
        
        $replyContent.value = '';
        $replyCharCount.textContent = '0';
        $replyModal.classList.add('active');
        $replyContent.focus();
    };

    window.closeReplyModal = function() {
        $replyModal.classList.remove('active');
        replyTargetId = null;
    };

    window.deletePost = function(postId) {
        if (!forumUser) return;
        if (!confirm('Delete this post?')) return;
        
        send({
            type: PacketType.FORUM_DELETE_POST,
            postId: postId
        });
    };

    window.pinPost = function(postId) {
        if (!forumUser || !isStaff(forumUser.username)) return;
        
        send({
            type: PacketType.FORUM_PIN_POST,
            postId: postId
        });
    };

    window.toggleReplies = function(btn) {
        const list = btn.nextElementSibling;
        if (list.style.display === 'none') {
            list.style.display = 'flex';
            btn.textContent = btn.textContent.replace('Show', 'Hide');
        } else {
            list.style.display = 'none';
            btn.textContent = btn.textContent.replace('Hide', 'Show');
        }
    };

    // ============================================
    // EVENT LISTENERS
    // ============================================
    
    function setupEventListeners() {
        // Post content
        $postContent.addEventListener('input', () => {
            const len = $postContent.value.length;
            $charCount.textContent = len;
            $submitPost.disabled = len === 0 || len > 2000;
        });
        
        // Submit post
        $submitPost.addEventListener('click', submitPost);
        
        // Ctrl+Enter to submit
        $postContent.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                submitPost();
            }
        });
        
        // Category buttons
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentCategory = btn.dataset.category;
                requestPosts();
            });
        });
        
        // Reply content
        $replyContent.addEventListener('input', () => {
            $replyCharCount.textContent = $replyContent.value.length;
        });
        
        // Submit reply
        $submitReply.addEventListener('click', submitReply);
        
        $replyContent.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                submitReply();
            }
        });
        
        // Modal backdrop
        $replyModal.querySelector('.modal-backdrop').addEventListener('click', closeReplyModal);
        
        // Escape closes modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeReplyModal();
            }
        });
        
        // Logout
        document.getElementById('logout-btn')?.addEventListener('click', () => {
            if (ws) {
                send({ type: PacketType.FORUM_DISCONNECT });
            }
            logout();
        });
    }

    function submitPost() {
        if (!forumUser) {
            toast('Please log in', 'error');
            return;
        }
        
        const content = $postContent.value.trim();
        if (!content) return;
        
        send({
            type: PacketType.FORUM_NEW_POST,
            content: content,
            category: $postCategory.value,
            isStaffPost: $staffPostToggle?.checked || false,
            isPinned: $pinPostToggle?.checked || false
        });
        
        // Clear form
        $postContent.value = '';
        $charCount.textContent = '0';
        $submitPost.disabled = true;
        if ($staffPostToggle) $staffPostToggle.checked = false;
        if ($pinPostToggle) $pinPostToggle.checked = false;
    }

    function submitReply() {
        if (!forumUser || !replyTargetId) return;
        
        const content = $replyContent.value.trim();
        if (!content) return;
        
        send({
            type: PacketType.FORUM_NEW_REPLY,
            postId: replyTargetId,
            content: content
        });
        
        closeReplyModal();
    }

    // ============================================
    // UTILITIES
    // ============================================
    
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function formatTimeAgo(dateStr) {
        if (!dateStr) return '';
        
        const now = Date.now();
        const date = new Date(dateStr).getTime();
        const diff = Math.floor((now - date) / 1000);
        
        if (diff < 5) return 'just now';
        if (diff < 60) return `${diff}s ago`;
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
        
        return new Date(dateStr).toLocaleDateString();
    }

    // ============================================
    // INIT ON LOAD
    // ============================================
    
    if (document.querySelector('.forums-page')) {
        init();
    }
})();