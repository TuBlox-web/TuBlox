// ═══════════════════════════════════════════════════════════════
// SETTINGS PAGE
// ═══════════════════════════════════════════════════════════════

let currentUser = null;

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
    await loadUser();
    initTheme();
    initEventListeners();
});

async function loadUser() {
    try {
        const res = await fetch('/api/user');
        const data = await res.json();
        
        if (!data.success) {
            window.location.href = '/auth';
            return;
        }
        
        currentUser = data.user;
        
        // Update UI
        document.getElementById('current-username').textContent = currentUser.username;
        document.getElementById('user-id').textContent = `#${currentUser.odilId}`;
        document.getElementById('member-since').textContent = formatDate(currentUser.createdAt);
        document.getElementById('last-login').textContent = formatDate(currentUser.lastSeen || currentUser.createdAt);
        
    } catch (err) {
        console.error('Failed to load user:', err);
        showToast('Failed to load user data', 'error');
    }
}

// ═══════════════════════════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════════════════════════

function initTheme() {
    const savedTheme = localStorage.getItem('tublox-theme') || 'dark';
    setTheme(savedTheme, false);
    
    // Mark active theme
    document.querySelectorAll('.theme-option').forEach(option => {
        const theme = option.dataset.theme;
        const radio = option.querySelector('input[type="radio"]');
        
        if (theme === savedTheme) {
            option.classList.add('active');
            radio.checked = true;
        }
        
        option.addEventListener('click', () => {
            setTheme(theme, true);
        });
    });
}

function setTheme(theme, save = true) {
    // Remove all theme classes
    document.body.classList.remove('theme-dark', 'theme-super-dark');
    
    // Add new theme class
    document.body.classList.add(`theme-${theme}`);
    
    // Update active state
    document.querySelectorAll('.theme-option').forEach(option => {
        option.classList.remove('active');
        if (option.dataset.theme === theme) {
            option.classList.add('active');
            option.querySelector('input[type="radio"]').checked = true;
        }
    });
    
    if (save) {
        localStorage.setItem('tublox-theme', theme);
        showToast('Theme updated', 'success');
    }
}

// ═══════════════════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════

function initEventListeners() {
    // Change username
    document.getElementById('change-username-btn').addEventListener('click', changeUsername);
    document.getElementById('new-username').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') changeUsername();
    });
    
    // Change password
    document.getElementById('change-password-btn').addEventListener('click', changePassword);
    
    // Toggle password visibility
    document.getElementById('toggle-password-btn').addEventListener('click', () => {
        openVerifyModal();
    });
    
    // Verify modal
    document.getElementById('verify-password-btn').addEventListener('click', verifyAndShowPassword);
    document.getElementById('verify-password-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') verifyAndShowPassword();
    });
    
    // Modal backdrop click
    document.querySelector('#verify-modal .modal-backdrop').addEventListener('click', closeVerifyModal);
    
    // Logout
    document.getElementById('logout-btn').addEventListener('click', logout);
}

// ═══════════════════════════════════════════════════════════════
// USERNAME
// ═══════════════════════════════════════════════════════════════

async function changeUsername() {
    const newUsername = document.getElementById('new-username').value.trim().toLowerCase();
    
    if (!newUsername) {
        showToast('Please enter a new username', 'error');
        return;
    }
    
    if (newUsername.length < 3 || newUsername.length > 20) {
        showToast('Username must be 3-20 characters', 'error');
        return;
    }
    
    if (!/^[a-z0-9_]+$/.test(newUsername)) {
        showToast('Username can only contain letters, numbers and underscore', 'error');
        return;
    }
    
    if (newUsername === currentUser.username) {
        showToast('This is already your username', 'error');
        return;
    }
    
    const btn = document.getElementById('change-username-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="loader"></span>';
    
    try {
        const res = await fetch('/api/user/username', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: newUsername })
        });
        
        const data = await res.json();
        
        if (data.success) {
            currentUser.username = newUsername;
            document.getElementById('current-username').textContent = newUsername;
            document.getElementById('new-username').value = '';
            showToast('Username changed successfully', 'success');
        } else {
            showToast(data.message || 'Failed to change username', 'error');
        }
    } catch (err) {
        console.error('Failed to change username:', err);
        showToast('Failed to change username', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Change';
    }
}

// ═══════════════════════════════════════════════════════════════
// PASSWORD
// ═══════════════════════════════════════════════════════════════

async function changePassword() {
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    
    if (!currentPassword || !newPassword || !confirmPassword) {
        showToast('Please fill in all password fields', 'error');
        return;
    }
    
    if (newPassword.length < 6) {
        showToast('New password must be at least 6 characters', 'error');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showToast('New passwords do not match', 'error');
        return;
    }
    
    const btn = document.getElementById('change-password-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="loader"></span> Changing...';
    
    try {
        const res = await fetch('/api/user/password', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                currentPassword, 
                newPassword 
            })
        });
        
        const data = await res.json();
        
        if (data.success) {
            document.getElementById('current-password').value = '';
            document.getElementById('new-password').value = '';
            document.getElementById('confirm-password').value = '';
            showToast('Password changed successfully', 'success');
        } else {
            showToast(data.message || 'Failed to change password', 'error');
        }
    } catch (err) {
        console.error('Failed to change password:', err);
        showToast('Failed to change password', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Change Password`;
    }
}

// ═══════════════════════════════════════════════════════════════
// VERIFY PASSWORD MODAL
// ═══════════════════════════════════════════════════════════════

function openVerifyModal() {
    document.getElementById('verify-modal').classList.add('active');
    document.getElementById('verify-password-input').value = '';
    document.getElementById('verify-password-input').focus();
}

function closeVerifyModal() {
    document.getElementById('verify-modal').classList.remove('active');
}

async function verifyAndShowPassword() {
    const password = document.getElementById('verify-password-input').value;
    
    if (!password) {
        showToast('Please enter your password', 'error');
        return;
    }
    
    const btn = document.getElementById('verify-password-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="loader"></span>';
    
    try {
        const res = await fetch('/api/user/verify-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        
        const data = await res.json();
        
        if (data.success) {
            closeVerifyModal();
            
            // Show password
            const input = document.getElementById('current-password-display');
            const iconEye = document.querySelector('.icon-eye');
            const iconEyeOff = document.querySelector('.icon-eye-off');
            
            input.type = 'text';
            input.value = password;
            iconEye.style.display = 'none';
            iconEyeOff.style.display = 'block';
            
            // Hide after 5 seconds
            setTimeout(() => {
                input.type = 'password';
                input.value = '••••••••';
                iconEye.style.display = 'block';
                iconEyeOff.style.display = 'none';
            }, 5000);
            
            showToast('Password visible for 5 seconds', 'success');
        } else {
            showToast(data.message || 'Incorrect password', 'error');
        }
    } catch (err) {
        console.error('Failed to verify password:', err);
        showToast('Failed to verify password', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Verify';
    }
}

// ═══════════════════════════════════════════════════════════════
// LOGOUT
// ═══════════════════════════════════════════════════════════════

async function logout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/';
    } catch (err) {
        window.location.href = '/';
    }
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${type === 'success' 
                ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'
                : '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'}
        </svg>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 200);
    }, 3000);
}