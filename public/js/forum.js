// ============================================
// Forum JS
// ============================================

let forumCategories = [];
let currentCategory = 'all';
let currentForumPage = 1;
let currentPostOwnerId = null;
let currentPostId = null;

// ============================================
// Init
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    const path = location.pathname;
    
    if (path === '/TuForums') {
        initForumMain();
    } else if (path.match(/^\/TuForums\/\d+$/)) {
        initForumUser();
    } else if (path.match(/^\/TuForums\/\d+\/\d+$/)) {
        initForumPost();
    }
    
    const titleInput = document.getElementById('post-title');
    const contentInput = document.getElementById('post-content');
    
    if (titleInput) {
        titleInput.addEventListener('input', () => {
            document.getElementById('title-count').textContent = titleInput.value.length;
        });
    }
    
    if (contentInput) {
        contentInput.addEventListener('input', () => {
            document.getElementById('content-count').textContent = contentInput.value.length;
        });
    }
});

// ============================================
// Main Forum Page
// ============================================
async function initForumMain() {
    await loadCategories();
    await loadPosts();
}

async function loadCategories() {
    try {
        const res = await fetch('/api/forum/categories');
        const data = await res.json();
        
        if (data.success) {
            forumCategories = data.categories;
            renderCategories();
            populateCategorySelect();
        }
    } catch (err) {
        console.error('Load categories error:', err);
    }
}

function renderCategories() {
    const list = document.getElementById('category-list');
    if (!list) return;
    
    let html = `
        <div class="category-item ${currentCategory === 'all' ? 'active' : ''}" data-category="all" onclick="selectCategory('all')">
            <span class="category-name">All Posts</span>
        </div>
    `;
    
    for (const cat of forumCategories) {
        html += `
            <div class="category-item ${currentCategory === cat.id ? 'active' : ''}" data-category="${cat.id}" onclick="selectCategory('${cat.id}')">
                <span class="category-name">${cat.name}</span>
            </div>
        `;
    }
    
    list.innerHTML = html;
}

function populateCategorySelect() {
    const select = document.getElementById('post-category');
    if (!select) return;
    
    let html = '';
    for (const cat of forumCategories) {
        html += `<option value="${cat.id}">${cat.name}</option>`;
    }
    select.innerHTML = html;
}

function selectCategory(category) {
    currentCategory = category;
    currentForumPage = 1;
    renderCategories();
    loadPosts();
}

async function loadPosts() {
    const list = document.getElementById('posts-list');
    if (!list) return;
    
    list.innerHTML = '<div class="loading">Loading posts...</div>';
    
    const sort = document.getElementById('sort-select')?.value || 'newest';
    const search = document.getElementById('search-input')?.value || '';
    
    try {
        let url = `/api/forum/posts?page=${currentForumPage}&limit=15&sort=${sort}`;
        if (currentCategory !== 'all') url += `&category=${currentCategory}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.success && data.posts && data.posts.length > 0) {
            const validPosts = data.posts.filter(post => post && post.authorName);
            if (validPosts.length > 0) {
                list.innerHTML = validPosts.map(post => postCardHTML(post)).join('');
                renderForumPagination(data.pagination);
            } else {
                list.innerHTML = `
                    <div class="forum-empty">
                        <h3>No posts found</h3>
                        <p>Be the first to create a post!</p>
                    </div>
                `;
                renderForumPagination(null);
            }
        } else {
            list.innerHTML = `
                <div class="forum-empty">
                    <h3>No posts found</h3>
                    <p>Be the first to create a post!</p>
                </div>
            `;
            renderForumPagination(null);
        }
    } catch (err) {
        console.error('Load posts error:', err);
        list.innerHTML = '<div class="forum-empty"><h3>Error loading posts</h3></div>';
    }
}

function handleSearch(e) {
    if (e.key === 'Enter') {
        currentForumPage = 1;
        loadPosts();
    }
}

// ============================================
// User Posts Page
// ============================================
async function initForumUser() {
    const parts = location.pathname.split('/');
    const ownerId = parts[2];
    currentPostOwnerId = ownerId;
    
    await loadCategories();
    await loadUserPosts(ownerId);
}

async function loadUserPosts(ownerId) {
    const header = document.getElementById('user-header');
    const list = document.getElementById('posts-list');
    
    try {
        const res = await fetch(`/api/forum/user/${ownerId}/posts?page=${currentForumPage}&limit=15`);
        const data = await res.json();
        
        if (data.success) {
            const initial = (data.user.username || 'U').charAt(0).toUpperCase();
            header.innerHTML = `
                <div class="user-avatar-large">${initial}</div>
                <h1>${data.user.username || 'Unknown'}'s Posts</h1>
                <p class="user-stats">${data.pagination.totalPosts} posts | <a href="/user/${data.user.odilId}">View Profile</a></p>
                <a href="/TuForums" class="btn btn-secondary" style="margin-top:16px;">Back to Forums</a>
            `;
            
            if (data.posts && data.posts.length > 0) {
                const validPosts = data.posts.filter(post => post && post.authorName);
                if (validPosts.length > 0) {
                    list.innerHTML = validPosts.map(post => postCardHTML(post)).join('');
                    renderForumPagination(data.pagination, 'loadUserPostsPage');
                } else {
                    list.innerHTML = `
                        <div class="forum-empty">
                            <h3>No posts yet</h3>
                            <p>This user hasn't created any posts.</p>
                        </div>
                    `;
                }
            } else {
                list.innerHTML = `
                    <div class="forum-empty">
                        <h3>No posts yet</h3>
                        <p>This user hasn't created any posts.</p>
                    </div>
                `;
            }
        } else {
            header.innerHTML = '<h1>User not found</h1>';
            list.innerHTML = '';
        }
    } catch (err) {
        console.error('Load user posts error:', err);
        header.innerHTML = '<h1>Error loading user</h1>';
    }
}

function loadUserPostsPage(page) {
    currentForumPage = page;
    loadUserPosts(currentPostOwnerId);
}

// ============================================
// Post View Page
// ============================================
async function initForumPost() {
    const parts = location.pathname.split('/');
    currentPostOwnerId = parts[2];
    currentPostId = parts[3];
    
    await loadCategories();
    await loadPost();
}

async function loadPost() {
    const container = document.getElementById('post-container');
    const repliesSection = document.getElementById('replies-section');
    
    try {
        const res = await fetch(`/api/forum/post/${currentPostOwnerId}/${currentPostId}`);
        const data = await res.json();
        
        if (data.success && data.post) {
            const post = data.post;
            const authorName = post.authorName || 'Unknown';
            const initial = authorName.charAt(0).toUpperCase();
            const category = forumCategories.find(c => c.id === post.category) || { name: 'General' };
            const isLiked = currentUser && post.likes && post.likes.includes(currentUser.odilId);
            const isOwner = currentUser && post.authorId === currentUser.odilId;
            
            container.innerHTML = `
                <a href="/TuForums" class="btn btn-ghost" style="margin-bottom:16px;">Back to Forums</a>
                <div class="post-full">
                    <div class="post-full-header">
                        <div class="post-avatar">${initial}</div>
                        <div class="post-full-meta">
                            <h1 class="post-full-title">
                                ${post.isPinned ? '<span class="pin-icon">[Pinned]</span>' : ''}
                                ${post.isLocked ? '<span class="lock-icon">[Locked]</span>' : ''}
                                ${escapeHtml(post.title || 'Untitled')}
                            </h1>
                            <div class="post-full-info">
                                <a href="/TuForums/${post.authorId}" class="post-author">${authorName}</a>
                                <span>|</span>
                                <span>${timeAgo(post.createdAt)}</span>
                                <span>|</span>
                                <span class="post-category-badge">${category.name}</span>
                            </div>
                        </div>
                    </div>
                    <div class="post-full-content">${escapeHtml(post.content || '')}</div>
                    <div class="post-full-actions">
                        <button class="btn btn-secondary ${isLiked ? 'liked' : ''}" onclick="likePost(${post.postId})">
                            Like <span id="like-count">${(post.likes || []).length}</span>
                        </button>
                        <span class="post-stat">${post.views || 0} views</span>
                        <span class="post-stat">${post.replies || 0} replies</span>
                        ${isOwner ? `<button class="btn btn-danger" onclick="deletePost(${post.postId})">Delete</button>` : ''}
                    </div>
                </div>
            `;
            
            document.title = `TuBlox - ${post.title || 'Post'}`;
            
            if (repliesSection) {
                repliesSection.style.display = 'block';
                
                if (post.isLocked) {
                    const replyForm = document.getElementById('reply-form');
                    if (replyForm) replyForm.style.display = 'none';
                }
                
                renderReplies(data.replies || []);
            }
        } else {
            container.innerHTML = `
                <div class="forum-empty">
                    <h3>Post not found</h3>
                    <a href="/TuForums" class="btn btn-primary">Back to Forums</a>
                </div>
            `;
        }
    } catch (err) {
        console.error('Load post error:', err);
        container.innerHTML = '<div class="forum-empty"><h3>Error loading post</h3></div>';
    }
}

function renderReplies(replies) {
    const list = document.getElementById('replies-list');
    if (!list) return;
    
    if (!replies || replies.length === 0) {
        list.innerHTML = '<p style="color:var(--text-secondary);text-align:center;">No replies yet. Be the first!</p>';
        return;
    }
    
    list.innerHTML = replies.map(reply => {
        if (!reply) return '';
        
        const authorName = reply.authorName || 'Unknown';
        const initial = authorName.charAt(0).toUpperCase();
        const isLiked = currentUser && reply.likes && reply.likes.includes(currentUser.odilId);
        
        return `
            <div class="reply-card">
                <div class="reply-header">
                    <div class="reply-avatar">${initial}</div>
                    <div class="post-meta">
                        <a href="/TuForums/${reply.authorId}" class="post-author">${authorName}</a>
                        <div class="post-time">${timeAgo(reply.createdAt)}</div>
                    </div>
                </div>
                <div class="reply-content">${escapeHtml(reply.content || '')}</div>
                <div class="reply-actions">
                    <button class="btn btn-ghost ${isLiked ? 'liked' : ''}" onclick="likeReply(${reply.replyId})">
                        Like ${(reply.likes || []).length}
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// Actions
// ============================================
function openNewPostModal() {
    if (!currentUser) {
        toast('Please log in to create posts', 'error');
        return;
    }
    const modal = document.getElementById('new-post-modal');
    if (modal) modal.classList.add('active');
}

function closeNewPostModal() {
    const modal = document.getElementById('new-post-modal');
    if (modal) modal.classList.remove('active');
    
    const titleEl = document.getElementById('post-title');
    const contentEl = document.getElementById('post-content');
    const titleCount = document.getElementById('title-count');
    const contentCount = document.getElementById('content-count');
    
    if (titleEl) titleEl.value = '';
    if (contentEl) contentEl.value = '';
    if (titleCount) titleCount.textContent = '0';
    if (contentCount) contentCount.textContent = '0';
}

async function createPost() {
    const titleEl = document.getElementById('post-title');
    const contentEl = document.getElementById('post-content');
    const categoryEl = document.getElementById('post-category');
    
    const title = titleEl ? titleEl.value.trim() : '';
    const content = contentEl ? contentEl.value.trim() : '';
    const category = categoryEl ? categoryEl.value : 'general';
    
    if (!title) {
        toast('Please enter a title', 'error');
        return;
    }
    
    if (!content) {
        toast('Please enter content', 'error');
        return;
    }
    
    try {
        const res = await fetch('/api/forum/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, content, category })
        });
        
        const data = await res.json();
        
        if (data.success) {
            toast('Post created!');
            closeNewPostModal();
            location.href = data.url;
        } else {
            toast(data.message || 'Error creating post', 'error');
        }
    } catch (err) {
        console.error('Create post error:', err);
        toast('Error creating post', 'error');
    }
}

async function postReply() {
    const contentEl = document.getElementById('reply-content');
    const content = contentEl ? contentEl.value.trim() : '';
    
    if (!content) {
        toast('Please enter a reply', 'error');
        return;
    }
    
    if (!currentUser) {
        toast('Please log in to reply', 'error');
        return;
    }
    
    try {
        const res = await fetch(`/api/forum/post/${currentPostId}/reply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });
        
        const data = await res.json();
        
        if (data.success) {
            toast('Reply posted!');
            if (contentEl) contentEl.value = '';
            loadPost();
        } else {
            toast(data.message || 'Error posting reply', 'error');
        }
    } catch (err) {
        console.error('Post reply error:', err);
        toast('Error posting reply', 'error');
    }
}

async function likePost(postId) {
    if (!currentUser) {
        toast('Please log in to like', 'error');
        return;
    }
    
    try {
        const res = await fetch(`/api/forum/post/${postId}/like`, { method: 'POST' });
        const data = await res.json();
        
        if (data.success) {
            const likeCount = document.getElementById('like-count');
            if (likeCount) likeCount.textContent = data.likesCount;
        }
    } catch (err) {
        console.error('Like post error:', err);
        toast('Error', 'error');
    }
}

async function likeReply(replyId) {
    if (!currentUser) {
        toast('Please log in to like', 'error');
        return;
    }
    
    try {
        const res = await fetch(`/api/forum/reply/${replyId}/like`, { method: 'POST' });
        const data = await res.json();
        
        if (data.success) {
            loadPost();
        }
    } catch (err) {
        console.error('Like reply error:', err);
        toast('Error', 'error');
    }
}

async function deletePost(postId) {
    if (!confirm('Are you sure you want to delete this post?')) return;
    
    try {
        const res = await fetch(`/api/forum/post/${postId}`, { method: 'DELETE' });
        const data = await res.json();
        
        if (data.success) {
            toast('Post deleted');
            location.href = '/TuForums';
        } else {
            toast(data.message || 'Error deleting post', 'error');
        }
    } catch (err) {
        console.error('Delete post error:', err);
        toast('Error deleting post', 'error');
    }
}

// ============================================
// Helpers
// ============================================
function postCardHTML(post) {
    if (!post) return '';
    
    const authorName = post.authorName || 'Unknown';
    const initial = authorName.charAt(0).toUpperCase();
    const category = forumCategories.find(c => c.id === post.category) || { name: 'General' };
    
    return `
        <div class="post-card ${post.isPinned ? 'pinned' : ''}" onclick="location.href='/TuForums/${post.authorId}/${post.postId}'">
            <div class="post-card-header">
                <div class="post-avatar">${initial}</div>
                <div class="post-meta">
                    <a href="/TuForums/${post.authorId}" class="post-author" onclick="event.stopPropagation()">${authorName}</a>
                    <div class="post-time">${timeAgo(post.createdAt)}</div>
                </div>
                <span class="post-category-badge">${category.name}</span>
            </div>
            <div class="post-title">
                ${post.isPinned ? '<span class="pin-icon">[Pinned]</span> ' : ''}
                ${post.isLocked ? '<span class="lock-icon">[Locked]</span> ' : ''}
                ${escapeHtml(post.title || 'Untitled')}
            </div>
            <div class="post-preview">${escapeHtml(post.content || '')}</div>
            <div class="post-stats">
                <span class="post-stat">${(post.likes || []).length} likes</span>
                <span class="post-stat">${post.replies || 0} replies</span>
                <span class="post-stat">${post.views || 0} views</span>
            </div>
        </div>
    `;
}

function renderForumPagination(pagination, loadFn = 'goToForumPage') {
    const container = document.getElementById('pagination');
    if (!container || !pagination) {
        if (container) container.innerHTML = '';
        return;
    }
    
    const { currentPage, totalPages } = pagination;
    
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    let html = '';
    
    html += `<button class="pagination-btn" onclick="${loadFn}(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>Prev</button>`;
    
    for (let i = 1; i <= Math.min(totalPages, 5); i++) {
        html += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" onclick="${loadFn}(${i})">${i}</button>`;
    }
    
    if (totalPages > 5) {
        html += `<span class="pagination-info">...</span>`;
        html += `<button class="pagination-btn" onclick="${loadFn}(${totalPages})">${totalPages}</button>`;
    }
    
    html += `<button class="pagination-btn" onclick="${loadFn}(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>Next</button>`;
    
    container.innerHTML = html;
}

function goToForumPage(page) {
    currentForumPage = page;
    loadPosts();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function timeAgo(date) {
    if (!date) return 'Unknown';
    
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago';
    
    return new Date(date).toLocaleDateString();
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}