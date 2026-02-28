// ============================================
// HATCHLY - scripts.js
// ============================================

// ============================================
// GLOBAL STATE
// ============================================
let currentUser     = null;
let currentUserId   = null;
let selectedPrawn   = null;
let capturedImageData = null;
let videoStream     = null;
let allPrawnsCache  = [];
let allLogsCache    = [];
let usingRPiCamera  = false;
let cameraStreamUrl = null;
let imageCaptured   = false;
let deletingLocationId   = null;
let deletingLocationName = null;
let dashboardCache  = null;
let dashboardRefreshing = false;
let navigationHistory   = [];
let isNavigating    = false;
const LOGS_PER_PAGE = 5;
let currentLogsPage = 1;
let currentFilteredLogs = [];

// ============================================
// NAVIGATION LOCK
// ============================================
function withNavLock(fn) {
    if (isNavigating) return;
    isNavigating = true;
    try { fn(); } finally {
        setTimeout(() => { isNavigating = false; }, 500);
    }
}

// ============================================
// FETCH INTERCEPTOR — session expiry
// ============================================
const originalFetch = window.fetch;
window.fetch = async function (...args) {
    const response = await originalFetch(...args);
    if (response.status === 401) {
        const wasLoggedIn = !!currentUser;
        _clearLocalSession();
        if (wasLoggedIn) {
            showToast('Session expired. Please log in again.', 'warning');
            setTimeout(() => showPage('authPage'), 1500);
        } else {
            showPage('authPage');
        }
        return response;
    }
    return response;
};

function _clearLocalSession() {
    localStorage.removeItem('hatchly_current_user');
    localStorage.removeItem('hatchly_current_user_id');
    localStorage.removeItem('hatchly_user_name');
    localStorage.removeItem('hatchly_current_page');
    localStorage.removeItem('hatchly_selected_prawn');
    currentUser   = null;
    currentUserId = null;
    selectedPrawn = null;
    updatePrawnBadge(null);
}

// ============================================
// SESSION & LOGIN STATUS
// ============================================
function checkLoginStatus() {
    const savedUser   = localStorage.getItem('hatchly_current_user');
    const savedUserId = localStorage.getItem('hatchly_current_user_id');

    if (!savedUser || !savedUserId) {
        showPage('authPage');
        return;
    }

    fetch('/api/check_session')
        .then(r => r.json())
        .then(data => {
            if (data.valid) {
                _restoreSession(savedUser, savedUserId);
            } else {
                _clearLocalSession();
                showPage('authPage');
            }
        })
        .catch(() => {
            // Network error — trust localStorage
            _restoreSession(savedUser, savedUserId);
        });
}

function _restoreSession(savedUser, savedUserId) {
    currentUser   = savedUser;
    currentUserId = parseInt(savedUserId);

    const savedPrawnJson = localStorage.getItem('hatchly_selected_prawn');
    if (savedPrawnJson) {
        try { selectedPrawn = JSON.parse(savedPrawnJson); } catch (e) { selectedPrawn = null; }
    }

    if (selectedPrawn) updatePrawnBadge(selectedPrawn);

    const savedImage  = localStorage.getItem('hatchly_captured_image');
    const savedSource = localStorage.getItem('hatchly_image_source');
    if (savedImage) {
        capturedImageData       = savedImage;
        window.lastImageSource  = savedSource || 'upload';
    }

    const savedPage = localStorage.getItem('hatchly_current_page');
    showPage(savedPage || 'dashboardPage');
    updateUserName();
}

function updateUserName() {
    if (!currentUser) return;
    const savedName = localStorage.getItem('hatchly_user_name');
    if (!savedName) return;
    document.querySelectorAll('.user-name-display').forEach(el => el.textContent = savedName);
    const userNameEl = document.getElementById('userName');
    if (userNameEl) userNameEl.textContent = savedName;
}

// Badge stub — removed from UI but kept to avoid reference errors
function updatePrawnBadge(prawn) {}

// ============================================
// PAGE NAVIGATION
// ============================================

// Prevent browser back button
history.pushState(null, null, location.href);
window.addEventListener('popstate', function () {
    history.pushState(null, null, location.href);
    if (navigationHistory.length > 1) {
        navigationHistory.pop();
        showPageWithoutHistory(navigationHistory[navigationHistory.length - 1]);
    }
});

function navigateBack() { withNavLock(_navigateBack); }
function _navigateBack() {
    if (navigationHistory.length > 1) {
        navigationHistory.pop();
        showPageWithoutHistory(navigationHistory[navigationHistory.length - 1]);
    } else {
        showPage('dashboardPage');
    }
}

function showPage(pageId) {
    history.pushState(null, null, location.href);
    if (navigationHistory[navigationHistory.length - 1] !== pageId) {
        navigationHistory.push(pageId);
    }
    if (currentUser && pageId !== 'authPage') {
        localStorage.setItem('hatchly_current_page', pageId);
    }
    _renderPage(pageId);
}

function showPageWithoutHistory(pageId) {
    history.pushState(null, null, location.href);
    _renderPage(pageId);
}

function _renderPage(pageId) {
    // Stop any active camera
    if (videoStream) {
        videoStream.getTracks().forEach(t => t.stop());
        videoStream = null;
    }
    const rpiStream = document.getElementById('rpiStream');
    if (rpiStream) { rpiStream.onerror = null; rpiStream.src = ''; rpiStream.style.display = 'none'; }

    // Clear inputs when navigating to register/location pages
    if (pageId === 'registerPrawnPage') {
        setTimeout(() => loadLocationDropdown(), 100);
        const prawnName = document.getElementById('prawnName');
        const inlineLocationName = document.getElementById('inlineLocationName');
        if (prawnName) prawnName.value = '';
        if (inlineLocationName) inlineLocationName.value = '';
        document.getElementById('prawnNameError')?.classList.remove('show');
        document.getElementById('inlineLocationError')?.classList.remove('show');
    }
    if (pageId === 'locationSetupPage') {
        setTimeout(() => loadLocationList(), 100);
        const newLocationName = document.getElementById('newLocationName');
        if (newLocationName) newLocationName.value = '';
        document.getElementById('locationNameError')?.classList.remove('show');
    }

    // Switch active page
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');

    // Page-specific init
    switch (pageId) {
        case 'selectPrawnPage':
            loadPrawnList();
            break;
        case 'capturePage':
            updateSelectedPrawnInfo();
            checkCameraStatus();
            resetCameraUI();
            _resetPredictState();
            break;
        case 'imageSelectionPage':
            updateSelectedPrawnInfo();
            break;
        case 'predictPage':
            updateSelectedPrawnInfo();
            _loadPredictPage();
            break;
        case 'historyPage':
            updateSelectedPrawnInfo();
            if (selectedPrawn) {
                document.getElementById('prawnNameTitle').textContent = `"${selectedPrawn.name}"`;
                loadPrawnHistory();
            } else {
                showPage('selectPrawnPage');
                return;
            }
            break;
        case 'dashboardPage':
            loadDashboard();
            break;
    }

    document.querySelectorAll('.menu-dropdown').forEach(d => d.classList.remove('show'));
    updateUserName();
}

function _resetPredictState() {
    capturedImageData = null;
    window.lastImageSource = 'camera';
    localStorage.removeItem('hatchly_captured_image');
    localStorage.removeItem('hatchly_image_source');
    localStorage.removeItem('hatchly_prediction_days');
    localStorage.removeItem('hatchly_prediction_confidence');

    const uploadedImg    = document.getElementById('uploadedImage');
    const resultContent  = document.getElementById('resultContent');
    const predictBtn     = document.getElementById('predictBtn');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const oldTryAgain    = document.getElementById('predictTryAgainBtn');

    if (uploadedImg)    uploadedImg.src = '';
    if (resultContent)  resultContent.style.display  = 'none';
    if (predictBtn)     predictBtn.style.display     = 'block';
    if (loadingSpinner) loadingSpinner.style.display  = 'none';
    if (oldTryAgain)    oldTryAgain.remove();
}

function _loadPredictPage() {
    if (!capturedImageData) {
        const saved       = localStorage.getItem('hatchly_captured_image');
        const savedSource = localStorage.getItem('hatchly_image_source');
        if (saved) { capturedImageData = saved; window.lastImageSource = savedSource || 'upload'; }
    }
    if (capturedImageData) document.getElementById('uploadedImage').src = capturedImageData;

    const savedDays = localStorage.getItem('hatchly_prediction_days');
    const savedConf = localStorage.getItem('hatchly_prediction_confidence');
    if (!savedDays) return;

    document.getElementById('daysResult').textContent       = savedDays;
    document.getElementById('confidenceResult').textContent = Number(savedConf).toFixed(1);
    document.getElementById('resultContent').style.display  = 'block';
    document.getElementById('predictBtn').style.display     = 'none';

    if (!document.getElementById('predictTryAgainBtn')) {
        _createPredictTryAgainBtn();
    }
}

// ============================================
// MENU
// ============================================
function toggleMenu() {
    const btn      = event.currentTarget;
    const dropdown = btn.nextElementSibling;
    const isOpen   = dropdown.classList.contains('show');
    document.querySelectorAll('.menu-dropdown').forEach(d => d.classList.remove('show'));
    if (!isOpen) dropdown.classList.add('show');
}

document.addEventListener('click', function (e) {
    if (!e.target.closest('.menu-container')) {
        document.querySelectorAll('.menu-dropdown').forEach(d => d.classList.remove('show'));
    }
});

function showChangePassword() {
    showPage('changePasswordPage');
    clearPasswordFields();
}

function clearPasswordFields() {
    ['currentPassword', 'newPassword', 'confirmPassword'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    const bar       = document.getElementById('strengthBar');
    const label     = document.getElementById('strengthLabel');
    const indicator = document.getElementById('matchIndicator');
    if (bar)       { bar.style.width = '0%'; bar.style.background = ''; }
    if (label)     label.textContent = '';
    if (indicator) indicator.textContent = '';

    ['req-length','req-upper','req-lower','req-number','req-symbol'].forEach(id => {
        document.getElementById(id)?.classList.remove('met');
    });

    clearErrors();
}

// ============================================
// AUTHENTICATION
// ============================================
async function handleLogin() {
    clearErrors();

    const emailInput    = document.getElementById('loginEmail');
    const passwordInput = document.getElementById('loginPassword');
    const email         = emailInput.value;
    const password      = passwordInput.value;
    let hasError        = false;

    if (!email.trim()) {
        _showFieldError('loginEmailError', 'Please enter your username', emailInput);
        hasError = true;
    } else if (email.includes('@')) {
        _showFieldError('loginEmailError', 'Username only — do not use an email address', emailInput);
        hasError = true;
    }

    if (!password) {
        _showFieldError('loginPasswordError', null, passwordInput);
        hasError = true;
    }

    if (hasError) return;

    try {
        const response = await fetch('/api/login', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ username: email, password })
        });
        const result = await response.json();

        if (result.success) {
            currentUser   = result.email;
            currentUserId = parseInt(result.user_id);
            localStorage.setItem('hatchly_current_user',    result.email);
            localStorage.setItem('hatchly_current_user_id', result.user_id);
            localStorage.setItem('hatchly_user_name',       result.name);
            showPage('dashboardPage');
            navigationHistory = ['dashboardPage'];
            updateUserName();
        } else {
            document.getElementById('loginCredentialsError').classList.add('show');
            emailInput.classList.add('error-input');
            passwordInput.classList.add('error-input');
            shakeInput(passwordInput);
        }
    } catch (error) {
        console.error('Login error:', error);
        showToast('Error connecting to server. Please try again.', 'error');
    }
}

async function handleSignup() {
    clearErrors();

    const nameInput            = document.getElementById('signupName');
    const emailInput           = document.getElementById('signupEmail');
    const passwordInput        = document.getElementById('signupPassword');
    const confirmPasswordInput = document.getElementById('signupConfirmPassword');
    const name                 = nameInput.value;
    const email                = emailInput.value;
    const password             = passwordInput.value;
    const confirmPassword      = confirmPasswordInput.value;
    let hasError               = false;

    // Name validation
    if (!name.trim()) {
        _showFieldError('signupNameError', null, nameInput); hasError = true;
    } else if (name.length > 30) {
        _showFieldError('signupNameError', 'Name must be 30 characters or less', nameInput); hasError = true;
    } else if (!/^[a-zA-ZÀ-ÖØ-öø-ÿ\s\-']+$/.test(name.trim())) {
        _showFieldError('signupNameError', 'Name must contain letters only (no numbers or symbols)', nameInput); hasError = true;
    }

    // Username validation
    if (!email.trim()) {
        _showFieldError('signupEmailError', 'Please enter a username', emailInput); hasError = true;
    } else if (email.includes('@')) {
        _showFieldError('signupEmailError', 'Username only — do not use an email address', emailInput); hasError = true;
    } else if (email.length < 6) {
        _showFieldError('signupEmailError', 'Username must be at least 6 characters', emailInput); hasError = true;
    } else if (email.length > 15) {
        _showFieldError('signupEmailError', 'Username must be 15 characters or less', emailInput); hasError = true;
    } else if (!/^[a-zA-Z0-9_.]+$/.test(email)) {
        _showFieldError('signupEmailError', 'Username can only contain letters, numbers, underscore, or dot', emailInput); hasError = true;
    }

    // Password validation
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/.test(password)) {
        passwordInput.classList.add('error-input'); shakeInput(passwordInput); hasError = true;
    } else if (password.length > 15) {
        passwordInput.classList.add('error-input'); shakeInput(passwordInput); hasError = true;
    }

    // Confirm password
    if (!confirmPassword) {
        _showFieldError('signupConfirmPasswordError', 'Please re-enter your password', confirmPasswordInput); hasError = true;
    } else if (password !== confirmPassword) {
        confirmPasswordInput.classList.add('error-input'); shakeInput(confirmPasswordInput); hasError = true;
    }

    if (hasError) return;

    try {
        const response = await fetch('/api/signup', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
                name:     name.trim().replace(/\b\w/g, c => c.toUpperCase()),
                username: email,
                password
            })
        });
        const result = await response.json();

        if (result.success) {
            ['signupName','signupEmail','signupPassword','signupConfirmPassword'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            document.getElementById('formsContainer').classList.remove('signup-mode');
            showToast('Account created! Please log in.', 'success');
        } else {
            showToast(result.message || 'Signup failed', 'error');
        }
    } catch (error) {
        console.error('Signup error:', error);
        showToast('Error connecting to server. Please try again.', 'error');
    }
}

async function handleLogout() {
    try {
        await fetch('/api/logout', { method: 'POST' });

        // Clear all local storage
        ['hatchly_current_user','hatchly_current_user_id','hatchly_user_name',
         'hatchly_current_page','hatchly_selected_prawn',
         'hatchly_captured_image','hatchly_image_source',
         'hatchly_prediction_days','hatchly_prediction_confidence'].forEach(k => localStorage.removeItem(k));

        currentUser   = null;
        currentUserId = null;
        selectedPrawn = null;
        allPrawnsCache = [];
        allLogsCache   = [];

        // Reset dashboard UI
        ['totalPrawns','totalPredictions','upcomingHatches'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '0';
        });
        ['upcomingHatchesList','latestPredictionsList','loginEmail','loginPassword'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML ? el.innerHTML = '' : el.value = '';
        });

        // Clear login fields explicitly
        const loginEmail    = document.getElementById('loginEmail');
        const loginPassword = document.getElementById('loginPassword');
        if (loginEmail)    loginEmail.value    = '';
        if (loginPassword) loginPassword.value = '';

        // Clear register prawn & location fields
        ['prawnName','inlineLocationName','newLocationName'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        // Clear pie chart
        const pieCanvas = document.getElementById('locationPieChart');
        if (pieCanvas) pieCanvas.getContext('2d').clearRect(0, 0, pieCanvas.width, pieCanvas.height);
        const legend = document.getElementById('pieChartLegend');
        if (legend) legend.innerHTML = '';

        // Clear all errors
        document.querySelectorAll('.error').forEach(e => e.classList.remove('show'));

        updatePrawnBadge(null);
        showPage('authPage');
        navigationHistory = [];
    } catch (error) {
        console.error('Logout error:', error);
    }
}

async function handleChangePassword() {
    clearErrors();

    const currentPasswordInput = document.getElementById('currentPassword');
    const newPasswordInput     = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const currentPassword      = currentPasswordInput.value;
    const newPassword          = newPasswordInput.value;
    const confirmPassword      = confirmPasswordInput.value;
    let hasError               = false;

    if (!currentPassword) {
        _showFieldError('currentPasswordError', null, currentPasswordInput); hasError = true;
    }
    if (newPassword.length < 6) {
        _showFieldError('newPasswordError', null, newPasswordInput); hasError = true;
    }
    if (newPassword !== confirmPassword) {
        _showFieldError('confirmPasswordError', null, confirmPasswordInput); hasError = true;
    }
    if (hasError) return;

    if (currentPassword === newPassword) {
        showToast('New password must be different from current password', 'error');
        return;
    }

    try {
        const response = await fetch('/api/change_password', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
                user_id:          currentUserId,
                current_password: currentPassword,
                new_password:     newPassword
            })
        });
        const result = await response.json();

        if (result.success) {
            showToast('Password changed successfully!', 'success');
            clearPasswordFields();
            showConfirm(
                'Password changed! Do you want to stay logged in or log out?',
                async () => { await handleLogout(); },
                'info', 'Log Out', 'Stay Logged In'
            );
        } else {
            if (result.message.includes('incorrect')) {
                _showFieldError('currentPasswordError', 'Current password is incorrect', currentPasswordInput);
            } else {
                showToast(result.message || 'Failed to change password', 'error');
            }
        }
    } catch (error) {
        console.error('Change password error:', error);
        showToast('Error connecting to server.', 'error');
    }
}

function toggleForm() {
    const container  = document.getElementById('formsContainer');
    container.classList.toggle('signup-mode');
    clearErrors();

    if (container.classList.contains('signup-mode')) {
        ['signupName','signupEmail','signupPassword','signupConfirmPassword'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const bar       = document.getElementById('signupStrengthBar');
        const label     = document.getElementById('signupStrengthLabel');
        const indicator = document.getElementById('signupMatchIndicator');
        if (bar)       { bar.style.width = '0%'; bar.style.background = ''; }
        if (label)     label.textContent = '';
        if (indicator) indicator.textContent = '';
        ['signup-req-length','signup-req-upper','signup-req-lower','signup-req-number','signup-req-symbol']
            .forEach(id => document.getElementById(id)?.classList.remove('met'));
    }
}

// ============================================
// PRAWN MANAGEMENT
// ============================================
async function loadPrawnList() {
    const container = document.getElementById('prawnListContainer');
    container.innerHTML = '<p style="text-align:center;padding:40px;color:#666;">Loading...</p>';

    try {
        const response = await fetch(`/api/get_prawns?user_id=${currentUserId}`);
        const result   = await response.json();
        if (result.success) {
            allPrawnsCache = result.prawns;
            await loadLocationFilterDropdown();
            renderPrawnList(allPrawnsCache);
        } else {
            container.innerHTML = '<div class="no-prawns">Failed to load prawns.</div>';
        }
    } catch (error) {
        console.error('Load prawns error:', error);
        container.innerHTML = '<div class="no-prawns" style="color:#dc2626;">Error connecting to server.</div>';
    }
}

async function loadLocationFilterDropdown() {
    const select = document.getElementById('locationFilter');
    if (!select) return;
    try {
        const response = await fetch('/api/get_locations');
        const result   = await response.json();
        select.innerHTML = '<option value="">All Prawns</option>';
        if (result.success && result.locations.length > 0) {
            result.locations.forEach(loc => {
                const option       = document.createElement('option');
                option.value       = loc.id;
                option.textContent = loc.name;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Load location filter error:', error);
    }
}

function filterPrawnsByLocation() {
    const select             = document.getElementById('locationFilter');
    const selectedLocationId = select ? select.value : '';
    const filtered           = selectedLocationId
        ? allPrawnsCache.filter(p => String(p.location_id) === String(selectedLocationId))
        : allPrawnsCache;
    renderPrawnList(filtered);
}

function renderPrawnList(prawns) {
    const container = document.getElementById('prawnListContainer');
    if (prawns.length === 0) {
        container.innerHTML = '<div class="no-prawns">No prawns found.</div>';
        return;
    }

    container.innerHTML = '';
    prawns.forEach(prawn => {
        const prawnCard      = document.createElement('div');
        prawnCard.className  = 'prawn-card';

        // Highlight newly registered prawn
        const highlightId = localStorage.getItem('hatchly_highlight_prawn');
        if (highlightId && String(prawn.id) === String(highlightId)) {
            prawnCard.style.border     = '2px solid #0891b2';
            prawnCard.style.background = '#e0f2fe';
            setTimeout(() => prawnCard.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
            localStorage.removeItem('hatchly_highlight_prawn');
        }

        prawnCard.innerHTML = `
            <div class="prawn-card-content" onclick="selectPrawnForImage(${JSON.stringify(prawn).replace(/"/g, '&quot;')})">
                <h3>${prawn.name}</h3>
                <p>${prawn.location_name || 'No location'}</p>
            </div>
            <button class="delete-prawn-btn" onclick="event.stopPropagation(); showDeleteModal(${JSON.stringify(prawn).replace(/"/g, '&quot;')})">
                <img src="${deleteIconUrl}">
            </button>
        `;
        container.appendChild(prawnCard);
    });
}

function selectPrawnForImage(prawn) {
    selectedPrawn = prawn;
    localStorage.setItem('hatchly_selected_prawn', JSON.stringify(prawn));
    updatePrawnBadge(prawn);
    updateSelectedPrawnInfo();
    showPage('imageSelectionPage');
}

function updateSelectedPrawnInfo() {
    if (!selectedPrawn) return;
    const locationText = selectedPrawn.location_name || 'No location';
    const nameEl       = document.getElementById('selectedPrawnName');
    const locationEl   = document.getElementById('selectedPrawnLocation');
    if (nameEl)     nameEl.textContent     = selectedPrawn.name;
    if (locationEl) locationEl.textContent = `Location: ${locationText}`;
    document.querySelectorAll('.selected-prawn-name-display').forEach(el => el.textContent = selectedPrawn.name);
    document.querySelectorAll('.selected-prawn-location-display').forEach(el => el.textContent = `Location: ${locationText}`);
}

async function handleSavePrawn() {
    clearErrors();

    const nameInput     = document.getElementById('prawnName');
    const locationInput = document.getElementById('prawnLocation');
    const name          = nameInput.value;
    const locationId    = locationInput.value;
    let hasError        = false;

    if (!name.trim()) {
        _showFieldError('prawnNameError', null, nameInput); hasError = true;
    }

    document.getElementById('prawnLocationError').classList.remove('show');
    locationInput.classList.remove('error-input');

    if (hasError) return;

    try {
        const response = await fetch('/api/save_prawn', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ user_id: currentUserId, name: name.trim(), location_id: locationId })
        });
        const result = await response.json();

        if (result.success) {
            showToast(`Prawn "${name}" registered successfully!`, 'success');
            localStorage.setItem('hatchly_highlight_prawn', result.prawn.id);
            showPage('selectPrawnPage');
        } else {
            showToast(result.message || 'Failed to register prawn', 'error');
        }
    } catch (error) {
        console.error('Save prawn error:', error);
        showToast('Error connecting to server.', 'error');
    }
}

// — Delete Prawn
function showDeleteModal(prawn) {
    selectedPrawn = prawn;
    document.getElementById('deletePrawnName').textContent = prawn.name;
    document.getElementById('deleteConfirmPassword').value = '';
    document.getElementById('deletePasswordError').classList.remove('show');
    document.getElementById('deletePrawnModal').style.display = 'block';
}

function closeDeleteModal(event) {
    if (event) event.stopPropagation();
    document.getElementById('deletePrawnModal').style.display = 'none';
}

async function confirmDeletePrawn() {
    const password = document.getElementById('deleteConfirmPassword').value;
    if (!password) {
        document.getElementById('deletePasswordError').textContent = 'Please enter your password';
        document.getElementById('deletePasswordError').classList.add('show');
        shakeInput(document.getElementById('deleteConfirmPassword'));
        return;
    }

    try {
        const response = await fetch('/api/delete_prawn', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ user_id: currentUserId, prawn_id: selectedPrawn.id, password })
        });
        const result = await response.json();

        if (result.success) {
            showToast(`Prawn "${selectedPrawn.name}" deleted successfully`, 'success');
            closeDeleteModal();
            loadPrawnList();
        } else {
            document.getElementById('deletePasswordError').textContent = result.message;
            document.getElementById('deletePasswordError').classList.add('show');
            shakeInput(document.getElementById('deleteConfirmPassword'));
        }
    } catch (error) {
        console.error('Delete prawn error:', error);
        showToast('Error connecting to server.', 'error');
    }
}

// — Rename Prawn
function showRenamePrawnModal(prawn) {
    if (!prawn) { showToast('No prawn selected', 'error'); return; }
    selectedPrawn = prawn;
    document.getElementById('renamePrawnCurrentName').textContent = prawn.name;
    document.getElementById('renamePrawnInput').value             = prawn.name;
    document.getElementById('renamePrawnError').classList.remove('show');
    document.getElementById('renamePrawnModal').style.display     = 'block';
}

function closeRenamePrawnModal(event) {
    if (event) event.stopPropagation();
    document.getElementById('renamePrawnModal').style.display = 'none';
}

async function confirmRenamePrawn() {
    const newName = document.getElementById('renamePrawnInput').value.trim();
    document.getElementById('renamePrawnError').classList.remove('show');
    if (!newName) {
        document.getElementById('renamePrawnError').classList.add('show');
        shakeInput(document.getElementById('renamePrawnInput'));
        return;
    }
    try {
        const response = await fetch('/api/rename_prawn', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ prawn_id: selectedPrawn.id, new_name: newName })
        });
        const result = await response.json();
        if (result.success) {
            selectedPrawn.name = newName;
            updateSelectedPrawnInfo();
            updatePrawnBadge(selectedPrawn);
            closeRenamePrawnModal();
            showToast(`Prawn renamed to "${newName}"!`, 'success');
        } else {
            showToast(result.message || 'Failed to rename prawn.', 'error');
        }
    } catch (error) {
        showToast('Error connecting to server.', 'error');
    }
}

// — Transfer Prawn
async function showTransferPrawnModal(prawn) {
    if (!prawn) { showToast('No prawn selected', 'error'); return; }
    selectedPrawn = prawn;
    document.getElementById('transferPrawnName').textContent       = prawn.name;
    document.getElementById('transferCurrentLocation').textContent = prawn.location_name || 'No location';
    document.getElementById('transferLocationError').classList.remove('show');

    const select     = document.getElementById('transferLocationSelect');
    select.innerHTML = '<option value="">-- Select Location --</option>';

    try {
        const response = await fetch('/api/get_locations');
        const result   = await response.json();
        if (result.success) {
            result.locations.forEach(loc => {
                if (String(loc.id) === String(prawn.location_id)) return;
                const option       = document.createElement('option');
                option.value       = loc.id;
                option.textContent = loc.name;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Load locations error:', error);
    }
    document.getElementById('transferPrawnModal').style.display = 'block';
}

function closeTransferPrawnModal(event) {
    if (event) event.stopPropagation();
    document.getElementById('transferPrawnModal').style.display = 'none';
}

async function confirmTransferPrawn() {
    const newLocationId   = document.getElementById('transferLocationSelect').value;
    const newLocationName = document.getElementById('transferLocationSelect').selectedOptions[0]?.text;
    document.getElementById('transferLocationError').classList.remove('show');
    if (!newLocationId) {
        document.getElementById('transferLocationError').classList.add('show');
        return;
    }
    try {
        const response = await fetch('/api/transfer_prawn', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ prawn_id: selectedPrawn.id, new_location_id: newLocationId })
        });
        const result = await response.json();
        if (result.success) {
            selectedPrawn.location_id   = newLocationId;
            selectedPrawn.location_name = newLocationName;
            updateSelectedPrawnInfo();
            updatePrawnBadge(selectedPrawn);
            closeTransferPrawnModal();
            showToast(`Moved to "${newLocationName}"!`, 'success');
        } else {
            showToast(result.message || 'Failed to change location.', 'error');
        }
    } catch (error) {
        showToast('Error connecting to server.', 'error');
    }
}

// ============================================
// PREDICTION
// ============================================
async function predictHatchDate() {
    const loadingSpinner = document.getElementById('loadingSpinner');
    const resultContent  = document.getElementById('resultContent');
    const predictBtn     = document.getElementById('predictBtn');

    document.getElementById('daysResult').textContent       = '--';
    document.getElementById('confidenceResult').textContent = '--';
    resultContent.style.display  = 'none';
    loadingSpinner.style.display = 'flex';
    predictBtn.style.display     = 'none';

    _createPredictTryAgainBtn();

    try {
        const response = await fetch('/api/predict', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ image: capturedImageData })
        });
        const result = await response.json();

        if (!result.success) {
            loadingSpinner.style.display = 'none';
            if (result.no_prawn_detected) {
                showToast('No prawn eggs detected. Try again.', 'warning');
            } else {
                showToast(result.error || 'Prediction failed. Please try again.', 'error');
            }
            return;
        }

        const daysUntilHatch = result.days_until_hatch;
        const confidence     = result.confidence;
        const currentDay     = result.current_day || null;

        document.getElementById('daysResult').textContent       = daysUntilHatch;
        document.getElementById('confidenceResult').textContent = confidence ? Number(confidence).toFixed(1) : 'N/A';
        loadingSpinner.style.display = 'none';
        resultContent.style.display  = 'block';

        await savePrediction(selectedPrawn, capturedImageData, daysUntilHatch, confidence, currentDay);
        localStorage.setItem('hatchly_prediction_days',       daysUntilHatch);
        localStorage.setItem('hatchly_prediction_confidence', confidence);

    } catch (error) {
        console.error('Prediction error:', error);
        loadingSpinner.style.display = 'none';
        predictBtn.style.display     = 'block';
        document.getElementById('predictTryAgainBtn')?.remove();
        showToast('Failed to connect to server. Check your connection.', 'error');
    }
}

function _createPredictTryAgainBtn() {
    if (document.getElementById('predictTryAgainBtn')) return;
    const predictBtn = document.getElementById('predictBtn');
    const btn        = document.createElement('button');
    btn.id           = 'predictTryAgainBtn';
    btn.className    = 'btn btn-outline';
    btn.textContent  = 'TRY AGAIN';
    btn.onclick      = function () {
        localStorage.removeItem('hatchly_captured_image');
        localStorage.removeItem('hatchly_image_source');
        localStorage.removeItem('hatchly_prediction_days');
        localStorage.removeItem('hatchly_prediction_confidence');
        document.getElementById('resultContent').style.display  = 'none';
        document.getElementById('uploadedImage').src            = '';
        capturedImageData = null;
        this.remove();
        document.getElementById('predictBtn').style.display = 'block';
        if (window.lastImageSource === 'upload') {
            showPage('imageSelectionPage');
            setTimeout(() => triggerFileUpload(), 300);
        } else {
            showPage('capturePage');
        }
    };
    document.getElementById('predictBtnGroup').insertBefore(btn, predictBtn.nextSibling);
}

async function savePrediction(prawn, imageData, days, confidence, currentDay = null) {
    try {
        const response = await fetch('/api/save_prediction', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
                user_id:       currentUserId,
                prawn_id:      prawn ? prawn.id   : null,
                prawn_name:    prawn ? prawn.name : 'Unknown',
                image_path:    imageData,
                predicted_days: days,
                current_day:   currentDay,
                confidence
            })
        });
        const result = await response.json();
        if (!result.success) console.error('Failed to save prediction:', result.message);
    } catch (error) {
        console.error('Error saving prediction:', error);
    }
}

function tryAgain() { withNavLock(_tryAgain); }
function _tryAgain() {
    _resetPredictState();
    showPage('imageSelectionPage');
}

// ============================================
// HISTORY
// ============================================
function showHistoryPage() {
    if (!selectedPrawn) { showToast('Please select a prawn first', 'error'); return; }
    localStorage.setItem('hatchly_selected_prawn', JSON.stringify(selectedPrawn));
    showPage('historyPage');
}

async function loadPrawnHistory() {
    const logsContainer = document.getElementById('logsContainer');
    logsContainer.innerHTML = '<p style="text-align:center;padding:40px;color:#666;">Loading...</p>';

    try {
        const response = await fetch(`/api/get_predictions?user_id=${currentUserId}&prawn_id=${selectedPrawn.id}`);
        const result   = await response.json();

        if (result.success) {
            if (result.predictions.length === 0) {
                logsContainer.innerHTML = '<div class="no-logs">No logs available for this prawn yet.</div>';
                return;
            }
            allLogsCache = result.predictions;
            renderHistoryLogs(allLogsCache);
        } else {
            logsContainer.innerHTML = '<div class="no-logs">Failed to load history.</div>';
        }
    } catch (error) {
        console.error('Load history error:', error);
        logsContainer.innerHTML = '<div class="no-logs" style="color:#dc2626;">Error connecting to server.</div>';
    }
}

function renderHistoryLogs(predictions) {
    const logsContainer = document.getElementById('logsContainer');
    if (!logsContainer) return;

    currentFilteredLogs = predictions;
    currentLogsPage     = 1;

    if (predictions.length === 0) {
        logsContainer.innerHTML = '<div class="no-logs">No logs found.</div>';
        return;
    }

    logsContainer.innerHTML = '';
    renderLogsBatch(logsContainer, predictions, 1);
}

function renderLogsBatch(container, predictions, page) {
    document.getElementById('loadMoreBtn')?.remove();

    const start = (page - 1) * LOGS_PER_PAGE;
    const end   = page * LOGS_PER_PAGE;
    const batch = predictions.slice(start, end);

    batch.forEach(log => {
        const logDate = new Date(log.created_at.replace('T', ' '));
        const dateStr = logDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        const timeStr = logDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

        const logItem       = document.createElement('div');
        logItem.className   = 'log-item';
        logItem.innerHTML   = `
            <div class="log-info">
                <p><strong>Date:</strong> ${dateStr}</p>
                <p><strong>Time:</strong> ${timeStr}</p>
                <p><strong>Status:</strong> ${log.predicted_days} Days before egg hatching</p>
            </div>
            <div class="log-image-preview" onclick="openImageModal('/static/${log.image_path}')">
                <img src="/static/${log.image_path}" alt="Prawn Image">
            </div>
            <button class="delete-log-btn" onclick="deleteLogEntry(${log.id}, this)">🗑️</button>
        `;
        container.appendChild(logItem);
    });

    // Count indicator
    const shown = Math.min(end, predictions.length);
    let countEl = document.getElementById('logsCountText');
    if (!countEl) {
        countEl          = document.createElement('p');
        countEl.id       = 'logsCountText';
        countEl.style.cssText = 'text-align:center;color:#999;font-size:13px;margin:10px 0 4px;';
        container.parentNode.insertBefore(countEl, container.nextSibling);
    }
    countEl.textContent = `Showing ${shown} of ${predictions.length} logs`;

    // Load More button
    if (end < predictions.length) {
        const loadMoreBtn       = document.createElement('button');
        loadMoreBtn.id          = 'loadMoreBtn';
        loadMoreBtn.className   = 'btn btn-outline';
        loadMoreBtn.textContent = `Load More (${predictions.length - end} remaining)`;
        loadMoreBtn.style.cssText = 'max-width:260px;margin:12px auto 0;display:block;font-size:14px;padding:10px;';
        loadMoreBtn.onclick = () => {
            currentLogsPage++;
            renderLogsBatch(container, predictions, currentLogsPage);
        };
        container.parentNode.insertBefore(loadMoreBtn, countEl);
    }
}

function filterHistoryLogs() {
    const filter        = document.getElementById('historyDateFilter')?.value || 'all';
    const logsContainer = document.getElementById('logsContainer');
    if (!logsContainer) return;

    let filtered = allLogsCache;
    if (filter !== 'all') {
        const days   = parseInt(filter);
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        filtered = allLogsCache.filter(log => new Date(log.created_at.replace('T', ' ')) >= cutoff);
    }

    if (filtered.length === 0) {
        logsContainer.innerHTML = '<div class="no-logs">No logs found for this period.</div>';
        return;
    }
    renderHistoryLogs(filtered);
}

async function deleteLogEntry(predictionId, btnEl) {
    showConfirm('Delete this prediction log? This cannot be undone.', async () => {
        try {
            const response = await fetch('/api/delete_prediction', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ prediction_id: predictionId })
            });
            const result = await response.json();
            if (result.success) {
                btnEl.closest('.log-item')?.remove();
                allLogsCache = allLogsCache.filter(l => l.id !== predictionId);
                const logsContainer = document.getElementById('logsContainer');
                if (logsContainer && logsContainer.children.length === 0) {
                    logsContainer.innerHTML = '<div class="no-logs">No logs available for this prawn yet.</div>';
                }
                showToast('Log deleted.', 'success');
            } else {
                showToast(result.message || 'Failed to delete log.', 'error');
            }
        } catch (error) {
            showToast('Cannot connect to server.', 'error');
        }
    }, 'error');
}

// ============================================
// DASHBOARD
// ============================================
async function loadDashboard() {
    showDashboardLoading(true);
    try {
        const response = await fetch('/api/get_dashboard_data');
        const result   = await response.json();

        if (!result.success) {
            showToast('Failed to load dashboard data.', 'error');
            showDashboardLoading(false);
            return;
        }

        dashboardCache = result;
        document.getElementById('totalPrawns').textContent      = result.total_prawns;
        document.getElementById('totalPredictions').textContent = result.total_predictions;
        document.getElementById('upcomingHatches').textContent  = result.upcoming_count;

        renderUpcomingHatches(result.upcoming_hatches, result.total_prawns);
        renderLatestPredictions(result.latest_predictions);
        renderLocationPieChart(result.prawns);
    } catch (error) {
        console.error('Dashboard load error:', error);
        showToast('Error loading dashboard.', 'error');
    }
    showDashboardLoading(false);
}

async function refreshDashboard() {
    if (dashboardRefreshing) return;
    dashboardRefreshing = true;

    const btn  = document.getElementById('dashboardRefreshBtn');
    const icon = document.getElementById('refreshIcon');
    if (btn)  btn.style.pointerEvents = 'none';
    if (icon) { icon.style.animation = 'spin 0.8s linear infinite'; icon.style.display = 'inline-block'; }

    await loadDashboard();

    dashboardRefreshing = false;
    if (btn)  btn.style.pointerEvents = 'auto';
    if (icon) icon.style.animation    = '';
    showToast('Dashboard refreshed!', 'success');
}

function showDashboardLoading(show) {
    const upcomingEl = document.getElementById('upcomingHatchesList');
    const latestEl   = document.getElementById('latestPredictionsList');

    if (show) {
        if (upcomingEl) upcomingEl.innerHTML = `
            <div class="skeleton-loader">
                <div class="skeleton-item"></div>
                <div class="skeleton-item"></div>
                <div class="skeleton-item"></div>
            </div>`;
        if (latestEl) latestEl.innerHTML = `
            <div class="skeleton-loader" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
                <div class="skeleton-card"></div>
                <div class="skeleton-card"></div>
                <div class="skeleton-card"></div>
            </div>`;
        document.getElementById('totalPrawns').textContent      = '...';
        document.getElementById('totalPredictions').textContent = '...';
        document.getElementById('upcomingHatches').textContent  = '...';
    }
}

function renderUpcomingHatches(hatchAlerts, totalPrawns) {
    const container = document.getElementById('upcomingHatchesList');

    if (totalPrawns === 0) {
        container.innerHTML = `
            <div class="no-data-message">
                <h3>No prawns registered yet</h3>
                <p>Register your first prawn to start tracking!</p>
                <button class="btn btn-outline" onclick="showPage('registerPrawnPage')" style="margin-top:16px;max-width:220px;">
                    + Register First Prawn
                </button>
            </div>`;
        return;
    }

    if (hatchAlerts.length === 0) {
        container.innerHTML = `
            <div class="no-data-message">
                <h3>No upcoming hatches</h3>
                <p>All clear for now!</p>
            </div>`;
        return;
    }

    container.innerHTML = '';
    hatchAlerts.forEach(alert => {
        const alertDiv      = document.createElement('div');
        alertDiv.className  = `hatch-alert ${alert.days <= 3 ? 'urgent' : ''}`;
        alertDiv.innerHTML  = `
            <div class="hatch-days">${alert.days}<br><small>days</small></div>
            <div class="hatch-info">
                <h3>${alert.prawn.name}</h3>
                <p>Expected: ${calculateHatchDate(alert.days)}</p>
                <p>Confidence: ${alert.prediction.confidence !== null ? Number(alert.prediction.confidence).toFixed(1) : 'N/A'}%</p>
            </div>
            <button class="hatch-view-btn" onclick="viewPrawnDetails(${JSON.stringify(alert.prawn).replace(/"/g, '&quot;')})">View</button>
        `;
        container.appendChild(alertDiv);
    });
}

function renderLatestPredictions(predictions) {
    const container = document.getElementById('latestPredictionsList');

    if (predictions.length === 0) {
        container.innerHTML = `
            <div class="no-data-message">
                <h3>No predictions yet</h3>
                <p>Select a prawn and capture an image to start!</p>
            </div>`;
        return;
    }

    container.innerHTML = '';
    predictions.forEach(item => {
        const predDate = new Date(item.created_at.replace('T', ' '));
        const dateStr  = predDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const card     = document.createElement('div');
        card.className = 'prediction-card';
        card.onclick   = () => {
            const prawn = dashboardCache.prawns.find(p => p.id === item.prawn_id);
            if (prawn) { selectPrawnForImage(prawn); showHistoryPage(); }
        };
        card.innerHTML = `
            <img src="/static/${item.image_path}" alt="Prawn prediction" class="prediction-image"
                onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'200\\' height=\\'200\\'%3E%3Crect fill=\\'%23ddd\\' width=\\'200\\' height=\\'200\\'/%3E%3Ctext x=\\'50%25\\' y=\\'50%25\\' text-anchor=\\'middle\\' fill=\\'%23999\\' font-size=\\'14\\'%3ENo Image%3C/text%3E%3C/svg%3E'">
            <div class="prediction-details">
                <h4>${item.prawn_name}</h4>
                <p class="prediction-result-text">${item.predicted_days} days</p>
                <p>Confidence: ${item.confidence !== null ? Number(item.confidence).toFixed(1) : 'N/A'}%</p>
                <p class="prediction-date">${dateStr}</p>
            </div>
        `;
        container.appendChild(card);
    });
}

function calculateHatchDate(daysUntilHatch) {
    const hatchDate = new Date();
    hatchDate.setDate(hatchDate.getDate() + daysUntilHatch);
    return hatchDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function viewPrawnDetails(prawn) {
    selectedPrawn = prawn;
    showPage('imageSelectionPage');
}

// ============================================
// PIE CHART
// ============================================
function renderLocationPieChart(prawns) {
    const canvas = document.getElementById('locationPieChart');
    if (!canvas) return;

    const ctx           = canvas.getContext('2d');
    const containerWidth = canvas.parentElement?.clientWidth || 300;
    const size          = Math.min(containerWidth - 20, 300);
    canvas.width        = size;
    canvas.height       = size;

    if (!prawns || prawns.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.style.display = 'none';
        const legend = document.getElementById('pieChartLegend');
        if (legend) legend.innerHTML = `
            <div class="pie-empty-state">
                <div class="pie-empty-icon">🦐</div>
                <h3>No prawns registered yet</h3>
                <p>Register your first prawn to see location distribution!</p>
                <button class="btn btn-outline" onclick="showPage('registerPrawnPage')"
                    style="max-width:200px;margin:12px auto 0;font-size:13px;padding:10px;">
                    + Register First Prawn
                </button>
            </div>`;
        return;
    }

    // Count per location
    const locationCounts = {};
    prawns.forEach(p => {
        const loc = p.location_name || 'No Location';
        locationCounts[loc] = (locationCounts[loc] || 0) + 1;
    });

    const labels  = Object.keys(locationCounts);
    const values  = Object.values(locationCounts);
    const total   = values.reduce((s, v) => s + v, 0);
    const colors  = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#f97316'];

    canvas.style.display = 'block';
    const centerX    = canvas.width  / 2;
    const centerY    = canvas.height / 2;
    const baseRadius = Math.min(centerX, centerY) - 20;
    const hoverRadius = baseRadius + 12;

    let slices        = [];
    let currentAngle  = -Math.PI / 2;
    values.forEach((value, index) => {
        const sliceAngle = (value / total) * 2 * Math.PI;
        slices.push({
            startAngle:  currentAngle,
            endAngle:    currentAngle + sliceAngle,
            midAngle:    currentAngle + sliceAngle / 2,
            value, label: labels[index],
            color:       colors[index % colors.length],
            percentage:  ((value / total) * 100).toFixed(1),
        });
        currentAngle += sliceAngle;
    });

    // Rebind events by cloning canvas
    const newCanvas = canvas.cloneNode(true);
    canvas.parentNode.replaceChild(newCanvas, canvas);
    const c2   = document.getElementById('locationPieChart');
    if (!c2)   return;
    const ctx2 = c2.getContext('2d');

    (function bindEvents(cvs, context) {
        let hoveredRef = -1;

        function lightenColor(hex, amount) {
            const num = parseInt(hex.replace('#', ''), 16);
            return `rgb(${Math.min(255,(num>>16)+amount)},${Math.min(255,((num>>8)&0xff)+amount)},${Math.min(255,(num&0xff)+amount)})`;
        }

        function redraw(hi) {
            hoveredRef = hi;
            context.clearRect(0, 0, cvs.width, cvs.height);

            slices.forEach((slice, i) => {
                const isHovered = i === hoveredRef;
                const r         = isHovered ? hoverRadius : baseRadius;
                const ox        = isHovered ? Math.cos(slice.midAngle) * 10 : 0;
                const oy        = isHovered ? Math.sin(slice.midAngle) * 10 : 0;

                context.save();
                context.shadowColor = isHovered ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.20)';
                context.shadowBlur  = isHovered ? 24 : 10;
                context.beginPath();
                context.moveTo(centerX + ox, centerY + oy);
                context.arc(centerX + ox, centerY + oy, r, slice.startAngle, slice.endAngle);
                context.closePath();
                context.fillStyle = slice.color;
                context.fill();
                context.restore();

                const grad = context.createRadialGradient(
                    centerX + ox - r * 0.25, centerY + oy - r * 0.25, r * 0.05,
                    centerX + ox, centerY + oy, r
                );
                grad.addColorStop(0, lightenColor(slice.color, 45));
                grad.addColorStop(0.6, slice.color);
                grad.addColorStop(1, lightenColor(slice.color, -30));

                context.beginPath();
                context.moveTo(centerX + ox, centerY + oy);
                context.arc(centerX + ox, centerY + oy, r, slice.startAngle, slice.endAngle);
                context.closePath();
                context.fillStyle   = grad;
                context.fill();
                context.strokeStyle = 'rgba(255,255,255,0.9)';
                context.lineWidth   = isHovered ? 3 : 2;
                context.stroke();

                const tx = centerX + ox + Math.cos(slice.midAngle) * (r * 0.65);
                const ty = centerY + oy + Math.sin(slice.midAngle) * (r * 0.65);
                context.fillStyle    = '#fff';
                context.font         = isHovered ? 'bold 15px Arial' : 'bold 13px Arial';
                context.textAlign    = 'center';
                context.textBaseline = 'middle';
                context.fillText(`${slice.percentage}%`, tx, ty);
            });

            if (hoveredRef !== -1) {
                const s     = slices[hoveredRef];
                const lines = [s.label, `${s.value} prawn${s.value > 1 ? 's' : ''}`, `${s.percentage}%`];
                const lineH = 20, boxW = 145, boxH = lines.length * lineH + 16;
                const bx    = centerX - boxW / 2, by = centerY - boxH / 2;
                context.fillStyle = 'rgba(20,20,20,0.85)';
                context.beginPath();
                context.roundRect(bx, by, boxW, boxH, 10);
                context.fill();
                lines.forEach((line, li) => {
                    context.fillStyle    = li === 0 ? '#fff' : '#d1d5db';
                    context.font         = li === 0 ? 'bold 13px Arial' : '12px Arial';
                    context.textAlign    = 'center';
                    context.textBaseline = 'middle';
                    context.fillText(line, centerX, by + 8 + lineH * li + lineH / 2);
                });
            }
            cvs.style.cursor = hoveredRef !== -1 ? 'pointer' : 'default';
        }

        function getIdx(e) {
            const rect   = cvs.getBoundingClientRect();
            const scaleX = cvs.width  / rect.width;
            const scaleY = cvs.height / rect.height;
            const mx     = (e.clientX - rect.left) * scaleX;
            const my     = (e.clientY - rect.top)  * scaleY;
            const dx     = mx - centerX, dy = my - centerY;
            const dist   = Math.sqrt(dx * dx + dy * dy);
            if (dist > hoverRadius + 14 || dist < 5) return -1;
            let angle    = Math.atan2(dy, dx);
            const shift  = Math.PI / 2;
            let a        = ((angle + shift) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
            return slices.findIndex(s => {
                let start = ((s.startAngle + shift) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
                let end   = ((s.endAngle   + shift) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
                if (end < start) end += 2 * Math.PI;
                let aa = a; if (aa < start) aa += 2 * Math.PI;
                return aa >= start && aa <= end;
            });
        }

        cvs.addEventListener('mousemove',  e => { const idx = getIdx(e); if (idx !== hoveredRef) redraw(idx); });
        cvs.addEventListener('mouseleave', () => { if (hoveredRef !== -1) redraw(-1); });
        redraw(-1);
    })(c2, ctx2);

    // Legend
    const legendContainer = document.getElementById('pieChartLegend');
    if (legendContainer) {
        legendContainer.innerHTML = '';
        slices.forEach(slice => {
            const item       = document.createElement('div');
            item.className   = 'legend-item';
            item.innerHTML   = `
                <div class="legend-color" style="background-color:${slice.color}"></div>
                <span class="legend-text">${slice.label}: ${slice.value} prawn${slice.value > 1 ? 's' : ''}</span>
            `;
            legendContainer.appendChild(item);
        });
    }
}

// ============================================
// CAMERA
// ============================================
function resetCameraUI() {
    usingRPiCamera = false;
    imageCaptured  = false;

    const cameraPlaceholder = document.getElementById('cameraPlaceholder');
    const cameraLoading     = document.getElementById('cameraLoading');
    const video             = document.getElementById('video');
    const capturedImage     = document.getElementById('capturedImage');
    const rpiStream         = document.getElementById('rpiStream');

    if (cameraPlaceholder) cameraPlaceholder.style.display = 'flex';
    if (cameraLoading)     cameraLoading.style.display     = 'none';
    if (video)             { video.style.display = 'none'; video.srcObject = null; }
    if (capturedImage)     { capturedImage.src = ''; capturedImage.style.display = 'none'; }
    if (rpiStream)         { rpiStream.src = ''; rpiStream.style.display = 'none'; }

    document.getElementById('captureBtn').textContent = 'CAPTURE';
    document.getElementById('tryAgainCaptureBtn')?.remove();
}

async function startCamera() {
    document.getElementById('cameraPlaceholder').style.display = 'none';
    document.getElementById('cameraLoading').style.display     = 'flex';
    document.getElementById('video').style.display             = 'none';

    try {
        videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        const video = document.getElementById('video');
        video.srcObject = videoStream;
        document.getElementById('cameraLoading').style.display  = 'none';
        video.style.display                                      = 'block';
        document.getElementById('capturedImage').style.display  = 'none';
        document.getElementById('captureBtn').textContent       = 'CAPTURE';
    } catch (err) {
        document.getElementById('cameraLoading').style.display     = 'none';
        document.getElementById('cameraPlaceholder').style.display = 'flex';
        showToast('Camera access denied or not available', 'error');
        console.error('Camera error:', err);
    }
}

function captureImage() { withNavLock(_captureImage); }
function _captureImage() {
    const captureBtn = document.getElementById('captureBtn');

    if (usingRPiCamera) {
        if (!imageCaptured) { captureFromRPi(); }
        else { document.getElementById('uploadedImage').src = capturedImageData; showPage('predictPage'); }
        return;
    }

    const video  = document.getElementById('video');
    const canvas = document.getElementById('canvas');

    if (!imageCaptured) {
        if (!videoStream) { showToast('No camera detected. Please select a camera source first.', 'warning'); return; }

        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        capturedImageData      = canvas.toDataURL('image/jpeg');
        window.lastImageSource = 'camera';

        videoStream.getTracks().forEach(t => t.stop());
        videoStream = null;
        video.style.display = 'none';

        const capturedImg          = document.getElementById('capturedImage');
        capturedImg.src            = capturedImageData;
        capturedImg.style.display  = 'block';
        imageCaptured              = true;
        captureBtn.textContent     = 'USE THIS IMAGE';

        _addTryAgainCaptureBtn(captureBtn);
    } else {
        document.getElementById('uploadedImage').src = capturedImageData;
        showPage('predictPage');
    }
}

function _addTryAgainCaptureBtn(captureBtn) {
    if (document.getElementById('tryAgainCaptureBtn')) return;
    const btn         = document.createElement('button');
    btn.id            = 'tryAgainCaptureBtn';
    btn.className     = 'btn btn-outline';
    btn.textContent   = 'TRY AGAIN';
    btn.style.cssText = 'margin:10px auto;display:block;width:auto;min-width:160px;padding:12px 30px;';
    btn.onclick       = function () {
        clearCapturePreview();
        usingRPiCamera ? startRPiCamera() : startCamera();
    };
    captureBtn.parentElement.parentElement.insertBefore(btn, captureBtn.parentElement.nextSibling);
}

function clearCapturePreview() {
    imageCaptured     = false;
    capturedImageData = null;
    const capturedImage = document.getElementById('capturedImage');
    if (capturedImage)  { capturedImage.src = ''; capturedImage.style.display = 'none'; }
    document.getElementById('captureBtn').textContent = 'CAPTURE';
    document.getElementById('tryAgainCaptureBtn')?.remove();
}

function triggerFileUpload() {
    const fileInput  = document.getElementById('fileInput');
    fileInput.value  = '';
    fileInput.click();
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader     = new FileReader();
    reader.onload    = function (e) {
        capturedImageData      = e.target.result;
        window.lastImageSource = 'upload';
        localStorage.setItem('hatchly_captured_image',  capturedImageData);
        localStorage.setItem('hatchly_image_source',    'upload');
        document.getElementById('uploadedImage').src = capturedImageData;
        showPage('predictPage');
    };
    reader.readAsDataURL(file);
}

// RPi Camera
async function checkCameraStatus() {
    try {
        const response = await fetch('/api/camera/status');
        const result   = await response.json();
        if (result.success && result.camera_online) {
            cameraStreamUrl = result.camera_url;
            return true;
        }
        return false;
    } catch (error) {
        console.error('Camera status check failed:', error);
        return false;
    }
}

function switchToLocalCamera() {
    usingRPiCamera = false;
    clearCapturePreview();
    document.getElementById('cameraPlaceholder').style.display = 'none';
    document.getElementById('rpiStream').style.display         = 'none';
    document.getElementById('capturedImage').style.display     = 'none';
    document.getElementById('useLocalCamera').classList.add('active-camera');
    document.getElementById('useRPiCamera').classList.remove('active-camera');
    startCamera();
}

async function switchToRPiCamera() {
    const isAvailable = await checkCameraStatus();
    if (!isAvailable) { showToast('RPi camera is offline. Check connection and try again.', 'error'); return; }

    usingRPiCamera = true;
    clearCapturePreview();

    if (videoStream) { videoStream.getTracks().forEach(t => t.stop()); videoStream = null; }

    document.getElementById('cameraPlaceholder').style.display = 'none';
    document.getElementById('cameraLoading').style.display     = 'flex';
    document.getElementById('video').style.display             = 'none';
    document.getElementById('capturedImage').style.display     = 'none';
    document.getElementById('useRPiCamera').classList.add('active-camera');
    document.getElementById('useLocalCamera').classList.remove('active-camera');

    startRPiCamera();
}

function startRPiCamera() {
    const rpiStream    = document.getElementById('rpiStream');
    rpiStream.onload   = function () {
        document.getElementById('cameraLoading').style.display = 'none';
        rpiStream.style.display = 'block';
    };
    rpiStream.onerror  = function () {
        document.getElementById('cameraLoading').style.display     = 'none';
        document.getElementById('cameraPlaceholder').style.display = 'flex';
        showToast('Cannot load RPi camera stream. Check your connection.', 'error');
        switchToLocalCamera();
    };
    rpiStream.src      = '/api/camera/stream?' + new Date().getTime();
    document.getElementById('captureBtn').textContent = 'CAPTURE';
}

async function captureFromRPi() {
    const rpiStreamEl = document.getElementById('rpiStream');
    if (rpiStreamEl) rpiStreamEl.onerror = null;

    try {
        const response = await fetch('/api/camera/capture');
        const result   = await response.json();

        if (result.success) {
            capturedImageData      = result.image;
            window.lastImageSource = 'camera';

            const capturedImg  = document.getElementById('capturedImage');
            const rpiStream    = document.getElementById('rpiStream');
            if (rpiStream)   { rpiStream.src = ''; rpiStream.style.display = 'none'; }
            if (capturedImg) { capturedImg.src = capturedImageData; capturedImg.style.display = 'block'; }

            imageCaptured                                         = true;
            document.getElementById('captureBtn').textContent    = 'USE THIS IMAGE';
            _addTryAgainCaptureBtn(document.getElementById('captureBtn'));
        } else {
            showToast(result.error || 'Unable to capture image from RPi camera.', 'error');
        }
    } catch (error) {
        console.error('RPi capture error:', error);
        showToast('Failed to capture from RPi camera. ' + error.message, 'error');
    }
}

// ============================================
// LOCATION MANAGEMENT
// ============================================
function goBackFromLocationSetup() {
    const prevPage = navigationHistory[navigationHistory.length - 2];
    showPage(prevPage === 'registerPrawnPage' ? 'registerPrawnPage' : 'dashboardPage');
}

async function loadLocationDropdown() {
    const select = document.getElementById('prawnLocation');
    if (!select) return;
    try {
        const response = await fetch('/api/get_locations');
        const result   = await response.json();
        select.innerHTML = '<option value="">-- Select Location --</option>';
        if (result.success && result.locations.length > 0) {
            result.locations.forEach(loc => {
                const option       = document.createElement('option');
                option.value       = loc.id;
                option.textContent = loc.name;
                select.appendChild(option);
            });
        } else {
            select.innerHTML = '<option value="">-- No locations yet. Add in Location Setup --</option>';
        }
    } catch (error) {
        console.error('Load locations error:', error);
    }
}

async function loadLocationList() {
    const container = document.getElementById('locationListContainer');
    if (!container) return;
    container.innerHTML = '<p style="text-align:center;color:#666;">Loading...</p>';
    try {
        const response = await fetch('/api/get_locations');
        const result   = await response.json();
        if (result.success) {
            if (result.locations.length === 0) {
                container.innerHTML = '<div class="no-prawns">No locations added yet.</div>';
                return;
            }
            container.innerHTML = '';
            result.locations.forEach(loc => {
                const item       = document.createElement('div');
                item.className   = 'location-item';
                item.innerHTML   = `
                    <span class="location-name">📍 ${loc.name}</span>
                    <div class="location-actions">
                        <button class="btn-icon" onclick="showRenameModal(${loc.id}, '${loc.name.replace(/'/g,"\\'")}')">✏️</button>
                        <button class="btn-icon btn-delete-icon" onclick="handleDeleteLocation(${loc.id}, '${loc.name.replace(/'/g,"\\'")}')">🗑️</button>
                    </div>
                `;
                container.appendChild(item);
            });
        }
    } catch (error) {
        console.error('Load location list error:', error);
        container.innerHTML = '<div class="no-prawns" style="color:#dc2626;">Error loading locations.</div>';
    }
}

async function handleAddLocation() {
    const nameInput = document.getElementById('newLocationName');
    const name      = nameInput.value.trim();
    document.getElementById('locationNameError').classList.remove('show');

    if (!name) { document.getElementById('locationNameError').classList.add('show'); return; }

    try {
        const response = await fetch('/api/save_location', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ name })
        });
        const result = await response.json();
        if (result.success) {
            nameInput.value = '';
            loadLocationList();
            showToast('Location added!', 'success');
        } else {
            showToast(result.message || 'Failed to add location.', 'error');
        }
    } catch (error) {
        showToast('Error connecting to server.', 'error');
    }
}

async function handleInlineAddLocation() {
    const nameInput = document.getElementById('inlineLocationName');
    const name      = nameInput.value.trim();
    const err       = document.getElementById('inlineLocationError');
    err.classList.remove('show');

    if (!name) { err.textContent = 'Please enter a location name'; err.classList.add('show'); return; }

    try {
        const response = await fetch('/api/save_location', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ name })
        });
        const result = await response.json();
        if (result.success) {
            nameInput.value = '';
            await loadLocationDropdown();
            document.getElementById('prawnLocation').value = result.location.id;
            showToast(`Location "${name}" added!`, 'success');
        } else {
            err.textContent = result.message || 'Failed to add location';
            err.classList.add('show');
        }
    } catch (error) {
        err.textContent = 'Error connecting to server';
        err.classList.add('show');
    }
}

// — Rename Location
let renamingLocationId = null;

function showRenameModal(locationId, currentName) {
    renamingLocationId = locationId;
    document.getElementById('renameLocationInput').value = currentName;
    document.getElementById('renameLocationError').classList.remove('show');
    document.getElementById('renameLocationModal').style.display = 'block';
}

function closeRenameModal(event) {
    if (event) event.stopPropagation();
    document.getElementById('renameLocationModal').style.display = 'none';
    renamingLocationId = null;
}

async function confirmRenameLocation() {
    const newName = document.getElementById('renameLocationInput').value.trim();
    if (!newName) {
        document.getElementById('renameLocationError').classList.add('show');
        shakeInput(document.getElementById('renameLocationInput'));
        return;
    }
    try {
        const response = await fetch('/api/rename_location', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ location_id: renamingLocationId, new_name: newName })
        });
        const result = await response.json();
        if (result.success) {
            closeRenameModal();
            loadLocationList();
            showToast(`Location renamed to "${newName}"!`, 'success');
        } else {
            showToast(result.message || 'Failed to rename location.', 'error');
        }
    } catch (error) {
        showToast('Error connecting to server.', 'error');
    }
}

// — Delete Location
async function handleDeleteLocation(locationId, locationName) {
    try {
        const response = await fetch(`/api/get_prawns?user_id=${currentUserId}`);
        const result   = await response.json();
        const affectedPrawns = result.success
            ? result.prawns.filter(p => String(p.location_id) === String(locationId))
            : [];

        if (affectedPrawns.length === 0) {
            showConfirm(`Delete location "${locationName}"?`, async () => {
                try {
                    const delResponse = await fetch('/api/delete_location', {
                        method:  'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body:    JSON.stringify({ location_id: locationId })
                    });
                    const delResult = await delResponse.json();
                    if (delResult.success) { loadLocationList(); showToast('Location deleted.', 'success'); }
                    else showToast(delResult.message || 'Failed to delete location.', 'error');
                } catch (error) { showToast('Cannot connect to server.', 'error'); }
            }, 'error');
            return;
        }

        // Has prawns — show reassign modal
        deletingLocationId   = locationId;
        deletingLocationName = locationName;
        document.getElementById('reassignPrawnCount').textContent = affectedPrawns.length;
        document.getElementById('reassignLocationError').classList.remove('show');

        const select     = document.getElementById('reassignLocationSelect');
        select.innerHTML = '<option value="">-- Select Location --</option>';
        try {
            const locResponse = await fetch('/api/get_locations');
            const locResult   = await locResponse.json();
            if (locResult.success) {
                locResult.locations
                    .filter(loc => String(loc.id) !== String(locationId))
                    .forEach(loc => {
                        const option       = document.createElement('option');
                        option.value       = loc.id;
                        option.textContent = loc.name;
                        select.appendChild(option);
                    });
            }
        } catch (e) { console.error(e); }

        document.getElementById('reassignLocationModal').style.display = 'block';
    } catch (error) {
        showToast('Cannot connect to server.', 'error');
    }
}

function closeReassignModal(event) {
    if (event) event.stopPropagation();
    document.getElementById('reassignLocationModal').style.display = 'none';
    deletingLocationId   = null;
    deletingLocationName = null;
}

async function confirmReassignAndDelete() {
    const newLocationId = document.getElementById('reassignLocationSelect').value;
    const err           = document.getElementById('reassignLocationError');
    err.classList.remove('show');
    if (!newLocationId) { err.classList.add('show'); return; }

    try {
        const response       = await fetch(`/api/get_prawns?user_id=${currentUserId}`);
        const result         = await response.json();
        const affectedPrawns = result.prawns.filter(p => String(p.location_id) === String(deletingLocationId));

        for (const prawn of affectedPrawns) {
            await fetch('/api/transfer_prawn', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ prawn_id: prawn.id, new_location_id: newLocationId })
            });
        }

        const delResponse = await fetch('/api/delete_location', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ location_id: deletingLocationId })
        });
        const delResult = await delResponse.json();

        if (delResult.success) {
            closeReassignModal();
            loadLocationList();
            showToast(`Location deleted. ${affectedPrawns.length} prawn(s) transferred.`, 'success');
        } else {
            showToast(delResult.message || 'Failed to delete location.', 'error');
        }
    } catch (error) {
        showToast('Cannot connect to server.', 'error');
    }
}

// ============================================
// IMAGE MODAL
// ============================================
function openImageModal(imageSrc) {
    document.getElementById('imageModal').style.display = 'block';
    document.getElementById('modalImage').src           = imageSrc;
}

function closeImageModal() {
    document.getElementById('imageModal').style.display = 'none';
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeImageModal(); });

// ============================================
// PASSWORD STRENGTH
// ============================================
function checkPasswordStrength(password) {
    const bar   = document.getElementById('strengthBar');
    const label = document.getElementById('strengthLabel');
    if (!bar || !label) return;

    const reqs = {
        length: password.length >= 6,
        upper:  /[A-Z]/.test(password),
        lower:  /[a-z]/.test(password),
        number: /[0-9]/.test(password),
        symbol: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    };

    Object.entries({
        'req-length': reqs.length, 'req-upper': reqs.upper,
        'req-lower':  reqs.lower,  'req-number': reqs.number, 'req-symbol': reqs.symbol
    }).forEach(([id, met]) => document.getElementById(id)?.classList.toggle('met', met));

    _applyStrengthBar(bar, label, password, Object.values(reqs).filter(Boolean).length);
    checkPasswordMatch();
}

function checkPasswordMatch() {
    const newPass     = document.getElementById('newPassword')?.value;
    const confirmPass = document.getElementById('confirmPassword')?.value;
    const indicator   = document.getElementById('matchIndicator');
    if (!indicator || !confirmPass) return;

    if (confirmPass === newPass) {
        indicator.textContent = '✓ Passwords match';
        indicator.style.color = '#16a34a';
        document.getElementById('confirmPasswordError')?.classList.remove('show');
    } else {
        indicator.textContent = '✗ Passwords do not match';
        indicator.style.color = '#ef4444';
    }
}

function checkSignupPasswordStrength(password) {
    const bar   = document.getElementById('signupStrengthBar');
    const label = document.getElementById('signupStrengthLabel');
    if (!bar || !label) return;

    const reqs = {
        length: password.length >= 6,
        upper:  /[A-Z]/.test(password),
        lower:  /[a-z]/.test(password),
        number: /[0-9]/.test(password),
        symbol: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    };

    Object.entries({
        'signup-req-length': reqs.length, 'signup-req-upper': reqs.upper,
        'signup-req-lower':  reqs.lower,  'signup-req-number': reqs.number, 'signup-req-symbol': reqs.symbol
    }).forEach(([id, met]) => document.getElementById(id)?.classList.toggle('met', met));

    _applyStrengthBar(bar, label, password, Object.values(reqs).filter(Boolean).length);
    checkSignupPasswordMatch();
}

function checkSignupPasswordMatch() {
    const newPass     = document.getElementById('signupPassword')?.value;
    const confirmPass = document.getElementById('signupConfirmPassword')?.value;
    const indicator   = document.getElementById('signupMatchIndicator');
    if (!indicator || !confirmPass) return;

    if (confirmPass === newPass) {
        indicator.textContent = '✓ Passwords match';
        indicator.style.color = '#16a34a';
        document.getElementById('signupConfirmPasswordError')?.classList.remove('show');
    } else {
        indicator.textContent = '✗ Passwords do not match';
        indicator.style.color = '#ef4444';
    }
}

function _applyStrengthBar(bar, label, password, score) {
    if (!password) {
        bar.style.width = '0%'; bar.style.background = '';
        label.textContent = ''; label.style.color = '';
        return;
    }
    const levels = [
        { max: 2, width: '25%', bg: '#ef4444', text: '🔴 Weak',   color: '#ef4444' },
        { max: 3, width: '50%', bg: '#f97316', text: '🟠 Fair',   color: '#f97316' },
        { max: 4, width: '75%', bg: '#f59e0b', text: '🟡 Good',   color: '#f59e0b' },
        { max: 5, width: '100%',bg: '#16a34a', text: '🟢 Strong', color: '#16a34a' },
    ];
    const level = levels.find(l => score <= l.max) || levels[3];
    bar.style.width       = level.width;
    bar.style.background  = level.bg;
    label.textContent     = level.text;
    label.style.color     = level.color;
}

// ============================================
// UTILITY HELPERS
// ============================================
function _showFieldError(errorId, message, inputEl) {
    const errEl = document.getElementById(errorId);
    if (!errEl) return;
    if (message) errEl.textContent = message;
    errEl.classList.add('show');
    if (inputEl) { inputEl.classList.add('error-input'); shakeInput(inputEl); }
}

function shakeInput(inputEl) {
    if (!inputEl) return;
    const parent  = inputEl.closest('.form-group') || inputEl.parentElement?.parentElement;
    if (!parent)  return;
    const errorEl = parent.querySelector('.error.show');
    if (!errorEl) return;
    errorEl.animate([
        { transform: 'translateX(0)'  },
        { transform: 'translateX(-8px)' },
        { transform: 'translateX(8px)'  },
        { transform: 'translateX(-5px)' },
        { transform: 'translateX(5px)'  },
        { transform: 'translateX(0)'  }
    ], { duration: 400, easing: 'ease' });
}

function clearErrors() {
    document.querySelectorAll('.error').forEach(e => e.classList.remove('show'));
    document.querySelectorAll('input').forEach(i => i.classList.remove('error-input'));
}

function togglePasswordVisibility(inputId, toggleBtn) {
    const input      = document.getElementById(inputId);
    input.type       = input.type === 'password' ? 'text' : 'password';
    toggleBtn.textContent = input.type === 'password' ? 'Show' : 'Hide';
}

// ============================================
// TOAST NOTIFICATION
// ============================================
function showToast(message, type = 'success') {
    document.getElementById('hatchlyToast')?.remove();

    const icons  = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const titles = { success: 'Success', error: 'Error', warning: 'Warning', info: 'Info' };

    const toast   = document.createElement('div');
    toast.id      = 'hatchlyToast';
    toast.className = `hatchly-toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <div class="toast-body">
            <p class="toast-title">${titles[type] || 'Notice'}</p>
            <p class="toast-message">${message}</p>
        </div>
        <button class="toast-close" onclick="this.closest('.hatchly-toast').remove()">✕</button>
        <div class="toast-progress"></div>
    `;
    document.body.appendChild(toast);

    requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('toast-show')));

    setTimeout(() => {
        if (toast.parentNode) {
            toast.style.opacity = '0';
            toast.style.top     = '-120px';
            setTimeout(() => toast.remove(), 400);
        }
    }, 3000);
}

// ============================================
// CONFIRM DIALOG
// ============================================
function showConfirm(message, onConfirm, type = 'warning', okText = 'Delete', cancelText = 'Cancel') {
    document.getElementById('hatchlyConfirm')?.remove();

    const icons  = { warning: '⚠️', error: '❌', info: 'ℹ️' };
    const colors = { warning: '#d97706', error: '#dc2626', info: '#0891b2' };

    const overlay    = document.createElement('div');
    overlay.id       = 'hatchlyConfirm';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999998;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(3px);';
    overlay.innerHTML = `
        <div style="background:#fff;border-radius:16px;padding:24px 20px 20px;max-width:320px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.25);border-left:4px solid ${colors[type]};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;animation:confirmSlideIn .25s cubic-bezier(.34,1.56,.64,1);">
            <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:20px;">
                <span style="font-size:22px;flex-shrink:0;">${icons[type]}</span>
                <p style="font-size:14px;color:#333;line-height:1.6;margin:0;font-weight:500;">${message.replace(/\n/g,'<br>')}</p>
            </div>
            <div style="display:flex;gap:10px;">
                <button id="confirmCancel" style="flex:1;padding:10px;border-radius:10px;background:#f3f4f6;color:#555;border:2px solid #e5e7eb;font-size:14px;font-weight:600;cursor:pointer;">${cancelText}</button>
                <button id="confirmOk" style="flex:1;padding:10px;border-radius:10px;background:${colors[type]};color:#fff;border:2px solid ${colors[type]};font-size:14px;font-weight:600;cursor:pointer;">${okText}</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    if (!document.getElementById('confirmStyles')) {
        const style      = document.createElement('style');
        style.id         = 'confirmStyles';
        style.textContent = '@keyframes confirmSlideIn{from{opacity:0;transform:scale(.85) translateY(20px)}to{opacity:1;transform:scale(1) translateY(0)}}';
        document.head.appendChild(style);
    }

    document.getElementById('confirmOk').onclick     = () => { overlay.remove(); onConfirm(); };
    document.getElementById('confirmCancel').onclick  = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

// ============================================
// DOM READY — event listeners
// ============================================
document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    checkLoginStatus();

    // Helper: bind Enter key to a function
    function onEnter(id, fn) {
        document.getElementById(id)?.addEventListener('keypress', e => { if (e.key === 'Enter') fn(); });
    }

    // Auth
    onEnter('loginEmail',    handleLogin);
    onEnter('loginPassword', handleLogin);
    onEnter('signupConfirmPassword', handleSignup);

    // Signup real-time validation
    const signupName = document.getElementById('signupName');
    if (signupName) {
        onEnter('signupName', handleSignup);
        signupName.addEventListener('input', function () {
            const val = this.value;
            const err = document.getElementById('signupNameError');
            if (!val.trim()) {
                err.classList.remove('show'); this.classList.remove('error-input');
            } else if (!/^[a-zA-ZÀ-ÖØ-öø-ÿ\s\-']+$/.test(val.trim())) {
                err.textContent = 'Invalid character — letters only';
                err.classList.add('show'); this.classList.add('error-input');
            } else if (val.length > 30) {
                err.textContent = 'Too long — max 30 characters';
                err.classList.add('show'); this.classList.add('error-input');
            } else {
                err.classList.remove('show'); this.classList.remove('error-input');
            }
        });
    }

    const signupEmail = document.getElementById('signupEmail');
    if (signupEmail) {
        onEnter('signupEmail', handleSignup);
        signupEmail.addEventListener('input', function () {
            const val = this.value;
            const err = document.getElementById('signupEmailError');
            if (!val.trim()) {
                err.classList.remove('show'); this.classList.remove('error-input');
            } else if (!/^[a-zA-Z0-9_.]+$/.test(val)) {
                err.textContent = 'Only letters, numbers, _ and . allowed';
                err.classList.add('show'); this.classList.add('error-input');
            } else if (val.length > 15) {
                err.textContent = 'Too long — max 15 characters';
                err.classList.add('show'); this.classList.add('error-input');
            } else {
                err.classList.remove('show'); this.classList.remove('error-input');
            }
        });
    }

    const signupPassword = document.getElementById('signupPassword');
    if (signupPassword) {
        onEnter('signupPassword', handleSignup);
        signupPassword.addEventListener('input', function () {
            const val = this.value;
            const err = document.getElementById('signupPasswordError');
            if (!val) {
                err.classList.remove('show'); this.classList.remove('error-input');
            } else if (val.length > 15) {
                err.textContent = 'Too long — max 15 characters';
                err.classList.add('show'); this.classList.add('error-input');
            } else {
                err.classList.remove('show'); this.classList.remove('error-input');
            }
        });

        // Revalidate confirm when password changes
        signupPassword.addEventListener('input', function () {
            const confirmVal = document.getElementById('signupConfirmPassword')?.value;
            if (!confirmVal) return;
            document.getElementById('signupConfirmPasswordError')?.classList.remove('show');
            document.getElementById('signupConfirmPassword')?.classList.remove('error-input');
        });
    }

    const signupConfirmPassword = document.getElementById('signupConfirmPassword');
    if (signupConfirmPassword) {
        signupConfirmPassword.addEventListener('input', function () {
            const val      = this.value;
            const password = document.getElementById('signupPassword').value;
            const err      = document.getElementById('signupConfirmPasswordError');
            if (!val || val.length > 15 || val !== password) {
                err.classList.remove('show'); this.classList.remove('error-input');
            } else {
                err.classList.remove('show'); this.classList.remove('error-input');
            }
        });
    }

    // Change password
    ['currentPassword','newPassword','confirmPassword'].forEach(id => onEnter(id, handleChangePassword));

    // Modals
    onEnter('renamePrawnInput',    confirmRenamePrawn);
    onEnter('transferLocationSelect', confirmTransferPrawn);
    onEnter('deleteConfirmPassword',  confirmDeletePrawn);
    onEnter('renameLocationInput',    confirmRenameLocation);
    onEnter('newLocationName',        handleAddLocation);
    onEnter('prawnName',              handleSavePrawn);
});