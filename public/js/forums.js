// ============================================
// TuForums Client - Clean Version
// ============================================

(function() {
    'use strict';

    const STAFF_USERS = ['today_idk'];
    
    let currentUser = null;
    let currentCategory = null;
    let currentPostId = null;

    // ============================================
    // INIT
    // ============================================
    
    async function init() {
        await loadUser();
        await loadStats();
        await loadRecentActivity();
        setupEventListeners();
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
            }
        } catch (err) {
            console.error('Load user error:', err);
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
                document.getElementById('total-posts').textContent = formatNumber(data.total.posts);
                document.getElementById('total-replies').textContent = formatNumber(data.total.replies);
                
                const cats = data.categories;
                
                if (cats.updates) {
                    document.getElementById('updates-threads').textContent = formatNumber(cats.updates.threads);
                    document.getElementById('updates-posts').textContent = formatNumber(cats.updates.posts);
                }
                if (cats.general) {
                    document.getElementById('general-threads').textContent = formatNumber(cats.general.threads);
                    document.getElementById('general-posts').textContent = formatNumber(cats.general.posts);
                }
                if (cats.offtopic) {
                    document.getElementById('offtopic-threads').textContent = formatNumber(cats.offtopic.threads);
                    document.getElementById('offtopic-posts').textContent = formatNumber(cats.offtopic.posts);
                }
            }
        } catch (err) {
            console.error('Load stats error:', err);
        }
    }

    // ============================================
    // RECENT ACTIVITY
    // ============================================

    async function loadRecentActivity() {
        const container = document.getElementById('recent-list');
        
        try {
            const res = await fetch('/api/forum/recent');
            const data = await res.json();
            
            if (data.success && data.activity.length > 0) {
                container.innerHTML = data.activity.map(item => `
                    <div class="recent-item" onclick="openThread('${item.isReply ? item.originalPostId : item._id}')">
                        <div class="recent-avatar">${getInitials(item.author)}</div>
                        <div class="recent-content">
                            <div class="recent-title">${escapeHtml(item.content.substring(0, 60))}${item.content.length > 60 ? '...' : ''}</div>
                            <div class="recent-meta">
                                <span class="recent-author">${escapeHtml(item.author)}</span>
                                <span>•</span>
                                <span class="recent-time">${formatTimeAgo(item.createdAt)}</span>
                            </div>
                        </div>
                    </div>
                `).join('');
            } else {
                container.innerHTML = '<div class="recent-empty">No recent activity</div>';
            }
        } catch (err) {
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
        
        document.getElementById('category-modal-title').textContent = titles[category] || category;
        document.getElementById('category-modal').classList.add('active');
        
        // Hide post form for updates (staff only)
        const postForm = document.getElementById('new-post-form');
        if (category === 'updates' && !isStaff(currentUser?.username)) {
            postForm.style.display = 'none';
        } else {
            postForm.style.display = 'block';
        }
        
        loadPosts(category);
    }

    window.closeCategoryModal = function() {
        document.getElementById('category-modal').classList.remove('active');
        currentCategory = null;
    };

    async function loadPosts(category) {
        const container = document.getElementById('posts-list');
        container.innerHTML = '<div class="loading-placeholder"><div class="spinner"></div></div>';
        
        try {
            const res = await fetch(`/api/forum/posts?category=${category}`);
            const data = await res.json();
            
            if (data.success && data.posts.length > 0) {
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
            container.innerHTML = '<div class="posts-empty">Failed to load posts</div>';
        }
    }

    // ============================================
    // THREAD MODAL
    // ============================================

    window.openThread = async function(postId) {
        currentPostId = postId;
        
        // Close category modal, open thread modal
        document.getElementById('category-modal').classList.remove('active');
        document.getElementById('thread-modal').classList.add('active');
        
        const container = document.getElementById('thread-content');
        container.innerHTML = '<div class="loading-placeholder"><div class="spinner"></div></div>';
        
        try {
            const res = await fetch(`/api/forum/posts/${postId}`);
            const data = await res.json();
            
            if (data.success) {
                renderThread(data.post);
            } else {
                container.innerHTML = '<div class="posts-empty">Post not found</div>';
            }
        } catch (err) {
            container.innerHTML = '<div class="posts-empty">Failed to load</div>';
        }
    };

    window.closeThreadModal = function() {
        document.getElementById('thread-modal').classList.remove('active');
        
        // Re-open category modal if we had one
        if (currentCategory) {
            document.getElementById('category-modal').classList.add('active');
        }
        
        currentPostId = null;
    };

    function renderThread(post) {
        const container = document.getElementById('thread-content');
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
                <textarea id="reply-content" placeholder="Write a reply..." maxlength="1000" rows="3"></textarea>
                <div class="reply-form-actions">
                    <span class="char-counter"><span id="reply-char-count">0</span>/1000</span>
                    <button class="btn btn-primary btn-sm" onclick="submitReply()">Reply</button>
                </div>
            </div>
        `;
        
        // Setup char counter
        const replyInput = document.getElementById('reply-content');
        replyInput.addEventListener('input', () => {
            document.getElementById('reply-char-count').textContent = replyInput.value.length;
        });
    }

    // ============================================
    // ACTIONS
    // ============================================

    window.submitPost = async function() {
        const content = document.getElementById('new-post-content').value.trim();
        if (!content) return;
        
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
                document.getElementById('new-post-content').value = '';
                document.getElementById('char-count').textContent = '0';
                document.getElementById('submit-post').disabled = true;
                loadPosts(currentCategory);
                loadStats();
                toast('Posted!');
            } else {
                toast(data.message, 'error');
            }
        } catch (err) {
            toast('Failed to post', 'error');
        }
    };

    window.submitReply = async function() {
        const content = document.getElementById('reply-content').value.trim();
        if (!content || !currentPostId) return;
        
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
                toast('Replied!');
            } else {
                toast(data.message, 'error');
            }
        } catch (err) {
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
                toast(data.message, 'error');
            }
        } catch (err) {
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
                toast(data.message, 'error');
            }
        } catch (err) {
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
                openCategory(card.dataset.category);
            });
        });
        
        // Post content input
        const postContent = document.getElementById('new-post-content');
        const submitBtn = document.getElementById('submit-post');
        const charCount = document.getElementById('char-count');
        
        postContent.addEventListener('input', () => {
            const len = postContent.value.length;
            charCount.textContent = len;
            submitBtn.disabled = len === 0 || len > 2000;
        });
        
        submitBtn.addEventListener('click', submitPost);
        
        // Ctrl+Enter to submit
        postContent.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey && !submitBtn.disabled) {
                submitPost();
            }
        });
        
        // Modal backdrops
        document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
            backdrop.addEventListener('click', () => {
                backdrop.closest('.modal').classList.remove('active');
            });
        });
        
        // Logout
        document.getElementById('logout-btn')?.addEventListener('click', logout);
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
        
        if (diff < 60) return `${diff}s`;
        if (diff < 3600) return `${Math.floor(diff / 60)}m`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
        if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
        return new Date(dateStr).toLocaleDateString();
    }

    function formatNumber(n) {
        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
        if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
        return n.toString();
    }

    function getInitials(name) {
        if (!name) return '?';
        return name.substring(0, 2).toUpperCase();
    }

    // ============================================
    // INIT
    // ============================================

    if (document.querySelector('.forums-page')) {
        init();
    }

    // Expose for onclick handlers
    window.openCategory = openCategory;
    window.openThread = openThread;
})();