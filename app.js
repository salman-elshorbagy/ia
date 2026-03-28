// ============================================
//  المتغيرات العامة
// ============================================
let s_grade = localStorage.getItem('s_grade');
let editingId = null;
let unsubscribe = null;
let adminLessonsUnsubscribe = null;
let currentUserRole = 'student';
let currentUserAllowedGrades = [];
let usersDataMap = new Map();

// بيانات الدروس المحملة في الذاكرة
let allLessonsData = { videos: [], images: [] };
// التاب الحالي في الصفحة الرئيسية
let currentContentTab = 'all';
// الصف الحالي في لوحة الأدمن
let adminCurrentGrade = null;

// ============================================
//  قفل/فتح سكرول الصفحة
// ============================================
let _scrollY = 0;
function lockBodyScroll() {
    _scrollY = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${_scrollY}px`;
    document.body.style.width = '100%';
}
function unlockBodyScroll() {
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    window.scrollTo(0, _scrollY);
}

// ============================================
//  إدارة حالة تسجيل الدخول
// ============================================
auth.onAuthStateChanged(async (user) => {
    if (user) {
        try {
            const userEmail = user.email.toLowerCase();
            const userDoc = await db.collection("users_access").doc(userEmail).get();

            if (!userDoc.exists) {
                await auth.signOut();
                showLoginScreen();
                await Swal.fire({
                    title: 'عفواً.. الحساب غير مسجل!',
                    text: 'إيميلك مش متضاف في المنصة، تواصل مع مستر محمد الشربيني لتفعيل حسابك.',
                    icon: 'error',
                    confirmButtonText: 'حسناً، فهمت',
                    background: '#111827',
                    color: '#fff',
                    confirmButtonColor: '#c5a059',
                    target: document.getElementById('auth-screen'),
                    heightAuto: false,
                    allowOutsideClick: false,
                    allowEscapeKey: false
                });
                return;
            }

            const userData = userDoc.data();
            const userRole = userData.role;
            currentUserRole = userRole;

            // تحديد الصفوف المسموح بها
            if (userRole === 'master') {
                currentUserAllowedGrades = ['1-mid','2-mid','3-mid','1-sec','2-sec','3-sec'];
            } else {
                currentUserAllowedGrades = userData.allowedGrades || [];
            }

            document.getElementById('auth-screen').style.display = 'none';
            document.getElementById('app-header').classList.remove('hidden');
            document.getElementById('app-content').classList.remove('hidden');

            updateUserProfile(user);

            // ضبط زرار لوحة المدرس - فقط للمشرف العام
            const adminBtn = document.querySelector('button[onclick="checkAdmin()"]');
            if (userRole === 'master') {
                if (adminBtn) {
                    adminBtn.style.display = 'flex';
                    adminBtn.setAttribute('onclick', 'openAdminDirect()');
                }
            } else {
                if (adminBtn) adminBtn.style.display = 'none';
            }

            // ====== إظهار/إخفاء زرار تغيير الصف ======
            // المشرف: يرى الزرار دائماً
            // الطالب بأكثر من صف: يرى الزرار
            // الطالب بصف واحد فقط: لا يرى الزرار
            const canChangeGrade = (userRole === 'master') || (currentUserAllowedGrades.length > 1);
            document.querySelectorAll('.change-grade-btn').forEach(btn => {
                btn.style.display = canChangeGrade ? '' : 'none';
            });

            // منطق تحميل الصف حسب الرتبة
            if (userRole === 'master') {
                if (s_grade) {
                    selectGrade(s_grade, "");
                } else if (userData.lastGrade) {
                    selectGrade(userData.lastGrade, "");
                } else {
                    openGradePicker();
                }
            } else {
                // الطالب - محدود بصفوفه فقط
                if (currentUserAllowedGrades.length === 0) {
                    await auth.signOut();
                    showLoginScreen();
                    await Swal.fire({
                        title: 'لم يتم تحديد صفك الدراسي!',
                        text: 'تواصل مع مستر محمد الشربيني لتحديد الصف الدراسي الخاص بك.',
                        icon: 'warning',
                        confirmButtonText: 'حسناً',
                        background: '#111827',
                        color: '#fff',
                        confirmButtonColor: '#c5a059',
                        heightAuto: false,
                        allowOutsideClick: false
                    });
                    return;
                } else if (currentUserAllowedGrades.length === 1) {
                    // صف واحد فقط - تحميل تلقائي
                    selectGrade(currentUserAllowedGrades[0], "");
                } else {
                    // أكثر من صف - يختار من المسموح فقط
                    const lastGrade = s_grade || userData.lastGrade;
                    if (lastGrade && currentUserAllowedGrades.includes(lastGrade)) {
                        selectGrade(lastGrade, "");
                    } else {
                        openGradePicker(currentUserAllowedGrades);
                    }
                }
            }

        } catch (error) {
            console.error("Access Error:", error);
            auth.signOut();
        }
    } else {
        showLoginScreen();
    }
});

// ============================================
//  تحديث بيانات البروفايل في الهيدر
// ============================================
function updateUserProfile(user) {
    const avatarImg = document.getElementById('user-avatar');
    if (avatarImg && user.photoURL) {
        avatarImg.referrerPolicy = "no-referrer";
        avatarImg.src = user.photoURL;
    }
    const nameSpan = document.getElementById('user-first-name');
    if (nameSpan && user.displayName) {
        nameSpan.innerText = user.displayName.split(' ')[0];
    }
}

// ============================================
//  تسجيل الدخول والخروج
// ============================================
async function login() {
    try {
        const p = new firebase.auth.GoogleAuthProvider();
        await auth.signInWithPopup(p);
    } catch (error) {
        if (error.code === 'auth/popup-closed-by-user') return;
        console.error("Login Error:", error);
        showToast("حدثت مشكلة في الاتصال بالإنترنت", "error");
    }
}

function logout() {
    auth.signOut();
    localStorage.removeItem('s_grade');
    location.reload();
}

function toggleMenu() {
    const menu = document.getElementById('drop-menu');
    if (menu.style.display === 'flex') {
        menu.style.display = 'none';
    } else {
        menu.style.display = 'flex';
    }
}

// ============================================
//  اختيار الصف
// ============================================
function openGradePicker(allowedGrades = null) {
    const allBtns = document.querySelectorAll('#grade-picker button[data-grade]');
    if (allowedGrades) {
        allBtns.forEach(btn => {
            btn.style.display = allowedGrades.includes(btn.dataset.grade) ? '' : 'none';
        });
    } else {
        allBtns.forEach(btn => btn.style.display = '');
    }
    document.getElementById('grade-picker').classList.remove('hidden');
    if (document.getElementById('drop-menu').style.display === 'flex') toggleMenu();
}

async function selectGrade(id, name) {
    // حماية: الطالب لا يستطيع اختيار صف خارج صفوفه
    if (currentUserRole !== 'master' && !currentUserAllowedGrades.includes(id)) {
        showToast('غير مسموح بهذا الصف!', 'error');
        return;
    }

    s_grade = id;
    localStorage.setItem('s_grade', id);
    document.getElementById('grade-picker').classList.add('hidden');

    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = "";

    // إعادة ضبط التاب عند تغيير الصف
    currentContentTab = 'all';
    document.querySelectorAll('.content-tab-btn').forEach(b => b.classList.remove('active'));
    const tabAll = document.getElementById('tab-all');
    if (tabAll) tabAll.classList.add('active');

    const map = {
        '1-mid':'الأول الإعدادي','2-mid':'الثاني الإعدادي','3-mid':'الثالث الإعدادي',
        '1-sec':'الأول الثانوي','2-sec':'الثاني الثانوي','3-sec':'الثالث الثانوي'
    };
    document.getElementById('grade-title').innerText = "محاضرات " + (name || map[id]);

    if (auth.currentUser) {
        const userEmail = auth.currentUser.email.toLowerCase();
        await db.collection("users_access").doc(userEmail).set({
            lastGrade: id
        }, { merge: true }).catch(e => console.log("Grade sync failed"));
    }

    loadLessons(id);
}

// ============================================
//  تنسيق الروابط
// ============================================
function formatUrl(url) {
    if (url.includes('youtube.com/watch?v=')) return url.replace('watch?v=', 'embed/') + "?rel=0&showinfo=0&controls=1";
    if (url.includes('youtu.be/')) return url.replace('youtu.be/', 'youtube.com/embed/') + "?rel=0&showinfo=0&controls=1";
    if (url.includes('drive.google.com')) return url.replace(/\/view.*|\/edit.*|\/preview.*/, '/preview');
    return url;
}

function getThumbnailUrl(url) {
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        const videoId = url.split('v=')[1]?.split('&')[0] || url.split('/').pop()?.split('?')[0];
        return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    }
    if (url.includes('drive.google.com')) {
        const match = url.match(/\/d\/([^\/]+)/);
        if (match) return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w800`;
    }
    return '';
}

// ============================================
//  تحميل الدروس (مع listener حقيقي)
// ============================================
function loadLessons(grade) {
    const grid = document.getElementById('lesson-grid');
    grid.innerHTML = '<div class="lessons-loading">جاري التحميل...</div>';

    // إلغاء الـ listener السابق
    if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
    }

    unsubscribe = db.collection("lessons")
        .where("grade", "==", grade)
        .onSnapshot((querySnapshot) => {
            const videos = [];
            const images = [];

            querySnapshot.forEach((doc) => {
                const item = { ...doc.data(), _id: doc.id };
                if (item.type === 'image') {
                    images.push(item);
                } else {
                    videos.push(item);
                }
            });

            // ترتيب من الأحدث للأقدم في الذاكرة
            const sortByTime = (a, b) => {
                const ta = a.createdAt?.toMillis?.() || 0;
                const tb = b.createdAt?.toMillis?.() || 0;
                return tb - ta;
            };
            videos.sort(sortByTime);
            images.sort(sortByTime);

            allLessonsData = { videos, images };
            renderLessons();
        });
}

// ============================================
//  رسم الدروس حسب التاب المختار
// ============================================
function renderLessons() {
    const grid = document.getElementById('lesson-grid');
    const { videos, images } = allLessonsData;

    const showVideos = currentContentTab === 'all' || currentContentTab === 'video';
    const showImages = currentContentTab === 'all' || currentContentTab === 'image';

    const filteredVideos = showVideos ? videos : [];
    const filteredImages = showImages ? images : [];

    if (filteredVideos.length === 0 && filteredImages.length === 0) {
        const msg = currentContentTab === 'video'
            ? 'لا توجد محاضرات في هذا الصف بعد'
            : currentContentTab === 'image'
                ? 'لا توجد صور أو مواد في هذا الصف بعد'
                : 'لا توجد محتويات في هذا الصف بعد';
        grid.innerHTML = `<div class="no-lessons-msg"><i class="fas fa-film"></i><p>${msg}</p></div>`;
        return;
    }

    grid.innerHTML = '';

    if (currentContentTab === 'all') {
        // عرض الفيديوهات أولاً مع عنوان القسم
        if (filteredVideos.length > 0) {
            const videoHeader = document.createElement('div');
            videoHeader.className = 'section-header';
            videoHeader.innerHTML = '<i class="fas fa-play-circle"></i> المحاضرات';
            grid.appendChild(videoHeader);

            const videoGrid = document.createElement('div');
            videoGrid.className = 'cards-grid';
            filteredVideos.forEach(item => videoGrid.appendChild(createCard(item, 'video')));
            grid.appendChild(videoGrid);
        }

        // ثم الصور مع عنوان القسم
        if (filteredImages.length > 0) {
            const imageHeader = document.createElement('div');
            imageHeader.className = 'section-header';
            imageHeader.innerHTML = '<i class="fas fa-image"></i> الصور والمواد';
            grid.appendChild(imageHeader);

            const imageGrid = document.createElement('div');
            imageGrid.className = 'cards-grid';
            filteredImages.forEach(item => imageGrid.appendChild(createCard(item, 'image')));
            grid.appendChild(imageGrid);
        }
    } else {
        // تاب منفرد - بدون عنوان قسم
        const cardGrid = document.createElement('div');
        cardGrid.className = 'cards-grid';
        const items = currentContentTab === 'video' ? filteredVideos : filteredImages;
        items.forEach(item => cardGrid.appendChild(createCard(item, item.type || 'video')));
        grid.appendChild(cardGrid);
    }
}

// ============================================
//  تبديل التاب الرئيسي
// ============================================
function switchContentTab(tab) {
    currentContentTab = tab;

    // تحديث مظهر الأزرار
    ['all', 'video', 'image'].forEach(t => {
        const btn = document.getElementById('tab-' + t);
        if (btn) {
            if (t === tab) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    });

    // إعادة رسم القائمة
    renderLessons();

    // مسح البحث
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
}

// ============================================
//  إنشاء كارت الدرس
// ============================================
function createCard(item, type) {
    const lessonId = item._id;
    const thumbnailUrl = getThumbnailUrl(item.url);
    const isVideo = type !== 'image';

    // حساب الوقت النسبي
    let timeText = '';
    if (item.createdAt?.toDate) {
        try {
            timeText = formatTimeAgo(item.createdAt.toDate());
        } catch(e) {}
    }

    const card = document.createElement('div');
    card.className = 'lesson-card animate__animated animate__fadeIn';

    const overlayIcon = isVideo
        ? '<div class="play-icon-overlay"><i class="fas fa-play"></i></div>'
        : '<div class="image-icon-overlay"><i class="fas fa-expand-alt"></i></div>';

    const ratersBadge = isVideo ? `
        <div class="card-raters">
            <i class="fas fa-star" style="color:#c5a059; font-size:9px;"></i>
            <span class="raters-count">-</span>
        </div>` : '';

    const btnText = isVideo
        ? 'مشاهدة المحاضرة <i class="fas fa-play-circle mr-1"></i>'
        : 'فتح الصورة <i class="fas fa-expand mr-1"></i>';

    const timeBadge = timeText
        ? `<span class="card-time-badge">${timeText}</span>`
        : '';

    card.innerHTML = `
        <div class="card-media-box">
            <div class="video-preview-container">
                <img src="${thumbnailUrl}" class="video-thumb-img" loading="lazy"
                     onerror="this.src='https://via.placeholder.com/640x360/111827/c5a059?text=${isVideo ? '▶' : '🖼'}'">
                ${overlayIcon}
            </div>
        </div>
        <div class="card-info" style="padding:8px; display:flex; flex-direction:column; gap:4px;">
            <h4 class="lesson-name font-black text-white text-center">${item.title}</h4>
            ${timeBadge}
            ${ratersBadge}
            <button class="play-btn btn-gold w-full py-2 rounded-lg text-xs font-black">${btnText}</button>
        </div>`;

    // تحميل عدد المقيمين للفيديوهات
    if (isVideo) {
        const ratersEl = card.querySelector('.raters-count');
        if (ratersEl) {
            db.collection('ratings').doc(lessonId).get().then(snap => {
                const count = Object.keys(snap.data()?.ratings || {}).length;
                ratersEl.innerText = count > 0 ? `${count} قيّم` : 'لم يُقيَّم بعد';
            }).catch(() => {});
        }
        card.onclick = () => {
            playVideo(item.url, lessonId, item.title);
            markWatched(lessonId);
        };
    } else {
        card.onclick = () => openImageViewer(item.url, lessonId, item.title);
    }

    return card;
}

// ============================================
//  نشر/تعديل الدرس أو الصورة
// ============================================
async function publish() {
    const title = document.getElementById('v-title').value.trim();
    const url = document.getElementById('v-url').value.trim();
    const grade = document.getElementById('v-grade').value;
    const type = document.getElementById('v-type').value;
    const btn = document.getElementById('pub-btn');

    if (!title || !url) return showToast("أكمل البيانات!", "error");

    btn.disabled = true;
    btn.innerText = "جاري الحفظ... ⏳";

    try {
        if (editingId) {
            await db.collection("lessons").doc(editingId).update({ title, url, grade, type });
            showToast("تم تحديث الدرس بنجاح ✅");
        } else {
            await db.collection("lessons").add({
                title, url, grade, type,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            showToast("تم النشر بنجاح 🚀");
        }
        resetAdminForm();
    } catch (e) {
        console.error(e);
        showToast("حدث خطأ!", "error");
    } finally {
        btn.disabled = false;
        btn.innerText = editingId ? "تحديث البيانات الآن 💾" : "نشر المحتوى الآن 🚀";
        if (!editingId) {
            btn.innerText = "نشر المحتوى الآن 🚀";
            btn.className = "btn-gold p-5 rounded-2xl font-black text-lg";
        }
    }
}

function resetAdminForm() {
    editingId = null;
    document.getElementById('v-title').value = "";
    document.getElementById('v-url').value = "";
    document.getElementById('v-type').value = "video";
    // إعادة تعيين v-grade للصف الحالي في الأدمن
    if (adminCurrentGrade) {
        document.getElementById('v-grade').value = adminCurrentGrade;
    }
    const btn = document.getElementById('pub-btn');
    btn.innerText = "نشر المحتوى الآن 🚀";
    btn.className = "btn-gold p-5 rounded-2xl font-black text-lg";
}

// ============================================
//  قائمة الدروس في لوحة الأدمن
// ============================================
function loadAdminLessons() {
    const list = document.getElementById('admin-lessons-list');
    const targetGrade = adminCurrentGrade || s_grade || '1-sec';

    // إلغاء الـ listener السابق
    if (adminLessonsUnsubscribe) {
        adminLessonsUnsubscribe();
        adminLessonsUnsubscribe = null;
    }

    list.innerHTML = `<div style="text-align:center;padding:16px;color:rgba(255,255,255,0.3);font-family:'Cairo',sans-serif;font-size:12px;">جاري التحميل...</div>`;

    adminLessonsUnsubscribe = db.collection("lessons")
        .orderBy("createdAt", "desc")
        .onSnapshot(snap => {
            let h = "";
            let count = 0;
            snap.forEach(doc => {
                const data = doc.data();
                if (data.grade === targetGrade) {
                    count++;
                    const typeIcon = data.type === 'image' ? '🖼️' : '🎥';
                    // حساب الوقت
                    let timeStr = '';
                    if (data.createdAt?.toDate) {
                        try { timeStr = formatTimeAgo(data.createdAt.toDate()); } catch(e) {}
                    }
                    const escapedTitle = data.title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                    const escapedUrl = data.url.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                    h += `
<div style="display:flex; align-items:center; gap:8px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); padding:8px 10px; border-radius:10px; margin-bottom:6px;">
    <span style="font-size:14px; flex-shrink:0;">${typeIcon}</span>
    <div style="flex:1; min-width:0; overflow:hidden;">
        <p style="color:white; font-size:11px; font-weight:700; margin:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${data.title}</p>
        ${timeStr ? `<span style="color:rgba(255,255,255,0.25);font-size:9px;font-family:'Cairo',sans-serif;">${timeStr}</span>` : ''}
    </div>
    <div style="display:flex; gap:6px; flex-shrink:0;">
        <button onclick="prepareEditLesson('${doc.id}', '${escapedTitle}', '${escapedUrl}', '${data.grade}', '${data.type || 'video'}')"
                style="background:rgba(59,130,246,0.2); color:#60a5fa; border:1px solid rgba(59,130,246,0.3); padding:4px 10px; border-radius:6px; font-size:10px; font-weight:700; cursor:pointer; white-space:nowrap; transition:all 0.2s;"
                onmouseover="this.style.background='rgba(59,130,246,0.4)'" onmouseout="this.style.background='rgba(59,130,246,0.2)'">
            <i class="fas fa-pen"></i> تعديل
        </button>
        <button onclick="deleteDoc('${doc.id}')"
                style="background:rgba(239,68,68,0.1); color:#ef4444; border:1px solid rgba(239,68,68,0.25); width:30px; height:30px; border-radius:6px; font-size:11px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.2s;"
                onmouseover="this.style.background='rgba(239,68,68,0.3)'" onmouseout="this.style.background='rgba(239,68,68,0.1)'">
            <i class="fas fa-trash-alt"></i>
        </button>
    </div>
</div>`;
                }
            });
            if (count === 0) {
                list.innerHTML = `<div style="text-align:center; padding:20px; color:rgba(255,255,255,0.3); font-size:13px; font-family:'Cairo',sans-serif;">لا توجد محتويات لهذا الصف حالياً</div>`;
            } else {
                list.innerHTML = h;
            }
        });
}

// ============================================
//  تبديل الصف داخل لوحة الأدمن
// ============================================
function adminSwitchGrade(grade) {
    adminCurrentGrade = grade;

    // تحديث مظهر تابز الأدمن
    document.querySelectorAll('[data-ag]').forEach(btn => {
        if (btn.dataset.ag === grade) {
            btn.classList.add('active-ag');
        } else {
            btn.classList.remove('active-ag');
        }
    });

    // مزامنة v-grade مع الصف المختار
    const vGrade = document.getElementById('v-grade');
    if (vGrade) vGrade.value = grade;

    // إعادة تحميل قائمة المحتوى
    loadAdminLessons();
}

// ============================================
//  حذف درس
// ============================================
async function deleteDoc(id) {
    const result = await Swal.fire({
        target: document.getElementById('admin-modal'),
        title: 'حذف المحتوى؟',
        text: "لن تتمكن من استعادته بعد الحذف",
        icon: 'error',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'نعم، احذف نهائياً',
        cancelButtonText: 'تراجع',
        background: '#111827',
        color: '#fff',
        heightAuto: false,
        scrollbarPadding: false,
        returnFocus: false
    });
    if (result.isConfirmed) {
        try {
            await db.collection("lessons").doc(id).delete();
            showToast("تم الحذف بنجاح ✅");
        } catch (error) {
            showToast("حدث خطأ أثناء الحذف", "error");
        }
    }
}

// ============================================
//  لوحة التحكم
// ============================================
function openAdminDirect() {
    // تحديد الصف الافتراضي في الأدمن
    adminCurrentGrade = s_grade || '1-sec';

    document.getElementById('admin-modal').style.display = 'flex';
    switchTab('lessons');

    // تفعيل التاب الصحيح في قائمة الأدمن
    adminSwitchGrade(adminCurrentGrade);

    loadUsersList();
    lockBodyScroll();
}

function closeAdmin() {
    document.getElementById('admin-modal').style.display = 'none';
    resetAdminForm();
    switchTab('lessons');

    // إلغاء listener الأدمن
    if (adminLessonsUnsubscribe) {
        adminLessonsUnsubscribe();
        adminLessonsUnsubscribe = null;
    }

    unlockBodyScroll();
}

function switchTab(tabName) {
    const lessonsSection = document.getElementById('section-lessons');
    const usersSection = document.getElementById('section-users');
    const lessonsBtn = document.getElementById('btn-tab-lessons');
    const usersBtn = document.getElementById('btn-tab-users');
    lessonsBtn.classList.remove('active');
    usersBtn.classList.remove('active');
    if (tabName === 'lessons') {
        lessonsSection.classList.remove('hidden');
        usersSection.classList.add('hidden');
        lessonsBtn.classList.add('active');
    } else {
        usersSection.classList.remove('hidden');
        lessonsSection.classList.add('hidden');
        usersBtn.classList.add('active');
    }
}

function prepareEditLesson(id, title, url, grade, type) {
    editingId = id;
    document.getElementById('v-title').value = title;
    document.getElementById('v-url').value = url;
    document.getElementById('v-grade').value = grade;
    document.getElementById('v-type').value = type || 'video';
    const btn = document.getElementById('pub-btn');
    btn.innerText = "تحديث البيانات الآن 💾";
    btn.className = "bg-blue-600 hover:bg-blue-500 text-white p-5 rounded-2xl font-black text-lg w-full transition";
    document.querySelector('.admin-box').scrollTop = 0;
}

// ============================================
//  إدارة المستخدمين
// ============================================
function toggleGradesContainer(val) {
    const c = document.getElementById('user-grades-container');
    if (val === 'student') {
        c.classList.remove('hidden');
    } else {
        c.classList.add('hidden');
        document.querySelectorAll('.grade-check').forEach(cb => cb.checked = false);
    }
}

async function addUser() {
    const emailInput = document.getElementById('new-user-email');
    const email = emailInput.value.trim().toLowerCase();
    const role = document.getElementById('new-user-role').value;
    const btn = document.getElementById('add-user-btn');

    if (!email) return showToast("اكتب الإيميل الأول!", "warning");

    const allowedGrades = role === 'student'
        ? Array.from(document.querySelectorAll('.grade-check:checked')).map(cb => cb.value)
        : [];

    if (role === 'student' && allowedGrades.length === 0) {
        return showToast("اختار صف واحد على الأقل للطالب!", "warning");
    }

    btn.disabled = true;
    try {
        if (btn.innerText.includes("تحديث") && editingId && editingId !== email) {
            await db.collection("users_access").doc(editingId).delete();
        }

        const dataToSave = {
            role: role,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        if (role === 'student') {
            dataToSave.allowedGrades = allowedGrades;
        }

        await db.collection("users_access").doc(email).set(dataToSave, { merge: true });
        showToast("تم حفظ البيانات بنجاح ✅");

        emailInput.value = "";
        editingId = null;
        document.querySelectorAll('.grade-check').forEach(cb => cb.checked = false);
        document.getElementById('user-grades-container').classList.remove('hidden');
        document.getElementById('new-user-role').value = 'student';
        btn.innerText = "إضافة الإيميل الآن +";
        btn.style.backgroundColor = "";
        btn.classList.remove('bg-green-600');

    } catch (e) {
        showToast("حدث خطأ في العملية", "error");
    } finally {
        btn.disabled = false;
    }
}

function loadUsersList() {
    const list = document.getElementById('admin-users-list');
    const currentUserEmail = auth.currentUser.email.toLowerCase();

    db.collection("users_access").onSnapshot(snap => {
        usersDataMap.clear();
        let h = "";

        snap.forEach(doc => {
            const data = doc.data();
            const targetEmail = doc.id.toLowerCase();
            const targetRole = data.role;
            const isTargetSelf = targetEmail === currentUserEmail;
            const isTargetMaster = targetRole === 'master';

            usersDataMap.set(targetEmail, data);

            let badgeText = isTargetMaster ? "👑 مشرف عام" : "🎓 طالب";
            let badgeStyle = isTargetMaster
                ? "color:#ff9068; font-size:9px; font-weight:700;"
                : "color:#60a5fa; font-size:9px; font-weight:700;";

            const gradeNames = (data.allowedGrades || []).map(g => ({
                '1-mid':'إعدادي١','2-mid':'إعدادي٢','3-mid':'إعدادي٣',
                '1-sec':'ثانوي١','2-sec':'ثانوي٢','3-sec':'ثانوي٣'
            }[g] || g)).join(' · ');

            const editBtn = (!isTargetSelf) ? `
                <button onclick="prepareUserEdit('${targetEmail}', '${targetRole}')"
                    style="background:rgba(59,130,246,0.15); color:#60a5fa; border:1px solid rgba(59,130,246,0.3); padding:3px 8px; border-radius:7px; font-size:9px; font-weight:700; cursor:pointer; white-space:nowrap; transition:all 0.2s;"
                    onmouseover="this.style.background='rgba(59,130,246,0.35)'" onmouseout="this.style.background='rgba(59,130,246,0.15)'">
                    <i class="fas fa-pen" style="font-size:8px;"></i>
                </button>` : '<div style="width:30px;"></div>';

            const deleteBtn = (!isTargetSelf) ? `
                <button onclick="deleteUser('${targetEmail}')"
                    style="background:rgba(239,68,68,0.1); color:#ef4444; border:1px solid rgba(239,68,68,0.2); width:28px; height:28px; border-radius:7px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.2s; flex-shrink:0;"
                    onmouseover="this.style.background='rgba(239,68,68,0.3)'" onmouseout="this.style.background='rgba(239,68,68,0.1)'">
                    <i class="fas fa-trash-alt" style="font-size:9px;"></i>
                </button>` : '';

            h += `
            <div style="display:flex; align-items:center; gap:8px; padding:8px 10px; background:rgba(255,255,255,0.04); border-radius:10px; border:1px solid ${isTargetSelf ? 'rgba(197,160,89,0.2)' : 'rgba(255,255,255,0.05)'}; margin-bottom:5px;">
                <div style="flex:1; min-width:0; overflow:hidden;">
                    <p style="color:${isTargetSelf ? '#c5a059' : 'white'}; font-size:10px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin:0; direction:ltr; text-align:right;">${doc.id}</p>
                    <div style="display:flex; align-items:center; gap:4px; margin-top:2px; flex-wrap:wrap;">
                        <span style="${badgeStyle}">${badgeText}</span>
                        ${isTargetSelf ? '<span style="color:#c5a059; font-size:9px; font-weight:700;">· أنت</span>' : ''}
                        ${gradeNames ? `<span style="color:rgba(255,255,255,0.25); font-size:8px;">· ${gradeNames}</span>` : ''}
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
                    ${editBtn}
                    ${deleteBtn}
                </div>
            </div>`;
        });

        list.innerHTML = h || '<div style="color:rgba(255,255,255,0.3); text-align:center; font-size:12px; padding:16px;">لا يوجد مستخدمين</div>';
    });
}

function prepareUserEdit(email, role) {
    editingId = email;
    document.getElementById('new-user-email').value = email;
    document.getElementById('new-user-role').value = role;

    const userData = usersDataMap.get(email) || {};
    const allowedGrades = userData.allowedGrades || [];

    document.querySelectorAll('.grade-check').forEach(cb => {
        cb.checked = allowedGrades.includes(cb.value);
    });
    toggleGradesContainer(role);

    const addBtn = document.getElementById('add-user-btn');
    addBtn.innerText = "تحديث البيانات الآن 💾";
    addBtn.style.backgroundColor = "#16a34a";

    document.getElementById('section-users').scrollIntoView({ behavior: 'smooth' });
    document.getElementById('new-user-email').focus();
}

async function deleteUser(email) {
    if (email === auth.currentUser.email.toLowerCase()) {
        return showToast("لا يمكنك حذف حسابك!", "error");
    }
    const result = await Swal.fire({
        target: document.getElementById('admin-modal'),
        title: 'هل أنت متأكد؟',
        text: `سيتم حذف صلاحية: ${email}`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'نعم، احذف',
        cancelButtonText: 'إلغاء',
        background: '#111827',
        color: '#fff',
        heightAuto: false,
        scrollbarPadding: false,
        returnFocus: false
    });
    if (result.isConfirmed) {
        await db.collection("users_access").doc(email).delete();
        showToast("تم حذف المستخدم بنجاح", "success");
    }
}

function showLoginScreen() {
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('app-header').classList.add('hidden');
    document.getElementById('app-content').classList.add('hidden');
}

// ============================================
//  مشغل المحتوى (فيديو)
// ============================================
let currentLessonId = null;
let currentLessonTitle = null;
let commentsUnsubscribe = null;

function playVideo(url, lessonId, title) {
    currentLessonId = lessonId;
    currentLessonTitle = title;

    const frame = document.getElementById('main-video-frame');
    frame.src = formatUrl(url);

    const modal = document.getElementById('video-player-modal');
    modal.style.display = 'block';
    modal.removeAttribute('data-content-type');

    document.getElementById('video-title-display').innerText = '🎥 ' + (title || '');

    const user = auth.currentUser;
    if (user) {
        const avatarEl = document.getElementById('comment-my-avatar');
        if (avatarEl) avatarEl.src = user.photoURL || '';
    }

    // فتح لوحة التقييمات تلقائياً
    const ratingsPanel = document.getElementById('ratings-panel');
    if (ratingsPanel) ratingsPanel.style.display = 'block';
    const ratingsBtn = document.getElementById('ratings-toggle-btn');
    if (ratingsBtn) {
        ratingsBtn.innerHTML = '<i class="fas fa-list-ul" style="margin-left:4px;"></i> إخفاء التفاصيل';
        ratingsBtn.style.background = 'rgba(197,160,89,0.25)';
    }

    modal.scrollTop = 0;

    initModalStars(lessonId);
    loadModalRating(lessonId);
    loadRatingsDetails(lessonId);
    listenComments(lessonId);
    pushStateForVideo();
    lockBodyScroll();
}

// ============================================
//  عارض الصور (يستخدم نفس مشغل المحتوى مع تعليقات)
// ============================================
function openImageViewer(url, lessonId, title) {
    currentLessonId = lessonId;
    currentLessonTitle = title;

    const frame = document.getElementById('main-video-frame');
    frame.src = formatUrl(url);

    const modal = document.getElementById('video-player-modal');
    modal.style.display = 'block';
    modal.setAttribute('data-content-type', 'image');

    document.getElementById('video-title-display').innerText = '🖼️ ' + (title || '');

    const user = auth.currentUser;
    if (user) {
        const avatarEl = document.getElementById('comment-my-avatar');
        if (avatarEl) avatarEl.src = user.photoURL || '';
    }

    // فتح لوحة التقييمات تلقائياً
    const ratingsPanel = document.getElementById('ratings-panel');
    if (ratingsPanel) ratingsPanel.style.display = 'block';
    const ratingsBtn = document.getElementById('ratings-toggle-btn');
    if (ratingsBtn) {
        ratingsBtn.innerHTML = '<i class="fas fa-list-ul" style="margin-left:4px;"></i> إخفاء التفاصيل';
        ratingsBtn.style.background = 'rgba(197,160,89,0.25)';
    }

    modal.scrollTop = 0;

    initModalStars(lessonId);
    loadModalRating(lessonId);
    loadRatingsDetails(lessonId);
    listenComments(lessonId);
    pushStateForVideo();
    lockBodyScroll();
}

// للتوافق مع الكود القديم (إن وُجد)
function closeImageViewer() {
    closePlayer();
}

function closePlayer() {
    document.getElementById('main-video-frame').src = "";
    const modal = document.getElementById('video-player-modal');
    modal.style.display = 'none';
    modal.removeAttribute('data-content-type');

    const commentInput = document.getElementById('comment-input');
    if (commentInput) commentInput.value = '';
    cancelReply();

    const removeBtn = document.getElementById('remove-rating-btn');
    if (removeBtn) removeBtn.remove();

    if (commentsUnsubscribe) {
        commentsUnsubscribe();
        commentsUnsubscribe = null;
    }

    if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
    unlockBodyScroll();
}

// ============================================
//  البحث
// ============================================
function filterVideos() {
    const searchValue = document.getElementById('search-input').value.toLowerCase();
    const cards = document.querySelectorAll('.lesson-card');
    cards.forEach(card => {
        const titleEl = card.querySelector('.lesson-name');
        if (!titleEl) return;
        const title = titleEl.innerText.toLowerCase();
        card.style.display = title.includes(searchValue) ? "" : "none";
    });
}

// ============================================
//  ملف الطالب (Profile)
// ============================================
const gradeMap = {
    '1-mid':'أولى إعدادي','2-mid':'تانية إعدادي','3-mid':'تالتة إعدادي',
    '1-sec':'أولى ثانوي','2-sec':'تانية ثانوي','3-sec':'تالتة ثانوي'
};

async function openProfile() {
    if (document.getElementById('drop-menu').style.display === 'flex') toggleMenu();
    const user = auth.currentUser;
    if (!user) return;

    document.getElementById('profile-avatar').src = user.photoURL || '';
    document.getElementById('profile-email').innerText = user.email || '';
    document.getElementById('profile-grade-text').innerText = gradeMap[s_grade] || '-';

    const userDoc = await db.collection('users_access').doc(user.email.toLowerCase()).get();
    const data = userDoc.data() || {};
    const role = data.role || 'student';
    const customName = data.displayName || user.displayName || '';

    document.getElementById('profile-name').innerText = customName;
    document.getElementById('profile-display-name-input').value = customName;

    const badge = document.getElementById('profile-role-badge');
    if (role === 'master') {
        badge.innerText = '👑 مشرف عام';
        badge.style.cssText = 'background:linear-gradient(90deg,#ff4b1f,#ff9068);color:white;padding:4px 14px;border-radius:30px;font-size:11px;font-weight:900;';
    } else {
        badge.innerText = '🎓 طالب';
        badge.style.cssText = 'background:rgba(59,130,246,0.15);color:#60a5fa;border:1px solid rgba(59,130,246,0.3);padding:4px 14px;border-radius:30px;font-size:11px;font-weight:900;';
    }

    // ====== إخفاء/إظهار زرار تغيير الصف في البروفايل ======
    const changeGradeInProfile = document.getElementById('profile-change-grade-btn');
    if (changeGradeInProfile) {
        const canChange = (role === 'master') || (currentUserAllowedGrades.length > 1);
        changeGradeInProfile.style.display = canChange ? 'flex' : 'none';
    }

    const watchedDoc = await db.collection('watched').doc(user.email.toLowerCase()).get();
    document.getElementById('profile-watched').innerText = (watchedDoc.data()?.lessons || []).length;

    document.getElementById('profile-modal').style.display = 'flex';
    lockBodyScroll();
}

function closeProfile() {
    document.getElementById('profile-modal').style.display = 'none';
    unlockBodyScroll();
}

async function markWatched(lessonId) {
    const user = auth.currentUser;
    if (!user || !lessonId) return;
    await db.collection('watched').doc(user.email.toLowerCase()).set({
        lessons: firebase.firestore.FieldValue.arrayUnion(lessonId)
    }, { merge: true }).catch(() => {});
}

async function getMyDisplayName() {
    const user = auth.currentUser;
    if (!user) return '';
    const doc = await db.collection('users_access').doc(user.email.toLowerCase()).get();
    return doc.data()?.displayName || user.displayName || user.email.split('@')[0];
}

async function saveDisplayName() {
    const input = document.getElementById('profile-display-name-input');
    const newName = input.value.trim();
    if (!newName) return showToast('اكتب اسمك الأول!', 'warning');
    const user = auth.currentUser;
    if (!user) return;
    await db.collection('users_access').doc(user.email.toLowerCase())
        .set({ displayName: newName }, { merge: true });
    document.getElementById('profile-name').innerText = newName;
    showToast('تم حفظ الاسم ✅');
}

// ============================================
//  نظام التقييم ⭐
// ============================================
function initModalStars(lessonId) {
    const stars = document.querySelectorAll('.modal-star');
    stars.forEach(star => {
        star.onmouseover = () => {
            const val = parseInt(star.getAttribute('data-val'));
            stars.forEach(s => {
                s.style.color = parseInt(s.getAttribute('data-val')) <= val ? '#edd3a1' : '#374151';
                s.style.transform = parseInt(s.getAttribute('data-val')) <= val ? 'scale(1.2)' : 'scale(1)';
            });
        };
        star.onmouseleave = () => loadModalRating(lessonId);
        star.onclick = () => submitModalRating(lessonId, parseInt(star.getAttribute('data-val')));
    });
}

function toggleRatingsPanel() {
    const panel = document.getElementById('ratings-panel');
    const btn = document.getElementById('ratings-toggle-btn');
    if (panel.style.display === 'none' || panel.style.display === '') {
        panel.style.display = 'block';
        btn.innerHTML = '<i class="fas fa-list-ul" style="margin-left:4px;"></i> إخفاء التفاصيل';
        btn.style.background = 'rgba(197,160,89,0.25)';
        loadRatingsDetails(currentLessonId);
    } else {
        panel.style.display = 'none';
        btn.innerHTML = '<i class="fas fa-list-ul" style="margin-left:4px;"></i> التفاصيل';
        btn.style.background = 'rgba(197,160,89,0.1)';
    }
}

async function loadRatingsDetails(lessonId) {
    const container = document.getElementById('ratings-details-list');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center;padding:16px;color:rgba(255,255,255,0.3);font-family:Cairo,sans-serif;font-size:12px;">جاري التحميل...</div>';
    const snap = await db.collection('ratings').doc(lessonId).get();
    const data = snap.data() || {};
    const ratings = data.ratings || {};
    const ratingUsers = data.ratingUsers || {};
    const entries = Object.entries(ratings);
    if (!entries.length) {
        container.innerHTML = '<div style="text-align:center;padding:20px;color:rgba(255,255,255,0.2);font-family:Cairo,sans-serif;font-size:12px;">لا توجد تقييمات بعد</div>';
        return;
    }
    let html = '';
    for (const [email, rating] of entries) {
        let name = ratingUsers[email]?.name;
        let avatarUrl = ratingUsers[email]?.avatar || '';
        if (!name) {
            const userDoc = await db.collection('users_access').doc(email).get();
            name = userDoc.data()?.displayName || email.split('@')[0];
        }
        const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1e293b&color=c5a059&size=60&bold=true`;
        const stars = Array.from({length: 5}, (_, i) =>
            `<i class="fas fa-star" style="font-size:11px; color:${i < rating ? '#c5a059' : '#374151'};"></i>`
        ).join('');
        // المشرف يستطيع الضغط على اسم المقيّم لرؤية بروفايله
        const nameClickAttr = currentUserRole === 'master'
            ? `onclick="viewUserProfile('${email}','${name.replace(/'/g,"\\'")}','${avatarUrl.replace(/'/g,"\\'")}');" style="cursor:pointer; color:white; font-family:'Cairo',sans-serif; font-size:12px; font-weight:700; text-decoration:underline dotted rgba(197,160,89,0.4);"`
            : `style="color:white; font-family:'Cairo',sans-serif; font-size:12px; font-weight:700;"`;
        html += `
        <div style="display:flex; align-items:center; gap:10px; padding:10px 14px; border-bottom:1px solid rgba(255,255,255,0.04);">
            <img src="${avatarUrl}" referrerpolicy="no-referrer"
                 style="width:34px; height:34px; border-radius:9px; object-fit:cover; flex-shrink:0; border:1px solid rgba(197,160,89,0.2); ${currentUserRole==='master'?'cursor:pointer;':''}"
                 onerror="this.src='${fallbackAvatar}'"
                 ${currentUserRole==='master' ? `onclick="viewUserProfile('${email}','${name.replace(/'/g,"\\'")}','${avatarUrl.replace(/'/g,"\\'")}');"` : ''}>
            <div style="flex:1;">
                <p ${nameClickAttr} style="margin:0 0 3px;">${name}</p>
                <div style="display:flex; gap:2px;">${stars}</div>
            </div>
            <div style="text-align:center;">
                <span style="color:#c5a059; font-family:'Cairo',sans-serif; font-weight:900; font-size:15px;">${rating}</span>
                <span style="color:rgba(255,255,255,0.25); font-size:10px;">/5</span>
            </div>
        </div>`;
    }
    container.innerHTML = html;
}

async function loadModalRating(lessonId) {
    const user = auth.currentUser;
    if (!user) return;
    const snap = await db.collection('ratings').doc(lessonId).get();
    const ratings = snap.data()?.ratings || {};
    const myRating = ratings[user.email.toLowerCase()] || 0;
    const allVals = Object.values(ratings);
    const avg = allVals.length ? (allVals.reduce((a, b) => a + b, 0) / allVals.length).toFixed(1) : 0;
    const count = allVals.length;
    document.getElementById('modal-avg-val').innerText = avg > 0 ? avg : '-';
    document.getElementById('modal-raters-count').innerText = count;
    let removeBtn = document.getElementById('remove-rating-btn');
    if (myRating > 0) {
        if (!removeBtn) {
            removeBtn = document.createElement('button');
            removeBtn.id = 'remove-rating-btn';
            removeBtn.onclick = () => removeMyRating(lessonId);
            removeBtn.style.cssText = 'background:none;border:1px solid rgba(239,68,68,0.3);color:rgba(239,68,68,0.6);border-radius:20px;padding:4px 10px;font-family:Cairo,sans-serif;font-size:10px;font-weight:700;cursor:pointer;margin-top:4px;display:flex;align-items:center;gap:4px;';
            removeBtn.innerHTML = '<i class="fas fa-times"></i> إزالة تقييمي';
            document.getElementById('modal-stars').parentElement.appendChild(removeBtn);
        }
    } else {
        if (removeBtn) removeBtn.remove();
    }
    const stars = document.querySelectorAll('.modal-star');
    const compareVal = myRating > 0 ? myRating : Math.round(parseFloat(avg));
    stars.forEach(s => {
        const v = parseInt(s.getAttribute('data-val'));
        s.style.color = v <= compareVal ? '#c5a059' : '#374151';
        s.style.transform = 'scale(1)';
    });
}

async function removeMyRating(lessonId) {
    const user = auth.currentUser;
    if (!user) return;
    const email = user.email.toLowerCase();
    await db.collection('ratings').doc(lessonId).set({
        ratings: { [email]: firebase.firestore.FieldValue.delete() },
        ratingUsers: { [email]: firebase.firestore.FieldValue.delete() }
    }, { merge: true });
    showToast('تم إزالة تقييمك ✅');
    loadModalRating(lessonId);
    if (document.getElementById('ratings-panel')?.style.display !== 'none') {
        loadRatingsDetails(lessonId);
    }
}

async function submitModalRating(lessonId, val) {
    const user = auth.currentUser;
    if (!user) return;
    const displayName = await getMyDisplayName();
    const email = user.email.toLowerCase();
    await db.collection('ratings').doc(lessonId).set({
        ratings: { [email]: val },
        ratingUsers: { [email]: { name: displayName, avatar: user.photoURL || '' } }
    }, { merge: true });
    showToast(`قيّمت المحتوى بـ ${val} نجوم ⭐`);
    loadModalRating(lessonId);
    if (document.getElementById('ratings-panel')?.style.display !== 'none') {
        loadRatingsDetails(lessonId);
    }
}

// ============================================
//  نظام التعليقات والردود 💬
// ============================================
let replyingTo = null;

// قفل منع التزامن في الرسم (يمنع اختفاء التعليقات)
let commentsRenderLock = false;
let commentsPendingSnap = null;

function listenComments(lessonId) {
    if (commentsUnsubscribe) commentsUnsubscribe();
    commentsRenderLock = false;
    commentsPendingSnap = null;

    const handleSnap = async (snap) => {
        // لو في عملية رسم جارية، احفظ أحدث snapshot وانتظر
        if (commentsRenderLock) {
            commentsPendingSnap = { lessonId, snap };
            return;
        }
        await doRenderComments(lessonId, snap);
    };

    commentsUnsubscribe = db.collection('comments').doc(lessonId)
        .collection('messages')
        .orderBy('createdAt', 'asc')
        .onSnapshot(handleSnap);
}

// دالة الرسم الفعلي مع قفل للحماية من التزامن
async function doRenderComments(lessonId, snap) {
    commentsRenderLock = true;
    const list = document.getElementById('comments-list');
    const countEl = document.getElementById('comments-count');
    if (!list || !countEl) { commentsRenderLock = false; return; }

    try {
        if (!snap || snap.empty) {
            list.innerHTML = `<div style="text-align:center;padding:24px;color:rgba(255,255,255,0.2);font-family:'Cairo',sans-serif;font-size:12px;">
                <i class="fas fa-comment-dots" style="font-size:24px;margin-bottom:8px;display:block;opacity:0.4;"></i>
                لا توجد تعليقات بعد، كن أول من يعلّق!
            </div>`;
            countEl.innerText = '0';
            return;
        }

        const isMaster = currentUserRole === 'master';
        const myEmail = auth.currentUser?.email?.toLowerCase() || '';
        let totalCount = snap.size;
        let html = '';

        for (const doc of snap.docs) {
            const d = doc.data();
            const timeAgo = d.createdAt ? formatTimeAgo(d.createdAt.toDate()) : '';
            const isMe = d.email === myEmail;
            const canDelete = isMe || isMaster;
            const nameClickable = isMaster
                ? `onclick="viewUserProfile('${d.email}','${(d.displayName||'').replace(/'/g,"\\'")}','${(d.avatar||'').replace(/'/g,"\\'")}');" style="cursor:pointer;"`
                : '';
            const masterBadge = isMaster && !isMe
                ? `<span style="background:rgba(239,68,68,0.1);color:#ef4444;font-size:9px;padding:1px 5px;border-radius:10px;font-family:Cairo,sans-serif;" title="${d.email}">👁</span>`
                : '';

            // جلب الردود
            const repliesSnap = await db.collection('comments').doc(lessonId)
                .collection('messages').doc(doc.id)
                .collection('replies').orderBy('createdAt','asc').get();
            totalCount += repliesSnap.size;

            let repliesHtml = '';
            repliesSnap.forEach(rDoc => {
                const r = rDoc.data();
                const rTime = r.createdAt ? formatTimeAgo(r.createdAt.toDate()) : '';
                const rIsMe = r.email === myEmail;
                const rCanDelete = rIsMe || isMaster;
                const rNameClick = isMaster
                    ? `onclick="viewUserProfile('${r.email}','${(r.displayName||'').replace(/'/g,"\\'")}','${(r.avatar||'').replace(/'/g,"\\'")}');" style="cursor:pointer;"`
                    : '';
                repliesHtml += `
                <div style="display:flex;gap:8px;padding:8px 12px 8px 0;border-top:1px solid rgba(255,255,255,0.04);margin-top:4px;">
                    <div style="width:2px;background:rgba(197,160,89,0.3);border-radius:2px;flex-shrink:0;margin-right:4px;"></div>
                    <img src="${r.avatar||''}" referrerpolicy="no-referrer"
                         style="width:26px;height:26px;border-radius:8px;object-fit:cover;flex-shrink:0;border:1px solid rgba(255,255,255,0.08);"
                         onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(r.displayName||'U')}&background=1e293b&color=c5a059&size=50'">
                    <div style="flex:1;">
                        <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;flex-wrap:wrap;">
                            <span ${rNameClick} style="color:${rIsMe?'#c5a059':'rgba(255,255,255,0.9)'};font-family:'Cairo',sans-serif;font-weight:900;font-size:11px;">${r.displayName||'مجهول'}</span>
                            ${rIsMe ? '<span style="background:rgba(197,160,89,0.15);color:#c5a059;font-size:9px;padding:1px 5px;border-radius:10px;font-family:Cairo,sans-serif;">أنت</span>' : ''}
                            <span style="color:rgba(255,255,255,0.2);font-size:9px;font-family:Cairo,sans-serif;margin-right:auto;">${rTime}</span>
                        </div>
                        <p style="color:rgba(255,255,255,0.75);font-family:'Cairo',sans-serif;font-size:11px;margin:0;line-height:1.5;">${r.text}</p>
                    </div>
                    ${rCanDelete ? `<button onclick="deleteReply('${lessonId}','${doc.id}','${rDoc.id}')" style="background:none;border:none;color:rgba(239,68,68,0.4);cursor:pointer;font-size:11px;padding:0 2px;flex-shrink:0;"><i class="fas fa-trash-alt"></i></button>` : ''}
                </div>`;
            });

            html += `
            <div style="border-bottom:1px solid rgba(255,255,255,0.05);">
                <div style="display:flex;gap:10px;padding:12px 14px;${isMe?'background:rgba(197,160,89,0.03);':''}">
                    <img src="${d.avatar||''}" referrerpolicy="no-referrer"
                         style="width:32px;height:32px;border-radius:10px;object-fit:cover;flex-shrink:0;border:1px solid rgba(255,255,255,0.1);margin-top:1px;"
                         onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(d.displayName||'U')}&background=1e293b&color=c5a059&size=60'">
                    <div style="flex:1;min-width:0;">
                        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap;">
                            <span ${nameClickable} style="color:${isMe?'#c5a059':'white'};font-family:'Cairo',sans-serif;font-weight:900;font-size:12px;">${d.displayName||'مجهول'}</span>
                            ${isMe ? '<span style="background:rgba(197,160,89,0.15);color:#c5a059;font-size:9px;padding:1px 6px;border-radius:20px;font-family:Cairo,sans-serif;">أنت</span>' : ''}
                            ${masterBadge}
                            <span style="color:rgba(255,255,255,0.2);font-size:10px;font-family:Cairo,sans-serif;margin-right:auto;">${timeAgo}</span>
                        </div>
                        <p style="color:rgba(255,255,255,0.82);font-family:'Cairo',sans-serif;font-size:12px;margin:0 0 8px;line-height:1.6;">${d.text}</p>
                        <button onclick="startReply('${doc.id}','${(d.displayName||'').replace(/'/g,"\\'")}')"
                            style="background:none;border:none;color:rgba(197,160,89,0.6);font-family:'Cairo',sans-serif;font-size:11px;font-weight:700;cursor:pointer;padding:0;display:flex;align-items:center;gap:4px;">
                            <i class="fas fa-reply" style="font-size:10px;"></i> رد
                        </button>
                        ${repliesHtml ? `<div style="margin-top:6px;">${repliesHtml}</div>` : ''}
                    </div>
                    ${canDelete ? `<button onclick="deleteComment('${lessonId}','${doc.id}')" style="background:none;border:none;color:rgba(239,68,68,0.4);cursor:pointer;font-size:12px;padding:0 2px;flex-shrink:0;"><i class="fas fa-trash-alt"></i></button>` : ''}
                </div>
            </div>`;
        }

        countEl.innerText = totalCount;
        list.innerHTML = html;

    } catch(e) {
        console.error('Comments render error:', e);
    } finally {
        commentsRenderLock = false;
        // لو في snapshot انتظر أثناء الرسم، ارسمه الآن
        if (commentsPendingSnap) {
            const pending = commentsPendingSnap;
            commentsPendingSnap = null;
            await doRenderComments(pending.lessonId, pending.snap);
        }
    }
}

// إعادة رسم يدوية (تُستخدم بعد إضافة الردود)
async function forceReloadComments(lessonId) {
    try {
        const snap = await db.collection('comments').doc(lessonId)
            .collection('messages').orderBy('createdAt','asc').get();
        await doRenderComments(lessonId, snap);
    } catch(e) {
        console.error('Force reload error:', e);
    }
}

function startReply(commentId, displayName) {
    replyingTo = { commentId, displayName };
    const input = document.getElementById('comment-input');
    input.placeholder = `ردك على ${displayName}...`;
    input.focus();
    const indicator = document.getElementById('reply-indicator');
    if (indicator) {
        indicator.style.display = 'flex';
        indicator.querySelector('#reply-to-name').innerText = displayName;
    }
}

function cancelReply() {
    replyingTo = null;
    const input = document.getElementById('comment-input');
    if (input) input.placeholder = 'شاركنا رأيك في المحتوى...';
    const indicator = document.getElementById('reply-indicator');
    if (indicator) indicator.style.display = 'none';
}

async function submitComment() {
    const input = document.getElementById('comment-input');
    const text = input.value.trim();
    if (!text) return;
    const user = auth.currentUser;
    if (!user || !currentLessonId) return;
    const displayName = await getMyDisplayName();
    input.value = '';

    if (replyingTo) {
        // الردود تُضاف في subcollection - لا تُطلق onSnapshot تلقائياً
        // لذلك نُعيد الرسم يدوياً بعد الإضافة
        const targetCommentId = replyingTo.commentId;
        cancelReply();
        await db.collection('comments').doc(currentLessonId)
            .collection('messages').doc(targetCommentId)
            .collection('replies').add({
                text, displayName,
                email: user.email.toLowerCase(),
                avatar: user.photoURL || '',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        // إعادة رسم يدوية لإظهار الرد فوراً
        await forceReloadComments(currentLessonId);
    } else {
        // التعليق الجديد يُطلق onSnapshot تلقائياً
        await db.collection('comments').doc(currentLessonId)
            .collection('messages').add({
                text, displayName,
                email: user.email.toLowerCase(),
                avatar: user.photoURL || '',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
    }
}

async function deleteComment(lessonId, commentId) {
    const repliesSnap = await db.collection('comments').doc(lessonId)
        .collection('messages').doc(commentId).collection('replies').get();
    const batch = db.batch();
    repliesSnap.forEach(d => batch.delete(d.ref));
    batch.delete(db.collection('comments').doc(lessonId).collection('messages').doc(commentId));
    await batch.commit();
}

async function deleteReply(lessonId, commentId, replyId) {
    await db.collection('comments').doc(lessonId)
        .collection('messages').doc(commentId)
        .collection('replies').doc(replyId).delete();
}

// ============================================
//  بروفايل المستخدم للمشرف العام 👑
// ============================================
async function viewUserProfile(email, displayName, avatar) {
    if (currentUserRole !== 'master') return;
    const userDoc = await db.collection('users_access').doc(email.toLowerCase()).get();
    const data = userDoc.data() || {};
    const role = data.role || 'student';
    const name = data.displayName || displayName || email.split('@')[0];
    const roleLabels = { master:'👑 مشرف عام', student:'🎓 طالب' };
    const watchedDoc = await db.collection('watched').doc(email.toLowerCase()).get();
    const watchedCount = (watchedDoc.data()?.lessons || []).length;
    const grade = gradeMap[data.lastGrade] || '-';
    const avatarUrl = avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1e293b&color=c5a059&size=100&bold=true`;
    await Swal.fire({
        html: `
        <div style="font-family:'Cairo',sans-serif;direction:rtl;text-align:right;">
            <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;">
                <img src="${avatarUrl}" referrerpolicy="no-referrer" style="width:60px;height:60px;border-radius:14px;border:2px solid #c5a059;object-fit:cover;" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1e293b&color=c5a059&size=100'">
                <div>
                    <p style="margin:0;color:white;font-weight:900;font-size:15px;">${name}</p>
                    <p style="margin:3px 0 0;color:rgba(255,255,255,0.4);font-size:11px;">${email}</p>
                    <span style="font-size:11px;color:#c5a059;font-weight:700;">${roleLabels[role]||role}</span>
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                <div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:12px;text-align:center;">
                    <p style="color:#c5a059;font-size:20px;font-weight:900;margin:0;">${watchedCount}</p>
                    <p style="color:rgba(255,255,255,0.4);font-size:11px;margin:4px 0 0;">درس شاهده</p>
                </div>
                <div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:12px;text-align:center;">
                    <p style="color:#c5a059;font-size:13px;font-weight:900;margin:0;">${grade}</p>
                    <p style="color:rgba(255,255,255,0.4);font-size:11px;margin:4px 0 0;">الصف الدراسي</p>
                </div>
            </div>
        </div>`,
        background: '#111827',
        color: '#fff',
        showConfirmButton: false,
        showCloseButton: true,
        heightAuto: false,
    });
}

// ============================================
//  أدوات مساعدة
// ============================================
function formatTimeAgo(date) {
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60) return 'الآن';
    if (diff < 3600) return `منذ ${Math.floor(diff/60)} دقيقة`;
    if (diff < 86400) return `منذ ${Math.floor(diff/3600)} ساعة`;
    if (diff < 2592000) return `منذ ${Math.floor(diff/86400)} يوم`;
    if (diff < 31536000) return `منذ ${Math.floor(diff/2592000)} شهر`;
    return `منذ ${Math.floor(diff/31536000)} سنة`;
}

function showToast(msg, icon = 'success') {
    const Toast = Swal.mixin({
        toast: true,
        position: 'top',
        showConfirmButton: false,
        timer: 2500,
        timerProgressBar: true,
        background: '#1f2937',
        color: '#ffffff',
        customClass: { container: 'swal-top-always' },
        didOpen: (toast) => {
            toast.addEventListener('mouseenter', Swal.stopTimer);
            toast.addEventListener('mouseleave', Swal.resumeTimer);
        }
    });
    Toast.fire({ icon, title: msg });
}

// ============================================
//  حماية زرار الرجوع
// ============================================
window.onpopstate = function() {
    if (document.getElementById('video-player-modal').style.display === 'block') {
        closePlayer();
        history.pushState(null, null, window.location.pathname);
    }
};

function pushStateForVideo() {
    history.pushState(null, null, window.location.pathname);
}

// ============================================
//  تنبيهات الإنترنت
// ============================================
window.addEventListener('online', () => {
    showToast('تم استعادة الاتصال بالإنترنت ✅', 'success');
});

window.addEventListener('offline', () => {
    Swal.fire({
        title: 'عذراً، لا يوجد اتصال!',
        text: 'يرجى التحقق من الإنترنت لتتمكن من مشاهدة محاضرات المستر.',
        icon: 'error',
        allowOutsideClick: false,
        showConfirmButton: true,
        confirmButtonText: 'حسناً',
        confirmButtonColor: '#c5a059'
    });
});

// ============================================
//  الشاشة الكاملة والاتجاه
// ============================================
document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) {
        if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(() => {});
        }
    } else {
        if (screen.orientation && screen.orientation.unlock) {
            screen.orientation.unlock();
        }
    }
});

// دالة مؤقتة للتوافق مع الزرار القديم
function checkAdmin() { }