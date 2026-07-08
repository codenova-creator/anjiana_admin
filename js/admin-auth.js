import { auth, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail, db, doc, getDoc, collection, getDocs, query, where } from './firebase-config.js';
import { checkAndSeedData } from './seed.js';

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

onAuthStateChanged(auth, async (user) => {
    if (user) {
        let isAuthorized = false;
        let errorMessageText = "";

        // Fallback for bootstrap superadmin
        if (user.email.toLowerCase().trim() === "admin@anjiana.com") {
            isAuthorized = true;
        } else {
            try {
                // Query Firestore staff matching this email
                const q = query(collection(db, "staff"), where("email", "==", user.email.toLowerCase().trim()));
                const snap = await getDocs(q);
                if (!snap.empty) {
                    const staffData = snap.docs[0].data();
                    const staffStatus = staffData.status || "Approved"; // default to Approved for compatibility
                    if (staffStatus === "Approved") {
                        isAuthorized = true;
                    } else if (staffStatus === "Pending") {
                        errorMessageText = "Your staff account is pending administrator approval.";
                    } else if (staffStatus === "Denied") {
                        errorMessageText = "Access Denied: Your staff account access request has been denied by an administrator.";
                    } else {
                        errorMessageText = "Your staff account has been suspended by an administrator.";
                    }
                } else {
                    errorMessageText = "Access Denied: You are not registered as an authorized staff member.";
                }
            } catch (err) {
                console.error("Firestore auth checking error:", err);
                errorMessageText = "Error verifying staff permissions database.";
            }
        }

        if (isAuthorized) {
            // User is signed in and approved.
            if (isLoginPage) {
                window.location.href = 'dashboard.html';
            }
        } else {
            // Sign out immediately and block access!
            await signOut(auth);
            sessionStorage.removeItem('isAdminSession');
            if (errorMessage) {
                errorMessage.textContent = errorMessageText || "Authentication failed.";
                errorMessage.style.display = 'block';
            } else {
                alert(errorMessageText || "Authentication failed.");
            }
        }
    } else {
        // No user is signed in.
        // Check if there is an active staff session in sessionStorage (email-only login fallback)
        const hasStaffSession = sessionStorage.getItem('staffUserEmail') !== null;
        if (!hasStaffSession) {
            sessionStorage.removeItem('isAdminSession');
            if (!isLoginPage) {
                window.location.href = 'index.html';
            }
        } else {
            if (isLoginPage) {
                window.location.href = 'dashboard.html';
            }
        }
    }
});

// Handle Login
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = emailInput.value.toLowerCase().trim();
        const password = passwordInput.value;
        
        // Reset messages
        if (errorMessage) errorMessage.style.display = 'none';
        if (resetMessage) resetMessage.style.display = 'none';

        if (isStaffMode) {
            // STAFF LOGIN TAB: Password-Free login via registered email lookup
            if (email === 'admin@anjiana.com') {
                if (errorMessage) {
                    errorMessage.textContent = "Root Administrator must log in via the Admin Login tab.";
                    errorMessage.style.display = 'block';
                }
                return;
            }

            try {
                const q = query(collection(db, "staff"), where("email", "==", email));
                const snap = await getDocs(q);
                if (!snap.empty) {
                    const staffData = snap.docs[0].data();
                    const staffStatus = staffData.status || "Approved";
                    
                    if (staffStatus === "Approved") {
                        // Set local session parameters
                        sessionStorage.setItem('isAdminSession', 'true');
                        sessionStorage.setItem('staffUserEmail', email);
                        sessionStorage.setItem('staffUserRole', staffData.role || 'Staff');
                        sessionStorage.setItem('staffUserName', staffData.name || 'Staff Member');
                        
                        window.location.href = 'dashboard.html';
                    } else if (staffStatus === "Pending") {
                        if (errorMessage) {
                            errorMessage.textContent = "Your staff account is pending administrator approval.";
                            errorMessage.style.display = 'block';
                        }
                    } else {
                        if (errorMessage) {
                            errorMessage.textContent = "Access Denied: Your staff account access request has been denied by an administrator.";
                            errorMessage.style.display = 'block';
                        }
                    }
                } else {
                    if (errorMessage) {
                        errorMessage.textContent = "Access Denied: You are not registered as an authorized staff member.";
                        errorMessage.style.display = 'block';
                    }
                }
            } catch (err) {
                console.error("Error looking up staff credentials:", err);
                if (errorMessage) {
                    errorMessage.textContent = "Error verifying staff permissions database.";
                    errorMessage.style.display = 'block';
                }
            }
        } else {
            // ADMIN LOGIN TAB: Password-Mandated login via Firebase Authentication
            if (!password) {
                if (errorMessage) {
                    errorMessage.textContent = "Please enter your administrator password.";
                    errorMessage.style.display = 'block';
                } else {
                    alert("Please enter your administrator password.");
                }
                return;
            }
            try {
                await signInWithEmailAndPassword(auth, email, password);
                // onAuthStateChanged handles routing
            } catch (error) {
                console.error("Admin Login Error:", error.message);
                if (errorMessage) {
                    errorMessage.textContent = "Invalid administrator credentials.";
                    errorMessage.style.display = 'block';
                } else {
                    alert("Invalid administrator credentials.");
                }
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
    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        
        let modal = document.getElementById('logoutConfirmModal');
        if (!modal) {
            const modalHtml = `
                <div id="logoutConfirmModal" class="custom-modal-overlay">
                    <div class="custom-modal-card">
                        <div class="custom-modal-icon">👋</div>
                        <h3>Confirm Sign Out</h3>
                        <p>Are you sure you want to log out of the Anjiana Store admin panel?</p>
                        <div class="custom-modal-actions">
                            <button class="modal-btn modal-btn-cancel">Cancel</button>
                            <button class="modal-btn modal-btn-confirm" style="background: var(--error-color, #ef5350); color: #fff;">Yes, Logout</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            modal = document.getElementById('logoutConfirmModal');

            // Attach event listeners
            modal.querySelector('.modal-btn-cancel').addEventListener('click', () => {
                modal.classList.remove('active');
            });
            modal.querySelector('.modal-btn-confirm').addEventListener('click', async () => {
                modal.classList.remove('active');
                
                // Clear all session storage keys
                sessionStorage.removeItem('isAdminSession');
                sessionStorage.removeItem('staffUserEmail');
                sessionStorage.removeItem('staffUserRole');
                sessionStorage.removeItem('staffUserName');

                try {
                    await signOut(auth);
                } catch (error) {
                    console.error("Logout Error:", error);
                }
                
                // Force return to login screen
                window.location.href = 'index.html';
            });
        }
        
        // Show modal
        setTimeout(() => modal.classList.add('active'), 50);
    });
}

// Handle Go to Store with Custom Confirmation Modal
const goToStoreBtn = document.getElementById('goToStoreBtn');
if (goToStoreBtn) {
    goToStoreBtn.addEventListener('click', (e) => {
        e.preventDefault();
        
        let modal = document.getElementById('goToStoreModal');
        if (!modal) {
            const modalHtml = `
                <div id="goToStoreModal" class="custom-modal-overlay">
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
            modal = document.getElementById('goToStoreModal');
            
            // Attach event listeners
            modal.querySelector('.modal-btn-cancel').addEventListener('click', () => {
                modal.classList.remove('active');
            });
            modal.querySelector('.modal-btn-confirm').addEventListener('click', async () => {
                modal.classList.remove('active');
                sessionStorage.setItem('isAdminSession', 'true');
                
                // Fetch dynamic store url
                let storeTarget = '../index.html';
                try {
                    const snap = await getDoc(doc(db, "settings", "store_info"));
                    if (snap.exists() && snap.data().storeUrl) {
                        storeTarget = snap.data().storeUrl;
                    }
                } catch (err) {
                    console.error("Failed to query storeUrl:", err);
                }
                window.location.href = storeTarget;
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

// Tab Switching between Admin and Staff Logins
let isStaffMode = false;
const tabAdmin = document.getElementById('tabAdmin');
const tabStaff = document.getElementById('tabStaff');
const passwordGroup = document.getElementById('passwordGroup');
const emailLabel = document.getElementById('emailLabel');
const loginBtn = document.getElementById('loginBtn');

if (tabAdmin && tabStaff) {
    tabAdmin.addEventListener('click', () => {
        isStaffMode = false;
        tabAdmin.classList.add('active');
        tabStaff.classList.remove('active');
        tabAdmin.style.background = 'rgba(255, 255, 255, 0.1)';
        tabAdmin.style.color = '#fff';
        tabStaff.style.background = 'none';
        tabStaff.style.color = 'rgba(255, 255, 255, 0.5)';
        if (passwordGroup) passwordGroup.style.display = 'block';
        if (emailLabel) emailLabel.textContent = 'Admin Email Address';
        if (emailInput) {
            emailInput.placeholder = 'Enter email address';
            emailInput.value = '';
        }
        if (passwordInput) passwordInput.value = '';
        if (loginBtn) loginBtn.textContent = 'Login to Dashboard';
        if (errorMessage) errorMessage.style.display = 'none';
    });

    tabStaff.addEventListener('click', () => {
        isStaffMode = true;
        tabStaff.classList.add('active');
        tabAdmin.classList.remove('active');
        tabStaff.style.background = 'rgba(255, 255, 255, 0.1)';
        tabStaff.style.color = '#fff';
        tabAdmin.style.background = 'none';
        tabAdmin.style.color = 'rgba(255, 255, 255, 0.5)';
        if (passwordGroup) passwordGroup.style.display = 'none';
        if (emailLabel) emailLabel.textContent = 'Registered Staff Email';
        if (emailInput) {
            emailInput.placeholder = 'Enter email address';
            emailInput.value = '';
        }
        if (passwordInput) passwordInput.value = '';
        if (loginBtn) loginBtn.textContent = 'Enter Staff Portal';
        if (errorMessage) errorMessage.style.display = 'none';
    });
}

// Auto-seed database if empty on auth load
checkAndSeedData();

