// ============================================
// TuForums Client
// ============================================

(function() {
    'use strict';

    const STAFF_USERS = ['today_idk'];
    
    let currentUser = null;
    let currentCategory = null;
    let currentPostId = null;

    // ============================================
    // HELPERS
    // ============================================
    
    function $(id) {
        return document.getElementById(id);
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function truncate(text, len) {
        if (!text) return '';
        if (text.length <= len) return text;
        return text.substring(0, len) + '...';
    }

    function formatTimeAgo(dateStr) {
        if (!dateStr) return '';
        const now = Date.now();
        const date = new Date(dateStr).getTime();
        const diff = Math.floor((now - date) / 1000);
        
        if (diff < 60) return `${diff}s ago`;
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
        return new Date(dateStr).toLocaleDateString();
    }

    function formatNumber(n) {
        if (!n) return '0';
        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
        if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
        return n.toString();
    }

    function getInitials(name) {
        if (!name) return '?';
        return name.substring(0, 2).toUpperCase();
    }

    function isStaff(username) {
        return STAFF_USERS.includes((username || '').toLowerCase());
    }

    // ============================================
    // INIT
    // ============================================
    
    async function init() {
        console.log('[Forum] Initializing...');
        
        await loadUser();
        loadStats();
        loadRecentActivity();
        setupEventListeners();
        
        console.log('[Forum] Ready');
    }

    async function loadUser() {
        try {
            const res = await fetch('/api/user');
            const data = await res.json();
            if (data.success) {
                currentUser = data.user;
                document.querySelectorAll('.username').forEach(el => {
                    el.textContent = data.user.username;
                });
                console.log('[Forum] User:', data.user.username);
            }
        } catch (err) {
            console.error('[Forum] Load user error:', err);
        }
    }

    // ============================================
    // LOAD STATS
    // ============================================

    async function loadStats() {
        try {
            const res = await fetch('/api/forum/stats');
            const data = await res.json();
            
            if (data.success) {
                const el1 = $('stat-total-posts');
                const el2 = $('stat-total-replies');
                if (el1) el1.textContent = formatNumber(data.total.posts);
                if (el2) el2.textContent = formatNumber(data.total.replies);
                
                const cats = data.categories || {};
                
                const u1 = $('stat-updates-threads');
                const u2 = $('stat-updates-posts');
                if (u1) u1.textContent = formatNumber(cats.updates?.threads || 0);
                if (u2) u2.textContent = formatNumber(cats.updates?.posts || 0);
                
                const g1 = $('stat-general-threads');
                const g2 = $('stat-general-posts');
                if (g1) g1.textContent = formatNumber(cats.general?.threads || 0);
                if (g2) g2.textContent = formatNumber(cats.general?.posts || 0);
                
                const o1 = $('stat-offtopic-threads');
                const o2 = $('stat-offtopic-posts');
                if (o1) o1.textContent = formatNumber(cats.offtopic?.threads || 0);
                if (o2) o2.textContent = formatNumber(cats.offtopic?.posts || 0);
                
                console.log('[Forum] Stats loaded');
            }
        } catch (err) {
            console.error('[Forum] Stats error:', err);
        }
    }

    // ============================================
    // LOAD RECENT ACTIVITY
    // ============================================

    async function loadRecentActivity() {
        const container = $('recent-activity-list');
        if (!container) {
            console.error('[Forum] recent-activity-list not found');
            return;
        }
        
        try {
            const res = await fetch('/api/forum/recent');
            const data = await res.json();
            
            if (data.success && data.activity && data.activity.length > 0) {
                container.innerHTML = data.activity.map(item => {
                    const postId = item.isReply ? item.originalPostId : item._id;
                    return `
                        <div class="recent-item" data-post-id="${postId}">
                            <div class="recent-avatar">${getInitials(item.author)}</div>
                            <div class="recent-content">
                                <div class="recent-title">${escapeHtml(truncate(item.content, 50))}</div>
                                <div class="recent-meta">
                                    <span class="recent-author">${escapeHtml(item.author)}</span>
                                    <span>•</span>
                                    <span class="recent-time">${formatTimeAgo(item.createdAt)}</span>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
                
                // Add click handlers
                container.querySelectorAll('.recent-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const postId = item.dataset.postId;
                        if (postId) openThread(postId);
                    });
                });
                
                console.log('[Forum] Recent activity loaded');
            } else {
                container.innerHTML = '<div class="recent-empty">No recent activity</div>';
            }
        } catch (err) {
            console.error('[Forum] Recent error:', err);
            container.innerHTML = '<div class="recent-empty">Failed to load</div>';
        }
    }

    // ============================================
    // CATEGORY MODAL
    // ============================================

    function openCategory(category) {
        currentCategory = category;
        
        const titles = {
            updates: 'Updates',
            general: 'General',
            offtopic: 'Off Topic'
        };
        
        const titleEl = $('modal-category-title');
        if (titleEl) titleEl.textContent = titles[category] || category;
        
        const modal = $('category-modal');
        if (modal) modal.classList.add('active');
        
        // Hide form for updates if not staff
        const form = $('form-new-post');
        if (form) {
            if (category === 'updates' && !isStaff(currentUser?.username)) {
                form.style.display = 'none';
            } else {
                form.style.display = 'block';
            }
        }
        
        loadPosts(category);
    }

    function closeCategoryModal() {
        const modal = $('category-modal');
        if (modal) modal.classList.remove('active');
        currentCategory = null;
    }

    async function loadPosts(category) {
        const container = $('category-posts-list');
        if (!container) return;
        
        container.innerHTML = '<div class="loading-placeholder"><div class="spinner"></div></div>';
        
        try {
            const res = await fetch(`/api/forum/posts?category=${category}`);
            const data = await res.json();
            
            if (data.success && data.posts && data.posts.length > 0) {
                container.innerHTML = data.posts.map(post => `
                    <div class="post-item ${post.isPinned ? 'pinned' : ''} ${post.isStaffPost ? 'staff-post' : ''}" 
                         data-post-id="${post._id}">
                        <div class="post-avatar">${getInitials(post.author)}</div>
                        <div class="post-body">
                            <div class="post-header">
                                <span class="post-author ${isStaff(post.author) ? 'staff' : ''}">${escapeHtml(post.author)}</span>
                                <div class="post-badges">
                                    ${post.isPinned ? '<span class="badge badge-pinned">Pinned</span>' : ''}
                                    ${post.isStaffPost ? '<span class="badge badge-staff">Staff</span>' : ''}
                                </div>
                                <span class="post-time">${formatTimeAgo(post.createdAt)}</span>
                            </div>
                            <div class="post-preview">${escapeHtml(post.content)}</div>
                            <div class="post-stats">
                                <span>${post.replies?.length || 0} replies</span>
                            </div>
                        </div>
                    </div>
                `).join('');
                
                // Click handlers
                container.querySelectorAll('.post-item').forEach(item => {
                    item.addEventListener('click', () => {
                        openThread(item.dataset.postId);
                    });
                });
            } else {
                container.innerHTML = `
                    <div class="posts-empty">
                        <h4>No threads yet</h4>
                        <p>Be the first to start a conversation!</p>
                    </div>
                `;
            }
        } catch (err) {
            console.error('[Forum] Load posts error:', err);
            container.innerHTML = '<div class="posts-empty">Failed to load posts</div>';
        }
    }

    // ============================================
    // THREAD MODAL
    // ============================================

    async function openThread(postId) {
        currentPostId = postId;
        
        // Close category modal
        const catModal = $('category-modal');
        if (catModal) catModal.classList.remove('active');
        
        // Open thread modal
        const threadModal = $('thread-modal');
        if (threadModal) threadModal.classList.add('active');
        
        const container = $('thread-view-content');
        if (!container) return;
        
        container.innerHTML = '<div class="loading-placeholder"><div class="spinner"></div></div>';
        
        try {
            const res = await fetch(`/api/forum/posts/${postId}`);
            const data = await res.json();
            
            if (data.success && data.post) {
                renderThread(data.post);
            } else {
                container.innerHTML = '<div class="posts-empty">Post not found</div>';
            }
        } catch (err) {
            console.error('[Forum] Thread error:', err);
            container.innerHTML = '<div class="posts-empty">Failed to load</div>';
        }
    }

    function closeThreadModal() {
        const modal = $('thread-modal');
        if (modal) modal.classList.remove('active');
        
        // Re-open category if we had one
        if (currentCategory) {
            const catModal = $('category-modal');
            if (catModal) catModal.classList.add('active');
        }
        
        currentPostId = null;
    }

    function renderThread(post) {
        const container = $('thread-view-content');
        if (!container) return;
        
        const canDelete = currentUser && (isStaff(currentUser.username) || post.authorId === currentUser.odilId);
        const canPin = currentUser && isStaff(currentUser.username);
        
        let repliesHtml = '';
        if (post.replies && post.replies.length > 0) {
            repliesHtml = `
                <div class="replies-section">
                    <div class="replies-header">${post.replies.length} Replies</div>
                    ${post.replies.map(r => `
                        <div class="reply-item">
                            <div class="reply-avatar">${getInitials(r.author)}</div>
                            <div class="reply-body">
                                <div class="reply-header">
                                    <span class="reply-author ${isStaff(r.author) ? 'staff' : ''}">${escapeHtml(r.author)}</span>
                                    <span class="reply-time">${formatTimeAgo(r.createdAt)}</span>
                                </div>
                                <div class="reply-text">${escapeHtml(r.content)}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }
        
        container.innerHTML = `
            <div class="thread-main">
                <div class="thread-author-row">
                    <div class="thread-avatar">${getInitials(post.author)}</div>
                    <div class="thread-author-info">
                        <div class="thread-author-name ${isStaff(post.author) ? 'staff' : ''}">${escapeHtml(post.author)}</div>
                        <div class="thread-time">${formatTimeAgo(post.createdAt)}</div>
                    </div>
                    <div class="thread-actions">
                        ${canPin ? `<button class="thread-action-btn" id="btn-pin-post">${post.isPinned ? 'Unpin' : 'Pin'}</button>` : ''}
                        ${canDelete ? `<button class="thread-action-btn delete" id="btn-delete-post">Delete</button>` : ''}
                    </div>
                </div>
                <div class="thread-text">${escapeHtml(post.content)}</div>
            </div>
            
            ${repliesHtml}
            
            <div class="reply-form">
                <textarea id="input-reply-content" placeholder="Write a reply..." maxlength="1000" rows="3"></textarea>
                <div class="reply-form-actions">
                    <span class="char-counter"><span id="reply-char-counter">0</span>/1000</span>
                    <button class="btn btn-primary btn-sm" id="btn-submit-reply">Reply</button>
                </div>
            </div>
        `;
        
        // Event listeners
        const replyInput = $('input-reply-content');
        const replyCounter = $('reply-char-counter');
        const replyBtn = $('btn-submit-reply');
        
        if (replyInput && replyCounter) {
            replyInput.addEventListener('input', () => {
                replyCounter.textContent = replyInput.value.length;
            });
        }
        
        if (replyBtn) {
            replyBtn.addEventListener('click', () => submitReply(post._id));
        }
        
        const pinBtn = $('btn-pin-post');
        if (pinBtn) {
            pinBtn.addEventListener('click', () => pinPost(post._id));
        }
        
        const deleteBtn = $('btn-delete-post');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => deletePost(post._id));
        }
    }

    // ============================================
    // ACTIONS
    // ============================================

    async function submitPost() {
        const input = $('input-post-content');
        if (!input) return;
        
        const content = input.value.trim();
        if (!content) return;
        
        const btn = $('btn-submit-post');
        if (btn) btn.disabled = true;
        
        try {
            const res = await fetch('/api/forum/posts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content,
                    category: currentCategory
                })
            });
            
            const data = await res.json();
            
            if (data.success) {
                input.value = '';
                const counter = $('post-char-count');
                if (counter) counter.textContent = '0';
                
                loadPosts(currentCategory);
                loadStats();
                loadRecentActivity();
                
                if (typeof toast === 'function') toast('Posted!');
            } else {
                if (typeof toast === 'function') toast(data.message || 'Failed', 'error');
            }
        } catch (err) {
            console.error('[Forum] Post error:', err);
            if (typeof toast === 'function') toast('Failed to post', 'error');
        }
        
        if (btn) btn.disabled = false;
    }

    async function submitReply(postId) {
        const input = $('input-reply-content');
        if (!input || !postId) return;
        
        const content = input.value.trim();
        if (!content) return;
        
        try {
            const res = await fetch(`/api/forum/posts/${postId}/reply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });
            
            const data = await res.json();
            
            if (data.success) {
                renderThread(data.post);
                loadStats();
                loadRecentActivity();
                if (typeof toast === 'function') toast('Replied!');
            } else {
                if (typeof toast === 'function') toast(data.message || 'Failed', 'error');
            }
        } catch (err) {
            console.error('[Forum] Reply error:', err);
            if (typeof toast === 'function') toast('Failed to reply', 'error');
        }
    }

    async function deletePost(postId) {
        if (!confirm('Delete this post?')) return;
        
        try {
            const res = await fetch(`/api/forum/posts/${postId}`, {
                method: 'DELETE'
            });
            
            const data = await res.json();
            
            if (data.success) {
                closeThreadModal();
                if (currentCategory) loadPosts(currentCategory);
                loadStats();
                loadRecentActivity();
                if (typeof toast === 'function') toast('Deleted');
            } else {
                if (typeof toast === 'function') toast(data.message || 'Failed', 'error');
            }
        } catch (err) {
            console.error('[Forum] Delete error:', err);
        }
    }

    async function pinPost(postId) {
        try {
            const res = await fetch(`/api/forum/posts/${postId}/pin`, {
                method: 'POST'
            });
            
            const data = await res.json();
            
            if (data.success) {
                openThread(postId);
                if (typeof toast === 'function') toast(data.isPinned ? 'Pinned' : 'Unpinned');
            }
        } catch (err) {
            console.error('[Forum] Pin error:', err);
        }
    }

    // ============================================
    // EVENT LISTENERS
    // ============================================

    function setupEventListeners() {
        // Category cards
        document.querySelectorAll('.category-card').forEach(card => {
            card.addEventListener('click', () => {
                const category = card.dataset.category;
                if (category) openCategory(category);
            });
        });
        
        // Post form
        const postInput = $('input-post-content');
        const postBtn = $('btn-submit-post');
        const postCounter = $('post-char-count');
        
        if (postInput && postBtn && postCounter) {
            postInput.addEventListener('input', () => {
                const len = postInput.value.length;
                postCounter.textContent = len;
                postBtn.disabled = len === 0 || len > 2000;
            });
            
            postBtn.addEventListener('click', submitPost);
            
            postInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.ctrlKey && !postBtn.disabled) {
                    e.preventDefault();
                    submitPost();
                }
            });
        }
        
        // Close buttons
        const closeCatBtn = $('close-category-modal');
        if (closeCatBtn) {
            closeCatBtn.addEventListener('click', closeCategoryModal);
        }
        
        const closeThreadBtn = $('close-thread-modal');
        if (closeThreadBtn) {
            closeThreadBtn.addEventListener('click', closeThreadModal);
        }
        
        const backBtn = $('btn-back-thread');
        if (backBtn) {
            backBtn.addEventListener('click', closeThreadModal);
        }
        
        // Backdrops
        document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
            backdrop.addEventListener('click', () => {
                const modal = backdrop.closest('.modal');
                if (modal) {
                    modal.classList.remove('active');
                    if (modal.id === 'category-modal') currentCategory = null;
                    if (modal.id === 'thread-modal') currentPostId = null;
                }
            });
        });
        
        // Logout
        const logoutBtn = $('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                if (typeof logout === 'function') {
                    logout();
                } else {
                    fetch('/api/logout', { method: 'POST' })
                        .then(() => location.href = '/');
                }
            });
        }
        
        console.log('[Forum] Event listeners ready');
    }

    // ============================================
    // START
    // ============================================

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (document.querySelector('.forums-page')) init();
        });
    } else {
        if (document.querySelector('.forums-page')) init();
    }
})();