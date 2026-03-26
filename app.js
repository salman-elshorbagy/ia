let s_grade = localStorage.getItem('s_grade');
let editingId = null;
let unsubscribe = null;
// إدارة حالة تسجيل الدخول - النسخة المعتمدة على الرتب
auth.onAuthStateChanged(async (user) => {
    if (user) {
        try {
            const userEmail = user.email.toLowerCase();
            const userDoc = await db.collection("users_access").doc(userEmail).get();

           if (!userDoc.exists) {
                await auth.signOut();
                
                // إظهار شاشة اللوجن فوراً عشان نضمن إننا واقفين عليها
                showLoginScreen();

                await Swal.fire({
                    title: 'عفواً.. الحساب غير مسجل!',
                    text: 'إيميلك مش متضاف في المنصة، تواصل مع مستر محمد الشربيني لتفعيل حسابك.',
                    icon: 'error',
                    confirmButtonText: 'حسناً، فهمت',
                    background: '#111827',
                    color: '#fff',
                    confirmButtonColor: '#c5a059',
                    // --- السطرين دول هما الحل ---
                    target: document.getElementById('auth-screen'), // تظهر جوه شاشة اللوجن نفسها
                    heightAuto: false,
                    // ----------------------------
                    allowOutsideClick: false,
                    allowEscapeKey: false
                });
                
                return;
            }

            const userData = userDoc.data();
            const userRole = userData.role;
            // جلب الصف من الداتابيز لو ملوش صف في الـ localStorage
            const savedGrade = userData.lastGrade; 

            document.getElementById('auth-screen').style.display = 'none';
            document.getElementById('app-header').classList.remove('hidden');
            document.getElementById('app-content').classList.remove('hidden');

            updateUserProfile(user);

            // صلاحية زرار الإدارة
            const adminBtn = document.querySelector('button[onclick="checkAdmin()"]');
            if (userRole === 'master' || userRole === 'teacher') {
                if (adminBtn) {
                    adminBtn.style.display = 'flex';
                    adminBtn.setAttribute('onclick', 'openAdminDirect()');
                }
            } else {
                if (adminBtn) adminBtn.style.display = 'none';
            }

            // === المنطق الجديد لاختيار الصف ===
            if (s_grade) {
                // لو المتصفح فاكر الصف (زي ما إحنا)
                selectGrade(s_grade, "");
            } else if (savedGrade) {
                // لو المتصفح نسي بس الداتابيز فاكرة
                selectGrade(savedGrade, "");
            } else {
                // لو أول مرة يدخل خالص ومفيش أي بيانات
                openGradePicker();
            }
            // ================================

        } catch (error) {
            console.error("Access Error:", error);
            auth.signOut();
        }
    } else {
        showLoginScreen();
    }
});

// دالة مساعدة لتحديث بيانات البروفايل
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

async function login() { 
    try {
        const p = new firebase.auth.GoogleAuthProvider();
        await auth.signInWithPopup(p); 
    } catch (error) {
        // خطأ popup_closed_by_user يعني المستخدم أغلق النافذة بنفسه - مش مشكلة
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

function openGradePicker() { 
    document.getElementById('grade-picker').classList.remove('hidden'); 
    if(document.getElementById('drop-menu').style.display === 'flex') toggleMenu(); 
}

// ضفنا async هنا عشان الدالة بقت بتكلم الداتابيز
async function selectGrade(id, name) {
    s_grade = id;
    localStorage.setItem('s_grade', id);
    document.getElementById('grade-picker').classList.add('hidden');
    
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = "";
    
    const map = {
        '1-mid':'الأول الإعدادي',
        '2-mid':'الثاني الإعدادي',
        '3-mid':'الثالث الإعدادي',
        '1-sec':'الأول الثانوي',
        '2-sec':'الثاني الثانوي',
        '3-sec':'الثالث الثانوي'
    };
    document.getElementById('grade-title').innerText = "محاضرات " + (name || map[id]);

    // دي الحتة اللي بتكلم الداتابيز (users_access)
    if (auth.currentUser) {
        const userEmail = auth.currentUser.email.toLowerCase();
        // await هنا معناها "استنى لما ترفع الصف للفايربيس وبعدين كمل"
        await db.collection("users_access").doc(userEmail).set({
            lastGrade: id
        }, { merge: true }).catch(e => console.log("Grade sync failed"));
    }

    loadLessons(id);
}

// دالة تنسيق الروابط (YouTube & Google Drive)
function formatUrl(url) {
    if (url.includes('youtube.com/watch?v=')) return url.replace('watch?v=', 'embed/') + "?rel=0&showinfo=0&controls=0";
    if (url.includes('youtu.be/')) return url.replace('youtu.be/', 'youtube.com/embed/') + "?rel=0&showinfo=0&controls=0";
    if (url.includes('drive.google.com')) return url.replace(/\/view.*|\/edit.*|\/preview.*/, '/preview');
    return url;
}

function loadLessons(grade) {
    const grid = document.getElementById('lesson-grid');
    const template = document.getElementById('lesson-card-template');
    
    grid.innerHTML = "";

    db.collection("lessons").where("grade", "==", grade).onSnapshot((querySnapshot) => {
        grid.innerHTML = ""; 
        
        querySnapshot.forEach((doc) => {
            const item = doc.data();
            const lessonId = doc.id;
            const clone = template.content.cloneNode(true);
            const url = item.url;

            let thumbnailUrl = "";
            if (url.includes('youtube.com') || url.includes('youtu.be')) {
                const videoId = url.split('v=')[1]?.split('&')[0] || url.split('/').pop();
                thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
            } else if (url.includes('drive.google.com')) {
                const match = url.match(/\/d\/(.+?)\//);
                if (match) thumbnailUrl = `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1000`;
            }

            const mediaBox = clone.querySelector('.card-media-box');
            mediaBox.innerHTML = `
                <div class="video-preview-container">
                    <img src="${thumbnailUrl}" class="video-thumb-img" onerror="this.src='https://via.placeholder.com/640x360/111827/FFFFFF?text=Lesson+Video'">
                    <div class="play-icon-overlay"><i class="fas fa-play"></i></div>
                </div>`;

            clone.querySelector('.lesson-name').innerText = item.title;

            // تحميل التقييم
            const starsContainer = clone.querySelector('.star-rating');
            if (starsContainer) {
                starsContainer.setAttribute('data-lesson-id', lessonId);
                // نحمل التقييم بعد ما الكارت يتضاف في الـ DOM
                setTimeout(() => loadRating(lessonId, starsContainer), 100);
            }

            const card = clone.querySelector('.lesson-card');
            card.onclick = () => {
                playVideo(item.url, lessonId, item.title);
                markWatched(lessonId);
            };

            grid.appendChild(clone);
        });
    });
}

async function publish() { 
    const title = document.getElementById('v-title').value; 
    const url = document.getElementById('v-url').value; 
    const grade = document.getElementById('v-grade').value; 
    const btn = document.getElementById('pub-btn');

    if(!title || !url) return showToast("أكمل البيانات!", "error"); // كلمة error هنا هي اللي هتحط علامة الـ (X) الحمراء 
    
    btn.disabled = true;
    btn.innerText = "جاري الحفظ... ⏳";

    try {
        if (editingId) {
            // وضع التعديل: تحديث المستند الموجود
            await db.collection("lessons").doc(editingId).update({
                title: title,
                url: url,
                grade: grade
            });
            showToast("تم تحديث الدرس بنجاح ✅");
        } else {
            // وضع الإضافة: إنشاء مستند جديد
            await db.collection("lessons").add({ 
                title: title, 
                url: url, 
                grade: grade, 
                createdAt: firebase.firestore.FieldValue.serverTimestamp() 
            });
            showToast("تم نشر الدرس بنجاح 🚀");
        }

        // إعادة ضبط اللوحة للوضع الطبيعي
        resetAdminForm();
    } catch (e) {
        console.error(e);
        showToast("حدث خطأ!");
    } finally {
        btn.disabled = false;
    }
}

// وظيفة مساعدة لمسح الخانات وإرجاع الزرار لأصله
function resetAdminForm() {
    editingId = null;
    document.getElementById('v-title').value = "";
    document.getElementById('v-url').value = "";
    const btn = document.getElementById('pub-btn');
    btn.innerText = "نشر الدرس الآن 🚀";
    btn.className = "btn-gold p-5 rounded-2xl font-black text-lg";
}

function loadAdminLessons() { 
    const list = document.getElementById('admin-lessons-list');
    
    // هنجيب الدروس ونعمل لها ترتيب بالتاريخ
    db.collection("lessons").orderBy("createdAt", "desc").onSnapshot(snap => { 
        let h = "";
        let count = 0; // عداد عشان نعرف فيه دروس ولا لأ

        snap.forEach(doc => { 
            const data = doc.data();

            // ================= الشرط السحري هنا =================
            // لو "صف الدرس" بيساوي "الصف اللي أنا فاتحه دلوقتي" بس هو اللي يظهر
            if (data.grade === s_grade) {
                count++;
              h += `
<div class="flex justify-between items-center bg-white/5 border border-white/10 p-2 mb-2 rounded-lg gap-2">
    
    <div class="flex-1 overflow-hidden">
        <p class="text-white text-xs sm:text-sm font-bold whitespace-nowrap overflow-hidden text-ellipsis m-0">
            ${data.title}
        </p>
    </div>

    <div class="flex gap-1.5 flex-shrink-0">
        <button onclick="prepareEdit('${doc.id}', '${data.title}', '${data.url}', '${data.grade}')" 
                class="bg-blue-500/20 text-blue-400 border border-blue-500/30 px-3 py-1.5 rounded text-[11px] font-bold whitespace-nowrap hover:bg-blue-600 hover:text-white transition">
            تعديل
        </button>
        <button onclick="deleteDoc('${doc.id}')" 
                class="bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1.5 rounded text-[11px] font-bold whitespace-nowrap hover:bg-red-600 hover:text-white transition">
            حذف
        </button>
    </div>
</div>
`;
            }
        });

        // لو مفيش دروس في الصف ده، نعرض رسالة بسيطة
        if (count === 0) {
            list.innerHTML = `<div class="text-center py-8 text-gray-500 font-bold text-sm">لا توجد دروس مرفوعة لهذا الصف حالياً.</div>`;
        } else {
            list.innerHTML = h;
        }
    });
}

async function deleteDoc(id) {
    const result = await Swal.fire({
        // التارجت هنا المودال عشان الرسالة تظهر فوقه بالظبط
        target: document.getElementById('admin-modal'), 
        title: 'حذف الفيديو؟',
        text: "لن تتمكن من استعادة هذا الفيديو مجدداً بعد الحذف",
        icon: 'error',
        showCancelButton: true,
        confirmButtonColor: '#ef4444', // أحمر للحذف
        cancelButtonColor: '#6b7280', // رمادي للإلغاء
        confirmButtonText: 'نعم، احذف نهائياً',
        cancelButtonText: 'تراجع',
        background: '#111827',
        color: '#fff',
        // السطور اللي بتثبت الرسالة في نص الشاشة ومنع السكرول
        heightAuto: false,
        scrollbarPadding: false,
        returnFocus: false
    });

    if (result.isConfirmed) {
        try {
            await db.collection("lessons").doc(id).delete();
            showToast("تم حذف الفيديو بنجاح ✅");
            // لو عايز تحدث القائمة فوراً
            if(typeof loadAdminLessons === "function") loadAdminLessons();
        } catch (error) {
            showToast("حدث خطأ أثناء الحذف", "error");
        }
    }
}

// --- تعديل بسيط لضمان تفعيل الزر عند فتح اللوحة ---
function openAdminDirect() {
    document.getElementById('admin-modal').style.display = 'flex';
    
    // تأكد من استدعاء التبديل هنا لضبط الشكل الافتراضي
    switchTab('lessons'); 
    
    loadAdminLessons();
    loadUsersList();
}

function closeAdmin() { 
    document.getElementById('admin-modal').style.display = 'none'; 
    resetAdminForm(); 
    // يفضل ترجعها للوضع الافتراضي
    switchTab('lessons');
}

async function addUser() {
    const emailInput = document.getElementById('new-user-email');
    const email = emailInput.value.trim().toLowerCase();
    const role = document.getElementById('new-user-role').value;
    const btn = document.getElementById('add-user-btn');

    if (!email) return showToast("اكتب الإيميل الأول!", "warning");

    btn.disabled = true;
    try {
        const myDoc = await db.collection("users_access").doc(auth.currentUser.email.toLowerCase()).get();
        const myRole = myDoc.data()?.role;

        // --- الجزء السحري هنا ---
        // لو بنعدل (الزرار فيه كلمة تحديث) والإيميل الجديد مختلف عن الإيميل اللي ضغطنا عليه تعديل
        if (btn.innerText.includes("تحديث") && editingId && editingId !== email) {
            // حذف الإيميل القديم أولاً لأنه اتغير
            await db.collection("users_access").doc(editingId).delete();
        }

        // فحص الحماية للمساعد
        if (myRole === 'teacher' && (role === 'master' || role === 'teacher')) {
             btn.disabled = false;
             return showToast("صلاحيتك إضافة طلاب فقط!", "error");
        }

        // حفظ البيانات (سواء إيميل جديد أو تحديث)
        await db.collection("users_access").doc(email).set({
            role: role,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        showToast("تم حفظ البيانات بنجاح ✅");
        
        // إعادة ضبط الفورم
        emailInput.value = "";
        editingId = null; // تصفير معرف التعديل
        btn.innerText = "إضافة الإيميل الآن +";
        btn.classList.remove('bg-green-600');
        btn.style.backgroundColor = "";

    } catch (e) {
        showToast("حدث خطأ في العملية", "error");
    } finally {
        btn.disabled = false;
    }
}


function loadUsersList() {
    const list = document.getElementById('admin-users-list');
    const currentUserEmail = auth.currentUser.email.toLowerCase();

    // 1. نجيب رتبة الشخص اللي فاتح اللوحة "مرة واحدة" الأول
    db.collection("users_access").doc(currentUserEmail).get().then(myDoc => {
        const myRole = myDoc.data()?.role;

        // 2. بعد ما عرفنا رتبتي، نبدأ نراقب قائمة المستخدمين
        db.collection("users_access").onSnapshot(snap => {
            let h = "";
            
            snap.forEach(doc => {
                const data = doc.data();
                const targetEmail = doc.id.toLowerCase();
                const targetRole = data.role;
                
                const isTargetMaster = targetRole === 'master';
                const isTargetTeacher = targetRole === 'teacher';
                const isTargetStudent = targetRole === 'student';
                const isTargetSelf = targetEmail === currentUserEmail;

                // تحديد شكل الرتبة (Badge)
                let badgeText = isTargetMaster ? "👑 المشرف العام" : isTargetTeacher ? "🛡️ مدرس مساعد" : "🎓 طالب";
                let badgeStyle = isTargetMaster ? "master-badge" : isTargetTeacher ? "text-yellow-500 font-bold" : "text-blue-400";

                h += `
                <div class="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 mb-2 animate__animated animate__fadeInUp">
                    <div class="flex flex-col text-right">
                        <span class="text-white text-[12px] font-bold">${doc.id}</span>
                        <span class="${badgeStyle} text-[10px]">${badgeText}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        
                        ${ (myRole === 'master' || (myRole === 'teacher' && isTargetStudent)) ? `
                            <button onclick="prepareUserEdit('${doc.id}', '${targetRole}')" 
                                    class="text-[10px] bg-blue-500/20 text-blue-400 px-3 py-1 rounded-md hover:bg-blue-500 hover:text-white transition font-bold">
                                تعديل
                            </button>` : '' 
                        }

                        ${ ( (myRole === 'master' && !isTargetSelf) || (myRole === 'teacher' && isTargetStudent) ) ? `
                            <button onclick="deleteUser('${doc.id}')" class="text-red-500 p-2 hover:bg-red-500/10 rounded-full transition">
                                <i class="fas fa-trash-alt"></i>
                            </button>` : '' 
                        }

                    </div>
                </div>`;
            });
            list.innerHTML = h || '<div class="text-gray-500 text-xs text-center">لا يوجد مستخدمين</div>';
        });
    });
}

function prepareUserEdit(email, role) {
    // تخزين الإيميل الأصلي في المتغير العالمي عشان لو غيرناه نحذفه
    editingId = email; 
    
    document.getElementById('new-user-email').value = email;
    document.getElementById('new-user-role').value = role;
    
    const addBtn = document.getElementById('add-user-btn');
    addBtn.innerText = "تحديث البيانات الآن 💾";
    addBtn.classList.add('bg-green-600');
    
    // سكرول بسيط لفوق عشان تبدأ تعدل
    document.getElementById('section-users').scrollIntoView({ behavior: 'smooth' });
    document.getElementById('new-user-email').focus();
}

// دالة إظهار شاشة تسجيل الدخول (اللي كانت بتعمل Error)
function showLoginScreen() {
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('app-header').classList.add('hidden');
    document.getElementById('app-content').classList.add('hidden');
}


async function deleteUser(email) {
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
        // --- السطور السحرية لحل مشكلة الظهور تحت ---
        heightAuto: false, // بيمنع المكتبة إنها تغير طول الصفحة
        scrollbarPadding: false,
        returnFocus: false, // عشان ما يرجعش يرميك في مكان غلط بعد ما تخلص
        // ------------------------------------------
    });

    if (result.isConfirmed) {
        await db.collection("users_access").doc(email).delete();
        showToast("تم حذف المستخدم بنجاح", "success");
    }
}

// closeAdmin معرّفة فوق بشكل كامل

function playVideo(url, lessonId, title) {
    currentLessonId = lessonId;
    currentLessonTitle = title;

    const frame = document.getElementById('main-video-frame');
    frame.src = formatUrl(url).replace("controls=0", "controls=1");
    document.getElementById('video-player-modal').style.display = 'block';
    document.getElementById('video-title-display').innerText = title || '';

    // صورة المستخدم في خانة التعليق
    const user = auth.currentUser;
    if (user) {
        document.getElementById('comment-my-avatar').src = user.photoURL || '';
    }

    // تحميل التقييم والتعليقات
    initModalStars(lessonId);
    loadModalRating(lessonId);
    listenComments(lessonId);

    pushStateForVideo();
}

function closePlayer() {
    document.getElementById('main-video-frame').src = "";
    document.getElementById('video-player-modal').style.display = 'none';
    document.getElementById('comment-input').value = '';
    if (commentsUnsubscribe) { commentsUnsubscribe(); commentsUnsubscribe = null; }
    if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
}

function filterVideos() {
    // 1. نجيب الكلمة اللي الطالب كتبها ونحولها لحروف صغيرة
    const searchValue = document.getElementById('search-input').value.toLowerCase();
    
    // 2. نجيب كل الكروت اللي معروضة حالياً في الصفحة
    const cards = document.querySelectorAll('.lesson-card');

    cards.forEach(card => {
        // 3. نجيب عنوان الدرس من جوه الكارت
        const title = card.querySelector('.lesson-name').innerText.toLowerCase();
        
        // 4. لو العنوان فيه الكلمة اللي بنبحث عنها، نظهره.. لو مفيش، نخفيه
        if (title.includes(searchValue)) {
            card.style.display = "flex"; // إظهار
            card.classList.add('animate__fadeIn'); // إضافة حركة بسيطة
        } else {
            card.style.display = "none"; // إخفاء
        }
    });
}

function prepareEdit(id, title, url, grade) {
    // 1. خزن معرف الدرس اللي بنعدله
    editingId = id;
    
    // 2. املأ الخانات بالبيانات القديمة
    document.getElementById('v-title').value = title;
    document.getElementById('v-url').value = url;
    document.getElementById('v-grade').value = grade;
    
    // 3. غير نص الزرار عشان تعرف إنك في وضع التعديل
    const btn = document.getElementById('pub-btn');
    btn.innerText = "تحديث البيانات الآن 💾";
    btn.classList.replace('btn-gold', 'bg-blue-600');
    
    // 4. اطلع فوق لأول المودال عشان تشوف الخانات
    document.querySelector('.admin-box').scrollTop = 0;
}

function switchTab(tabName) {
    const lessonsSection = document.getElementById('section-lessons');
    const usersSection = document.getElementById('section-users');
    const lessonsBtn = document.getElementById('btn-tab-lessons');
    const usersBtn = document.getElementById('btn-tab-users');

    // إزالة كلاس active من الزرارين
    lessonsBtn.classList.remove('active');
    usersBtn.classList.remove('active');

    if (tabName === 'lessons') {
        lessonsSection.classList.remove('hidden');
        usersSection.classList.add('hidden');
        lessonsBtn.classList.add('active'); // نور زرار الدروس
    } else {
        usersSection.classList.remove('hidden');
        lessonsSection.classList.add('hidden');
        usersBtn.classList.add('active'); // نور زرار الصلاحيات
    }
}

// حط دي في آخر ملف app.js
function showToast(msg, icon = 'success') {
    // بنحدد هنا لو لوحة الإدارة مفتوحة يرمي الرسالة جواها، لو مقفولة يرميها في الصفحة العادية
    const targetElement = document.getElementById('admin-modal').style.display === 'flex' 
                         ? document.getElementById('admin-modal') 
                         : document.body;

    const Toast = Swal.mixin({
        toast: true,
        position: 'top', 
        target: targetElement, // السطر ده هو اللي هيخليها تظهر قدام عينك دايما
        showConfirmButton: false,
        timer: 2500,
        timerProgressBar: true,
        background: '#1f2937',
        color: '#ffffff',
        didOpen: (toast) => {
            toast.addEventListener('mouseenter', Swal.stopTimer)
            toast.addEventListener('mouseleave', Swal.resumeTimer)
        }
    });

    Toast.fire({
        icon: icon,
        title: msg
    });
}

// حماية التطبيق من الإغلاق عند الضغط على زر الرجوع أثناء مشاهدة فيديو
window.onpopstate = function() {
    if (document.getElementById('video-player-modal').style.display === 'flex') {
        closePlayer();
        history.pushState(null, null, window.location.pathname);
    }
};

// تشغيل الحماية عند فتح الفيديو
function pushStateForVideo() {
    history.pushState(null, null, window.location.pathname);
}
// تأكد من استدعاء pushStateForVideo() داخل دالة openPlayer() عندك

// التنبيه عند انقطاع أو عودة الإنترنت
window.addEventListener('online', () => {
    Swal.fire({
        title: 'تم استعادة الاتصال',
        text: 'أنت الآن متصل بالإنترنت، يمكنك متابعة دروسك.',
        icon: 'success',
        timer: 3000,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
    });
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

// --- ميزة التحديث بالسحب (Pull to Refresh) ---

let touchStart = 0;
const indicator = document.getElementById('refresh-indicator');

window.addEventListener('touchstart', (e) => {
    // تسجيل نقطة بداية اللمس
    touchStart = e.touches[0].pageY;
}, {passive: true});

window.addEventListener('touchmove', (e) => {
    const touchMove = e.touches[0].pageY;
    const distance = touchMove - touchStart;

    // الشرط الذهبي:
    // 1. لازم نكون في أول الصفحة (window.scrollY === 0)
    // 2. لازم لوحة الإدارة تكون مقفولة (display !== 'flex') عشان ما تضايقكش وأنت بتمسح
    // 3. لازم السحبة تكون طويلة كفاية (distance > 150)
    
    const isAdminOpen = document.getElementById('admin-modal').style.display === 'flex';

    if (!isAdminOpen && window.scrollY === 0 && distance > 150) {
        if (indicator) {
            indicator.style.top = '20px'; 
            setTimeout(() => {
                location.reload();
            }, 800);
        }
    }
}, {passive: true});

window.addEventListener('touchend', () => {
    // تم نقل التحديث لـ touchmove عشان يتشغل مرة واحدة بس
    if (indicator && parseInt(indicator.style.top) > 0) {
        indicator.style.top = '-50px'; // إخفاء المؤشر بعد التشغيل
    }
});

// مراقب التكبير: أول ما الشاشة تكبر (سواء بزرار درايف أو غيره) اقلب الموبايل
// ============================================
//  متغيرات الفيديو الحالي
// ============================================
let currentLessonId = null;
let currentLessonTitle = null;
let commentsUnsubscribe = null;

// ============================================
//  الاسم المعروض (مخصص أو من Google)
// ============================================
async function getMyDisplayName() {
    const user = auth.currentUser;
    if (!user) return '';
    const doc = await db.collection('users_access').doc(user.email.toLowerCase()).get();
    return doc.data()?.displayName || user.displayName || user.email.split('@')[0];
}

async function saveDisplayName() {
    const input = document.getElementById('profile-display-name-input');
    const newName = input.value.trim();
    if (!newName) return showToast('اكتب اسم الأول!', 'warning');
    const user = auth.currentUser;
    if (!user) return;
    await db.collection('users_access').doc(user.email.toLowerCase())
        .set({ displayName: newName }, { merge: true });
    document.getElementById('profile-name').innerText = newName;
    showToast('تم حفظ الاسم ✅');
}

// ============================================
//  ملف الطالب (Profile)
// ============================================
const gradeMap = {
    '1-mid':'أولى إعدادي', '2-mid':'تانية إعدادي', '3-mid':'تالتة إعدادي',
    '1-sec':'أولى ثانوي',  '2-sec':'تانية ثانوي',  '3-sec':'تالتة ثانوي'
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
        badge.style.cssText = 'background:linear-gradient(90deg,#ff4b1f,#ff9068);color:white;padding:3px 10px;border-radius:30px;';
    } else if (role === 'teacher') {
        badge.innerText = '🛡️ مدرس مساعد';
        badge.style.cssText = 'background:rgba(234,179,8,0.15);color:#eab308;border:1px solid rgba(234,179,8,0.3);padding:3px 10px;border-radius:30px;';
    } else {
        badge.innerText = '🎓 طالب';
        badge.style.cssText = 'background:rgba(59,130,246,0.15);color:#60a5fa;border:1px solid rgba(59,130,246,0.3);padding:3px 10px;border-radius:30px;';
    }

    const watchedDoc = await db.collection('watched').doc(user.email.toLowerCase()).get();
    document.getElementById('profile-watched').innerText = (watchedDoc.data()?.lessons || []).length;

    document.getElementById('profile-modal').style.display = 'flex';
}

function closeProfile() {
    document.getElementById('profile-modal').style.display = 'none';
}

async function markWatched(lessonId) {
    const user = auth.currentUser;
    if (!user || !lessonId) return;
    await db.collection('watched').doc(user.email.toLowerCase()).set({
        lessons: firebase.firestore.FieldValue.arrayUnion(lessonId)
    }, { merge: true }).catch(() => {});
}

// ============================================
//  نظام التقييم في مودال الفيديو ⭐
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

    const stars = document.querySelectorAll('.modal-star');
    const compareVal = myRating > 0 ? myRating : Math.round(parseFloat(avg));
    stars.forEach(s => {
        const v = parseInt(s.getAttribute('data-val'));
        s.style.color = v <= compareVal ? '#c5a059' : '#374151';
        s.style.transform = 'scale(1)';
    });
}

async function submitModalRating(lessonId, val) {
    const user = auth.currentUser;
    if (!user) return;
    await db.collection('ratings').doc(lessonId).set({
        ratings: { [user.email.toLowerCase()]: val }
    }, { merge: true });
    showToast(`قيّمت الدرس بـ ${val} نجوم ⭐`);
    loadModalRating(lessonId);
}

// ============================================
//  نظام التعليقات 💬
// ============================================
function listenComments(lessonId) {
    if (commentsUnsubscribe) commentsUnsubscribe();
    const list = document.getElementById('comments-list');
    const countEl = document.getElementById('comments-count');

    commentsUnsubscribe = db.collection('comments').doc(lessonId)
        .collection('messages')
        .orderBy('createdAt', 'asc')
        .onSnapshot(snap => {
            if (snap.empty) {
                list.innerHTML = `<div style="text-align:center;padding:22px;color:rgba(255,255,255,0.25);font-family:'Cairo',sans-serif;font-size:12px;">
                    <i class="fas fa-comment-slash" style="font-size:22px;margin-bottom:6px;display:block;"></i>
                    لا توجد تعليقات بعد، كن أول من يعلّق!
                </div>`;
                countEl.innerText = '0';
                return;
            }

            countEl.innerText = snap.size;
            let html = '';
            snap.forEach(doc => {
                const d = doc.data();
                const timeAgo = d.createdAt ? formatTimeAgo(d.createdAt.toDate()) : '';
                const isMe = auth.currentUser && d.email === auth.currentUser.email.toLowerCase();
                html += `
                <div style="display:flex;gap:9px;padding:10px 14px;${isMe ? 'background:rgba(197,160,89,0.04);' : ''}border-bottom:1px solid rgba(255,255,255,0.04);">
                    <img src="${d.avatar || ''}" referrerpolicy="no-referrer"
                         style="width:30px;height:30px;border-radius:9px;object-fit:cover;flex-shrink:0;border:1px solid rgba(255,255,255,0.1);"
                         onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(d.displayName)}&background=111827&color=c5a059&size=60'">
                    <div style="flex:1;">
                        <div style="display:flex;align-items:center;gap:7px;margin-bottom:3px;">
                            <span style="color:${isMe ? '#c5a059' : 'white'};font-family:'Cairo',sans-serif;font-weight:900;font-size:12px;">${d.displayName}</span>
                            ${isMe ? '<span style="background:rgba(197,160,89,0.15);color:#c5a059;font-size:9px;padding:1px 6px;border-radius:20px;font-family:Cairo,sans-serif;">أنت</span>' : ''}
                            <span style="color:rgba(255,255,255,0.25);font-size:10px;font-family:Cairo,sans-serif;margin-right:auto;">${timeAgo}</span>
                        </div>
                        <p style="color:rgba(255,255,255,0.8);font-family:'Cairo',sans-serif;font-size:12px;margin:0;line-height:1.5;">${d.text}</p>
                    </div>
                    ${isMe ? `<button onclick="deleteComment('${lessonId}','${doc.id}')" style="background:none;border:none;color:rgba(239,68,68,0.5);cursor:pointer;font-size:12px;padding:0 4px;" title="حذف">
                        <i class="fas fa-trash-alt"></i></button>` : ''}
                </div>`;
            });
            list.innerHTML = html;
            list.scrollTop = list.scrollHeight;
        });
}

async function submitComment() {
    const input = document.getElementById('comment-input');
    const text = input.value.trim();
    if (!text) return;
    const user = auth.currentUser;
    if (!user || !currentLessonId) return;

    const displayName = await getMyDisplayName();
    input.value = '';

    await db.collection('comments').doc(currentLessonId)
        .collection('messages').add({
            text,
            displayName,
            email: user.email.toLowerCase(),
            avatar: user.photoURL || '',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
}

async function deleteComment(lessonId, commentId) {
    await db.collection('comments').doc(lessonId)
        .collection('messages').doc(commentId).delete();
}

function formatTimeAgo(date) {
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60) return 'الآن';
    if (diff < 3600) return `منذ ${Math.floor(diff/60)} دقيقة`;
    if (diff < 86400) return `منذ ${Math.floor(diff/3600)} ساعة`;
    return `منذ ${Math.floor(diff/86400)} يوم`;
}

document.addEventListener('fullscreenchange', () => {

    if (document.fullscreenElement) {
        // الطالب داس تكبير -> اقلب عرض
        if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(() => {});
        }
    } else {
        // الطالب صغر الفيديو -> ارجع طول
        if (screen.orientation && screen.orientation.unlock) {
            screen.orientation.unlock();
        }
    }
});