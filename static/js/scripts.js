// ============================================
// FLASK VERSION - Updated API endpoints
// ============================================

// Global variables
let currentUser = null;
let currentUserId = null;
let selectedPrawn = null;
let capturedImageData = null;
let videoStream = null;

let allPrawnsCache = [];
let usingRPiCamera = false;
let cameraStreamUrl = null;
let imageCaptured = false;
let deletingLocationId = null;
let deletingLocationName = null;

// Navigation lock — prevents rapid clicking
let isNavigating = false;

function withNavLock(fn) {
    if (isNavigating) return;
    isNavigating = true;
    try { fn(); } finally {
        setTimeout(() => { isNavigating = false; }, 500);
    }
}

// PRIORITY 7 — History logs cache
let allLogsCache = [];

async function loadPrawnList() {
    const container = document.getElementById('prawnListContainer');
    container.innerHTML = '<p style="text-align: center; padding: 40px; color: #666;">Loading...</p>';

    try {
        const response = await fetch(`/api/get_prawns?user_id=${currentUserId}`);
        const result = await response.json();

        if (result.success) {
            allPrawnsCache = result.prawns;
            await loadLocationFilterDropdown();
            renderPrawnList(allPrawnsCache);
        } else {
            container.innerHTML = '<div class="no-prawns">Failed to load prawns.</div>';
        }
    } catch (error) {
        console.error('Load prawns error:', error);
        container.innerHTML = '<div class="no-prawns" style="color: #dc2626;">Error connecting to server.</div>';
    }
}
// Navigation history stack
let navigationHistory = [];

// Prevent browser back button - handle internally
history.pushState(null, null, location.href);
window.addEventListener('popstate', function() {
    history.pushState(null, null, location.href);
    
    if (navigationHistory.length > 1) {
        navigationHistory.pop(); // Remove current page
        const previousPage = navigationHistory[navigationHistory.length - 1];
        showPageWithoutHistory(previousPage);
    }
    // If only dashboard left, stay there
});
// Configuration - Flask API URLs
const API_BASE = '';  // Flask handles this automatically
const PREDICT_API_URL = '/api/predict';
const originalFetch = window.fetch;

// PRIORITY 4 — Session Expired Toast (updated fetch interceptor)
window.fetch = async function(...args) {
    const response = await originalFetch(...args);
    if (response.status === 401) {
        const wasLoggedIn = !!currentUser;
        localStorage.removeItem('hatchly_current_user');
        localStorage.removeItem('hatchly_current_user_id');
        localStorage.removeItem('hatchly_user_name');
        localStorage.removeItem('hatchly_current_page');
        localStorage.removeItem('hatchly_selected_prawn');
        currentUser = null;
        currentUserId = null;
        selectedPrawn = null;
        updatePrawnBadge(null);
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
// ============================================
// Fix #1 & #2: Validate server session on load
// ============================================
function checkLoginStatus() {
    const savedUser = localStorage.getItem('hatchly_current_user');
    const savedUserId = localStorage.getItem('hatchly_current_user_id');
    
    if (savedUser && savedUserId) {
        fetch('/api/check_session')
            .then(r => r.json())
            .then(data => {
                if (data.valid) {
                    currentUser = savedUser;
                    currentUserId = parseInt(savedUserId);
                    
                    const savedPrawnJson = localStorage.getItem('hatchly_selected_prawn');
                    if (savedPrawnJson) {
                        try { selectedPrawn = JSON.parse(savedPrawnJson); }
                        catch (e) { selectedPrawn = null; }
                    }
                    
                    if (selectedPrawn) updatePrawnBadge(selectedPrawn);
                    
                    const savedImage = localStorage.getItem('hatchly_captured_image');
                    const savedSource = localStorage.getItem('hatchly_image_source');
                    if (savedImage) {
                        capturedImageData = savedImage;
                        window.lastImageSource = savedSource || 'upload';
                    }
                    const savedPage = localStorage.getItem('hatchly_current_page');
                    showPage(savedPage || 'dashboardPage');
                    updateUserName();
                } else {
                    // Only clear and redirect if truly invalid
                    localStorage.removeItem('hatchly_current_user');
                    localStorage.removeItem('hatchly_current_user_id');
                    localStorage.removeItem('hatchly_user_name');
                    localStorage.removeItem('hatchly_current_page');
                    localStorage.removeItem('hatchly_selected_prawn');
                    showPage('authPage');
                }
            })
            .catch(() => {
                // Network error — trust localStorage, don't redirect
                currentUser = savedUser;
                currentUserId = parseInt(savedUserId);
                const savedImage = localStorage.getItem('hatchly_captured_image');
                const savedSource = localStorage.getItem('hatchly_image_source');
                if (savedImage) {
                    capturedImageData = savedImage;
                    window.lastImageSource = savedSource || 'upload';
                }
                const savedPage = localStorage.getItem('hatchly_current_page');
                showPage(savedPage || 'dashboardPage');
                updateUserName();
            });
    } else {
        showPage('authPage');
    }
}
function updateUserName() {
    if (currentUser) {
        const savedName = localStorage.getItem('hatchly_user_name');
        
        if (savedName) {
            document.querySelectorAll('.user-name-display').forEach(el => {
                el.textContent = savedName;
            });
            const userNameEl = document.getElementById('userName');
            if (userNameEl) {
                userNameEl.textContent = savedName;
            }
        }
    }
}

// Badge removed — stub kept so no reference errors
function updatePrawnBadge(prawn) {}

// ============================================
// PRIORITY 5 — Back Navigation Fix
// ============================================
function navigateBack() { withNavLock(_navigateBack); }
function _navigateBack() {
    if (navigationHistory.length > 1) {
        navigationHistory.pop();
        const prev = navigationHistory[navigationHistory.length - 1];
        showPageWithoutHistory(prev);
    } else {
        showPage('dashboardPage');
    }
}

// ============================================
// MENU FUNCTIONS
// ============================================

function toggleMenu() {
    const btn = event.currentTarget;
    const dropdown = btn.nextElementSibling;
    const isOpen = dropdown.classList.contains('show');

    // Close all first
    document.querySelectorAll('.menu-dropdown').forEach(d => d.classList.remove('show'));

    // If it was closed, open it; if it was open, leave it closed
    if (!isOpen) {
        dropdown.classList.add('show');
    }
}

document.addEventListener('click', function(e) {
    if (!e.target.closest('.menu-container')) {
        document.querySelectorAll('.menu-dropdown').forEach(dropdown => {
            dropdown.classList.remove('show');
        });
    }
});

function showChangePassword() {
    showPage('changePasswordPage');
    clearPasswordFields();
}

function clearPasswordFields() {
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
    clearErrors();
}

// ============================================
// AUTHENTICATION - FLASK API
// ============================================

async function handleLogin() {
    clearErrors();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    const emailInput = document.getElementById('loginEmail');
    const passwordInput = document.getElementById('loginPassword');
    
    let hasError = false;

    if (!email || email.trim() === '') {
        document.getElementById('loginEmailError').textContent = 'Please enter your username';
        document.getElementById('loginEmailError').classList.add('show');
        emailInput.classList.add('error-input');
        shakeInput(emailInput);
        hasError = true;
    } else if (email.includes('@')) {
        document.getElementById('loginEmailError').textContent = 'Username only — do not use an email address';
        document.getElementById('loginEmailError').classList.add('show');
        emailInput.classList.add('error-input');
        shakeInput(emailInput);
        hasError = true;
    }

    if (!password) {
        document.getElementById('loginPasswordError').classList.add('show');
        passwordInput.classList.add('error-input');
        shakeInput(passwordInput);
        hasError = true;
    }

    if (hasError) return;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username: email, password })
        });

        const result = await response.json();

       if (result.success) {
            currentUser = result.email;
            currentUserId = parseInt(result.user_id);
            
            localStorage.setItem('hatchly_current_user', result.email);
            localStorage.setItem('hatchly_current_user_id', result.user_id);
            localStorage.setItem('hatchly_user_name', result.name);
            
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
    
    const name = document.getElementById('signupName').value;
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    
    const nameInput = document.getElementById('signupName');
    const emailInput = document.getElementById('signupEmail');
    const passwordInput = document.getElementById('signupPassword');
    
    let hasError = false;

   if (!name.trim()) {
        document.getElementById('signupNameError').classList.add('show');
        nameInput.classList.add('error-input');
        shakeInput(nameInput);
        hasError = true;
    } else if (name.length > 30) {
        document.getElementById('signupNameError').textContent = 'Name must be 30 characters or less';
        document.getElementById('signupNameError').classList.add('show');
        nameInput.classList.add('error-input');
        shakeInput(nameInput);
        hasError = true;
    } else if (!/^[a-zA-ZÀ-ÖØ-öø-ÿ\s\-']+$/.test(name.trim())) {
        document.getElementById('signupNameError').textContent = 'Name must contain letters only (no numbers or symbols)';
        document.getElementById('signupNameError').classList.add('show');
        nameInput.classList.add('error-input');
        shakeInput(nameInput);
        hasError = true;
    }

    if (!email || email.trim() === '') {
        document.getElementById('signupEmailError').textContent = 'Please enter a username';
        document.getElementById('signupEmailError').classList.add('show');
        emailInput.classList.add('error-input');
        shakeInput(emailInput);
        hasError = true;
    } else if (email.length > 15) {
        document.getElementById('signupEmailError').textContent = 'Username must be 15 characters or less';
        document.getElementById('signupEmailError').classList.add('show');
        emailInput.classList.add('error-input');
        shakeInput(emailInput);
        hasError = true;
    } else if (email.includes('@')) {
        document.getElementById('signupEmailError').textContent = 'Username only — do not use an email address';
        document.getElementById('signupEmailError').classList.add('show');
        emailInput.classList.add('error-input');
        shakeInput(emailInput);
        hasError = true;
    } else if (!/^[a-zA-Z0-9_.]+$/.test(email)) {
        document.getElementById('signupEmailError').textContent = 'Username can only contain letters, numbers, underscore, or dot';
        document.getElementById('signupEmailError').classList.add('show');
        emailInput.classList.add('error-input');
        shakeInput(emailInput);
        hasError = true;
    } else if (email.length < 6) {
        document.getElementById('signupEmailError').textContent = 'Username must be at least 6 characters';
        document.getElementById('signupEmailError').classList.add('show');
        emailInput.classList.add('error-input');
        shakeInput(emailInput);
        hasError = true;
    }

    const confirmPassword = document.getElementById('signupConfirmPassword').value;
    const confirmPasswordInput = document.getElementById('signupConfirmPassword');

   if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/.test(password)) {
        document.getElementById('signupPasswordError').textContent = 'Password must include uppercase, lowercase, number, and special character';
        document.getElementById('signupPasswordError').classList.add('show');
        passwordInput.classList.add('error-input');
        shakeInput(passwordInput);
        hasError = true;
    } else if (password.length > 15) {
        document.getElementById('signupPasswordError').textContent = 'Password must be 15 characters or less';
        document.getElementById('signupPasswordError').classList.add('show');
        passwordInput.classList.add('error-input');
        shakeInput(passwordInput);
        hasError = true;
    }

    if (!confirmPassword) {
        document.getElementById('signupConfirmPasswordError').textContent = 'Please re-enter your password';
        document.getElementById('signupConfirmPasswordError').classList.add('show');
        confirmPasswordInput.classList.add('error-input');
        shakeInput(confirmPasswordInput);
        hasError = true;
    } else if (password !== confirmPassword) {
        document.getElementById('signupConfirmPasswordError').textContent = 'Passwords do not match';
        document.getElementById('signupConfirmPasswordError').classList.add('show');
        confirmPasswordInput.classList.add('error-input');
        shakeInput(confirmPasswordInput);
        hasError = true;
    }

    if (hasError) return;

    try {
        const response = await fetch('/api/signup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: name.trim().replace(/\b\w/g, c => c.toUpperCase()), username: email, password })
        });

        const result = await response.json();

        if (result.success) {
            document.getElementById('signupName').value = '';
            document.getElementById('signupEmail').value = '';
            document.getElementById('signupPassword').value = '';
            document.getElementById('signupConfirmPassword').value = '';
            
            // Switch back to login form with animation
            const container = document.getElementById('formsContainer');
            container.classList.remove('signup-mode');
            
            showToast('Account created! Please log in.', 'success');
        }
        else {
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
        
        localStorage.removeItem('hatchly_current_user');
        localStorage.removeItem('hatchly_current_user_id');
        localStorage.removeItem('hatchly_user_name');
        localStorage.removeItem('hatchly_current_page');
        localStorage.removeItem('hatchly_selected_prawn');
        
        currentUser = null;
        currentUserId = null;
        selectedPrawn = null;
        allPrawnsCache = [];
        allLogsCache = [];

        // Reset dashboard UI
        document.getElementById('totalPrawns').textContent = '0';
        document.getElementById('totalPredictions').textContent = '0';
        document.getElementById('upcomingHatches').textContent = '0';
        document.getElementById('upcomingHatchesList').innerHTML = '';
        document.getElementById('latestPredictionsList').innerHTML = '';
        const pieCanvas = document.getElementById('locationPieChart');
        if (pieCanvas) {
            const ctx = pieCanvas.getContext('2d');
            ctx.clearRect(0, 0, pieCanvas.width, pieCanvas.height);
        }
        const legend = document.getElementById('pieChartLegend');
        if (legend) legend.innerHTML = '';

        updatePrawnBadge(null);
        
        showPage('authPage');
        navigationHistory = [];
    } catch (error) {
        console.error('Logout error:', error);
    }
}

async function handleChangePassword() {
    clearErrors();
    
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    const currentPasswordInput = document.getElementById('currentPassword');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    
    let hasError = false;

    if (!currentPassword) {
        document.getElementById('currentPasswordError').classList.add('show');
        currentPasswordInput.classList.add('error-input');
        shakeInput(currentPasswordInput);
        hasError = true;
    }

    if (newPassword.length < 6) {
        document.getElementById('newPasswordError').classList.add('show');
        newPasswordInput.classList.add('error-input');
        shakeInput(newPasswordInput);
        hasError = true;
    }

    if (newPassword !== confirmPassword) {
        document.getElementById('confirmPasswordError').classList.add('show');
        confirmPasswordInput.classList.add('error-input');
        shakeInput(confirmPasswordInput);
        hasError = true;
    }

    if (hasError) return;

    if (currentPassword === newPassword) {
        showToast('New password must be different from current password', 'error');
        return;
    }

    try {
        const response = await fetch('/api/change_password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                user_id: currentUserId,
                current_password: currentPassword,
                new_password: newPassword
            })
        });

        const result = await response.json();

        if (result.success) {
            showToast('Password changed successfully!', 'success');
            clearPasswordFields();
            showPage('dashboardPage');
        } else {
            if (result.message.includes('incorrect')) {
                document.getElementById('currentPasswordError').textContent = 'Current password is incorrect';
                document.getElementById('currentPasswordError').classList.add('show');
                currentPasswordInput.classList.add('error-input');
                shakeInput(currentPasswordInput);
            } else {
                showToast(result.message || 'Failed to change password', 'error');
            }
        }
    } catch (error) {
        console.error('Change password error:', error);
        showToast('Error connecting to server.', 'error');
    }
}

// ============================================
// PRAWN MANAGEMENT - FLASK API
// ============================================

async function handleSavePrawn() {
    clearErrors();
    
    const name = document.getElementById('prawnName').value;
    const locationId = document.getElementById('prawnLocation').value;
    const nameInput = document.getElementById('prawnName');
    const locationInput = document.getElementById('prawnLocation');
    
    let hasError = false;

    if (!name.trim()) {
        document.getElementById('prawnNameError').classList.add('show');
        nameInput.classList.add('error-input');
        shakeInput(nameInput);
        hasError = true;
    }

    if (!locationId) {
        document.getElementById('prawnLocationError').classList.add('show');
        locationInput.classList.add('error-input');
        shakeInput(locationInput);
        hasError = true;
    }

    if (hasError) return;

    try {
        const response = await fetch('/api/save_prawn', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: currentUserId,
                name: name.trim(),
                location_id: locationId
            })
        });

        const result = await response.json();

        if (result.success) {
            showToast(`Prawn "${name}" registered successfully!`, 'success');
            document.getElementById('prawnName').value = '';
            document.getElementById('prawnLocation').value = '';
            // PRIORITY 9 — highlight newly registered prawn
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


async function loadLocationFilterDropdown() {
    const select = document.getElementById('locationFilter');
    if (!select) return;
    try {
        const response = await fetch('/api/get_locations');
        const result = await response.json();
        select.innerHTML = '<option value="">All Prawns</option>';
        if (result.success && result.locations.length > 0) {
            result.locations.forEach(loc => {
                const option = document.createElement('option');
                option.value = loc.id;
                option.textContent = loc.name;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Load location filter error:', error);
    }
}

function filterPrawnsByLocation() {
    const select = document.getElementById('locationFilter');
    const selectedLocationId = select ? select.value : '';
    
    if (!selectedLocationId) {
        renderPrawnList(allPrawnsCache);
    } else {
        const filtered = allPrawnsCache.filter(p => String(p.location_id) === String(selectedLocationId));
        renderPrawnList(filtered);
    }
}

function renderPrawnList(prawns) {
    const container = document.getElementById('prawnListContainer');
    
    if (prawns.length === 0) {
        container.innerHTML = '<div class="no-prawns">No prawns found.</div>';
        return;
    }

    container.innerHTML = '';
    prawns.forEach(prawn => {
        const prawnCard = document.createElement('div');
        prawnCard.className = 'prawn-card';

        // PRIORITY 9 — highlight newly registered prawn
        const highlightId = localStorage.getItem('hatchly_highlight_prawn');
        if (highlightId && String(prawn.id) === String(highlightId)) {
            prawnCard.style.border = '2px solid #0891b2';
            prawnCard.style.background = '#e0f2fe';
            setTimeout(() => {
                prawnCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
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
    
    // Save to localStorage
    localStorage.setItem('hatchly_selected_prawn', JSON.stringify(prawn));
    const locationText = prawn.location_name || 'No location';
    
    // PRIORITY 2 — update persistent badge
    updatePrawnBadge(prawn);
    
    // Update all location/name displays
    document.querySelectorAll('.selected-prawn-name-display').forEach(el => {
        el.textContent = prawn.name;
    });
    document.querySelectorAll('.selected-prawn-location-display').forEach(el => {
        el.textContent = `Location: ${locationText}`;
    });
    const locEl = document.getElementById('selectedPrawnLocation');
    if (locEl) locEl.textContent = `Location: ${locationText}`;
    const nameEl = document.getElementById('selectedPrawnName');
    if (nameEl) nameEl.textContent = prawn.name;
    
    showPage('imageSelectionPage');
}

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
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                user_id: currentUserId,
                prawn_id: selectedPrawn.id,
                password: password
            })
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

// ============================================
// PREDICTION - FLASK API
// ============================================

async function predictHatchDate() {
    const loadingSpinner = document.getElementById('loadingSpinner');
    const resultContent = document.getElementById('resultContent');
    const predictBtn = document.getElementById('predictBtn');

    document.getElementById('daysResult').textContent = '--';
    document.getElementById('confidenceResult').textContent = '--';
    resultContent.style.display = 'none';
    loadingSpinner.style.display = 'flex';
    predictBtn.style.display = 'none';

    // Hide predict button, show Try Again
    predictBtn.style.display = 'none';
    let predictTryAgain = document.getElementById('predictTryAgainBtn');
    if (!predictTryAgain) {
        predictTryAgain = document.createElement('button');
        predictTryAgain.id = 'predictTryAgainBtn';
        predictTryAgain.className = 'btn btn-outline';
        predictTryAgain.textContent = 'TRY AGAIN';
        predictTryAgain.onclick = function() {
            localStorage.removeItem('hatchly_captured_image');
            localStorage.removeItem('hatchly_image_source');
            localStorage.removeItem('hatchly_prediction_days');
            localStorage.removeItem('hatchly_prediction_confidence');
            document.getElementById('resultContent').style.display = 'none';
            document.getElementById('uploadedImage').src = '';
            capturedImageData = null;
            this.remove();
            const oldPredictBtn = document.getElementById('predictBtn');
            if (oldPredictBtn) oldPredictBtn.style.display = 'block';
            if (window.lastImageSource === 'upload') {
                    showPage('imageSelectionPage');
                    setTimeout(() => triggerFileUpload(), 300);
                } else {
                    showPage('capturePage');
                }
        };
        document.getElementById('predictBtnGroup').insertBefore(predictTryAgain, predictBtn.nextSibling);
    }

    try {
        const response = await fetch(PREDICT_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                image: capturedImageData
            })
        });

        const result = await response.json();

        // CHECK FOR VALIDATION ERRORS
       if (!result.success) {
    loadingSpinner.style.display = 'none';
    predictBtn.style.display = 'none';

    let existingTryAgain = document.getElementById('predictTryAgainBtn');
    if (!existingTryAgain) {
        existingTryAgain = document.createElement('button');
        existingTryAgain.id = 'predictTryAgainBtn';
        existingTryAgain.className = 'btn btn-outline';
        existingTryAgain.textContent = 'TRY AGAIN';
        existingTryAgain.onclick = function() {
            document.getElementById('resultContent').style.display = 'none';
            document.getElementById('uploadedImage').src = '';
            capturedImageData = null;
            this.remove();
            const oldPredictBtn = document.getElementById('predictBtn');
            if (oldPredictBtn) oldPredictBtn.style.display = 'block';
            if (window.lastImageSource === 'upload') {
                showPage('imageSelectionPage');
                setTimeout(() => triggerFileUpload(), 100);
            } else {
                showPage('capturePage');
            }
        };
        predictBtn.parentNode.insertBefore(existingTryAgain, predictBtn);
    }

    if (result.no_prawn_detected) {
        showToast('No prawn eggs detected. Try again.', 'warning');
    } else {
        showToast(result.error || 'Prediction failed. Please try again.', 'error');
    }
    return;
}

        // SUCCESS - show results
        const daysUntilHatch = result.days_until_hatch;
        const confidence = result.confidence;
        const currentDay = result.current_day || null;

        document.getElementById('daysResult').textContent = daysUntilHatch;
        document.getElementById('confidenceResult').textContent = confidence ? Number(confidence).toFixed(1) : 'N/A';
        loadingSpinner.style.display = 'none';
        resultContent.style.display = 'block';

        await savePrediction(selectedPrawn, capturedImageData, daysUntilHatch, confidence, currentDay);
        localStorage.setItem('hatchly_prediction_days', daysUntilHatch);
        localStorage.setItem('hatchly_prediction_confidence', confidence);
        
        console.log('Prediction successful:', result);

    } catch (error) {
        console.error('Prediction error:', error);
        loadingSpinner.style.display = 'none';
        predictBtn.style.display = 'block';

        const existingTryAgain = document.getElementById('predictTryAgainBtn');
        if (existingTryAgain) existingTryAgain.remove();

        showToast('Failed to connect to server. Check your connection.', 'error');
    }
}

async function savePrediction(prawn, imageData, days, confidence, currentDay = null) {
    try {
        const response = await fetch('/api/save_prediction', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                user_id: currentUserId,
                prawn_id: prawn ? prawn.id : null,
                prawn_name: prawn ? prawn.name : 'Unknown',
                image_path: imageData,
                predicted_days: days,
                current_day: currentDay,
                confidence: confidence
            })
        });
        
        const result = await response.json();
        if (result.success) {
            console.log('Prediction saved to database');
        } else {
            console.error('Failed to save prediction:', result.message);
        }
    } catch (error) {
        console.error('Error saving prediction:', error);
    }
}

// ============================================
// HISTORY - FLASK API
// ============================================

function showHistoryPage() {
    if (!selectedPrawn) {
        showToast('Please select a prawn first', 'error');
        return;
    }

    localStorage.setItem('hatchly_selected_prawn', JSON.stringify(selectedPrawn));
    showPage('historyPage');
}

async function loadPrawnHistory() {
    const logsContainer = document.getElementById('logsContainer');
    logsContainer.innerHTML = '<p style="text-align: center; padding: 40px; color: #666;">Loading...</p>';

    try {
        const response = await fetch(`/api/get_predictions?user_id=${currentUserId}&prawn_id=${selectedPrawn.id}`);
        const result = await response.json();

        if (result.success) {
            const predictions = result.predictions;

            if (predictions.length === 0) {
                logsContainer.innerHTML = '<div class="no-logs">No logs available for this prawn yet.</div>';
                return;
            }

            // PRIORITY 7 — store in cache and render via function
            allLogsCache = predictions;
            await loadHistoryLocationFilter();
            renderHistoryLogs(predictions);
        } else {
            logsContainer.innerHTML = '<div class="no-logs">Failed to load history.</div>';
        }
    } catch (error) {
        console.error('Load history error:', error);
        logsContainer.innerHTML = '<div class="no-logs" style="color: #dc2626;">Error connecting to server.</div>';
    }
}

const LOGS_PER_PAGE = 5;
let currentLogsPage = 1;
let currentFilteredLogs = [];

function renderHistoryLogs(predictions) {
    const logsContainer = document.getElementById('logsContainer');
    if (!logsContainer) return;

    currentFilteredLogs = predictions;
    currentLogsPage = 1;

    if (predictions.length === 0) {
        logsContainer.innerHTML = '<div class="no-logs">No logs found.</div>';
        return;
    }

    logsContainer.innerHTML = '';
    renderLogsBatch(logsContainer, predictions, 1);
}

function renderLogsBatch(container, predictions, page) {
    // Remove existing Load More button if any
    const existingBtn = document.getElementById('loadMoreBtn');
    if (existingBtn) existingBtn.remove();

    const start = (page - 1) * LOGS_PER_PAGE;
    const end = page * LOGS_PER_PAGE;
    const batch = predictions.slice(start, end);

    batch.forEach(log => {
        const logDate = new Date(log.created_at.replace('T', ' '));
        const dateStr = logDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        const timeStr = logDate.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });

        const logItem = document.createElement('div');
        logItem.className = 'log-item';
        logItem.innerHTML = `
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

    // Show log count
    const shown = Math.min(end, predictions.length);
    let countEl = document.getElementById('logsCountText');
    if (!countEl) {
        countEl = document.createElement('p');
        countEl.id = 'logsCountText';
        countEl.style.cssText = 'text-align:center;color:#999;font-size:13px;margin:10px 0 4px;';
        container.parentNode.insertBefore(countEl, container.nextSibling);
    }
    countEl.textContent = `Showing ${shown} of ${predictions.length} logs`;

    // Show Load More button if there are more logs
    if (end < predictions.length) {
        const loadMoreBtn = document.createElement('button');
        loadMoreBtn.id = 'loadMoreBtn';
        loadMoreBtn.className = 'btn btn-outline';
        loadMoreBtn.textContent = `Load More (${predictions.length - end} remaining)`;
        loadMoreBtn.style.cssText = 'max-width:260px;margin:12px auto 0;display:block;font-size:14px;padding:10px;';
        loadMoreBtn.onclick = () => {
            currentLogsPage++;
            renderLogsBatch(container, predictions, currentLogsPage);
        };
        container.parentNode.insertBefore(loadMoreBtn, countEl);
    }
}

async function loadHistoryLocationFilter() {
    // Date filter — no API call needed
}
async function handleInlineAddLocation() {
    const nameInput = document.getElementById('inlineLocationName');
    const name = nameInput.value.trim();
    const err = document.getElementById('inlineLocationError');
    err.classList.remove('show');

    if (!name) {
        err.textContent = 'Please enter a location name';
        err.classList.add('show');
        return;
    }

    try {
        const response = await fetch('/api/save_location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
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

function filterHistoryLogs() {
    const filter = document.getElementById('historyDateFilter')?.value || 'all';
    const logsContainer = document.getElementById('logsContainer');
    if (!logsContainer) return;

    let filtered = allLogsCache;
    if (filter !== 'all') {
        const days = parseInt(filter);
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        filtered = allLogsCache.filter(log => {
            const logDate = new Date(log.created_at.replace('T', ' '));
            return logDate >= cutoff;
        });
    }

    if (filtered.length === 0) {
        logsContainer.innerHTML = '<div class="no-logs">No logs found for this period.</div>';
        return;
    }

    renderHistoryLogs(filtered);
}

// Fix #4: Delete individual log entry
async function deleteLogEntry(predictionId, btnEl) {
    
    showConfirm('Delete this prediction log? This cannot be undone.', async () => {
        try {
            const response = await fetch('/api/delete_prediction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prediction_id: predictionId })
            });
            const result = await response.json();
            if (result.success) {
                const logItem = btnEl.closest('.log-item');
                if (logItem) logItem.remove();
                // Also remove from cache
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
// UTILITY FUNCTIONS
// ============================================

function updateSelectedPrawnInfo() {
    if (selectedPrawn) {
        const nameElement = document.getElementById('selectedPrawnName');
        const locationElement = document.getElementById('selectedPrawnLocation');
        
        const locationText = selectedPrawn.location_name || 'No location';
        
        if (nameElement) {
            nameElement.textContent = selectedPrawn.name;
        }
        if (locationElement) {
            locationElement.textContent = `Location: ${locationText}`;
        }
        
        // Update all displays
        document.querySelectorAll('.selected-prawn-name-display').forEach(el => {
            el.textContent = selectedPrawn.name;
        });
        document.querySelectorAll('.selected-prawn-location-display').forEach(el => {
            el.textContent = `Location: ${locationText}`;
        });
    }
}

// ============================================
// RENAME PRAWN
// ============================================

function showRenamePrawnModal(prawn) {
    if (!prawn) { showToast('No prawn selected', 'error'); return; }
    selectedPrawn = prawn;
    document.getElementById('renamePrawnCurrentName').textContent = prawn.name;
    document.getElementById('renamePrawnInput').value = prawn.name;
    document.getElementById('renamePrawnError').classList.remove('show');
    document.getElementById('renamePrawnModal').style.display = 'block';
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
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prawn_id: selectedPrawn.id, new_name: newName })
        });
        const result = await response.json();
        if (result.success) {
            selectedPrawn.name = newName;
            const nameEl = document.getElementById('selectedPrawnName');
            if (nameEl) nameEl.textContent = newName;
            document.querySelectorAll('.selected-prawn-name-display').forEach(el => el.textContent = newName);
            // PRIORITY 2 — update badge after rename
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

// ============================================
// CHANGE LOCATION (TRANSFER) PRAWN
// ============================================

async function showTransferPrawnModal(prawn) {
    if (!prawn) { showToast('No prawn selected', 'error'); return; }
    selectedPrawn = prawn;
    document.getElementById('transferPrawnName').textContent = prawn.name;
    document.getElementById('transferCurrentLocation').textContent = prawn.location_name || 'No location';
    document.getElementById('transferLocationError').classList.remove('show');
    const select = document.getElementById('transferLocationSelect');
    select.innerHTML = '<option value="">-- Select Location --</option>';
    try {
        const response = await fetch('/api/get_locations');
        const result = await response.json();
        if (result.success) {
            result.locations.forEach(loc => {
                if (String(loc.id) === String(prawn.location_id)) return;
                const option = document.createElement('option');
                option.value = loc.id;
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
    const newLocationId = document.getElementById('transferLocationSelect').value;
    const newLocationName = document.getElementById('transferLocationSelect').selectedOptions[0]?.text;
    document.getElementById('transferLocationError').classList.remove('show');
    if (!newLocationId) {
        document.getElementById('transferLocationError').classList.add('show');
        return;
    }
    try {
        const response = await fetch('/api/transfer_prawn', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prawn_id: selectedPrawn.id, new_location_id: newLocationId })
        });
        const result = await response.json();
        if (result.success) {
            selectedPrawn.location_id = newLocationId;
            selectedPrawn.location_name = newLocationName;
            const locEl = document.getElementById('selectedPrawnLocation');
            if (locEl) locEl.textContent = `Location: ${newLocationName}`;
            document.querySelectorAll('.selected-prawn-location-display').forEach(el => {
                el.textContent = `Location: ${newLocationName}`;
            });
            // PRIORITY 2 — update badge after transfer
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

function toggleForm() {
    const container = document.getElementById('formsContainer');
    container.classList.toggle('signup-mode');
    clearErrors();
}
function showPageWithoutHistory(pageId) {
    // Same as showPage pero hindi nagdadagdag sa history
    history.pushState(null, null, location.href);
    if (pageId === 'registerPrawnPage') {
        setTimeout(() => loadLocationDropdown(), 100);
    }
    if (pageId === 'locationSetupPage') {
        setTimeout(() => loadLocationList(), 100);
    }
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    const rpiStream = document.getElementById('rpiStream');
    if (rpiStream) {
        rpiStream.onerror = null;
        rpiStream.src = '';
        rpiStream.style.display = 'none';
    }

    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    document.getElementById(pageId).classList.add('active');

    if (pageId === 'selectPrawnPage') {
        loadPrawnList();
    } else if (pageId === 'capturePage') {
        updateSelectedPrawnInfo();
        checkCameraStatus();
        resetCameraUI();
        document.getElementById('resultContent').style.display = 'none';
        document.getElementById('predictBtn').style.display = 'block';
        const uploadedImg = document.getElementById('uploadedImage');
        if (uploadedImg) uploadedImg.src = '';
        capturedImageData = null;
        window.lastImageSource = 'camera';
        const oldPredictTryAgain = document.getElementById('predictTryAgainBtn');
        if (oldPredictTryAgain) oldPredictTryAgain.remove();
    } else if (pageId === 'imageSelectionPage') {
        updateSelectedPrawnInfo();
    } else if (pageId === 'predictPage') {
        updateSelectedPrawnInfo();
        if (!capturedImageData) {
            const saved = localStorage.getItem('hatchly_captured_image');
            const savedSource = localStorage.getItem('hatchly_image_source');
            if (saved) {
                capturedImageData = saved;
                window.lastImageSource = savedSource || 'upload';
            }
        }
        if (capturedImageData) {
            document.getElementById('uploadedImage').src = capturedImageData;
        }
        const savedDays = localStorage.getItem('hatchly_prediction_days');
        const savedConf = localStorage.getItem('hatchly_prediction_confidence');
        if (savedDays) {
            document.getElementById('daysResult').textContent = savedDays;
            document.getElementById('confidenceResult').textContent = Number(savedConf).toFixed(1);
            document.getElementById('resultContent').style.display = 'block';
            document.getElementById('predictBtn').style.display = 'none';
            const existingTryAgain = document.getElementById('predictTryAgainBtn');
            if (!existingTryAgain) {
                const tryAgainBtn = document.createElement('button');
                tryAgainBtn.id = 'predictTryAgainBtn';
                tryAgainBtn.className = 'btn btn-outline';
                tryAgainBtn.textContent = 'TRY AGAIN';
                tryAgainBtn.onclick = function() {
                    document.getElementById('resultContent').style.display = 'none';
                    document.getElementById('uploadedImage').src = '';
                    capturedImageData = null;
                    this.remove();
                    const oldPredictBtn = document.getElementById('predictBtn');
                    if (oldPredictBtn) oldPredictBtn.style.display = 'block';
                    if (window.lastImageSource === 'upload') {
                        showPage('imageSelectionPage');
                        setTimeout(() => triggerFileUpload(), 100);
                    } else {
                        showPage('capturePage');
                    }
                };
                const predictBtn = document.getElementById('predictBtn');
                predictBtn.parentNode.insertBefore(tryAgainBtn, predictBtn);
            }
        }
    } else if (pageId === 'historyPage') {
        updateSelectedPrawnInfo();
        if (selectedPrawn) {
            document.getElementById('prawnNameTitle').textContent = `"${selectedPrawn.name}"`;
            loadPrawnHistory();
        }
    } else if (pageId === 'dashboardPage') {
        loadDashboard();
    }

    document.querySelectorAll('.menu-dropdown').forEach(dropdown => {
        dropdown.classList.remove('show');
    });

    updateUserName();
}

function showPage(pageId) {
    // Save current page (except authPage)
    history.pushState(null, null, location.href);
    if (navigationHistory[navigationHistory.length - 1] !== pageId) {
        navigationHistory.push(pageId);
    }
    if (currentUser && pageId !== 'authPage') {
        localStorage.setItem('hatchly_current_page', pageId);
    }
    
    if (pageId === 'registerPrawnPage') {
        setTimeout(() => loadLocationDropdown(), 100);
    }
    if (pageId === 'locationSetupPage') {
        setTimeout(() => loadLocationList(), 100);
    }
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    const rpiStream = document.getElementById('rpiStream');
    if (rpiStream) {
        rpiStream.src = '';
        rpiStream.style.display = 'none';
    }

    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    document.getElementById(pageId).classList.add('active');

    if (pageId === 'selectPrawnPage') {
        loadPrawnList();
    } else if (pageId === 'capturePage') {
        updateSelectedPrawnInfo(); 
        checkCameraStatus();
        resetCameraUI();

        // Reset predict page state completely
        capturedImageData = null;
        window.lastImageSource = 'camera';
        localStorage.removeItem('hatchly_captured_image');
        localStorage.removeItem('hatchly_image_source');
        localStorage.removeItem('hatchly_prediction_days');
        localStorage.removeItem('hatchly_prediction_confidence');

        const uploadedImg = document.getElementById('uploadedImage');
        const resultContent = document.getElementById('resultContent');
        const predictBtn = document.getElementById('predictBtn');
        const loadingSpinner = document.getElementById('loadingSpinner');
        const oldPredictTryAgain = document.getElementById('predictTryAgainBtn');

        if (uploadedImg) uploadedImg.src = '';
        if (resultContent) resultContent.style.display = 'none';
        if (predictBtn) predictBtn.style.display = 'block';
        if (loadingSpinner) loadingSpinner.style.display = 'none';
        if (oldPredictTryAgain) oldPredictTryAgain.remove();
    } else if (pageId === 'imageSelectionPage') {
        updateSelectedPrawnInfo();
    } else if (pageId === 'predictPage') {
        updateSelectedPrawnInfo();
        if (!capturedImageData) {
            const saved = localStorage.getItem('hatchly_captured_image');
            const savedSource = localStorage.getItem('hatchly_image_source');
            if (saved) {
                capturedImageData = saved;
                window.lastImageSource = savedSource || 'upload';
            }
        }
        if (capturedImageData) {
            document.getElementById('uploadedImage').src = capturedImageData;
        }
        const savedDays = localStorage.getItem('hatchly_prediction_days');
        const savedConf = localStorage.getItem('hatchly_prediction_confidence');
        if (savedDays) {
            document.getElementById('daysResult').textContent = savedDays;
            document.getElementById('confidenceResult').textContent = Number(savedConf).toFixed(1);
            document.getElementById('resultContent').style.display = 'block';
            document.getElementById('predictBtn').style.display = 'none';
            const existingTryAgain = document.getElementById('predictTryAgainBtn');
            if (!existingTryAgain) {
                const tryAgainBtn = document.createElement('button');
                tryAgainBtn.id = 'predictTryAgainBtn';
                tryAgainBtn.className = 'btn btn-outline';
                tryAgainBtn.textContent = 'TRY AGAIN';
                tryAgainBtn.onclick = function() {
                    document.getElementById('resultContent').style.display = 'none';
                    document.getElementById('uploadedImage').src = '';
                    capturedImageData = null;
                    this.remove();
                    const oldPredictBtn = document.getElementById('predictBtn');
                    if (oldPredictBtn) oldPredictBtn.style.display = 'block';
                    if (window.lastImageSource === 'upload') {
                        showPage('imageSelectionPage');
                        setTimeout(() => triggerFileUpload(), 100);
                    } else {
                        showPage('capturePage');
                    }
                };
                const predictBtn = document.getElementById('predictBtn');
                predictBtn.parentNode.insertBefore(tryAgainBtn, predictBtn);
            }
        }
    } else if (pageId === 'historyPage') {
        updateSelectedPrawnInfo();
        if (selectedPrawn) {
            document.getElementById('prawnNameTitle').textContent = `"${selectedPrawn.name}"`;
            loadPrawnHistory();
        } else {
            // No prawn selected, redirect to select page
            showPage('selectPrawnPage');
            return;
        }
    } else if (pageId === 'dashboardPage') {
        loadDashboard();
    }
   
    document.querySelectorAll('.menu-dropdown').forEach(dropdown => {
        dropdown.classList.remove('show');
    });
    
    updateUserName();
}
function shakeInput(inputEl) {
    if (!inputEl) return;
    const parent = inputEl.closest('.form-group') || inputEl.parentElement?.parentElement;
    if (!parent) return;
    const errorEl = parent.querySelector('.error.show');
    if (!errorEl) return;

    const keyframes = [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-8px)' },
        { transform: 'translateX(8px)' },
        { transform: 'translateX(-5px)' },
        { transform: 'translateX(5px)' },
        { transform: 'translateX(0)' }
    ];
    errorEl.animate(keyframes, { duration: 400, easing: 'ease' });
}

function clearErrors() {
    document.querySelectorAll('.error').forEach(error => {
        error.classList.remove('show');
    });
    document.querySelectorAll('input').forEach(input => {
        input.classList.remove('error-input');
    });
}

function togglePasswordVisibility(inputId, toggleBtn) {
    const input = document.getElementById(inputId);
    if (input.type === 'password') {
        input.type = 'text';
        toggleBtn.textContent = 'Hide';
    } else {
        input.type = 'password';
        toggleBtn.textContent = 'Show';
    }
}

function parseFlexibleDate(dateStr) {
    const cleaned = dateStr.trim();
    
    const formats = [
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
        /^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/,
        /^(\d{4})-(\d{2})-(\d{2})$/
    ];

    for (let format of formats) {
        const match = cleaned.match(format);
        if (match) {
            if (format === formats[0]) {
                const [, month, day, year] = match;
                return new Date(year, month - 1, day);
            } else if (format === formats[1]) {
                return new Date(cleaned);
            } else if (format === formats[2]) {
                const [, year, month, day] = match;
                return new Date(year, month - 1, day);
            }
        }
    }
    
    return null;
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// ============================================
// CAMERA FUNCTIONS
// ============================================

// Fix #5: Reset camera UI to placeholder state when entering capture page
function resetCameraUI() {
    usingRPiCamera = false;
    imageCaptured = false;

    const cameraPlaceholder = document.getElementById('cameraPlaceholder');
    const cameraLoading = document.getElementById('cameraLoading');
    const video = document.getElementById('video');
    const capturedImage = document.getElementById('capturedImage');
    const rpiStream = document.getElementById('rpiStream');

    if (cameraPlaceholder) cameraPlaceholder.style.display = 'flex';
    if (cameraLoading) cameraLoading.style.display = 'none';
    if (video) { video.style.display = 'none'; video.srcObject = null; }
    if (capturedImage) { capturedImage.src = ''; capturedImage.style.display = 'none'; }
    if (rpiStream) { rpiStream.src = ''; rpiStream.style.display = 'none'; }

    document.getElementById('captureBtn').textContent = 'CAPTURE';

    const oldTryAgain = document.getElementById('tryAgainCaptureBtn');
    if (oldTryAgain) oldTryAgain.remove();
}

async function startCamera() {
    // Fix #6: Show loading indicator while camera starts
    document.getElementById('cameraPlaceholder').style.display = 'none';
    document.getElementById('cameraLoading').style.display = 'flex';
    document.getElementById('video').style.display = 'none';

    try {
        videoStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment' } 
        });
        const video = document.getElementById('video');
        video.srcObject = videoStream;

        document.getElementById('cameraLoading').style.display = 'none';
        video.style.display = 'block';
        document.getElementById('capturedImage').style.display = 'none';
        document.getElementById('captureBtn').textContent = 'CAPTURE';
    } catch (err) {
        document.getElementById('cameraLoading').style.display = 'none';
        document.getElementById('cameraPlaceholder').style.display = 'flex';
        showToast('Camera access denied or not available', 'error');
        console.error('Camera error:', err);
    }
}

// Track whether we've already captured an image (vs. live feed showing)
function captureImage() { withNavLock(_captureImage); }
function _captureImage() {
    const captureBtn = document.getElementById('captureBtn');

    if (usingRPiCamera) {
        if (!imageCaptured) {
            captureFromRPi();
        } else {
            document.getElementById('uploadedImage').src = capturedImageData;
            showPage('predictPage');
        }
        return;
    }

    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');

    if (!imageCaptured) {
        if (!videoStream) {
            showToast('No camera detected. Please select a camera source first.', 'warning');
            return;
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        capturedImageData = canvas.toDataURL('image/jpeg');
        window.lastImageSource = 'camera';

        if (videoStream) {
            videoStream.getTracks().forEach(track => track.stop());
            videoStream = null;
        }
        video.style.display = 'none';

        const capturedImage = document.getElementById('capturedImage');
        capturedImage.src = capturedImageData;
        capturedImage.style.display = 'block';

        imageCaptured = true;
        captureBtn.textContent = 'USE THIS IMAGE';

        let tryAgainCaptureBtn = document.getElementById('tryAgainCaptureBtn');
        if (!tryAgainCaptureBtn) {
            tryAgainCaptureBtn = document.createElement('button');
            tryAgainCaptureBtn.id = 'tryAgainCaptureBtn';
            tryAgainCaptureBtn.className = 'btn btn-outline';
            tryAgainCaptureBtn.textContent = 'TRY AGAIN';
            tryAgainCaptureBtn.style.margin = '10px auto';
            tryAgainCaptureBtn.style.display = 'block';
            tryAgainCaptureBtn.style.width = 'auto';
            tryAgainCaptureBtn.style.minWidth = '160px';
            tryAgainCaptureBtn.style.padding = '12px 30px';
            tryAgainCaptureBtn.onclick = function() {
                clearCapturePreview();
                if (usingRPiCamera) { startRPiCamera(); } else { startCamera(); }
            };
            captureBtn.parentElement.parentElement.insertBefore(tryAgainCaptureBtn, captureBtn.parentElement.nextSibling);
        }
    } else {
        document.getElementById('uploadedImage').src = capturedImageData;
        showPage('predictPage');
    }
}

function triggerFileUpload() {
    const fileInput = document.getElementById('fileInput');
    fileInput.value = ''; // Clear previous file selection
    fileInput.click();
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            capturedImageData = e.target.result;
            localStorage.setItem('hatchly_captured_image', capturedImageData);
            localStorage.setItem('hatchly_image_source', 'upload');
            document.getElementById('uploadedImage').src = capturedImageData;
            window.lastImageSource = 'upload';
            showPage('predictPage');
        };
        reader.readAsDataURL(file);
    }
}

function tryAgain() { withNavLock(_tryAgain); }
function _tryAgain() {
    capturedImageData = null;
    localStorage.removeItem('hatchly_captured_image');
    localStorage.removeItem('hatchly_image_source');
    localStorage.removeItem('hatchly_prediction_days');
    localStorage.removeItem('hatchly_prediction_confidence');

    // Reset predict page UI
    const resultContent = document.getElementById('resultContent');
    const predictBtn = document.getElementById('predictBtn');
    const uploadedImage = document.getElementById('uploadedImage');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const oldPredictTryAgain = document.getElementById('predictTryAgainBtn');

    if (resultContent) resultContent.style.display = 'none';
    if (predictBtn) predictBtn.style.display = 'block';
    if (uploadedImage) uploadedImage.src = '';
    if (loadingSpinner) loadingSpinner.style.display = 'none';
    if (oldPredictTryAgain) oldPredictTryAgain.remove();

    showPage('imageSelectionPage');
}

function openImageModal(imageSrc) {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    modal.style.display = 'block';
    modalImg.src = imageSrc;
}

function closeImageModal() {
    document.getElementById('imageModal').style.display = 'none';
}

document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeImageModal();
    }
});

// ============================================
// DASHBOARD FUNCTIONS
// ============================================

let dashboardCache = null;

async function loadDashboard() {
    showDashboardLoading(true);
    try {
        const response = await fetch('/api/get_dashboard_data');
        const result = await response.json();
        
        if (!result.success) {
            showToast('Failed to load dashboard data.', 'error');
            showDashboardLoading(false);
            return;
        }
        
        dashboardCache = result;
        
        // Update stats
        document.getElementById('totalPrawns').textContent = result.total_prawns;
        document.getElementById('totalPredictions').textContent = result.total_predictions;
        document.getElementById('upcomingHatches').textContent = result.upcoming_count;
        
        // Render sections
        renderUpcomingHatches(result.upcoming_hatches, result.total_prawns);
        renderLatestPredictions(result.latest_predictions);
        renderLocationPieChart(result.prawns);
        
    } catch (error) {
        console.error('Dashboard load error:', error);
        showToast('Error loading dashboard.', 'error');
    }
    showDashboardLoading(false);
}

function showDashboardLoading(show) {
    const upcomingEl = document.getElementById('upcomingHatchesList');
    const latestEl = document.getElementById('latestPredictionsList');

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

        document.getElementById('totalPrawns').textContent = '...';
        document.getElementById('totalPredictions').textContent = '...';
        document.getElementById('upcomingHatches').textContent = '...';
    }
}

function renderUpcomingHatches(hatchAlerts, totalPrawns) {
    const container = document.getElementById('upcomingHatchesList');
    
    if (totalPrawns === 0) {
        container.innerHTML = `
            <div class="no-data-message">
                <h3>No prawns registered yet</h3>
                <p>Register your first prawn to start tracking!</p>
                <button class="btn btn-outline" onclick="showPage('registerPrawnPage')" 
                    style="margin-top:16px;max-width:220px;">
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
        const urgentClass = alert.days <= 3 ? 'urgent' : '';
        const alertDiv = document.createElement('div');
        alertDiv.className = `hatch-alert ${urgentClass}`;
        alertDiv.innerHTML = `
            <div class="hatch-days">${alert.days}<br><small>days</small></div>
            <div class="hatch-info">
                <h3>${alert.prawn.name}</h3>
                <p>Expected: ${calculateHatchDate(alert.days)}</p>
                <p>Confidence: ${alert.prediction.confidence !== null ? 
                    Number(alert.prediction.confidence).toFixed(1) : 'N/A'}%</p>
            </div>
            <button class="hatch-view-btn" onclick="viewPrawnDetails(${JSON.stringify(alert.prawn).replace(/"/g, '&quot;')})">
                View
            </button>
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
        const dateStr = predDate.toLocaleDateString('en-US', { 
            month: 'short', day: 'numeric', year: 'numeric'
        });
        
        const card = document.createElement('div');
        card.className = 'prediction-card';
        card.onclick = () => {
            const prawn = dashboardCache.prawns.find(p => p.id === item.prawn_id);
            if (prawn) {
                selectPrawnForImage(prawn);
                showHistoryPage();
            }
        };
        
        card.innerHTML = `
            <img src="/static/${item.image_path}" 
                alt="Prawn prediction" 
                class="prediction-image"
                onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'200\\' height=\\'200\\'%3E%3Crect fill=\\'%23ddd\\' width=\\'200\\' height=\\'200\\'/%3E%3Ctext x=\\'50%25\\' y=\\'50%25\\' text-anchor=\\'middle\\' fill=\\'%23999\\' font-size=\\'14\\'%3ENo Image%3C/text%3E%3C/svg%3E'">
            <div class="prediction-details">
                <h4>${item.prawn_name}</h4>
                <p class="prediction-result-text">${item.predicted_days} days</p>
                <p>Confidence: ${item.confidence !== null ? 
                    Number(item.confidence).toFixed(1) : 'N/A'}%</p>
                <p class="prediction-date">${dateStr}</p>
            </div>
        `;
        container.appendChild(card);
    });
}

function calculateHatchDate(daysUntilHatch) {
    const today = new Date();
    const hatchDate = new Date(today);
    hatchDate.setDate(today.getDate() + daysUntilHatch);
    
    return hatchDate.toLocaleDateString('en-US', { 
        month: 'long', 
        day: 'numeric',
        year: 'numeric'
    });
}

function viewPrawnDetails(prawn) {
    selectedPrawn = prawn;
    showPage('imageSelectionPage');
}

// ============================================
// RASPBERRY PI CAMERA FUNCTIONS
// ============================================

async function checkCameraStatus() {
    console.log('🔍 Checking RPi camera status...');
    try {
        const response = await fetch('/api/camera/status', { timeout: 3000 });
        const result = await response.json();
        
        console.log('📡 Camera status:', result);
        
        if (result.success && result.camera_online) {
            cameraStreamUrl = result.camera_url;
            console.log('✅ RPi camera is online');
            return true;
        } else {
            console.log('⚠️ RPi camera is offline');
            return false;
        }
    } catch (error) {
        console.error('❌ Camera status check failed:', error);
        return false;
    }
}
function clearCapturePreview() {
    imageCaptured = false;
    capturedImageData = null;
    const previewImage = document.getElementById('previewImage');
    const previewPlaceholder = document.getElementById('previewPlaceholder');

    if (previewImage) { previewImage.src = ''; previewImage.style.display = 'none'; }
    if (previewPlaceholder) previewPlaceholder.style.display = 'flex';
    document.getElementById('capturedImage').style.display = 'none';
    document.getElementById('captureBtn').textContent = 'CAPTURE';
    const oldTryAgain = document.getElementById('tryAgainCaptureBtn');
    if (oldTryAgain) oldTryAgain.remove();
}

function switchToLocalCamera() {
    usingRPiCamera = false;
    clearCapturePreview();

    document.getElementById('cameraPlaceholder').style.display = 'none';
    document.getElementById('rpiStream').style.display = 'none';
    document.getElementById('capturedImage').style.display = 'none';

    document.getElementById('useLocalCamera').classList.add('active-camera');
    document.getElementById('useRPiCamera').classList.remove('active-camera');

    startCamera();

    console.log('📱 Switched to local camera');
}

async function switchToRPiCamera() {
    console.log('🎥 Attempting to switch to RPi camera...');
    
    const isAvailable = await checkCameraStatus();
    
    if (!isAvailable) {
        showToast('RPi camera is offline. Check connection and try again.', 'error');
        return;
    }
    
    usingRPiCamera = true;
    clearCapturePreview();
    
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }

    document.getElementById('cameraPlaceholder').style.display = 'none';
    document.getElementById('cameraLoading').style.display = 'flex';
    document.getElementById('video').style.display = 'none';
    document.getElementById('capturedImage').style.display = 'none';

    document.getElementById('useRPiCamera').classList.add('active-camera');
    document.getElementById('useLocalCamera').classList.remove('active-camera');
    
    startRPiCamera();
    
    console.log('✅ Switched to RPi camera');
}

function startRPiCamera() {
    const rpiStream = document.getElementById('rpiStream');
    
    rpiStream.onload = function() {
        document.getElementById('cameraLoading').style.display = 'none';
        rpiStream.style.display = 'block';
    };

    rpiStream.onerror = function() {
        console.error('❌ Failed to load RPi camera stream');
        document.getElementById('cameraLoading').style.display = 'none';
        document.getElementById('cameraPlaceholder').style.display = 'flex';
        showToast('Cannot load RPi camera stream. Check your connection.', 'error');
        switchToLocalCamera();
    };
    
    rpiStream.src = '/api/camera/stream?' + new Date().getTime();
    document.getElementById('captureBtn').textContent = 'CAPTURE';
    
    console.log('📹 Loading RPi camera stream...');
}
async function captureFromRPi() {
    const rpiStreamEl = document.getElementById('rpiStream');
    if (rpiStreamEl) rpiStreamEl.onerror = null;
    
    try {
        console.log('📸 Capturing from RPi...');
        
        const response = await fetch('/api/camera/capture');
        const result = await response.json();
        
        if (result.success) {
            capturedImageData = result.image;
            window.lastImageSource = 'camera';
            
            const capturedImg = document.getElementById('capturedImage');
            const rpiStream = document.getElementById('rpiStream');
            if (rpiStream) {
                rpiStream.src = '';
                rpiStream.style.display = 'none';
            }
            if (capturedImg) {
                capturedImg.src = capturedImageData;
                capturedImg.style.display = 'block';
            }
            

            imageCaptured = true;
            const captureBtn = document.getElementById('captureBtn');
            captureBtn.textContent = 'USE THIS IMAGE';

            let tryAgainCaptureBtn = document.getElementById('tryAgainCaptureBtn');
            if (!tryAgainCaptureBtn) {
                tryAgainCaptureBtn = document.createElement('button');
                tryAgainCaptureBtn.id = 'tryAgainCaptureBtn';
                tryAgainCaptureBtn.className = 'btn btn-outline';
                tryAgainCaptureBtn.textContent = 'TRY AGAIN';
                tryAgainCaptureBtn.style.margin = '10px auto';
                tryAgainCaptureBtn.style.display = 'block';
                tryAgainCaptureBtn.style.width = 'auto';
                tryAgainCaptureBtn.style.minWidth = '160px';
                tryAgainCaptureBtn.style.padding = '12px 30px';
                tryAgainCaptureBtn.onclick = function() {
                    clearCapturePreview();
                    startRPiCamera();
                };
                captureBtn.parentElement.parentElement.insertBefore(tryAgainCaptureBtn, captureBtn.parentElement.nextSibling);
            }
            
            console.log('✅ Captured from RPi successfully!');
        } else {
            showToast(result.error || 'Unable to capture image from RPi camera.', 'error');
            console.error('❌ Capture failed:', result.error);
        }
    } catch (error) {
        console.error('❌ RPi capture error:', error);
        showToast('Failed to capture from RPi camera. ' + error.message, 'error');
    }
}


// ============================================
// LOCATION MANAGEMENT
// ============================================
function goBackFromLocationSetup() {
    const prevPage = navigationHistory[navigationHistory.length - 2];
    if (prevPage === 'registerPrawnPage') {
        showPage('registerPrawnPage');
    } else {
        showPage('dashboardPage');
    }
}
async function loadLocationDropdown() {
    const select = document.getElementById('prawnLocation');
    if (!select) return;
    try {
        const response = await fetch('/api/get_locations');
        const result = await response.json();
        select.innerHTML = '<option value="">-- Select Location --</option>';
        if (result.success && result.locations.length > 0) {
            result.locations.forEach(loc => {
                const option = document.createElement('option');
                option.value = loc.id;
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
    container.innerHTML = '<p style="text-align: center; color: #666;">Loading...</p>';
    try {
        const response = await fetch('/api/get_locations');
        const result = await response.json();
        if (result.success) {
            if (result.locations.length === 0) {
                container.innerHTML = '<div class="no-prawns">No locations added yet.</div>';
                return;
            }
            container.innerHTML = '';
            result.locations.forEach(loc => {
                const item = document.createElement('div');
                item.className = 'location-item';
                item.innerHTML = `
                    <span class="location-name">📍 ${loc.name}</span>
                    <div class="location-actions">
                        <button class="btn-icon" onclick="showRenameModal(${loc.id}, '${loc.name.replace(/'/g, "\'")}')">✏️</button>
                        <button class="btn-icon btn-delete-icon" onclick="handleDeleteLocation(${loc.id}, '${loc.name.replace(/'/g, "\'")}')">🗑️</button>
                    </div>
                `;
                container.appendChild(item);
            });
        }
    } catch (error) {
        console.error('Load location list error:', error);
        container.innerHTML = '<div class="no-prawns" style="color: #dc2626;">Error loading locations.</div>';
    }
}

async function handleAddLocation() {
    const nameInput = document.getElementById('newLocationName');
    const name = nameInput.value.trim();
    document.getElementById('locationNameError').classList.remove('show');
    
    if (!name) {
        document.getElementById('locationNameError').classList.add('show');
        return;
    }
    
    try {
        const response = await fetch('/api/save_location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
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
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ location_id: renamingLocationId, new_name: newName })
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

async function handleDeleteLocation(locationId, locationName) {
    try {
        const response = await fetch(`/api/get_prawns?user_id=${currentUserId}`);
        const result = await response.json();

        let affectedPrawns = [];
        if (result.success) {
            affectedPrawns = result.prawns.filter(p => String(p.location_id) === String(locationId));
        }

        // No prawns — just delete directly
        if (affectedPrawns.length === 0) {
            showConfirm(`Delete location "${locationName}"?`, async () => {
                try {
                    const delResponse = await fetch('/api/delete_location', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ location_id: locationId })
                    });
                    const delResult = await delResponse.json();
                    if (delResult.success) {
                        loadLocationList();
                        showToast('Location deleted.', 'success');
                    } else {
                        showToast(delResult.message || 'Failed to delete location.', 'error');
                    }
                } catch (error) {
                    showToast('Cannot connect to server.', 'error');
                }
            }, 'error');
            return;
        }

        // Has prawns — show reassign modal
        deletingLocationId = locationId;
        deletingLocationName = locationName;

        document.getElementById('reassignPrawnCount').textContent = affectedPrawns.length;
        document.getElementById('reassignLocationError').classList.remove('show');

        // Load other locations
        const select = document.getElementById('reassignLocationSelect');
        select.innerHTML = '<option value="">-- Select Location --</option>';
        try {
            const locResponse = await fetch('/api/get_locations');
            const locResult = await locResponse.json();
            if (locResult.success) {
                locResult.locations
                    .filter(loc => String(loc.id) !== String(locationId))
                    .forEach(loc => {
                        const option = document.createElement('option');
                        option.value = loc.id;
                        option.textContent = loc.name;
                        select.appendChild(option);
                    });
            }
        } catch (e) {
            console.error('Load locations error:', e);
        }

        document.getElementById('reassignLocationModal').style.display = 'block';

    } catch (error) {
        showToast('Cannot connect to server.', 'error');
    }
}

function closeReassignModal(event) {
    if (event) event.stopPropagation();
    document.getElementById('reassignLocationModal').style.display = 'none';
    deletingLocationId = null;
    deletingLocationName = null;
}

async function confirmReassignAndDelete() {
    const newLocationId = document.getElementById('reassignLocationSelect').value;
    const err = document.getElementById('reassignLocationError');
    err.classList.remove('show');

    if (!newLocationId) {
        err.classList.add('show');
        return;
    }

    try {
        // Get all prawns in this location
        const response = await fetch(`/api/get_prawns?user_id=${currentUserId}`);
        const result = await response.json();
        const affectedPrawns = result.prawns.filter(p => String(p.location_id) === String(deletingLocationId));

        // Transfer all prawns
        for (const prawn of affectedPrawns) {
            await fetch('/api/transfer_prawn', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prawn_id: prawn.id, new_location_id: newLocationId })
            });
        }

        // Delete location
        const delResponse = await fetch('/api/delete_location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ location_id: deletingLocationId })
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
// ENTER KEY SUBMIT
// ============================================
function showConfirm(message, onConfirm, type = 'warning') {
    const existing = document.getElementById('hatchlyConfirm');
    if (existing) existing.remove();

    const icons = { warning: '⚠️', error: '❌', info: 'ℹ️' };
    const colors = { warning: '#d97706', error: '#dc2626', info: '#0891b2' };

    const overlay = document.createElement('div');
    overlay.id = 'hatchlyConfirm';
    overlay.style.cssText = `
        position:fixed;inset:0;z-index:9999998;
        background:rgba(0,0,0,0.5);
        display:flex;align-items:center;justify-content:center;
        padding:16px;
        backdrop-filter:blur(3px);
    `;

    overlay.innerHTML = `
        <div style="
            background:#fff;
            border-radius:16px;
            padding:24px 20px 20px;
            max-width:320px;
            width:100%;
            box-shadow:0 20px 60px rgba(0,0,0,0.25);
            border-left:4px solid ${colors[type]};
            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
            animation:confirmSlideIn 0.25s cubic-bezier(0.34,1.56,0.64,1);
        ">
            <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:20px;">
                <span style="font-size:22px;flex-shrink:0;">${icons[type]}</span>
                <p style="font-size:14px;color:#333;line-height:1.6;margin:0;font-weight:500;">${message.replace(/\n/g, '<br>')}</p>
            </div>
            <div style="display:flex;gap:10px;">
                <button id="confirmCancel" style="
                    flex:1;padding:10px;border-radius:10px;
                    background:#f3f4f6;color:#555;
                    border:2px solid #e5e7eb;
                    font-size:14px;font-weight:600;cursor:pointer;
                    transition:all 0.2s;
                ">Cancel</button>
                <button id="confirmOk" style="
                    flex:1;padding:10px;border-radius:10px;
                    background:${colors[type]};color:#fff;
                    border:2px solid ${colors[type]};
                    font-size:14px;font-weight:600;cursor:pointer;
                    transition:all 0.2s;
                ">Delete</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    if (!document.getElementById('confirmStyles')) {
        const style = document.createElement('style');
        style.id = 'confirmStyles';
        style.textContent = `
            @keyframes confirmSlideIn {
                from { opacity:0; transform:scale(0.85) translateY(20px); }
                to   { opacity:1; transform:scale(1) translateY(0); }
            }
        `;
        document.head.appendChild(style);
    }

    document.getElementById('confirmOk').onclick = () => {
        overlay.remove();
        onConfirm();
    };

    document.getElementById('confirmCancel').onclick = () => overlay.remove();

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
}
function showToast(message, type = 'success') {
    const existing = document.getElementById('hatchlyToast');
    if (existing) existing.remove();

    const icons = {
        success: '✅',
        error:   '❌',
        warning: '⚠️',
        info:    'ℹ️'
    };

    const titles = {
        success: 'Success',
        error:   'Error',
        warning: 'Warning',
        info:    'Info'
    };

    const toast = document.createElement('div');
    toast.id = 'hatchlyToast';
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

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            toast.classList.add('toast-show');
        });
    });

    setTimeout(() => {
        if (toast.parentNode) {
            toast.style.opacity = '0';
            toast.style.top = '-120px';
            setTimeout(() => toast.remove(), 400);
        }
    }, 3000);
}

document.addEventListener('DOMContentLoaded', function() {
    // Check login status on page load
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    checkLoginStatus();

    // Login form - Enter key
    const loginEmail = document.getElementById('loginEmail');
    const loginPassword = document.getElementById('loginPassword');
    
    if (loginEmail) {
        loginEmail.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') handleLogin();
        });
    }
    
    if (loginPassword) {
        loginPassword.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') handleLogin();
        });
    }
    
    // Signup form - Enter key
    const signupName = document.getElementById('signupName');
    const signupEmail = document.getElementById('signupEmail');
    const signupPassword = document.getElementById('signupPassword');
    
   if (signupName) {
        signupName.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') handleSignup();
        });
        signupName.addEventListener('input', function() {
            const val = this.value;
            const err = document.getElementById('signupNameError');
            if (!val.trim()) {
                err.classList.remove('show');
                this.classList.remove('error-input');
            } else if (!/^[a-zA-ZÀ-ÖØ-öø-ÿ\s\-']+$/.test(val.trim())) {
                err.textContent = 'Invalid character — letters only';
                err.classList.add('show');
                this.classList.add('error-input');
            } else if (val.length > 30) {
                err.textContent = 'Too long — max 30 characters';
                err.classList.add('show');
                this.classList.add('error-input');
            } else {
                err.classList.remove('show');
                this.classList.remove('error-input');
            }
        });
    }
    
    if (signupEmail) {
        signupEmail.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') handleSignup();
        });
        signupEmail.addEventListener('input', function() {
            const val = this.value;
            const err = document.getElementById('signupEmailError');
            if (!val.trim()) {
                err.classList.remove('show');
                this.classList.remove('error-input');
            } else if (!/^[a-zA-Z0-9_.]+$/.test(val)) {
                err.textContent = 'Only letters, numbers, _ and . allowed';
                err.classList.add('show');
                this.classList.add('error-input');
            } else if (val.length > 15) {
                err.textContent = 'Too long — max 15 characters';
                err.classList.add('show');
                this.classList.add('error-input');
            } else {
                err.classList.remove('show');
                this.classList.remove('error-input');
            }
        });
    }
    
    if (signupPassword) {
        signupPassword.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') handleSignup();
        });
        signupPassword.addEventListener('input', function() {
            const val = this.value;
            const err = document.getElementById('signupPasswordError');
            if (!val) {
                err.classList.remove('show');
                this.classList.remove('error-input');
            } else if (val.length > 15) {
                err.textContent = 'Too long — max 15 characters';
                err.classList.add('show');
                this.classList.add('error-input');
            } else {
                err.classList.remove('show');
                this.classList.remove('error-input');
            }
        });
    }
    
    if (signupEmail) {
        signupEmail.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') handleSignup();
        });
    }
    
    if (signupPassword) {
        signupPassword.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') handleSignup();
        });
    }

    const signupConfirmPassword = document.getElementById('signupConfirmPassword');
    if (signupConfirmPassword) {
        signupConfirmPassword.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') handleSignup();
        });
        signupConfirmPassword.addEventListener('input', function() {
            const val = this.value;
            const password = document.getElementById('signupPassword').value;
            const err = document.getElementById('signupConfirmPasswordError');
            if (!val) {
                err.classList.remove('show');
                this.classList.remove('error-input');
            } else if (val.length > 15) {
                err.textContent = 'Password must be 15 characters or less';
                err.classList.add('show');
                this.classList.add('error-input');
            } else if (val !== password) {
                err.classList.remove('show');
                this.classList.remove('error-input');
            } else {
                err.classList.remove('show');
                this.classList.remove('error-input');
            }
        });

        // Re-validate confirm when password field changes
        document.getElementById('signupPassword').addEventListener('input', function() {
            const confirmVal = signupConfirmPassword.value;
            if (!confirmVal) return;
            const err = document.getElementById('signupConfirmPasswordError');
            if (confirmVal !== this.value) {
                err.classList.remove('show');
                signupConfirmPassword.classList.remove('error-input');
            } else {
                err.classList.remove('show');
                signupConfirmPassword.classList.remove('error-input');
            }
        });
    }

    // Change password - Enter key
    const currentPassword = document.getElementById('currentPassword');
    const newPassword = document.getElementById('newPassword');
    const confirmPassword = document.getElementById('confirmPassword');
    [currentPassword, newPassword, confirmPassword].forEach(el => {
        if (el) el.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') handleChangePassword();
        });
    });

    // Rename prawn - Enter key
    const renamePrawnInput = document.getElementById('renamePrawnInput');
    if (renamePrawnInput) renamePrawnInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') confirmRenamePrawn();
    });

    // Transfer prawn - Enter key
    const transferLocationSelect = document.getElementById('transferLocationSelect');
    if (transferLocationSelect) transferLocationSelect.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') confirmTransferPrawn();
    });

    // Delete prawn - Enter key
    const deleteConfirmPassword = document.getElementById('deleteConfirmPassword');
    if (deleteConfirmPassword) deleteConfirmPassword.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') confirmDeletePrawn();
    });

    // Rename location - Enter key
    const renameLocationInput = document.getElementById('renameLocationInput');
    if (renameLocationInput) renameLocationInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') confirmRenameLocation();
    });

    // Add location - Enter key
    const newLocationName = document.getElementById('newLocationName');
    if (newLocationName) newLocationName.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') handleAddLocation();
    });

    // Register prawn - Enter key
    const prawnName = document.getElementById('prawnName');
    if (prawnName) prawnName.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') handleSavePrawn();
    });
});
// ============================================
// PIE CHART FOR LOCATIONS
// ============================================

// Helper: lighten a hex color by amount (0-255)
function lightenColor(hex, amount) {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, (num >> 16) + amount);
    const g = Math.min(255, ((num >> 8) & 0xff) + amount);
    const b = Math.min(255, (num & 0xff) + amount);
    return `rgb(${r},${g},${b})`;
}

function renderLocationPieChart(prawns) {
    const canvas = document.getElementById('locationPieChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const containerWidth = canvas.parentElement?.clientWidth || 300;
    const size = Math.min(containerWidth - 20, 300);
    canvas.width = size;
    canvas.height = size;

    if (!prawns || prawns.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.style.display = 'none';
        const legend = document.getElementById('pieChartLegend');
        if (legend) legend.innerHTML = `
            <div class="pie-empty-state">
                <div class="pie-empty-icon">🦐</div>
                <h3>No prawns registered yet</h3>
                <p>Register your first prawn to see location distribution!</p>
                <button class="btn btn-outline" 
                    onclick="showPage('registerPrawnPage')"
                    style="max-width:200px;margin:12px auto 0;font-size:13px;padding:10px;">
                    + Register First Prawn
                </button>
            </div>`;
        return;
    }

    // Count prawns per location
    const locationCounts = {};
    prawns.forEach(prawn => {
        const loc = prawn.location_name || 'No Location';
        locationCounts[loc] = (locationCounts[loc] || 0) + 1;
    });

    const labels = Object.keys(locationCounts);
    const values = Object.values(locationCounts);
    const total = values.reduce((sum, val) => sum + val, 0);
    const colors = [
        '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
        '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
    ];

    canvas.style.display = 'block';
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const baseRadius = Math.min(centerX, centerY) - 20;
    const hoverRadius = baseRadius + 12;

    let slices = [];
    let currentAngle = -Math.PI / 2;

    values.forEach((value, index) => {
        const sliceAngle = (value / total) * 2 * Math.PI;
        slices.push({
            startAngle: currentAngle,
            endAngle: currentAngle + sliceAngle,
            midAngle: currentAngle + sliceAngle / 2,
            value, label: labels[index],
            color: colors[index % colors.length],
            percentage: ((value / total) * 100).toFixed(1),
        });
        currentAngle += sliceAngle;
    });

    const newCanvas = canvas.cloneNode(true);
    canvas.parentNode.replaceChild(newCanvas, canvas);
    const c2 = document.getElementById('locationPieChart');
    if (!c2) return;
    const ctx2 = c2.getContext('2d');

    (function bindEvents(cvs, context) {
        let hoveredRef = -1;

        function lightenColor(hex, amount) {
            const num = parseInt(hex.replace('#', ''), 16);
            const r = Math.min(255, (num >> 16) + amount);
            const g = Math.min(255, ((num >> 8) & 0xff) + amount);
            const b = Math.min(255, (num & 0xff) + amount);
            return `rgb(${r},${g},${b})`;
        }

        function redraw(hi) {
            hoveredRef = hi;
            context.clearRect(0, 0, cvs.width, cvs.height);

            slices.forEach((slice, i) => {
                const isHovered = i === hoveredRef;
                const r = isHovered ? hoverRadius : baseRadius;
                const offsetX = isHovered ? Math.cos(slice.midAngle) * 10 : 0;
                const offsetY = isHovered ? Math.sin(slice.midAngle) * 10 : 0;

                context.save();
                context.shadowColor = isHovered ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.20)';
                context.shadowBlur = isHovered ? 24 : 10;
                context.beginPath();
                context.moveTo(centerX + offsetX, centerY + offsetY);
                context.arc(centerX + offsetX, centerY + offsetY, r, slice.startAngle, slice.endAngle);
                context.closePath();
                context.fillStyle = slice.color;
                context.fill();
                context.restore();

                const grad = context.createRadialGradient(
                    centerX + offsetX - r * 0.25, centerY + offsetY - r * 0.25, r * 0.05,
                    centerX + offsetX, centerY + offsetY, r
                );
                grad.addColorStop(0, lightenColor(slice.color, 45));
                grad.addColorStop(0.6, slice.color);
                grad.addColorStop(1, lightenColor(slice.color, -30));

                context.beginPath();
                context.moveTo(centerX + offsetX, centerY + offsetY);
                context.arc(centerX + offsetX, centerY + offsetY, r, slice.startAngle, slice.endAngle);
                context.closePath();
                context.fillStyle = grad;
                context.fill();
                context.strokeStyle = 'rgba(255,255,255,0.9)';
                context.lineWidth = isHovered ? 3 : 2;
                context.stroke();

                const textX = centerX + offsetX + Math.cos(slice.midAngle) * (r * 0.65);
                const textY = centerY + offsetY + Math.sin(slice.midAngle) * (r * 0.65);
                context.fillStyle = '#fff';
                context.font = isHovered ? 'bold 15px Arial' : 'bold 13px Arial';
                context.textAlign = 'center';
                context.textBaseline = 'middle';
                context.fillText(`${slice.percentage}%`, textX, textY);
            });

            if (hoveredRef !== -1) {
                const s = slices[hoveredRef];
                const lines = [s.label, `${s.value} prawn${s.value > 1 ? 's' : ''}`, `${s.percentage}%`];
                const lineH = 20, boxW = 145, boxH = lines.length * lineH + 16;
                const bx = centerX - boxW / 2, by = centerY - boxH / 2;
                context.fillStyle = 'rgba(20,20,20,0.85)';
                context.beginPath();
                context.roundRect(bx, by, boxW, boxH, 10);
                context.fill();
                lines.forEach((line, li) => {
                    context.fillStyle = li === 0 ? '#fff' : '#d1d5db';
                    context.font = li === 0 ? 'bold 13px Arial' : '12px Arial';
                    context.textAlign = 'center';
                    context.textBaseline = 'middle';
                    context.fillText(line, centerX, by + 8 + lineH * li + lineH / 2);
                });
            }
            cvs.style.cursor = hoveredRef !== -1 ? 'pointer' : 'default';
        }

        function getIdx(e) {
            const rect = cvs.getBoundingClientRect();
            const scaleX = cvs.width / rect.width;
            const scaleY = cvs.height / rect.height;
            const mx = (e.clientX - rect.left) * scaleX;
            const my = (e.clientY - rect.top) * scaleY;
            const dx = mx - centerX, dy = my - centerY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > hoverRadius + 14 || dist < 5) return -1;
            let angle = Math.atan2(dy, dx);
            const shift = Math.PI / 2;
            let a = ((angle + shift) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
            return slices.findIndex(s => {
                let start = ((s.startAngle + shift) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
                let end = ((s.endAngle + shift) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
                if (end < start) end += 2 * Math.PI;
                let aa = a; if (aa < start) aa += 2 * Math.PI;
                return aa >= start && aa <= end;
            });
        }

        cvs.addEventListener('mousemove', e => {
            const idx = getIdx(e);
            if (idx !== hoveredRef) redraw(idx);
        });
        cvs.addEventListener('mouseleave', () => {
            if (hoveredRef !== -1) redraw(-1);
        });

        redraw(-1);
    })(c2, ctx2);

    const legendContainer = document.getElementById('pieChartLegend');
    if (legendContainer) {
        legendContainer.innerHTML = '';
        slices.forEach(slice => {
            const legendItem = document.createElement('div');
            legendItem.className = 'legend-item';
            legendItem.innerHTML = `
                <div class="legend-color" style="background-color: ${slice.color}"></div>
                <span class="legend-text">${slice.label}: ${slice.value} prawn${slice.value > 1 ? 's' : ''}</span>
            `;
            legendContainer.appendChild(legendItem);
        });
    }
}

// ============================================
// PASSWORD STRENGTH CHECKER
// ============================================
function checkPasswordStrength(password) {
    const bar = document.getElementById('strengthBar');
    const label = document.getElementById('strengthLabel');
    if (!bar || !label) return;

    const reqs = {
        length: password.length >= 6,
        upper: /[A-Z]/.test(password),
        lower: /[a-z]/.test(password),
        number: /[0-9]/.test(password),
        symbol: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    };

    // Update checklist
    const map = {
        'req-length': reqs.length,
        'req-upper': reqs.upper,
        'req-lower': reqs.lower,
        'req-number': reqs.number,
        'req-symbol': reqs.symbol
    };
    Object.entries(map).forEach(([id, met]) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('met', met);
    });

    // Calculate score
    const score = Object.values(reqs).filter(Boolean).length;

    if (!password) {
        bar.style.width = '0%';
        bar.style.background = '';
        label.textContent = '';
        label.style.color = '';
        return;
    }

    if (score <= 2) {
        bar.style.width = '25%';
        bar.style.background = '#ef4444';
        label.textContent = '🔴 Weak';
        label.style.color = '#ef4444';
    } else if (score === 3) {
        bar.style.width = '50%';
        bar.style.background = '#f97316';
        label.textContent = '🟠 Fair';
        label.style.color = '#f97316';
    } else if (score === 4) {
        bar.style.width = '75%';
        bar.style.background = '#f59e0b';
        label.textContent = '🟡 Good';
        label.style.color = '#f59e0b';
    } else {
        bar.style.width = '100%';
        bar.style.background = '#16a34a';
        label.textContent = '🟢 Strong';
        label.style.color = '#16a34a';
    }

    // Also check match if confirm has value
    checkPasswordMatch();
}

function checkPasswordMatch() {
    const newPass = document.getElementById('newPassword')?.value;
    const confirmPass = document.getElementById('confirmPassword')?.value;
    const indicator = document.getElementById('matchIndicator');
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
    const bar = document.getElementById('signupStrengthBar');
    const label = document.getElementById('signupStrengthLabel');
    if (!bar || !label) return;

    const reqs = {
        length: password.length >= 6,
        upper: /[A-Z]/.test(password),
        lower: /[a-z]/.test(password),
        number: /[0-9]/.test(password),
        symbol: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    };

    // Update checklist
    const map = {
        'signup-req-length': reqs.length,
        'signup-req-upper': reqs.upper,
        'signup-req-lower': reqs.lower,
        'signup-req-number': reqs.number,
        'signup-req-symbol': reqs.symbol
    };
    Object.entries(map).forEach(([id, met]) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('met', met);
    });

    const score = Object.values(reqs).filter(Boolean).length;

    if (!password) {
        bar.style.width = '0%';
        bar.style.background = '';
        label.textContent = '';
        label.style.color = '';
        return;
    }

    if (score <= 2) {
        bar.style.width = '25%';
        bar.style.background = '#ef4444';
        label.textContent = '🔴 Weak';
        label.style.color = '#ef4444';
    } else if (score === 3) {
        bar.style.width = '50%';
        bar.style.background = '#f97316';
        label.textContent = '🟠 Fair';
        label.style.color = '#f97316';
    } else if (score === 4) {
        bar.style.width = '75%';
        bar.style.background = '#f59e0b';
        label.textContent = '🟡 Good';
        label.style.color = '#f59e0b';
    } else {
        bar.style.width = '100%';
        bar.style.background = '#16a34a';
        label.textContent = '🟢 Strong';
        label.style.color = '#16a34a';
    }

    checkSignupPasswordMatch();
}

function checkSignupPasswordMatch() {
    const newPass = document.getElementById('signupPassword')?.value;
    const confirmPass = document.getElementById('signupConfirmPassword')?.value;
    const indicator = document.getElementById('signupMatchIndicator');
    if (!indicator || !confirmPass) return;

    if (confirmPass === newPass) {
        indicator.textContent = '✓ Passwords match';
        indicator.style.color = '#16a34a';
        document.getElementById('signupConfirmPasswordError')?.classList.remove('show');
    } else {
        indicator.textContent = '✗ Passwords do not match';
        indicator.style.color = '#ef4444';
        document.getElementById('signupConfirmPasswordError')?.classList.remove('show');
    }
}