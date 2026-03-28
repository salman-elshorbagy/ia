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
// الدروس اللي شافها الطالب
let watchedLessons = new Set();
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
            await loadWatchedLessons();

            // ======= حفظ صورة Google ومعلومات المستخدم للاستخدام في لوحة المتابعة =======
            db.collection("users_access").doc(userEmail).set({
                photoURL: user.photoURL || '',
                googleName: user.displayName || ''
            }, { merge: true }).catch(() => {});

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
    if (avatarImg) {
        // referrerPolicy فقط — بدون crossOrigin لأن Google Photos تفشل معه
        // photoURL من Google هو أفاتار المزوّد الفعلي (ملوّن أو مخصص)
        avatarImg.referrerPolicy = "no-referrer";
        avatarImg.src = user.photoURL || '';
        avatarImg.onerror = function() { this.onerror = null; this.src = ''; };
    }
    const nameSpan = document.getElementById('user-first-name');
    if (nameSpan && user.displayName) {
        nameSpan.innerText = user.displayName.split(' ')[0];
    }
}

// ============================================
//  تحميل الدروس المشاهدة
// ============================================
async function loadWatchedLessons() {
    const user = auth.currentUser;
    if (!user) return;
    try {
        const doc = await db.collection('watched').doc(user.email.toLowerCase()).get();
        const lessons = doc.data()?.lessons || [];
        watchedLessons = new Set(lessons);
    } catch(e) {}
}


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
    card.dataset.lessonId = lessonId;
    if (watchedLessons.has(lessonId)) card.classList.add('card-watched');

    const overlayIcon = isVideo
        ? '<div class="play-icon-overlay"><i class="fas fa-play"></i></div>'
        : '<div class="image-icon-overlay"><i class="fas fa-expand-alt"></i></div>';

    const btnText = isVideo
        ? 'مشاهدة المحاضرة <i class="fas fa-play-circle mr-1"></i>'
        : 'فتح الصورة <i class="fas fa-expand mr-1"></i>';

    const isWatched = watchedLessons.has(lessonId);

    card.innerHTML = `
        <div class="card-media-box">
            <div class="video-preview-container">
                <img src="${thumbnailUrl}" class="video-thumb-img" loading="lazy"
                     onerror="this.src='https://via.placeholder.com/640x360/111827/c5a059?text=${isVideo ? '▶' : '🖼'}'">
                ${overlayIcon}
            </div>
        </div>
        <div class="card-info" style="padding:7px 8px; display:flex; flex-direction:column; gap:5px;">
            <h4 class="lesson-name font-black text-white text-center">${item.title}</h4>
            <div style="display:flex; align-items:center; justify-content:center; gap:5px; flex-wrap:wrap;">
                ${isWatched ? '<span class="watched-mini"><i class="fas fa-check-circle"></i> شاهدته</span>' : ''}
                ${timeText ? `<span class="card-time-badge">${timeText}</span>` : ''}
                ${isVideo ? `<span style="display:flex;align-items:center;gap:2px;background:rgba(197,160,89,0.1);border-radius:20px;padding:2px 6px;">
                    <i class="fas fa-star" style="color:#c5a059;font-size:8px;"></i>
                    <span class="raters-count" style="color:rgba(255,255,255,0.5);font-family:'Cairo',sans-serif;font-size:9px;font-weight:700;">-</span>
                </span>` : ''}
                <span style="display:flex;align-items:center;gap:2px;background:rgba(100,116,139,0.15);border-radius:20px;padding:2px 6px;">
                    <i class="fas fa-comment" style="color:#64748b;font-size:8px;"></i>
                    <span class="comments-count" style="color:rgba(255,255,255,0.4);font-family:'Cairo',sans-serif;font-size:9px;font-weight:700;">0</span>
                </span>
            </div>
            <button class="play-btn btn-gold w-full py-2 rounded-lg text-xs font-black">${btnText}</button>
        </div>`;

    // تحميل عدد المقيمين للفيديوهات
    if (isVideo) {
        const ratersEl = card.querySelector('.raters-count');
        if (ratersEl) {
            db.collection('ratings').doc(lessonId).get().then(snap => {
                const count = Object.keys(snap.data()?.ratings || {}).length;
                ratersEl.innerText = count > 0 ? count : '-';
            }).catch(() => {});
        }
    }

    // تحميل عدد التعليقات (للفيديو والصورة) — يشمل التعليقات والردود
    const commentsEl = card.querySelector('.comments-count');
    if (commentsEl) {
        db.collection('comments').doc(lessonId).collection('messages').get().then(async snap => {
            let total = snap.size;
            // جمع الردود من كل تعليق بالتوازي
            const replyCounts = await Promise.all(
                snap.docs.map(d =>
                    db.collection('comments').doc(lessonId)
                      .collection('messages').doc(d.id)
                      .collection('replies').get()
                      .then(r => r.size)
                      .catch(() => 0)
                )
            );
            total += replyCounts.reduce((a, b) => a + b, 0);
            commentsEl.innerText = total;
        }).catch(() => {});
    }

    if (isVideo) {
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
    const sections = {
        lessons: document.getElementById('section-lessons'),
        users:   document.getElementById('section-users'),
        students:document.getElementById('section-students')
    };
    const btns = {
        lessons: document.getElementById('btn-tab-lessons'),
        users:   document.getElementById('btn-tab-users'),
        students:document.getElementById('btn-tab-students')
    };

    Object.keys(sections).forEach(k => {
        if (sections[k]) sections[k].classList.toggle('hidden', k !== tabName);
        if (btns[k])     btns[k].classList.toggle('active', k === tabName);
    });

    if (tabName === 'students') loadStudentsMonitor();
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

            // ---- الاسم والأفاتار بمنطق موحّد ----
            const userName  = resolveUserName(data);          // null لو مستخدم جديد
            const isNewUser = !userName && !data.photoURL;    // مستخدم جديد فعلاً

            const displayedName  = userName  || (isNewUser ? 'مستخدم جديد' : '');
            const avatarHtml = buildAvatarHtml(
                data,
                targetEmail,
                'width:36px;height:36px;border-radius:10px;border:1px solid rgba(197,160,89,0.2);'
            );

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
            <div style="display:flex; align-items:center; gap:10px; padding:9px 10px; background:rgba(255,255,255,0.04); border-radius:10px; border:1px solid ${isTargetSelf ? 'rgba(197,160,89,0.2)' : 'rgba(255,255,255,0.05)'}; margin-bottom:5px;">
                ${avatarHtml}
                <div style="flex:1; min-width:0; overflow:hidden;">
                    <div style="display:flex;align-items:center;gap:4px;margin-bottom:1px;flex-wrap:wrap;">
                        <p style="color:${isTargetSelf?'#c5a059':'white'};font-size:${displayedName?'11':'9'}px;font-weight:${displayedName?'900':'600'};margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${isNewUser?'font-style:italic;opacity:0.55;':''}">${displayedName || targetEmail}</p>
                        ${isTargetSelf ? '<span style="color:#c5a059; font-size:9px; font-weight:700; flex-shrink:0;">· أنت</span>' : ''}
                        ${isNewUser ? '<span style="background:rgba(100,116,139,0.2);color:rgba(255,255,255,0.4);font-size:8px;padding:1px 6px;border-radius:10px;font-family:Cairo,sans-serif;flex-shrink:0;">جديد</span>' : ''}
                    </div>
                    <p style="color:rgba(255,255,255,0.3); font-size:9px; margin:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; direction:ltr; text-align:right;">${doc.id}</p>
                    <div style="display:flex; align-items:center; gap:4px; margin-top:2px; flex-wrap:wrap;">
                        <span style="${badgeStyle}">${badgeText}</span>
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

    // ======= تأكيد الحذف مع توضيح ما سيُحذف =======
    const result = await Swal.fire({
        target: document.getElementById('admin-modal'),
        title: '⚠️ حذف نهائي وشامل',
        html: `<div style="font-family:'Cairo',sans-serif;direction:rtl;text-align:right;font-size:13px;color:rgba(255,255,255,0.8);">
            <p style="margin:0 0 10px;">سيتم حذف جميع بيانات هذا المستخدم نهائياً:</p>
            <ul style="margin:0;padding-right:16px;line-height:2;color:rgba(255,255,255,0.6);">
                <li>📋 صلاحية الوصول للمنصة</li>
                <li>📚 سجل المشاهدات والإنجازات</li>
                <li>⭐ جميع التقييمات التي قيّمها</li>
                <li>💬 جميع تعليقاته وردوده</li>
            </ul>
            <p style="margin:12px 0 0;padding:8px 10px;background:rgba(239,68,68,0.1);border-radius:10px;border:1px solid rgba(239,68,68,0.2);color:#fca5a5;font-size:12px;">
                <b>${email}</b><br>لا يمكن التراجع عن هذه العملية
            </p>
        </div>`,
        icon: 'error',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'نعم، احذف كل شيء',
        cancelButtonText: 'تراجع',
        background: '#111827',
        color: '#fff',
        heightAuto: false,
        scrollbarPadding: false,
        returnFocus: false
    });

    if (!result.isConfirmed) return;

    // ======= شاشة التحميل =======
    Swal.fire({
        target: document.getElementById('admin-modal'),
        title: 'جاري الحذف...',
        html: `<div style="font-family:'Cairo',sans-serif;font-size:12px;color:rgba(255,255,255,0.5);">
            <i class="fas fa-spinner fa-spin" style="font-size:20px;color:#c5a059;display:block;margin-bottom:10px;"></i>
            يتم الآن حذف جميع البيانات، انتظر لحظة...
        </div>`,
        background: '#111827',
        color: '#fff',
        allowOutsideClick: false,
        showConfirmButton: false,
        heightAuto: false,
    });

    try {
        const batch = db.batch();
        const emailLower = email.toLowerCase();

        // ---- 1. حذف صلاحية الوصول ----
        batch.delete(db.collection("users_access").doc(emailLower));

        // ---- 2. حذف سجل المشاهدات ----
        batch.delete(db.collection("watched").doc(emailLower));

        // ---- 3. حذف التقييمات من كل الدروس ----
        const ratingsSnap = await db.collection("ratings").get();
        ratingsSnap.forEach(doc => {
            const ratings = doc.data().ratings || {};
            if (emailLower in ratings) {
                batch.update(doc.ref, {
                    [`ratings.${emailLower}`]: firebase.firestore.FieldValue.delete()
                });
            }
        });

        // ---- 4. حذف التعليقات والردود من كل الدروس ----
        const lessonsSnap = await db.collection("lessons").get();

        for (const lessonDoc of lessonsSnap.docs) {
            const lessonId = lessonDoc.id;
            const messagesSnap = await db.collection("comments")
                .doc(lessonId).collection("messages").get();

            for (const msgDoc of messagesSnap.docs) {
                const msgData = msgDoc.data();

                // حذف ردوده على تعليقات الآخرين
                const repliesSnap = await msgDoc.ref.collection("replies").get();
                repliesSnap.forEach(replyDoc => {
                    if (replyDoc.data().email === emailLower) {
                        batch.delete(replyDoc.ref);
                    }
                });

                // لو التعليق نفسه بتاعه: احذفه + كل ردوده
                if (msgData.email === emailLower) {
                    repliesSnap.forEach(replyDoc => batch.delete(replyDoc.ref));
                    batch.delete(msgDoc.ref);
                }
            }
        }

        await batch.commit();

        Swal.fire({
            target: document.getElementById('admin-modal'),
            title: 'تم الحذف ✅',
            text: 'تم حذف جميع بيانات المستخدم بنجاح',
            icon: 'success',
            timer: 2500,
            showConfirmButton: false,
            background: '#111827',
            color: '#fff',
            heightAuto: false,
        });

    } catch (e) {
        console.error("deleteUser error:", e);
        Swal.fire({
            target: document.getElementById('admin-modal'),
            title: 'حدث خطأ!',
            text: 'تعذّر إتمام عملية الحذف، حاول مرة أخرى',
            icon: 'error',
            confirmButtonColor: '#ef4444',
            background: '#111827',
            color: '#fff',
            heightAuto: false,
        });
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
        if (avatarEl) {
            avatarEl.referrerPolicy = "no-referrer";
            avatarEl.src = user.photoURL || '';
            avatarEl.onerror = function() { this.onerror = null; this.src = ''; };
        }
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

    const userImg = auth.currentUser;
    if (userImg) {
        const avatarEl = document.getElementById('comment-my-avatar');
        if (avatarEl) {
            avatarEl.referrerPolicy = "no-referrer";
            avatarEl.src = userImg.photoURL || '';
            avatarEl.onerror = function() { this.onerror = null; this.src = ''; };
        }
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
    _repliesCache = {};

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

// ============================================
//  مساعد موحّد: اسم + أفاتار المستخدم
//  يعالج حالة "مستخدم جديد" (لم يسجّل دخول بعد)
// ============================================

/**
 * يُرجع الاسم الصحيح للمستخدم.
 * لو لا يوجد اسم → يُرجع 'مستخدم جديد'
 */
function resolveUserName(data) {
    return data.displayName || data.googleName || null;
}

/**
 * يُرجع HTML جاهز للأفاتار.
 * - لو في photoURL حقيقي  → <img> مع referrerPolicy
 * - لو مفيش (مستخدم جديد) → <div> Placeholder بالحرف الأول
 *
 * @param {object} data - بيانات المستخدم من Firestore
 * @param {string} email - إيميل المستخدم (لاستخراج الحرف الأول كاحتياطي)
 * @param {string} styles - CSS inline للعنصر (width, height, border-radius, …)
 */
function buildAvatarHtml(data, email, styles) {
    const photoURL = data.photoURL || '';
    const name     = resolveUserName(data) || email || '?';
    const initial  = name.charAt(0).toUpperCase();

    if (photoURL) {
        return `<img src="${photoURL}" referrerpolicy="no-referrer"
                     style="${styles}object-fit:cover;"
                     onerror="this.onerror=null;this.replaceWith(buildAvatarPlaceholder('${initial}','${styles}'))">`;
    }

    // Placeholder ثابت — بدون أي <img>
    return `<div style="${styles}background:linear-gradient(135deg,#1e3a5f,#0f172a);
                  display:flex;align-items:center;justify-content:center;
                  font-family:'Cairo',sans-serif;font-weight:900;color:#60a5fa;flex-shrink:0;"
                  title="${email}">${initial}</div>`;
}

/**
 * يُنشئ Placeholder DOM Node (يُستخدم في onerror بديل)
 * لا يُستدعى مباشرة من JS — فقط reference لـ onerror
 */
function buildAvatarPlaceholder(initial, styles) {
    const div = document.createElement('div');
    div.style.cssText = styles +
        'background:linear-gradient(135deg,#1e3a5f,#0f172a);' +
        'display:flex;align-items:center;justify-content:center;' +
        'font-family:Cairo,sans-serif;font-weight:900;color:#60a5fa;flex-shrink:0;';
    div.innerText = initial;
    return div;
}

async function openProfile() {
    if (document.getElementById('drop-menu').style.display === 'flex') toggleMenu();
    const user = auth.currentUser;
    if (!user) return;

    const profileAvatar = document.getElementById('profile-avatar');
    if (profileAvatar) {
        profileAvatar.referrerPolicy = "no-referrer";
        profileAvatar.src = user.photoURL || '';
        profileAvatar.onerror = function() { this.onerror = null; this.src = ''; };
    }
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

    const changeGradeInProfile = document.getElementById('profile-change-grade-btn');
    if (changeGradeInProfile) {
        const canChange = (role === 'master') || (currentUserAllowedGrades.length > 1);
        changeGradeInProfile.style.display = canChange ? 'flex' : 'none';
    }

    const watchedDoc = await db.collection('watched').doc(user.email.toLowerCase()).get();
    const allWatched = watchedDoc.data()?.lessons || [];
    const watchedSet = new Set(allWatched);
    document.getElementById('profile-watched').innerText = allWatched.length;

    // ====== Progress Bars لكل صف ======
    const gradesContainer = document.getElementById('profile-grades-progress');
    if (gradesContainer) {
        const gradesToShow = (role === 'master')
            ? ['1-mid','2-mid','3-mid','1-sec','2-sec','3-sec']
            : data.allowedGrades || [];

        if (gradesToShow.length > 0) {
            gradesContainer.innerHTML = `<div style="background:#0f172a;border:1px solid rgba(197,160,89,0.12);border-radius:16px;overflow:hidden;margin-bottom:12px;">
                <div style="padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.05);display:flex;align-items:center;gap:7px;">
                    <i class="fas fa-chart-line" style="color:#c5a059;font-size:12px;"></i>
                    <span style="color:white;font-family:'Cairo',sans-serif;font-weight:900;font-size:13px;">تقدمك الدراسي</span>
                </div>
                <div id="grade-progress-items" style="padding:14px;display:flex;flex-direction:column;gap:12px;">
                    <div style="text-align:center;color:rgba(255,255,255,0.3);font-family:'Cairo',sans-serif;font-size:11px;">
                        <i class="fas fa-spinner fa-spin"></i> جاري التحميل...
                    </div>
                </div>
            </div>`;

            // جلب بيانات كل صف بالتوازي
            const gradeDataPromises = gradesToShow.map(async grade => {
                const snap = await db.collection('lessons').where('grade','==',grade).get();
                const total = snap.size;
                const watched = snap.docs.filter(d => watchedSet.has(d.id)).length;
                return { grade, total, watched };
            });

            const gradeResults = await Promise.all(gradeDataPromises);

            let itemsHtml = '';
            gradeResults.forEach(({ grade, total, watched }, idx) => {
                const pct = total > 0 ? Math.round((watched / total) * 100) : 0;
                const isActive = grade === s_grade;
                const isDone = pct === 100 && total > 0;
                const barColor = isDone ? '#22c55e' : (pct > 60 ? '#c5a059' : '#c5a059');

                itemsHtml += `
                <div>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                        <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
                            <span style="color:${isActive?'#c5a059':'rgba(255,255,255,0.8)'};font-family:'Cairo',sans-serif;font-size:12px;font-weight:${isActive?'900':'700'};">${gradeMap[grade]}</span>
                            ${isActive ? '<span style="background:rgba(197,160,89,0.15);color:#c5a059;font-size:8px;padding:1px 7px;border-radius:10px;font-family:Cairo,sans-serif;font-weight:700;">الحالي</span>' : ''}
                            ${isDone ? '<span style="background:rgba(34,197,94,0.15);color:#22c55e;font-size:8px;padding:1px 7px;border-radius:10px;font-family:Cairo,sans-serif;font-weight:700;">✅ مكتمل</span>' : ''}
                        </div>
                        <span style="color:rgba(255,255,255,0.45);font-family:'Cairo',sans-serif;font-size:11px;">${watched} / ${total}</span>
                    </div>
                    <div style="background:rgba(255,255,255,0.08);border-radius:20px;height:9px;overflow:hidden;position:relative;">
                        <div class="grade-prog-bar" style="height:100%;width:0%;background:${isDone?'linear-gradient(90deg,#22c55e,#4ade80)':'linear-gradient(90deg,#c5a059,#edd3a1)'};border-radius:20px;transition:width 0.7s ease;" data-target="${pct}"></div>
                    </div>
                    <div style="display:flex;justify-content:space-between;margin-top:3px;">
                        <span style="color:${isDone?'#22c55e':'#c5a059'};font-family:'Cairo',sans-serif;font-size:10px;font-weight:700;">${pct}%</span>
                        ${total === 0 ? '<span style="color:rgba(255,255,255,0.2);font-family:Cairo,sans-serif;font-size:9px;">لا يوجد محتوى بعد</span>' : ''}
                    </div>
                </div>`;
            });

            const itemsContainer = gradesContainer.querySelector('#grade-progress-items');
            if (itemsContainer) itemsContainer.innerHTML = itemsHtml;

            // تحريك شريط التقدم
            setTimeout(() => {
                gradesContainer.querySelectorAll('.grade-prog-bar').forEach(bar => {
                    bar.style.width = (bar.dataset.target || '0') + '%';
                });
            }, 150);
        } else {
            gradesContainer.innerHTML = '';
        }
    }

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

    // تحديث فوري للـ Set والـ UI
    if (!watchedLessons.has(lessonId)) {
        watchedLessons.add(lessonId);
        const card = document.querySelector(`[data-lesson-id="${lessonId}"]`);
        if (card) {
            card.classList.add('card-watched');
            const cardInfo = card.querySelector('.card-info');
            if (cardInfo && !cardInfo.querySelector('.watched-mini')) {
                const mini = document.createElement('span');
                mini.className = 'watched-mini';
                mini.innerHTML = '<i class="fas fa-check-circle"></i> شاهدته';
                const lessonName = cardInfo.querySelector('.lesson-name');
                if (lessonName && lessonName.nextSibling) {
                    cardInfo.insertBefore(mini, lessonName.nextSibling);
                } else {
                    cardInfo.appendChild(mini);
                }
            }
        }
    }

    await db.collection('watched').doc(user.email.toLowerCase()).set({
        lessons: firebase.firestore.FieldValue.arrayUnion(lessonId)
    }, { merge: true }).catch(() => {});
}

async function getMyDisplayName() {
    const user = auth.currentUser;
    if (!user) return '';
    const doc = await db.collection('users_access').doc(user.email.toLowerCase()).get();
    return doc.data()?.displayName || doc.data()?.googleName || user.displayName || user.email;
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
            name = userDoc.data()?.displayName || userDoc.data()?.googleName || email;
        }
        const stars = Array.from({length: 5}, (_, i) =>
            `<i class="fas fa-star" style="font-size:11px; color:${i < rating ? '#c5a059' : '#374151'};"></i>`
        ).join('');

        // أفاتار الرتبة بالمساعد الموحّد
        const ratingAvatarHtml = buildAvatarHtml(
            { photoURL: avatarUrl, displayName: name },
            email,
            `width:34px;height:34px;border-radius:9px;border:1px solid rgba(197,160,89,0.2);flex-shrink:0;font-size:14px;${currentUserRole==='master'?'cursor:pointer;':''}`
        );

        const nameClickAttr = currentUserRole === 'master'
            ? `onclick="viewUserProfile('${email}','${name.replace(/'/g,"\\'")}','${avatarUrl.replace(/'/g,"\\'")}');" style="cursor:pointer; color:white; font-family:'Cairo',sans-serif; font-size:12px; font-weight:700; text-decoration:underline dotted rgba(197,160,89,0.4);"`
            : `style="color:white; font-family:'Cairo',sans-serif; font-size:12px; font-weight:700;"`;
        html += `
        <div style="display:flex; align-items:center; gap:10px; padding:10px 14px; border-bottom:1px solid rgba(255,255,255,0.04);">
            <div ${currentUserRole==='master' ? `onclick="viewUserProfile('${email}','${name.replace(/'/g,"\\'")}','${avatarUrl.replace(/'/g,"\\'")}');"` : ''} style="flex-shrink:0;${currentUserRole==='master'?'cursor:pointer;':''}">
                ${buildAvatarHtml({photoURL:avatarUrl,displayName:name}, email, 'width:34px;height:34px;border-radius:9px;font-size:13px;')}
            </div>
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

// *** إصلاح Bug 2: نظام الإصدارات بدلاً من الـ lock ***
// كل مرة بنطلب render جديد، رقم الإصدار بيزيد
// الـ render القديم لو اتأخر مش هيحدث الـ DOM عشان رقمه بقى قديم
let commentsRenderVersion = 0;
// كاش الردود لكل تعليق — يُخزّن مصفوفة HTML strings لكل commentId
let _repliesCache = {};
const REPLIES_PAGE_SIZE = 10;

function listenComments(lessonId) {
    if (commentsUnsubscribe) commentsUnsubscribe();
    // إعادة ضبط العداد والكاش لما بنبدأ listener جديد
    commentsRenderVersion = 0;
    _repliesCache = {};

    commentsUnsubscribe = db.collection('comments').doc(lessonId)
        .collection('messages')
        .orderBy('createdAt', 'asc')
        .onSnapshot(snap => {
            doRenderComments(lessonId, snap);
        });
}

// دالة الرسم الفعلي بنظام الإصدارات
async function doRenderComments(lessonId, snap) {
    // نحجز رقم إصدار لهذا الـ render
    const myVersion = ++commentsRenderVersion;
    const list = document.getElementById('comments-list');
    const countEl = document.getElementById('comments-count');
    if (!list || !countEl) return;

    try {
        if (!snap || snap.empty) {
            // تحقق من الإصدار قبل تحديث الـ DOM
            if (myVersion !== commentsRenderVersion) return;
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

            // جلب الردود وبناء مصفوفة HTML (بدل string واحد)
            const repliesSnap = await db.collection('comments').doc(lessonId)
                .collection('messages').doc(doc.id)
                .collection('replies').orderBy('createdAt','asc').get();
            totalCount += repliesSnap.size;

            // بناء مصفوفة HTML لكل رد على حدة وتخزينها في الكاش
            const repliesArr = [];
            repliesSnap.forEach(rDoc => {
                const r = rDoc.data();
                const rTime = r.createdAt ? formatTimeAgo(r.createdAt.toDate()) : '';
                const rIsMe = r.email === myEmail;
                const rCanDelete = rIsMe || isMaster;
                const rNameClick = isMaster
                    ? `onclick="viewUserProfile('${r.email}','${(r.displayName||'').replace(/'/g,"\\'")}','${(r.avatar||'').replace(/'/g,"\\'")}');" style="cursor:pointer;"`
                    : '';

                const quoteBox = (r.replyToName && r.replyToText)
                    ? `<div style="
                            border-right: 3px solid #c5a059;
                            background: rgba(197,160,89,0.07);
                            border-radius: 8px;
                            padding: 5px 9px;
                            margin-bottom: 5px;
                            max-width: 100%;
                        ">
                            <span style="color:#c5a059;font-family:'Cairo',sans-serif;font-size:10px;font-weight:900;display:block;margin-bottom:1px;">
                                <i class="fas fa-reply" style="font-size:9px;margin-left:3px;"></i>${r.replyToName}
                            </span>
                            <span style="color:rgba(255,255,255,0.4);font-family:'Cairo',sans-serif;font-size:10px;
                                         display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;">
                                ${r.replyToText}
                            </span>
                       </div>`
                    : '';

                const escapedRName = (r.displayName||'').replace(/'/g,"\\'").replace(/"/g,'&quot;');
                const escapedRText = (r.text||'').replace(/'/g,"\\'").replace(/"/g,'&quot;').substring(0,80);
                repliesArr.push(`
                <div style="display:flex;gap:8px;padding:9px 0 9px 0;border-top:1px solid rgba(255,255,255,0.04);margin-top:4px;">
                    <div style="width:2px;background:rgba(197,160,89,0.35);border-radius:2px;flex-shrink:0;margin:0 4px;"></div>
                    <img src="${r.avatar||''}" referrerpolicy="no-referrer"
                         style="width:28px;height:28px;border-radius:8px;object-fit:cover;flex-shrink:0;border:1px solid rgba(255,255,255,0.08);margin-top:2px;"
                         onerror="this.onerror=null;this.src=''">
                    <div style="flex:1;min-width:0;">
                        <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap;">
                            <span ${rNameClick} style="color:${rIsMe?'#c5a059':'rgba(255,255,255,0.9)'};font-family:'Cairo',sans-serif;font-weight:900;font-size:11px;">${r.displayName||'مجهول'}</span>
                            ${rIsMe ? '<span style="background:rgba(197,160,89,0.15);color:#c5a059;font-size:9px;padding:1px 5px;border-radius:10px;font-family:Cairo,sans-serif;">أنت</span>' : ''}
                            <span style="color:rgba(255,255,255,0.2);font-size:9px;font-family:Cairo,sans-serif;margin-right:auto;">${rTime}</span>
                        </div>
                        ${quoteBox}
                        <p style="color:rgba(255,255,255,0.78);font-family:'Cairo',sans-serif;font-size:11px;margin:0 0 5px;line-height:1.55;">${r.text}</p>
                        <button onclick="startReply('${doc.id}','${escapedRName}','${escapedRText}')"
                            style="background:none;border:none;color:rgba(197,160,89,0.5);font-family:'Cairo',sans-serif;font-size:10px;font-weight:700;cursor:pointer;padding:0;display:flex;align-items:center;gap:3px;">
                            <i class="fas fa-reply" style="font-size:9px;"></i> رد
                        </button>
                    </div>
                    ${rCanDelete ? `<button onclick="deleteReply('${lessonId}','${doc.id}','${rDoc.id}')" style="background:none;border:none;color:rgba(239,68,68,0.4);cursor:pointer;font-size:11px;padding:0 2px;flex-shrink:0;align-self:flex-start;margin-top:2px;"><i class="fas fa-trash-alt"></i></button>` : ''}
                </div>`);
            });

            // تخزين في الكاش
            _repliesCache[doc.id] = repliesArr;
            const repliesCount = repliesArr.length;

            // بناء منطقة الردود (زرار التبديل + الحاوية المخفية)
            const repliesToggleHtml = repliesCount > 0 ? `
                <div style="margin-top:6px;">
                    <button id="replies-toggle-btn-${doc.id}" onclick="toggleReplies('${doc.id}')"
                        style="background:rgba(197,160,89,0.08);border:1px solid rgba(197,160,89,0.2);color:rgba(197,160,89,0.8);border-radius:20px;padding:3px 10px;font-family:'Cairo',sans-serif;font-size:10px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:4px;transition:all 0.2s;"
                        onmouseover="this.style.background='rgba(197,160,89,0.15)'" onmouseout="this.style.background='rgba(197,160,89,0.08)'">
                        <i class="fas fa-comment-dots" style="font-size:9px;"></i>
                        عرض ${repliesCount} ${repliesCount === 1 ? 'رد' : 'ردود'} ↓
                    </button>
                    <div id="replies-container-${doc.id}" style="display:none;margin-top:6px;padding-right:4px;"></div>
                    <button id="replies-more-btn-${doc.id}" onclick="showMoreReplies('${doc.id}')"
                        style="display:none;margin-top:6px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.5);border-radius:20px;padding:4px 14px;font-family:'Cairo',sans-serif;font-size:10px;font-weight:700;cursor:pointer;transition:all 0.2s;"
                        onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                        <i class="fas fa-ellipsis-h" style="font-size:9px;margin-left:4px;"></i> عرض المزيد
                    </button>
                </div>` : '';

            // زرار الرد على التعليق الأصلي
            const escapedDName = (d.displayName||'').replace(/'/g,"\\'").replace(/"/g,'&quot;');
            const escapedDText = (d.text||'').replace(/'/g,"\\'").replace(/"/g,'&quot;').substring(0,80);

            html += `
            <div style="border-bottom:1px solid rgba(255,255,255,0.05);">
                <div style="display:flex;gap:10px;padding:12px 14px;${isMe?'background:rgba(197,160,89,0.03);':''}">
                    <img src="${d.avatar||''}" referrerpolicy="no-referrer"
                         style="width:32px;height:32px;border-radius:10px;object-fit:cover;flex-shrink:0;border:1px solid rgba(255,255,255,0.1);margin-top:1px;"
                         onerror="this.onerror=null;this.src=''">
                    <div style="flex:1;min-width:0;">
                        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap;">
                            <span ${nameClickable} style="color:${isMe?'#c5a059':'white'};font-family:'Cairo',sans-serif;font-weight:900;font-size:12px;">${d.displayName||'مجهول'}</span>
                            ${isMe ? '<span style="background:rgba(197,160,89,0.15);color:#c5a059;font-size:9px;padding:1px 6px;border-radius:20px;font-family:Cairo,sans-serif;">أنت</span>' : ''}
                            ${masterBadge}
                            <span style="color:rgba(255,255,255,0.2);font-size:10px;font-family:Cairo,sans-serif;margin-right:auto;">${timeAgo}</span>
                        </div>
                        <p style="color:rgba(255,255,255,0.82);font-family:'Cairo',sans-serif;font-size:12px;margin:0 0 8px;line-height:1.6;">${d.text}</p>
                        <button onclick="startReply('${doc.id}','${escapedDName}','${escapedDText}')"
                            style="background:none;border:none;color:rgba(197,160,89,0.6);font-family:'Cairo',sans-serif;font-size:11px;font-weight:700;cursor:pointer;padding:0;display:flex;align-items:center;gap:4px;">
                            <i class="fas fa-reply" style="font-size:10px;"></i> رد
                        </button>
                        ${repliesToggleHtml}
                    </div>
                    ${canDelete ? `<button onclick="deleteComment('${lessonId}','${doc.id}')" style="background:none;border:none;color:rgba(239,68,68,0.4);cursor:pointer;font-size:12px;padding:0 2px;flex-shrink:0;align-self:flex-start;"><i class="fas fa-trash-alt"></i></button>` : ''}
                </div>
            </div>`;
        }

        // *** إصلاح Bug 2 ***
        // قبل ما نحدث الـ DOM، نتحقق إن مفيش render أحدث منا
        // لو في render أحدث، ده معناه البيانات دي قديمة ومش المفروض تظهر
        if (myVersion !== commentsRenderVersion) return;

        countEl.innerText = totalCount;
        list.innerHTML = html;

    } catch(e) {
        console.error('Comments render error:', e);
    }
}

// إعادة رسم يدوية (بعد إضافة/حذف الردود)
async function forceReloadComments(lessonId) {
    try {
        const snap = await db.collection('comments').doc(lessonId)
            .collection('messages').orderBy('createdAt','asc').get();
        // نستخدم نفس doRenderComments اللي فيها نظام الإصدارات
        // لو في render أحدث منها خلال الـ await، النتيجة هتتجاهل تلقائياً
        await doRenderComments(lessonId, snap);
    } catch(e) {
        console.error('Force reload error:', e);
    }
}

// ============================================
//  تبديل إظهار/إخفاء الردود
// ============================================
function toggleReplies(commentId) {
    const container = document.getElementById(`replies-container-${commentId}`);
    const btn = document.getElementById(`replies-toggle-btn-${commentId}`);
    const moreBtn = document.getElementById(`replies-more-btn-${commentId}`);
    if (!container || !btn) return;

    const isHidden = container.style.display === 'none' || container.style.display === '';
    const replies = _repliesCache[commentId] || [];
    const total = replies.length;

    if (isHidden) {
        // عرض الصفحة الأولى
        const firstPage = replies.slice(0, REPLIES_PAGE_SIZE);
        container.innerHTML = firstPage.join('');
        container.style.display = 'block';

        btn.innerHTML = '<i class="fas fa-chevron-up" style="font-size:9px;"></i> إخفاء الردود ↑';
        btn.style.background = 'rgba(197,160,89,0.15)';

        // زرار "عرض المزيد"
        if (moreBtn) {
            if (total > REPLIES_PAGE_SIZE) {
                moreBtn.dataset.offset = REPLIES_PAGE_SIZE;
                moreBtn.innerHTML = `<i class="fas fa-ellipsis-h" style="font-size:9px;margin-left:4px;"></i> عرض المزيد (${total - REPLIES_PAGE_SIZE} متبقي)`;
                moreBtn.style.display = 'inline-flex';
            } else {
                moreBtn.style.display = 'none';
            }
        }
    } else {
        // إخفاء الردود
        container.style.display = 'none';
        container.innerHTML = '';

        btn.innerHTML = `<i class="fas fa-comment-dots" style="font-size:9px;"></i> عرض ${total} ${total === 1 ? 'رد' : 'ردود'} ↓`;
        btn.style.background = 'rgba(197,160,89,0.08)';

        if (moreBtn) moreBtn.style.display = 'none';
    }
}

// ============================================
//  عرض المزيد من الردود
// ============================================
function showMoreReplies(commentId) {
    const container = document.getElementById(`replies-container-${commentId}`);
    const moreBtn = document.getElementById(`replies-more-btn-${commentId}`);
    if (!container || !moreBtn) return;

    const replies = _repliesCache[commentId] || [];
    const currentOffset = parseInt(moreBtn.dataset.offset || '0');
    const nextPage = replies.slice(currentOffset, currentOffset + REPLIES_PAGE_SIZE);

    // إضافة الردود الجديدة بعد الموجودين
    nextPage.forEach(html => {
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        while (tmp.firstChild) container.appendChild(tmp.firstChild);
    });

    const newOffset = currentOffset + REPLIES_PAGE_SIZE;
    moreBtn.dataset.offset = newOffset;

    const remaining = replies.length - newOffset;
    if (remaining <= 0) {
        moreBtn.style.display = 'none';
    } else {
        moreBtn.innerHTML = `<i class="fas fa-ellipsis-h" style="font-size:9px;margin-left:4px;"></i> عرض المزيد (${remaining} متبقي)`;
    }
}

function startReply(commentId, displayName, replyToText) {
    replyingTo = { commentId, displayName, replyToText: replyToText || '' };
    const input = document.getElementById('comment-input');
    input.placeholder = `ردك على ${displayName}...`;
    input.focus();
    input.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const indicator = document.getElementById('reply-indicator');
    if (indicator) {
        indicator.style.display = 'flex';
        indicator.querySelector('#reply-to-name').innerText = displayName;
        const snippetEl = document.getElementById('reply-to-snippet');
        if (snippetEl) {
            if (replyToText) {
                snippetEl.innerText = replyToText;
                snippetEl.style.display = 'block';
            } else {
                snippetEl.style.display = 'none';
            }
        }
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
        const targetCommentId = replyingTo.commentId;
        const replyToName = replyingTo.displayName || '';
        const replyToText = replyingTo.replyToText || '';
        cancelReply();
        await db.collection('comments').doc(currentLessonId)
            .collection('messages').doc(targetCommentId)
            .collection('replies').add({
                text, displayName,
                email: user.email.toLowerCase(),
                avatar: user.photoURL || '',
                replyToName,
                replyToText,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        await forceReloadComments(currentLessonId);
    } else {
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
    // *** إصلاح Bug 1 ***
    // الـ onSnapshot على messages مش بيشتغل لما حاجة في replies بتتحذف
    // فلازم نعمل reload يدوي بعد الحذف عشان الـ UI يتحدث
    await db.collection('comments').doc(lessonId)
        .collection('messages').doc(commentId)
        .collection('replies').doc(replyId).delete();
    await forceReloadComments(lessonId);
}

// ============================================
//  بروفايل المستخدم للمشرف العام 👑
// ============================================
async function viewUserProfile(email, displayName, avatar) {
    if (currentUserRole !== 'master') return;
    const userDoc = await db.collection('users_access').doc(email.toLowerCase()).get();
    const data = userDoc.data() || {};
    const role = data.role || 'student';
    const name = resolveUserName(data) || email.split('@')[0];
    const isNewUser = !resolveUserName(data) && !data.photoURL;
    const roleLabels = { master:'👑 مشرف عام', student:'🎓 طالب' };

    // أفاتار بالمساعد الموحّد
    const profileAvatarHtml = buildAvatarHtml(
        data,
        email,
        'width:56px;height:56px;border-radius:14px;border:2px solid #c5a059;flex-shrink:0;font-size:22px;'
    );

    const watchedDoc = await db.collection('watched').doc(email.toLowerCase()).get();
    const allWatched = watchedDoc.data()?.lessons || [];
    const watchedSet = new Set(allWatched);

    const gradesToShow = role === 'master'
        ? ['1-mid','2-mid','3-mid','1-sec','2-sec','3-sec']
        : (data.allowedGrades || []);

    // جلب بيانات الصفوف بالتوازي
    const gradeResults = await Promise.all(gradesToShow.map(async grade => {
        const snap = await db.collection('lessons').where('grade','==',grade).get();
        const total = snap.size;
        const watched = snap.docs.filter(d => watchedSet.has(d.id)).length;
        return { grade, total, watched };
    }));

    let progressHtml = '';
    gradeResults.forEach(({ grade, total, watched }) => {
        const pct = total > 0 ? Math.round((watched / total) * 100) : 0;
        const isDone = pct === 100 && total > 0;
        progressHtml += `
        <div style="margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                <div style="display:flex;align-items:center;gap:5px;">
                    <span style="color:rgba(255,255,255,0.8);font-family:'Cairo',sans-serif;font-size:11px;font-weight:700;">${gradeMap[grade]}</span>
                    ${isDone ? '<span style="color:#22c55e;font-size:9px;">✅</span>' : ''}
                </div>
                <span style="color:rgba(255,255,255,0.4);font-family:'Cairo',sans-serif;font-size:10px;">${watched}/${total}</span>
            </div>
            <div style="background:rgba(255,255,255,0.08);border-radius:20px;height:7px;overflow:hidden;">
                <div style="height:100%;width:${pct}%;background:${isDone?'#22c55e':'#c5a059'};border-radius:20px;"></div>
            </div>
            <span style="color:${isDone?'#22c55e':'#c5a059'};font-family:'Cairo',sans-serif;font-size:9px;font-weight:700;">${pct}%</span>
        </div>`;
    });

    await Swal.fire({
        html: `
        <div style="font-family:'Cairo',sans-serif;direction:rtl;text-align:right;max-height:70vh;overflow-y:auto;">
            <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;">
                ${profileAvatarHtml}
                <div style="min-width:0;">
                    <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:2px;">
                        <p style="margin:0;color:${isNewUser?'rgba(255,255,255,0.5)':'white'};font-weight:${isNewUser?'600':'900'};font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${isNewUser?'font-style:italic;':''}">${name}</p>
                        ${isNewUser ? '<span style="background:rgba(100,116,139,0.2);color:rgba(255,255,255,0.4);font-size:8px;padding:1px 6px;border-radius:10px;flex-shrink:0;">لم يسجّل دخول بعد</span>' : ''}
                    </div>
                    <p style="margin:3px 0 0;color:rgba(255,255,255,0.4);font-size:10px;overflow:hidden;text-overflow:ellipsis;">${email}</p>
                    <span style="font-size:11px;color:#c5a059;font-weight:700;">${roleLabels[role]||role}</span>
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
                <div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:12px;text-align:center;">
                    <p style="color:#c5a059;font-size:22px;font-weight:900;margin:0;">${allWatched.length}</p>
                    <p style="color:rgba(255,255,255,0.4);font-size:10px;margin:4px 0 0;">درس شاهده</p>
                </div>
                <div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:12px;text-align:center;">
                    <p style="color:#c5a059;font-size:13px;font-weight:900;margin:0;">${gradeMap[data.lastGrade] || '-'}</p>
                    <p style="color:rgba(255,255,255,0.4);font-size:10px;margin:4px 0 0;">آخر صف</p>
                </div>
            </div>
            ${gradesToShow.length > 0 ? `
            <div style="background:#0f172a;border:1px solid rgba(197,160,89,0.12);border-radius:14px;padding:14px;margin-bottom:4px;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:12px;">
                    <i class="fas fa-chart-line" style="color:#c5a059;font-size:11px;"></i>
                    <span style="color:white;font-family:'Cairo',sans-serif;font-weight:900;font-size:12px;">الإنجازات الدراسية</span>
                </div>
                ${progressHtml}
            </div>` : ''}
        </div>`,
        background: '#111827',
        color: '#fff',
        showConfirmButton: false,
        showCloseButton: true,
        heightAuto: false,
    });
}

// ============================================
//  متابعة الطلاب - تبويب المشرف العام 📊
// ============================================
let studentsDataCache = [];
// بيانات مؤقتة لنافذة دروس الطالب
let _swWatchedItems = { all: [], videos: [], images: [] };

async function loadStudentsMonitor() {
    const container = document.getElementById('students-monitor-list');
    const badge = document.getElementById('students-count-badge');
    if (!container) return;

    container.innerHTML = `<div style="text-align:center;padding:30px;color:rgba(255,255,255,0.3);font-family:'Cairo',sans-serif;font-size:13px;">
        <i class="fas fa-spinner fa-spin" style="font-size:20px;margin-bottom:8px;display:block;"></i> جاري التحميل...
    </div>`;

    const snap = await db.collection('users_access').get();
    const students = [];
    snap.forEach(doc => {
        const d = doc.data();
        if (d.role !== 'master') {
            students.push({ email: doc.id, ...d });
        }
    });

    if (badge) badge.innerText = students.length;
    studentsDataCache = students;

    if (students.length === 0) {
        container.innerHTML = `<div style="text-align:center;padding:30px;color:rgba(255,255,255,0.3);font-family:'Cairo',sans-serif;font-size:13px;">لا يوجد طلاب مسجلون</div>`;
        return;
    }

    // جلب عدد المشاهدات لكل طالب
    const watchedPromises = students.map(s =>
        db.collection('watched').doc(s.email).get()
            .then(d => ({ email: s.email, count: (d.data()?.lessons || []).length }))
            .catch(() => ({ email: s.email, count: 0 }))
    );
    const watchedResults = await Promise.all(watchedPromises);
    const watchedMap = Object.fromEntries(watchedResults.map(r => [r.email, r.count]));

    renderStudentsList(students, watchedMap);
}

function renderStudentsList(students, watchedMap) {
    const container = document.getElementById('students-monitor-list');
    if (!container) return;

    if (students.length === 0) {
        container.innerHTML = `<div style="text-align:center;padding:20px;color:rgba(255,255,255,0.3);font-family:'Cairo',sans-serif;font-size:12px;">لا توجد نتائج</div>`;
        return;
    }

    let html = '';
    students.forEach(s => {
        // الاسم والأفاتار بمنطق موحّد
        const resolvedName = resolveUserName(s);
        const isNewUser    = !resolvedName && !s.photoURL;
        const displayName  = resolvedName || (isNewUser ? 'مستخدم جديد' : s.email);

        const avatarHtml = buildAvatarHtml(
            s,
            s.email,
            'width:40px;height:40px;border-radius:11px;border:1px solid rgba(197,160,89,0.25);flex-shrink:0;'
        );

        const count = watchedMap?.[s.email] ?? 0;
        const gradeNames = (s.allowedGrades || []).map(g => ({
            '1-mid':'إعدادي١','2-mid':'إعدادي٢','3-mid':'إعدادي٣',
            '1-sec':'ثانوي١','2-sec':'ثانوي٢','3-sec':'ثانوي٣'
        }[g] || g)).join(' · ');
        const safeName   = displayName.replace(/'/g, "\\'");
        const safeAvatar = (s.photoURL || '').replace(/'/g, "\\'");

        html += `
        <div onclick="showStudentWatchedDetails('${s.email}','${safeName}','${safeAvatar}')"
             style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;cursor:pointer;transition:all 0.2s;"
             onmouseover="this.style.borderColor='rgba(197,160,89,0.3)';this.style.background='rgba(197,160,89,0.04)'"
             onmouseout="this.style.borderColor='rgba(255,255,255,0.06)';this.style.background='rgba(255,255,255,0.03)'"
             data-name="${displayName.toLowerCase()}" data-email="${s.email.toLowerCase()}">
            ${avatarHtml}
            <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:1px;">
                    <p style="color:${isNewUser?'rgba(255,255,255,0.4)':'white'};font-family:'Cairo',sans-serif;font-size:12px;font-weight:${isNewUser?'600':'900'};margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${isNewUser?'font-style:italic;':''}">${displayName}</p>
                    ${isNewUser ? '<span style="background:rgba(100,116,139,0.2);color:rgba(255,255,255,0.4);font-size:8px;padding:1px 5px;border-radius:10px;flex-shrink:0;">جديد</span>' : ''}
                </div>
                <p style="color:rgba(255,255,255,0.3);font-family:'Cairo',sans-serif;font-size:9px;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:ltr;text-align:right;">${s.email}</p>
                ${gradeNames ? `<p style="color:rgba(197,160,89,0.7);font-family:'Cairo',sans-serif;font-size:9px;font-weight:700;margin:2px 0 0;">${gradeNames}</p>` : ''}
            </div>
            <div style="text-align:center;flex-shrink:0;min-width:36px;">
                <p style="color:#c5a059;font-family:'Cairo',sans-serif;font-size:17px;font-weight:900;margin:0;line-height:1;">${count}</p>
                <p style="color:rgba(255,255,255,0.25);font-family:'Cairo',sans-serif;font-size:8px;margin:2px 0 0;">درس</p>
            </div>
            <i class="fas fa-chevron-left" style="color:rgba(255,255,255,0.15);font-size:10px;flex-shrink:0;"></i>
        </div>`;
    });
    container.innerHTML = html;
}

// ============================================
//  نافذة تفاصيل دروس الطالب المشاهدة
// ============================================
async function showStudentWatchedDetails(email, name, avatar) {
    if (currentUserRole !== 'master') return;

    // نافذة تحميل أولاً
    Swal.fire({
        html: `<div style="font-family:'Cairo',sans-serif;direction:rtl;text-align:center;padding:20px;">
            <i class="fas fa-spinner fa-spin" style="color:#c5a059;font-size:24px;"></i>
            <p style="color:rgba(255,255,255,0.4);font-size:12px;margin-top:10px;">جاري تحميل بيانات الطالب...</p>
        </div>`,
        background: '#111827',
        color: '#fff',
        showConfirmButton: false,
        showCloseButton: true,
        heightAuto: false,
        allowOutsideClick: true,
    });

    try {
        const [userDoc, watchedDoc, allLessonsSnap] = await Promise.all([
            db.collection('users_access').doc(email.toLowerCase()).get(),
            db.collection('watched').doc(email.toLowerCase()).get(),
            db.collection('lessons').get()
        ]);

        const userData = userDoc.data() || {};
        const resolvedName   = resolveUserName(userData) || name || email;
        const isNewUser      = !resolveUserName(userData) && !userData.photoURL;
        // نستخدم photoURL المخزّن — أفاتار المزوّد الفعلي بدون توليد بديل
        const resolvedAvatar = userData.photoURL || '';

        // بناء أفاتار الرأس بالمساعد الموحّد
        const headerAvatarHtml = buildAvatarHtml(
            userData,
            email,
            'width:50px;height:50px;border-radius:13px;border:2px solid #c5a059;flex-shrink:0;font-size:20px;'
        );

        const watchedIds = new Set(watchedDoc.data()?.lessons || []);
        const allowedGrades = userData.role === 'master'
            ? null // المشرف يرى كل شيء
            : (userData.allowedGrades || []);

        // فهرس الدروس
        const lessonsMap = {};
        allLessonsSnap.forEach(d => { lessonsMap[d.id] = { ...d.data(), _id: d.id }; });

        const allWatched = [], watchedVideos = [], watchedImages = [];
        watchedIds.forEach(id => {
            const lesson = lessonsMap[id];
            if (!lesson) return;
            // فلترة بالصفوف المسموح بها الحالية للطالب فقط
            if (allowedGrades && !allowedGrades.includes(lesson.grade)) return;
            allWatched.push(lesson);
            if (lesson.type === 'image') watchedImages.push(lesson);
            else watchedVideos.push(lesson);
        });

        _swWatchedItems = { all: allWatched, videos: watchedVideos, images: watchedImages };

        const gradeNames = (userData.allowedGrades || []).map(g => ({
            '1-mid':'إعدادي١','2-mid':'إعدادي٢','3-mid':'إعدادي٣',
            '1-sec':'ثانوي١','2-sec':'ثانوي٢','3-sec':'ثانوي٣'
        }[g] || g)).join(' · ');

        const html = `
        <div style="font-family:'Cairo',sans-serif;direction:rtl;text-align:right;">
            <!-- رأس: صورة + معلومات -->
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
                ${headerAvatarHtml}
                <div style="min-width:0;flex:1;">
                    <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:1px;">
                        <p style="margin:0;color:${isNewUser?'rgba(255,255,255,0.5)':'white'};font-weight:${isNewUser?'600':'900'};font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${isNewUser?'font-style:italic;':''}">${resolvedName}</p>
                        ${isNewUser ? '<span style="background:rgba(100,116,139,0.2);color:rgba(255,255,255,0.4);font-size:8px;padding:1px 6px;border-radius:10px;flex-shrink:0;">لم يسجّل دخول بعد</span>' : ''}
                    </div>
                    <p style="margin:2px 0;color:rgba(255,255,255,0.3);font-size:9px;overflow:hidden;text-overflow:ellipsis;direction:ltr;text-align:right;">${email}</p>
                    ${gradeNames ? `<p style="margin:2px 0;color:rgba(197,160,89,0.8);font-size:9px;font-weight:700;">${gradeNames}</p>` : ''}
                </div>
            </div>
            <!-- إحصائيات ثلاثية -->
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:12px;">
                <div style="background:rgba(255,255,255,0.05);border-radius:11px;padding:9px 5px;text-align:center;">
                    <p style="color:#c5a059;font-size:18px;font-weight:900;margin:0;line-height:1;">${allWatched.length}</p>
                    <p style="color:rgba(255,255,255,0.3);font-size:8px;margin:3px 0 0;">الكل</p>
                </div>
                <div style="background:rgba(255,255,255,0.05);border-radius:11px;padding:9px 5px;text-align:center;">
                    <p style="color:#c5a059;font-size:18px;font-weight:900;margin:0;line-height:1;">${watchedVideos.length}</p>
                    <p style="color:rgba(255,255,255,0.3);font-size:8px;margin:3px 0 0;">🎥 محاضرة</p>
                </div>
                <div style="background:rgba(255,255,255,0.05);border-radius:11px;padding:9px 5px;text-align:center;">
                    <p style="color:#c5a059;font-size:18px;font-weight:900;margin:0;line-height:1;">${watchedImages.length}</p>
                    <p style="color:rgba(255,255,255,0.3);font-size:8px;margin:3px 0 0;">🖼️ صورة</p>
                </div>
            </div>
            <!-- تبويبات -->
            <div style="display:flex;gap:4px;background:rgba(0,0,0,0.4);border-radius:11px;padding:4px;margin-bottom:10px;">
                <button id="sw-tab-all" onclick="swSetTab('all')"
                    style="flex:1;padding:7px 3px;border-radius:8px;border:none;cursor:pointer;font-family:'Cairo',sans-serif;font-size:10px;font-weight:900;transition:all 0.2s;background:#c5a059;color:#080c14;">
                    الكل (${allWatched.length})
                </button>
                <button id="sw-tab-video" onclick="swSetTab('video')"
                    style="flex:1;padding:7px 3px;border-radius:8px;border:none;cursor:pointer;font-family:'Cairo',sans-serif;font-size:10px;font-weight:700;transition:all 0.2s;background:transparent;color:rgba(255,255,255,0.45);">
                    🎥 (${watchedVideos.length})
                </button>
                <button id="sw-tab-image" onclick="swSetTab('image')"
                    style="flex:1;padding:7px 3px;border-radius:8px;border:none;cursor:pointer;font-family:'Cairo',sans-serif;font-size:10px;font-weight:700;transition:all 0.2s;background:transparent;color:rgba(255,255,255,0.45);">
                    🖼️ (${watchedImages.length})
                </button>
            </div>
            <!-- قائمة الدروس -->
            <div id="sw-lessons-list"
                 style="max-height:210px;overflow-y:auto;background:#0f172a;border:1px solid rgba(255,255,255,0.06);border-radius:12px;">
            </div>
        </div>`;

        Swal.update({ html, showCloseButton: true, showConfirmButton: false });
        swSetTab('all');

    } catch (e) {
        console.error('showStudentWatchedDetails error:', e);
        Swal.update({
            html: `<div style="font-family:'Cairo',sans-serif;color:rgba(255,255,255,0.4);text-align:center;padding:20px;">حدث خطأ في تحميل البيانات</div>`,
            showCloseButton: true, showConfirmButton: false,
        });
    }
}

// تبديل تبويب دروس الطالب داخل SweetAlert2
function swSetTab(tab) {
    ['all', 'video', 'image'].forEach(t => {
        const btn = document.getElementById(`sw-tab-${t}`);
        if (!btn) return;
        if (t === tab) { btn.style.background = '#c5a059'; btn.style.color = '#080c14'; }
        else { btn.style.background = 'transparent'; btn.style.color = 'rgba(255,255,255,0.45)'; }
    });

    const list = document.getElementById('sw-lessons-list');
    if (!list) return;

    const items = tab === 'video' ? _swWatchedItems.videos
                : tab === 'image' ? _swWatchedItems.images
                : _swWatchedItems.all;

    if (items.length === 0) {
        list.innerHTML = `<div style="text-align:center;padding:22px;color:rgba(255,255,255,0.2);font-family:'Cairo',sans-serif;font-size:11px;">
            <i class="fas fa-${tab === 'image' ? 'image' : 'play-circle'}" style="font-size:18px;display:block;margin-bottom:7px;opacity:0.3;"></i>
            لم يشاهد أي محتوى من هذا القسم بعد
        </div>`;
        return;
    }

    list.innerHTML = items.map((item, idx) => `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;${idx < items.length - 1 ? 'border-bottom:1px solid rgba(255,255,255,0.04);' : ''}">
            <span style="font-size:11px;flex-shrink:0;">${item.type === 'image' ? '🖼️' : '🎥'}</span>
            <p style="color:rgba(255,255,255,0.82);font-family:'Cairo',sans-serif;font-size:11px;font-weight:700;margin:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.title}</p>
            <span style="color:rgba(255,255,255,0.18);font-family:'Cairo',sans-serif;font-size:8px;white-space:nowrap;flex-shrink:0;">${gradeMap[item.grade] || ''}</span>
        </div>
    `).join('');
}


function filterStudentsList() {
    const query = document.getElementById('students-search')?.value?.toLowerCase() || '';
    const items = document.querySelectorAll('#students-monitor-list [data-name]');
    items.forEach(item => {
        const name = item.dataset.name || '';
        const email = item.dataset.email || '';
        item.style.display = (name.includes(query) || email.includes(query)) ? '' : 'none';
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