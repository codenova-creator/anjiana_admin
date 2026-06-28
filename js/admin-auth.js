import { auth, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from './firebase-config.js';

// Elements
const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const errorMessage = document.getElementById('errorMessage');
const resetMessage = document.getElementById('resetMessage');
const logoutBtn = document.getElementById('logoutBtn');
const togglePasswordBtn = document.getElementById('togglePassword');
const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');

// Handle Auth State Changes for Protection
const isLoginPage = window.location.pathname.includes('index.html') || 
                    window.location.pathname.endsWith('/') || 
                    window.location.pathname.endsWith('/admin');

onAuthStateChanged(auth, (user) => {
    if (user) {
        // User is signed in.
        if (isLoginPage) {
            window.location.href = 'dashboard.html';
        }
    } else {
        // No user is signed in.
        sessionStorage.removeItem('isAdminSession');
        if (!isLoginPage) {
            window.location.href = 'index.html';
        }
    }
});

// Handle Login
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = emailInput.value;
        const password = passwordInput.value;
        
        try {
            await signInWithEmailAndPassword(auth, email, password);
            // onAuthStateChanged will handle redirection
        } catch (error) {
            console.error("Login Error:", error.message);
            if(errorMessage) {
                errorMessage.textContent = "Invalid email or password.";
                errorMessage.style.display = 'block';
                if(resetMessage) resetMessage.style.display = 'none';
            } else {
                alert("Login Failed: " + error.message);
            }
        }
    });

    // Handle Password Visibility Toggle
    if (togglePasswordBtn && passwordInput) {
        togglePasswordBtn.addEventListener('click', () => {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            // Update icon
            togglePasswordBtn.textContent = type === 'password' ? '👁️' : '👁️‍🗨️';
        });
    }

    // Handle Forgot Password
    if (forgotPasswordBtn && emailInput) {
        forgotPasswordBtn.addEventListener('click', async () => {
            const email = emailInput.value.trim();
            if (!email) {
                if(errorMessage) {
                    errorMessage.textContent = "Please enter your email address first.";
                    errorMessage.style.display = 'block';
                    if(resetMessage) resetMessage.style.display = 'none';
                } else {
                    alert("Please enter your email address first.");
                }
                emailInput.focus();
                return;
            }

            try {
                await sendPasswordResetEmail(auth, email);
                if(resetMessage) {
                    resetMessage.textContent = "Password reset email sent! Check your inbox.";
                    resetMessage.style.display = 'block';
                    if(errorMessage) errorMessage.style.display = 'none';
                } else {
                    alert("Password reset email sent!");
                }
            } catch (error) {
                console.error("Password Reset Error:", error.message);
                if(errorMessage) {
                    errorMessage.textContent = "Failed to send reset email. Ensure the email is correct.";
                    errorMessage.style.display = 'block';
                    if(resetMessage) resetMessage.style.display = 'none';
                }
            }
        });
    }
}

// Handle Logout
if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const confirmLogout = confirm("Are you sure you want to log out of the admin panel?");
        if (!confirmLogout) return;

        try {
            await signOut(auth);
            // onAuthStateChanged will handle redirection
        } catch (error) {
            console.error("Logout Error:", error);
        }
    });
}

// Handle Go to Store with Custom Confirmation Modal
const goToStoreBtn = document.getElementById('goToStoreBtn');
if (goToStoreBtn) {
    goToStoreBtn.addEventListener('click', (e) => {
        e.preventDefault();
        
        let modal = document.querySelector('.custom-modal-overlay');
        if (!modal) {
            const modalHtml = `
                <div class="custom-modal-overlay">
                    <div class="custom-modal-card">
                        <div class="custom-modal-icon">🏪</div>
                        <h3>Leaving Admin Panel</h3>
                        <p>You are about to leave the admin panel and navigate to the storefront. Your administrator session will remain active.</p>
                        <div class="custom-modal-actions">
                            <button class="modal-btn modal-btn-cancel">Cancel</button>
                            <button class="modal-btn modal-btn-confirm">Go to Store</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            modal = document.querySelector('.custom-modal-overlay');
            
            // Attach event listeners
            modal.querySelector('.modal-btn-cancel').addEventListener('click', () => {
                modal.classList.remove('active');
            });
            modal.querySelector('.modal-btn-confirm').addEventListener('click', () => {
                modal.classList.remove('active');
                sessionStorage.setItem('isAdminSession', 'true');
                window.location.href = '../index.html';
            });
        }
        
        // Show modal
        setTimeout(() => modal.classList.add('active'), 50);
    });
}

// Live Clock Logic
const liveClockEl = document.getElementById('liveClock');
if (liveClockEl) {
    function updateClock() {
        const now = new Date();
        const timeOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };
        const dateOptions = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
        
        const timeString = now.toLocaleTimeString('en-US', timeOptions);
        const dateString = now.toLocaleDateString('en-US', dateOptions);

        liveClockEl.innerHTML = `
            <span class="clock-dot"></span>
            <span class="clock-time">${timeString}</span>
            <span class="clock-date">${dateString}</span>
        `;
    }
    updateClock(); // Initial call
    setInterval(updateClock, 1000);
}
