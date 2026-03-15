// ============================================
// TuForums Client - Fixed Version
// ============================================

(function() {
    'use strict';

    const STAFF_USERS = ['today_idk'];
    
    let currentUser = null;
    let currentCategory = null;
    let currentPostId = null;

    // ============================================
    // DOM ELEMENTS
    // ============================================
    
    const $ = (id) => document.getElementById(id);
    
    // ============================================
    // INIT
    // ============================================
    
    async function init() {
        console.log('[Forum] Initializing...');
        
        await loadUser();
        await loadStats();
        await loadRecentActivity();
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
                console.log('[Forum] User loaded:', data.user.username);
            }
        } catch (err) {
            console.error('[Forum] Load user error:', err);
        }
    }

    function isStaff(username) {
        return STAFF_USERS.includes((username || '').toLowerCase());
    }

    // ============================================
    // STATS
    // ============================================

    async function loadStats() {
        try {
            const res = await fetch('/api/forum/stats');
            const data = await res.json();
            
            if (data.success) {
                // Total stats
                const totalPosts = $('stat-total-posts');
                const totalReplies = $('stat-total-replies');
                
                if (totalPosts) totalPosts.textContent = formatNumber(data.total.posts);
                if (totalReplies) totalReplies.textContent = formatNumber(data.total.replies);
                
                // Category stats
                const cats = data.categories || {};
                
                // Updates
                const updatesThreads = $('stat-updates-threads');
                const updatesPosts = $('stat-updates-posts');
                if (updatesThreads) updatesThreads.textContent = formatNumber(cats.updates?.threads || 0);
                if (updatesPosts) updatesPosts.textContent = formatNumber(cats.updates?.posts || 0);
                
                // General
                const generalThreads = $('stat-general-threads');
                const generalPosts = $('stat-general-posts');
                if (generalThreads) generalThreads.textContent = formatNumber(cats.general?.threads || 0);
                if (generalPosts) generalPosts.textContent = formatNumber(cats.general?.posts || 0);
                
                // Off Topic
                const offtopicThreads = $('stat-offtopic-threads');
                const offtopicPosts = $('stat-offtopic-posts');
                if (offtopicThreads) offtopicThreads.textContent = formatNumber(cats.offtopic?.threads || 0);
                if (offtopicPosts) offtopicPosts.textContent = formatNumber(cats.offtopic?.posts || 0);
                
                console.log('[Forum] Stats loaded');
            }
        } catch (err) {
            console.error('[Forum] Load stats error:', err);
        }
    }

    // ============================================
    // RECENT ACTIVITY
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
                container.innerHTML = data.activity.map(item => `
                    <div class="recent-item" onclick="openThread('${item.isReply ? item.originalPostId : item._id}')">
                        <div class="recent-avatar">${getInitials(item.author)}</div>
                        <div class="recent-content">
                            <div class="recent-title">${escapeHtml(truncate(item.content, 60))}</div>
                            <div class="recent-meta">
                                <span class="recent-author">${escapeHtml(item.author)}</span>
                                <span>•</span>
                                <span class="recent-time">${formatTimeAgo(item.createdAt)}</span>
                            </div>
                        </div>
                    </div>
                `).join('');
                console.log('[Forum] Recent activity loaded:', data.activity.length);
            } else {
                container.innerHTML = '<div class="recent-empty">No recent activity</div>';
            }
        } catch (err) {
            console.error('[Forum] Load recent error:', err);
            container.innerHTML = '<div class="recent-empty">Failed to load</div>';
        }
    }

    // ============================================
    // CATEGORY MODAL
    // ============================================

    window.openCategory = function(category) {
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
        
        // Hide post form for updates (staff only)
        const postForm = $('form-new-post');
        if (postForm) {
            if (category === 'updates' && !isStaff(currentUser?.username)) {
                postForm.style.display = 'none';
            } else {
                postForm.style.display = 'block';
            }
        }
        
        loadPosts(category);
    };

    window.closeCategoryModal = function() {
        const modal = $('category-modal');
        if (modal) modal.classList.remove('active');
        currentCategory = null;
    };

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
                         onclick="openThread('${post._id}')">
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

    window.openThread = async function(postId) {
        currentPostId = postId;
        
        // Close category modal, open thread modal
        const catModal = $('category-modal');
        const threadModal = $('thread-modal');
        
        if (catModal) catModal.classList.remove('active');
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
            console.error('[Forum] Load thread error:', err);
            container.innerHTML = '<div class="posts-empty">Failed to load</div>';
        }
    };

    window.closeThreadModal = function() {
        const threadModal = $('thread-modal');
        if (threadModal) threadModal.classList.remove('active');
        
        // Re-open category modal if we had one
        if (currentCategory) {
            const catModal = $('category-modal');
            if (catModal) catModal.classList.add('active');
        }
        
        currentPostId = null;
    };

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
                    ${post.replies.map(reply => `
                        <div class="reply-item">
                            <div class="reply-avatar">${getInitials(reply.author)}</div>
                            <div class="reply-body">
                                <div class="reply-header">
                                    <span class="reply-author ${isStaff(reply.author) ? 'staff' : ''}">${escapeHtml(reply.author)}</span>
                                    <span class="reply-time">${formatTimeAgo(reply.createdAt)}</span>
                                </div>
                                <div class="reply-text">${escapeHtml(reply.content)}</div>
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
                        ${canPin ? `<button class="thread-action-btn" onclick="pinPost('${post._id}')">${post.isPinned ? 'Unpin' : 'Pin'}</button>` : ''}
                        ${canDelete ? `<button class="thread-action-btn delete" onclick="deletePost('${post._id}')">Delete</button>` : ''}
                    </div>
                </div>
                <div class="thread-text">${escapeHtml(post.content)}</div>
            </div>
            
            ${repliesHtml}
            
            <div class="reply-form">
                <textarea id="input-reply-content" placeholder="Write a reply..." maxlength="1000" rows="3"></textarea>
                <div class="reply-form-actions">
                    <span class="char-counter"><span id="reply-char-counter">0</span>/1000</span>
                    <button class="btn btn-primary btn-sm" onclick="submitReply()">Reply</button>
                </div>
            </div>
        `;
        
        // Setup char counter for reply
        const replyInput = $('input-reply-content');
        if (replyInput) {
            replyInput.addEventListener('input', () => {
                const counter = $('reply-char-counter');
                if (counter) counter.textContent = replyInput.value.length;
            });
        }
    }

    // ============================================
    // ACTIONS
    // ============================================

    window.submitPost = async function() {
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
                toast('Posted!');
            } else {
                toast(data.message || 'Failed to post', 'error');
            }
        } catch (err) {
            console.error('[Forum] Submit post error:', err);
            toast('Failed to post', 'error');
        }
        
        if (btn) btn.disabled = false;
    };

    window.submitReply = async function() {
        const input = $('input-reply-content');
        if (!input || !currentPostId) return;
        
        const content = input.value.trim();
        if (!content) return;
        
        try {
            const res = await fetch(`/api/forum/posts/${currentPostId}/reply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });
            
            const data = await res.json();
            
            if (data.success) {
                renderThread(data.post);
                loadStats();
                loadRecentActivity();
                toast('Replied!');
            } else {
                toast(data.message || 'Failed to reply', 'error');
            }
        } catch (err) {
            console.error('[Forum] Submit reply error:', err);
            toast('Failed to reply', 'error');
        }
    };

    window.deletePost = async function(postId) {
        if (!confirm('Delete this post?')) return;
        
        try {
            const res = await fetch(`/api/forum/posts/${postId}`, {
                method: 'DELETE'
            });
            
            const data = await res.json();
            
            if (data.success) {
                closeThreadModal();
                if (currentCategory) {
                    loadPosts(currentCategory);
                }
                loadStats();
                loadRecentActivity();
                toast('Deleted');
            } else {
                toast(data.message || 'Failed to delete', 'error');
            }
        } catch (err) {
            console.error('[Forum] Delete error:', err);
            toast('Failed to delete', 'error');
        }
    };

    window.pinPost = async function(postId) {
        try {
            const res = await fetch(`/api/forum/posts/${postId}/pin`, {
                method: 'POST'
            });
            
            const data = await res.json();
            
            if (data.success) {
                openThread(postId);
                toast(data.isPinned ? 'Pinned' : 'Unpinned');
            } else {
                toast(data.message || 'Failed', 'error');
            }
        } catch (err) {
            console.error('[Forum] Pin error:', err);
            toast('Failed', 'error');
        }
    };

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
        
        // Post content input
        const postInput = $('input-post-content');
        const submitBtn = $('btn-submit-post');
        const charCount = $('post-char-count');
        
        if (postInput && submitBtn && charCount) {
            postInput.addEventListener('input', () => {
                const len = postInput.value.length;
                charCount.textContent = len;
                submitBtn.disabled = len === 0 || len > 2000;
            });
            
            submitBtn.addEventListener('click', submitPost);
            
            // Ctrl+Enter to submit
            postInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.ctrlKey && !submitBtn.disabled) {
                    e.preventDefault();
                    submitPost();
                }
            });
        }
        
        // Modal backdrops
        document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
            backdrop.addEventListener('click', () => {
                const modal = backdrop.closest('.modal');
                if (modal) modal.classList.remove('active');
                currentCategory = null;
                currentPostId = null;
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
    // UTILITIES
    // ============================================

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
        
        if (diff < 60) return `${diff}s`;
        if (diff < 3600) return `${Math.floor(diff / 60)}m`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
        if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
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

    // ============================================
    // INIT ON DOM READY
    // ============================================

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (document.querySelector('.forums-page')) {
                init();
            }
        });
    } else {
        if (document.querySelector('.forums-page')) {
            init();
        }
    }
})();