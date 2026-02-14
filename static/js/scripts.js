// ============================================
// FLASK VERSION - Updated API endpoints
// ============================================

// Global variables
let currentUser = null;
let currentUserId = null;
let selectedPrawn = null;
let capturedImageData = null;
let videoStream = null;

// Configuration - Flask API URLs
const API_BASE = '';  // Flask handles this automatically
const PREDICT_API_URL = '/api/predict';

// Check if user is already logged in
checkLoginStatus();

function checkLoginStatus() {
    const savedUser = localStorage.getItem('hatchly_current_user');
    const savedUserId = localStorage.getItem('hatchly_current_user_id');
    
    if (savedUser && savedUserId) {
        currentUser = savedUser;
        currentUserId = parseInt(savedUserId);
        showPage('homePage');
        updateUserName();
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

// ============================================
// MENU FUNCTIONS
// ============================================

function toggleMenu() {
    document.querySelectorAll('.menu-dropdown').forEach(dropdown => {
        dropdown.classList.remove('show');
    });
    
    event.target.nextElementSibling.classList.toggle('show');
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

    if (!email || !email.includes('@')) {
        document.getElementById('loginEmailError').classList.add('show');
        emailInput.classList.add('error-input');
        hasError = true;
    }

    if (!password) {
        document.getElementById('loginPasswordError').classList.add('show');
        passwordInput.classList.add('error-input');
        hasError = true;
    }

    if (hasError) return;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const result = await response.json();

        if (result.success) {
            currentUser = result.email;
            currentUserId = result.user_id;
            
            localStorage.setItem('hatchly_current_user', result.email);
            localStorage.setItem('hatchly_current_user_id', result.user_id);
            localStorage.setItem('hatchly_user_name', result.name);
            
            showPage('homePage');
            updateUserName();
        } else {
            document.getElementById('loginCredentialsError').classList.add('show');
            emailInput.classList.add('error-input');
            passwordInput.classList.add('error-input');
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('Error connecting to server. Please try again.');
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
        hasError = true;
    }

    if (!email || !email.includes('@')) {
        document.getElementById('signupEmailError').classList.add('show');
        emailInput.classList.add('error-input');
        hasError = true;
    }

    if (password.length < 6) {
        document.getElementById('signupPasswordError').classList.add('show');
        passwordInput.classList.add('error-input');
        hasError = true;
    }

    if (hasError) return;

    try {
        const response = await fetch('/api/signup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, email, password })
        });

        const result = await response.json();

        if (result.success) {
            currentUser = result.email;
            currentUserId = result.user_id;
            
            localStorage.setItem('hatchly_current_user', result.email);
            localStorage.setItem('hatchly_current_user_id', result.user_id);
            localStorage.setItem('hatchly_user_name', result.name);
            
            showPage('homePage');
            updateUserName();
        } else {
            alert(result.message || 'Signup failed');
        }
    } catch (error) {
        console.error('Signup error:', error);
        alert('Error connecting to server. Please try again.');
    }
}

async function handleLogout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
        
        localStorage.removeItem('hatchly_current_user');
        localStorage.removeItem('hatchly_current_user_id');
        localStorage.removeItem('hatchly_user_name');
        
        currentUser = null;
        currentUserId = null;
        selectedPrawn = null;
        
        showPage('authPage');
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
        hasError = true;
    }

    if (newPassword.length < 6) {
        document.getElementById('newPasswordError').classList.add('show');
        newPasswordInput.classList.add('error-input');
        hasError = true;
    }

    if (newPassword !== confirmPassword) {
        document.getElementById('confirmPasswordError').classList.add('show');
        confirmPasswordInput.classList.add('error-input');
        hasError = true;
    }

    if (hasError) return;

    if (currentPassword === newPassword) {
        alert('New password must be different from current password');
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
            alert('Password changed successfully!');
            clearPasswordFields();
            showPage('homePage');
        } else {
            if (result.message.includes('incorrect')) {
                document.getElementById('currentPasswordError').textContent = 'Current password is incorrect';
                document.getElementById('currentPasswordError').classList.add('show');
                currentPasswordInput.classList.add('error-input');
            } else {
                alert(result.message || 'Failed to change password');
            }
        }
    } catch (error) {
        console.error('Change password error:', error);
        alert('Error connecting to server.');
    }
}

// ============================================
// PRAWN MANAGEMENT - FLASK API
// ============================================

async function handleSavePrawn() {
    clearErrors();
    
    const name = document.getElementById('prawnName').value;
    const dob = document.getElementById('prawnDOB').value;
    
    const nameInput = document.getElementById('prawnName');
    const dobInput = document.getElementById('prawnDOB');
    
    let hasError = false;

    if (!name.trim()) {
        document.getElementById('prawnNameError').classList.add('show');
        nameInput.classList.add('error-input');
        hasError = true;
    }

    const parsedDate = parseFlexibleDate(dob);
    if (!parsedDate) {
        document.getElementById('prawnDOBError').classList.add('show');
        dobInput.classList.add('error-input');
        hasError = true;
    } else if (parsedDate > new Date()) {
        document.getElementById('prawnFutureDateError').classList.add('show');
        dobInput.classList.add('error-input');
        hasError = true;
    }

    if (hasError) return;

    try {
        const response = await fetch('/api/save_prawn', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                user_id: currentUserId,
                name: name.trim(),
                date_of_birth: formatDate(parsedDate)
            })
        });

        const result = await response.json();

        if (result.success) {
            alert(`Prawn "${name}" registered successfully!`);
            document.getElementById('prawnName').value = '';
            document.getElementById('prawnDOB').value = '';
            showPage('homePage');
        } else {
            alert(result.message || 'Failed to register prawn');
        }
    } catch (error) {
        console.error('Save prawn error:', error);
        alert('Error connecting to server.');
    }
}

async function loadPrawnList() {
    const container = document.getElementById('prawnListContainer');
    container.innerHTML = '<p style="text-align: center; padding: 40px; color: #666;">Loading...</p>';

    try {
        const response = await fetch(`/api/get_prawns?user_id=${currentUserId}`);
        const result = await response.json();

        if (result.success) {
            const prawns = result.prawns;

            if (prawns.length === 0) {
                container.innerHTML = '<div class="no-prawns">Register your first prawn!</div>';
                return;
            }

            container.innerHTML = '';
            prawns.forEach(prawn => {
                const prawnCard = document.createElement('div');
                prawnCard.className = 'prawn-card';
                prawnCard.innerHTML = `
                    <div class="prawn-card-content" onclick="selectPrawnForImage(${JSON.stringify(prawn).replace(/"/g, '&quot;')})">
                        <h3>${prawn.name}</h3>
                        <p>DOB: ${prawn.date_of_birth}</p>
                    </div>
                    <button class="delete-prawn-btn" onclick="event.stopPropagation(); showDeleteModal(${JSON.stringify(prawn).replace(/"/g, '&quot;')})">
                        🗑️ Delete
                    </button>
                `;
                container.appendChild(prawnCard);
            });
        } else {
            container.innerHTML = '<div class="no-prawns">Failed to load prawns.</div>';
        }
    } catch (error) {
        console.error('Load prawns error:', error);
        container.innerHTML = '<div class="no-prawns" style="color: #dc2626;">Error connecting to server.</div>';
    }
}

function selectPrawnForImage(prawn) {
    selectedPrawn = prawn;
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
            alert(`Prawn "${selectedPrawn.name}" deleted successfully`);
            closeDeleteModal();
            loadPrawnList();
        } else {
            document.getElementById('deletePasswordError').textContent = result.message;
            document.getElementById('deletePasswordError').classList.add('show');
        }
    } catch (error) {
        console.error('Delete prawn error:', error);
        alert('Error connecting to server.');
    }
}

// ============================================
// PREDICTION - FLASK API
// ============================================

async function predictHatchDate() {
    const loadingSpinner = document.getElementById('loadingSpinner');
    const resultContent = document.getElementById('resultContent');
    const predictBtn = document.getElementById('predictBtn');

    loadingSpinner.style.display = 'block';
    predictBtn.style.display = 'none';

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
            predictBtn.style.display = 'block';
            
            // Show user-friendly error
            if (result.no_prawn_detected) {
                alert('⚠️ No Prawn Eggs Detected\n\n' + result.error + '\n\nPlease:\n• Use better lighting\n• Take a clearer photo\n• Ensure prawn eggs are visible');
            } else {
                alert('❌ Prediction Error\n\n' + (result.error || 'Unknown error occurred'));
            }
            return;
        }

        // SUCCESS - show results
        const daysUntilHatch = result.days_until_hatch;
        const confidence = result.confidence;
        const currentDay = result.current_day || null;

        document.getElementById('daysResult').textContent = daysUntilHatch;
        document.getElementById('confidenceResult').textContent = confidence.toFixed(1);

        loadingSpinner.style.display = 'none';
        resultContent.style.display = 'block';

        await savePrediction(selectedPrawn, capturedImageData, daysUntilHatch, confidence, currentDay);
        
        console.log('Prediction successful:', result);

    } catch (error) {
        console.error('Prediction error:', error);
        
        loadingSpinner.style.display = 'none';
        predictBtn.style.display = 'block';
        
        alert('❌ Failed to connect to server\n\nPlease check:\n• Internet connection\n• Flask server is running\n\nError: ' + error.message);
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
        alert('Please select a prawn first');
        return;
    }

    document.getElementById('prawnNameTitle').textContent = `"${selectedPrawn.name}"`;
    loadPrawnHistory();
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

            logsContainer.innerHTML = '';
            predictions.forEach(log => {
                const logDate = new Date(log.created_at);
                const dateStr = logDate.toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                });
                const timeStr = logDate.toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit',
                    hour12: false
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
                `;
                logsContainer.appendChild(logItem);
            });
        } else {
            logsContainer.innerHTML = '<div class="no-logs">Failed to load history.</div>';
        }
    } catch (error) {
        console.error('Load history error:', error);
        logsContainer.innerHTML = '<div class="no-logs" style="color: #dc2626;">Error connecting to server.</div>';
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function updateSelectedPrawnInfo() {
    if (selectedPrawn) {
        const nameElement = document.getElementById('selectedPrawnName');
        const dobElement = document.getElementById('selectedPrawnDOB');
        
        if (nameElement) {
            nameElement.textContent = selectedPrawn.name;
        }
        if (dobElement) {
            dobElement.textContent = `Date of Birth: ${selectedPrawn.date_of_birth}`;
        }
        
        document.querySelectorAll('.selected-prawn-name-display').forEach(el => {
            el.textContent = selectedPrawn.name;
        });
        document.querySelectorAll('.selected-prawn-dob-display').forEach(el => {
            el.textContent = `Date of Birth: ${selectedPrawn.date_of_birth}`;
        });
    }
}

function toggleForm() {
    const container = document.getElementById('formsContainer');
    container.classList.toggle('signup-mode');
    clearErrors();
}

function showPage(pageId) {
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }

    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    document.getElementById(pageId).classList.add('active');

    // Load data based on page
    if (pageId === 'selectPrawnPage') {
        loadPrawnList();
    } else if (pageId === 'capturePage') {
        startCamera();
    } else if (pageId === 'imageSelectionPage') {
        updateSelectedPrawnInfo(); 
    } else if (pageId === 'dashboardPage') {  // ← ADD THIS
        loadDashboard();
    }
    
    document.querySelectorAll('.menu-dropdown').forEach(dropdown => {
        dropdown.classList.remove('show');
    });
    
    updateUserName();
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

// Camera functions
async function startCamera() {
    try {
        videoStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment' } 
        });
        const video = document.getElementById('video');
        video.srcObject = videoStream;
        video.style.display = 'block';
        document.getElementById('capturedImage').style.display = 'none';
        document.getElementById('captureBtn').textContent = 'CAPTURE';
    } catch (err) {
        alert('Camera access denied or not available');
        console.error('Camera error:', err);
    }
}

function captureImage() {
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const capturedImage = document.getElementById('capturedImage');
    const previewImage = document.getElementById('previewImage');
    const captureBtn = document.getElementById('captureBtn');

    if (video.style.display !== 'none') {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        
        capturedImageData = canvas.toDataURL('image/jpeg');
        capturedImage.src = capturedImageData;
        previewImage.src = capturedImageData;
        
        video.style.display = 'none';
        capturedImage.style.display = 'block';
        captureBtn.textContent = 'USE THIS IMAGE';
    } else {
        document.getElementById('uploadedImage').src = capturedImageData;
        showPage('predictPage');
    }
}

function triggerFileUpload() {
    document.getElementById('fileInput').click();
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            capturedImageData = e.target.result;
            document.getElementById('uploadedImage').src = capturedImageData;
            showPage('predictPage');
        };
        reader.readAsDataURL(file);
    }
}

function tryAgain() {
    showPage('imageSelectionPage');
    capturedImageData = null;
    document.getElementById('resultContent').style.display = 'none';
    document.getElementById('predictBtn').style.display = 'block';
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

// Email suggestions (optional feature)
function showEmailSuggestions(value) {
    const suggestions = document.getElementById('emailSuggestions');
    const domains = ['gmail.com', 'yahoo.com', 'outlook.com'];
    
    if (value.includes('@')) {
        suggestions.innerHTML = '';
        return;
    }
    
    if (value.length > 0) {
        suggestions.innerHTML = domains
            .map(domain => `<div onclick="selectEmail('${value}@${domain}')">${value}@${domain}</div>`)
            .join('');
    } else {
        suggestions.innerHTML = '';
    }
}

function selectEmail(email) {
    document.getElementById('loginEmail').value = email;
    document.getElementById('emailSuggestions').innerHTML = '';
}

// ============================================
// DASHBOARD FUNCTIONS
// ============================================

async function loadDashboard() {
    try {
        // Load stats
        await loadDashboardStats();
        
        // Load upcoming hatches
        await loadUpcomingHatches();
        
        // Load latest predictions
        await loadLatestPredictions();
        
    } catch (error) {
        console.error('Dashboard load error:', error);
    }
}

async function loadDashboardStats() {
    try {
        // Get total prawns
        const prawnsResponse = await fetch(`/api/get_prawns?user_id=${currentUserId}`);
        const prawnsData = await prawnsResponse.json();
        const totalPrawns = prawnsData.success ? prawnsData.prawns.length : 0;
        
        // Get total predictions (count from all prawns)
        let totalPredictions = 0;
        if (prawnsData.success) {
            for (const prawn of prawnsData.prawns) {
                const predResponse = await fetch(`/api/get_predictions?user_id=${currentUserId}&prawn_id=${prawn.id}`);
                const predData = await predResponse.json();
                if (predData.success) {
                    totalPredictions += predData.predictions.length;
                }
            }
        }
        
        // Count upcoming hatches (within 7 days)
        let upcomingCount = 0;
        if (prawnsData.success) {
            for (const prawn of prawnsData.prawns) {
                const predResponse = await fetch(`/api/get_predictions?user_id=${currentUserId}&prawn_id=${prawn.id}`);
                const predData = await predResponse.json();
                if (predData.success && predData.predictions.length > 0) {
                    const latestPred = predData.predictions[0];
                    if (latestPred.predicted_days <= 7) {
                        upcomingCount++;
                    }
                }
            }
        }
        
        // Update UI
        document.getElementById('totalPrawns').textContent = totalPrawns;
        document.getElementById('totalPredictions').textContent = totalPredictions;
        document.getElementById('upcomingHatches').textContent = upcomingCount;
        
    } catch (error) {
        console.error('Stats load error:', error);
    }
}

async function loadUpcomingHatches() {
    const container = document.getElementById('upcomingHatchesList');
    container.innerHTML = '<p class="loading-text">Loading...</p>';
    
    try {
        const response = await fetch(`/api/get_prawns?user_id=${currentUserId}`);
        const result = await response.json();
        
        if (!result.success || result.prawns.length === 0) {
            container.innerHTML = `
                <div class="no-data-message">
                    <h3>No prawns registered yet</h3>
                    <p>Register your first prawn to start tracking!</p>
                </div>
            `;
            return;
        }
        
        // Get latest prediction for each prawn
        const hatchAlerts = [];
        for (const prawn of result.prawns) {
            const predResponse = await fetch(`/api/get_predictions?user_id=${currentUserId}&prawn_id=${prawn.id}`);
            const predData = await predResponse.json();
            
            if (predData.success && predData.predictions.length > 0) {
                const latestPred = predData.predictions[0];
                if (latestPred.predicted_days <= 14) { // Show if hatching within 14 days
                    hatchAlerts.push({
                        prawn: prawn,
                        prediction: latestPred,
                        days: latestPred.predicted_days
                    });
                }
            }
        }
        
        // Sort by days (closest first)
        hatchAlerts.sort((a, b) => a.days - b.days);
        
        if (hatchAlerts.length === 0) {
            container.innerHTML = `
                <div class="no-data-message">
                    <h3>No upcoming hatches</h3>
                    <p>All clear for now!</p>
                </div>
            `;
            return;
        }
        
        // Display alerts
        container.innerHTML = '';
        hatchAlerts.forEach(alert => {
            const urgentClass = alert.days <= 3 ? 'urgent' : '';
            const alertDiv = document.createElement('div');
            alertDiv.className = `hatch-alert ${urgentClass}`;
            alertDiv.innerHTML = `
                <div class="hatch-days">${alert.days}<br><small>days</small></div>
                <div class="hatch-info">
                    <h3>${alert.prawn.name}</h3>
                    <p>Expected hatch date: ${calculateHatchDate(alert.days)}</p>
                    <p>Confidence: ${alert.prediction.confidence.toFixed(1)}%</p>
                </div>
                <button class="hatch-view-btn" onclick="viewPrawnDetails(${JSON.stringify(alert.prawn).replace(/"/g, '&quot;')})">
                    View
                </button>
            `;
            container.appendChild(alertDiv);
        });
        
    } catch (error) {
        console.error('Upcoming hatches error:', error);
        container.innerHTML = '<p class="loading-text" style="color: #dc2626;">Error loading data</p>';
    }
}

async function loadLatestPredictions() {
    const container = document.getElementById('latestPredictionsList');
    container.innerHTML = '<p class="loading-text">Loading...</p>';
    
    try {
        const response = await fetch(`/api/get_prawns?user_id=${currentUserId}`);
        const result = await response.json();
        
        if (!result.success || result.prawns.length === 0) {
            container.innerHTML = `
                <div class="no-data-message">
                    <h3>No predictions yet</h3>
                    <p>Upload your first prawn image to get started!</p>
                </div>
            `;
            return;
        }
        
        // Collect all predictions
        const allPredictions = [];
        for (const prawn of result.prawns) {
            const predResponse = await fetch(`/api/get_predictions?user_id=${currentUserId}&prawn_id=${prawn.id}`);
            const predData = await predResponse.json();
            
            if (predData.success && predData.predictions.length > 0) {
                predData.predictions.forEach(pred => {
                    allPredictions.push({
                        prawn: prawn,
                        prediction: pred
                    });
                });
            }
        }
        
        if (allPredictions.length === 0) {
            container.innerHTML = `
                <div class="no-data-message">
                    <h3>No predictions yet</h3>
                    <p>Upload your first prawn image!</p>
                </div>
            `;
            return;
        }
        
        // Sort by date (newest first)
        allPredictions.sort((a, b) => 
            new Date(b.prediction.created_at) - new Date(a.prediction.created_at)
        );
        
        // Show latest 6
        const latestSix = allPredictions.slice(0, 6);
        
        container.innerHTML = '';
        latestSix.forEach(item => {
            const predDate = new Date(item.prediction.created_at);
            const dateStr = predDate.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric',
                year: 'numeric'
            });
            
            const card = document.createElement('div');
            card.className = 'prediction-card';
            card.onclick = () => {
                selectPrawnForImage(item.prawn);
                showHistoryPage();
            };
            
            card.innerHTML = `
                <img src="/static/${item.prediction.image_path}" 
                     alt="Prawn prediction" 
                     class="prediction-image"
                     onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'200\\' height=\\'200\\'%3E%3Crect fill=\\'%23ddd\\' width=\\'200\\' height=\\'200\\'/%3E%3Ctext x=\\'50%25\\' y=\\'50%25\\' text-anchor=\\'middle\\' fill=\\'%23999\\' font-size=\\'14\\'%3ENo Image%3C/text%3E%3C/svg%3E'">
                <div class="prediction-details">
                    <h4>${item.prawn.name}</h4>
                    <p class="prediction-result-text">${item.prediction.predicted_days} days</p>
                    <p>Confidence: ${item.prediction.confidence.toFixed(1)}%</p>
                    <p class="prediction-date">${dateStr}</p>
                </div>
            `;
            container.appendChild(card);
        });
        
    } catch (error) {
        console.error('Latest predictions error:', error);
        container.innerHTML = '<p class="loading-text" style="color: #dc2626;">Error loading data</p>';
    }
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
// ENTER KEY SUBMIT
// ============================================

// Add event listeners when page loads
document.addEventListener('DOMContentLoaded', function() {
    // Login form - Enter key
    const loginEmail = document.getElementById('loginEmail');
    const loginPassword = document.getElementById('loginPassword');
    
    if (loginEmail) {
        loginEmail.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                handleLogin();
            }
        });
    }
    
    if (loginPassword) {
        loginPassword.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                handleLogin();
            }
        });
    }
    
    // Signup form - Enter key
    const signupName = document.getElementById('signupName');
    const signupEmail = document.getElementById('signupEmail');
    const signupPassword = document.getElementById('signupPassword');
    
    if (signupName) {
        signupName.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                handleSignup();
            }
        });
    }
    
    if (signupEmail) {
        signupEmail.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                handleSignup();
            }
        });
    }
    
    if (signupPassword) {
        signupPassword.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                handleSignup();
            }
        });
    }
});
