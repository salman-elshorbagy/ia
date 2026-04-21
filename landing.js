// ============================================
//  landing.js — Firebase Auth Check
//  إذا كان المستخدم مسجل دخوله → يُتحقق من صلاحيته أولاً ثم يُحوَّل لـ index.html
// ============================================

// ============================================
//  Toast بسيط لصفحة الـ Landing
// ============================================
function showLandingToast(msg) {
    const existing = document.getElementById('landing-toast');
    if (existing) existing.remove();

    if (!document.getElementById('landing-toast-style')) {
        const style = document.createElement('style');
        style.id = 'landing-toast-style';
        style.textContent = `
            @keyframes landingToastIn {
                from { opacity:0; transform:translate(-50%, 16px); }
                to   { opacity:1; transform:translate(-50%, 0); }
            }
        `;
        document.head.appendChild(style);
    }

    const toast = document.createElement('div');
    toast.id = 'landing-toast';
    toast.style.cssText = [
        'position:fixed',
        'bottom:28px',
        'left:50%',
        'transform:translateX(-50%)',
        'background:linear-gradient(135deg,#1a1220,#1f1535)',
        'border:1px solid rgba(239,68,68,0.45)',
        'color:white',
        'padding:14px 22px',
        'border-radius:18px',
        'font-family:Cairo,sans-serif',
        'font-size:13px',
        'font-weight:700',
        'z-index:99999',
        'max-width:88vw',
        'box-shadow:0 8px 36px rgba(239,68,68,0.18),0 2px 8px rgba(0,0,0,0.5)',
        'direction:rtl',
        'display:flex',
        'align-items:center',
        'gap:10px',
        'animation:landingToastIn 0.3s cubic-bezier(0.16,1,0.3,1) both'
    ].join(';');

    toast.innerHTML = `
        <i class="fas fa-exclamation-circle" style="color:#ef4444;font-size:18px;flex-shrink:0;"></i>
        <span style="white-space:normal;line-height:1.5;">${msg}</span>
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(10px)';
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 400);
    }, 5000);
}

function _resetLoginBtn() {
    const btn = document.getElementById('cta-login-btn');
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fab fa-google"></i> دخول المنصة بحساب Google';
    }
}

// ============================================
//  onAuthStateChanged — مع التحقق من الصلاحية
// ============================================
firebase.auth().onAuthStateChanged(async (user) => {
    if (user) {
        try {
            const userEmail = user.email.toLowerCase();
            const userDoc = await firebase.firestore()
                .collection('users_access')
                .doc(userEmail)
                .get();

            if (!userDoc.exists) {
                await firebase.auth().signOut();
                _resetLoginBtn();
                showLandingToast('ليس لديك صلاحية للوصول، تواصل مع المطور لتفعيل حسابك');
                return;
            }

            window.location.replace('index.html');

        } catch (e) {
            console.warn('[landing.js] Firestore check failed:', e);
            window.location.replace('index.html');
        }
    }
});

// ============================================
//  فحص flag من app.js (fallback)
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('_access_denied')) {
        localStorage.removeItem('_access_denied');
        showLandingToast('ليس لديك صلاحية للوصول، تواصل مع المطور لتفعيل حسابك');
    }

    // ── Intersection Observer ──
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

    // ── Typing effect ──
    const typingEl = document.getElementById('typing-text');
    const words = [
        'مواقع احترافية',
        'تطبيقات ذكية',
        'مشاريع حقيقية',
        'مستقبلك في التقنية',
        'بـ Python',
        'بـ JavaScript',
        'بـ React',
        'واجهات مذهلة',
        'نماذج AI',
        'APIs قوية',
        'قواعد بيانات',
        'أتمتة المهام',
        'Prompt Engineering',
        'حلول Cybersecurity',
        'تطبيقات Full Stack',
        'مستقبلك الرقمي',
        'أدوات المطورين',
        'مشاريع تغير حياتك',
    ];
    let wIdx = 0, cIdx = 0, deleting = false;
    function typeLoop() {
        const current = words[wIdx];
        if (!deleting) {
            typingEl.textContent = current.slice(0, ++cIdx);
            if (cIdx === current.length) { deleting = true; setTimeout(typeLoop, 1800); return; }
        } else {
            typingEl.textContent = current.slice(0, --cIdx);
            if (cIdx === 0) { deleting = false; wIdx = (wIdx + 1) % words.length; }
        }
        setTimeout(typeLoop, deleting ? 55 : 90);
    }
    if (typingEl) setTimeout(typeLoop, 700);

    // ── Scroll progress bar ──
    const progressBar = document.getElementById('scroll-progress');
    if (progressBar) {
        window.addEventListener('scroll', () => {
            const scrolled = window.scrollY;
            const total = document.body.scrollHeight - window.innerHeight;
            progressBar.style.width = (scrolled / total * 100) + '%';
        }, { passive: true });
    }

    // ── Counter animation ──
    const counters = document.querySelectorAll('[data-count]');
    const counterObs = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const el = entry.target;
            const target = parseInt(el.dataset.count);
            const duration = 1600;
            const step = target / (duration / 16);
            let current = 0;
            const timer = setInterval(() => {
                current = Math.min(current + step, target);
                el.textContent = Math.floor(current) + (el.dataset.suffix || '');
                if (current >= target) clearInterval(timer);
            }, 16);
            counterObs.unobserve(el);
        });
    }, { threshold: 0.5 });
    counters.forEach(el => counterObs.observe(el));
});

// ============================================
//  دالة تسجيل الدخول
// ============================================
async function loginWithGoogle() {
    const btn = document.getElementById('cta-login-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="btn-spinner"></span> جاري الاتصال...';
    }
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        await firebase.auth().signInWithPopup(provider);
    } catch (error) {
        if (error.code === 'auth/popup-closed-by-user') { _resetLoginBtn(); return; }
        _resetLoginBtn();
        console.error('Login error:', error);
        showLandingToast('حدث خطأ في الاتصال، حاول مرة ثانية');
    }
}