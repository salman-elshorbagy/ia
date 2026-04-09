// ============================================
//  منطق الذكاء الاصطناعي — El Sherbini AI
//  ai-logic.js
// ============================================

// ─── حالة الـ AI ──────────────────────────────────────────
let aiCurrentUser   = null;
let aiActiveChat    = null;
let aiAllChats      = [];
let aiIsLoading     = false;

// ─── بيانات المنصة (محملة مرة واحدة عند الفتح) ──────────
// { gradeId: { videos: [{id,title,type}], images: [...] } }
let aiPlatformData      = {};
let aiAllWatchedSet     = new Set();
let aiMasterStudentsCtx = ''; // ملخص الطلاب للـ system prompt (master فقط)

// ─── نظام الذاكرة طويلة المدى ─────────────────────────────
const AI_MAX_MEMORIES = 20;
let aiMemories = [];

// ─── تنظيف ردود AI من التشويه ─────────────────────────────
// يحتفظ بـ: عربية، لاتين أساسي (إنجليزي+أرقام+ترقيم)، emoji، سطر جديد
function cleanAIResponse(text) {
    if (!text) return '';
    return text
        .replace(/[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0020-\u007E\u00A9\u00AE\u2000-\u206F\u2190-\u21FF\u2600-\u27FF\uD800-\uDFFF\n\r\t]/g, '')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// ─── حفظ / استرجاع آخر محادثة مفتوحة ───────────────────
function aiSaveLastOpenedChat(email, chatId) {
    try { localStorage.setItem('ai_last_opened_' + email, chatId); } catch {}
}

function aiGetLastOpenedChat(email) {
    try { return localStorage.getItem('ai_last_opened_' + email); } catch { return null; }
}

// ─── localStorage ─────────────────────────────────────────
function aiStorageKey(email) {
    return `ai_chats_v2_${email}`;
}

function aiLoadChats(email) {
    try {
        const raw = localStorage.getItem(aiStorageKey(email));
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function aiSaveChats(email, chats) {
    try {
        localStorage.setItem(aiStorageKey(email), JSON.stringify(chats));
    } catch (e) {
        console.error('[AI] localStorage save failed:', e.name, e.message);
        // لو الـ quota اتعدى: نحاول نحفظ بدون بيانات الصور عشان ما نخسرش التاريخ النصي
        if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
            console.warn('[AI] Storage quota exceeded — saving chats without image data as fallback');
            try {
                const lean = chats.map(c => ({
                    ...c,
                    messages: (c.messages || []).map(m => {
                        if (!m.imageBase64) return m;
                        // نحذف بيانات الصورة ونحتفظ بباقي الرسالة
                        const { imageBase64, imageType, ...rest } = m;
                        return rest;
                    })
                }));
                localStorage.setItem(aiStorageKey(email), JSON.stringify(lean));
            } catch (e2) {
                console.error('[AI] localStorage fallback save also failed:', e2.message);
            }
        }
    }
    aiSyncToFirestore(email, chats).catch(() => {});
}

async function aiSyncToFirestore(email, chats) {
    if (!db) return;
    const metadata = chats.map(c => ({
        id:           c.id,
        title:        c.title || 'محادثة',
        createdAt:    c.createdAt,
        updatedAt:    c.updatedAt || c.createdAt,
        messageCount: (c.messages || []).length,
        preview:      (c.messages || []).slice(-1)[0]?.content?.substring(0, 120) || '',
        questions:    (c.messages || [])
            .filter(m => m.role === 'user')
            .map(m => m.content.substring(0, 150))
    }));
    await db.collection('ai_chats').doc(email).set(
        { metadata, email, lastActive: Date.now() },
        { merge: true }
    );
}

// ─── تحميل كل محتوى المنصة من Firestore ──────────────────
// المشرف: كل الصفوف الستة | الطالب: صفوفه المسموح بها فقط
async function aiLoadPlatformData() {
    const user = auth.currentUser;
    if (!user) return;

    const gradesToLoad = (currentUserRole === 'master')
        ? ['1-mid','2-mid','3-mid','1-sec','2-sec','3-sec']
        : (currentUserAllowedGrades || []);

    aiPlatformData = {};
    for (const grade of gradesToLoad) {
        const snap = await db.collection('lessons').where('grade','==',grade).get();
        aiPlatformData[grade] = { videos: [], images: [] };
        snap.forEach(doc => {
            const d = { id: doc.id, ...doc.data() };
            if (d.type === 'image') aiPlatformData[grade].images.push(d);
            else                    aiPlatformData[grade].videos.push(d);
        });
    }

    // الدروس المشاهدة للمستخدم الحالي
    try {
        const wDoc = await db.collection('watched').doc(user.email.toLowerCase()).get();
        aiAllWatchedSet = new Set(wDoc.data()?.lessons || []);
    } catch { aiAllWatchedSet = new Set(); }
}

// ─── تحميل ملخص الطلاب للمشرف ────────────────────────────
async function aiLoadMasterStudentsContext() {
    if (currentUserRole !== 'master') { aiMasterStudentsCtx = ''; return; }
    try {
        const snap = await db.collection('users_access').get();
        const lines = [];
        const watchedPromises = [];
        const studentDocs = [];

        snap.forEach(doc => {
            const d = doc.data();
            if (d.role !== 'master') studentDocs.push({ email: doc.id, data: d });
        });

        // نجيب watched counts لكل طالب
        for (const s of studentDocs) {
            watchedPromises.push(
                db.collection('watched').doc(s.email).get()
                  .then(wd => ({ email: s.email, count: (wd.data()?.lessons || []).length }))
                  .catch(() => ({ email: s.email, count: 0 }))
            );
        }
        const watchedResults = await Promise.all(watchedPromises);
        const watchedMap = {};
        watchedResults.forEach(r => { watchedMap[r.email] = r.count; });

        studentDocs.forEach(s => {
            const d = s.data;
            const name = d.displayName || d.googleName || s.email.split('@')[0];
            const grades = (d.allowedGrades || []).map(g => AI_GRADE_MAP[g] || g).join('، ');
            const watched = watchedMap[s.email] || 0;
            lines.push(`• ${name} | ${s.email} | الصفوف: ${grades || 'لم تُحدد'} | شاهد: ${watched} درس`);
        });

        aiMasterStudentsCtx = lines.length > 0
            ? `\n\n══ قائمة الطلاب المسجلين (${lines.length} طالب) ══\n` + lines.join('\n')
            : '\n\nلا يوجد طلاب مسجلون بعد.';
    } catch (e) {
        console.warn('[AI] aiLoadMasterStudentsContext error:', e);
        aiMasterStudentsCtx = '';
    }
}

// ─── إنشاء محادثة جديدة ──────────────────────────────────
function aiCreateChat() {
    const user = auth.currentUser;
    if (!user) return null;
    const email = user.email.toLowerCase();
    if (aiAllChats.length >= AI_CONFIG.maxChats) return null;
    const chat = {
        id:        'chat_' + Date.now(),
        title:     'محادثة جديدة',
        messages:  [],
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
    aiAllChats.unshift(chat);
    aiSaveChats(email, aiAllChats);
    return chat;
}

// ─── حذف محادثة ──────────────────────────────────────────
function aiDeleteChat(chatId) {
    const user = auth.currentUser;
    if (!user) return;
    const email = user.email.toLowerCase();
    aiAllChats = aiAllChats.filter(c => c.id !== chatId);
    aiSaveChats(email, aiAllChats);
    if (aiActiveChat?.id === chatId) {
        aiActiveChat = aiAllChats[0] || null;
    }
}

// ─── إعادة تسمية محادثة ──────────────────────────────────
function aiRenameChat(chatId, newTitle) {
    const user = auth.currentUser;
    if (!user || !newTitle.trim()) return;
    const email = user.email.toLowerCase();
    const chat = aiAllChats.find(c => c.id === chatId);
    if (!chat) return;
    chat.title     = newTitle.trim().substring(0, 40);
    chat.updatedAt = Date.now();
    aiSaveChats(email, aiAllChats); // يحدّث Firestore تلقائياً عبر aiSyncToFirestore
}

// ─── إضافة رسالة ─────────────────────────────────────────
function aiAddMessageToChat(chatId, role, content, imageData = null, options = {}) {
    const user = auth.currentUser;
    if (!user) return;
    const email = user.email.toLowerCase();
    const chat  = aiAllChats.find(c => c.id === chatId);
    if (!chat) return;
    const msg = { role, content, ts: Date.now() };
    // حفظ نوع السؤال (TF) حتى يمكن استعادة الأزرار عند إعادة الرسم
    if (options.isTF) msg.isTF = true;
    // حفظ تحليل الصورة لاستخدامه كـ context في الرسائل اللاحقة
    if (options.imageAnalysis) msg.imageAnalysis = String(options.imageAnalysis).substring(0, 600);
    if (imageData && imageData.base64) {
        msg.imageBase64 = imageData.base64;
        msg.imageType   = imageData.type || 'image/jpeg';
    }
    chat.messages.push(msg);
    chat.updatedAt = Date.now();
    if (role === 'user' && chat.messages.filter(m => m.role === 'user').length === 1) {
        chat.title = content.substring(0, 36) + (content.length > 36 ? '…' : '');
    }
    aiSaveChats(email, aiAllChats);
    return msg;
}

// ─── بناء Context للـ API ─────────────────────────────────
function aiBuildApiMessages(chatMessages) {
    const firstName = document.getElementById('user-first-name')?.innerText?.trim() || '';
    const gradeName = AI_GRADE_MAP[s_grade] || s_grade || 'غير محدد';
    const role      = currentUserRole === 'master' ? 'مشرف عام' : 'طالب';
    const memoriesFull = aiMemories.length >= AI_MAX_MEMORIES;

    // ── System Prompt الأساسي ──
    let system = AI_SYSTEM_PROMPT;
    system += `\n\n══════════════════════════
بيانات المستخدم الحالي:
• الاسم: ${firstName || 'المستخدم'}
• الصف الحالي: ${gradeName}
• الدور: ${role}`;

    // ── الذاكرة ──
    if (aiMemories.length > 0) {
        system += `\n\n📝 الذاكرة الشخصية:\n`;
        aiMemories.forEach((m, i) => { system += `  ${i+1}. ${m.text}\n`; });
    }
    system += `\nحالة الذاكرة: ${aiMemories.length}/${AI_MAX_MEMORIES}`;
    if (memoriesFull) system += ` — ممتلئة ❌`;

    // ── محتوى المنصة (الدروس) ──
    const gradeKeys = Object.keys(aiPlatformData);
    if (gradeKeys.length > 0) {
        system += `\n\n══ محتوى المنصة ══`;
        for (const gId of gradeKeys) {
            const gName = AI_GRADE_MAP[gId] || gId;
            const { videos, images } = aiPlatformData[gId];
            if (!videos.length && !images.length) continue;
            system += `\n📚 ${gName}:`;
            videos.forEach(v  => { system += `\n  🎬 ${v.title}`; });
            images.forEach(im => { system += `\n  🖼️ ${im.title}`; });
        }

        const allIds = gradeKeys.flatMap(g => [
            ...aiPlatformData[g].videos.map(v => v.id),
            ...aiPlatformData[g].images.map(i => i.id)
        ]);
        const watchedCount = allIds.filter(id => aiAllWatchedSet.has(id)).length;
        system += `\n\nإجمالي المحتوى: ${allIds.length} | المشاهَد: ${watchedCount}`;
    }

    // ── قائمة الطلاب (مشرف عام فقط) + تعليمات صريحة ──
    if (currentUserRole === 'master' && aiMasterStudentsCtx) {
        system += aiMasterStudentsCtx;
        system += `\n
⚠️ تعليمات المشرف العام:
- أنت تتحدث مع المشرف العام — يحق له معرفة بيانات أي طالب.
- إذا سألك المشرف عن أي طالب (باسمه أو إيميله أو صفه)، أجبه بتفصيل كامل من القائمة أعلاه.
- لا تقل "لا أعرف" إذا كان الطالب موجوداً في القائمة.
- المشرف يستطيع رؤية: الإيميل، الاسم، الصف، عدد الدروس المشاهدة.`;
    }

    // ── سياق الصور السابقة — يحافظ على فهم الـ AI للصور عبر الرسائل ──
    // نجيب آخر 3 رسائل مستخدم فيها صورة ولها تحليل محفوظ
    const historyImgMsgs = chatMessages
        .filter(m => m.role === 'user' && m.imageBase64)
        .slice(-3); // آخر 3 صور بحد أقصى

    if (historyImgMsgs.length > 0) {
        system += `\n\n══ سياق صور سابقة في المحادثة ══`;
        historyImgMsgs.forEach((m, i) => {
            const label = historyImgMsgs.length > 1 ? ` ${i + 1}` : '';
            if (m.imageAnalysis) {
                system += `\n• تحليل صورة سابقة${label}: ${m.imageAnalysis}`;
            } else {
                system += `\n• كان فيه صورة مرفقة${label} تم تحليلها في رسالة سابقة`;
            }
        });
        system += `\n(لو المستخدم سأل عن صورة سابقة أو أشار إليها، اعتمد على التحليل أعلاه دون طلب إعادة رفعها)`;
    }

    system += `\n══════════════════════════`;

    const slice      = chatMessages.slice(-AI_CONFIG.maxMessagesContext);
    const validSlice = slice.filter(m => m.role === 'user' || m.role === 'assistant');

    return [
        { role: 'system', content: system },
        ...validSlice.map(m => ({ role: m.role, content: m.content || '' }))
    ];
}

// ─── Vision Model (Groq) — تحليل الصور مباشرة بدون CORS ─
const AI_VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

// ─── استدعاء API ─────────────────────────────────────────
async function aiCallAPI(chatMessages, imageData = null) {
    const messages = aiBuildApiMessages(chatMessages);

    // لو في صورة: نضيف الصورة مباشرة في الرسالة الأخيرة بـ vision format
    if (imageData && imageData.base64) {
        let lastUserIdx = -1;
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'user') { lastUserIdx = i; break; }
        }
        if (lastUserIdx >= 0) {
            const originalText = (typeof messages[lastUserIdx].content === 'string'
                ? messages[lastUserIdx].content
                : '') || 'حللي الصورة دي وأخبرني بمحتواها بالتفصيل باللغة العربية.';

            // نحوّل الـ content لـ array (OpenAI vision format)
            messages[lastUserIdx] = {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: originalText
                    },
                    {
                        type: 'image_url',
                        image_url: {
                            url: `data:${imageData.type || 'image/jpeg'};base64,${imageData.base64}`
                        }
                    }
                ]
            };
        }
    }

    // تحديد الموديل: vision model للصور، text model للنص
    const model = (imageData && imageData.base64) ? AI_VISION_MODEL : AI_CONFIG.model;

    let res;
    try {
        res = await fetch(AI_CONFIG.apiUrl, {
            method:      'POST',
            mode:        'cors',
            credentials: 'omit',
            headers: {
                'Content-Type':  'application/json',
                'Authorization': `Bearer ${AI_CONFIG.apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages,
                max_tokens:  AI_CONFIG.maxTokens,
                temperature: AI_CONFIG.temperature,
                stream:      false
            })
        });
    } catch (fetchErr) {
        console.error('[AI] Fetch/CORS error:', fetchErr);
        throw Object.assign(new Error('NETWORK'), { original: fetchErr });
    }

    if (!res.ok) {
        let errBody = '';
        try { errBody = await res.text(); } catch {}
        console.error('[AI] HTTP error:', res.status, errBody);
        throw Object.assign(new Error('HTTP_' + res.status), { body: errBody });
    }

    let data;
    try { data = await res.json(); }
    catch (parseErr) {
        console.error('[AI] JSON parse error:', parseErr);
        throw new Error('PARSE_ERROR');
    }

    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
        console.error('[AI] Empty/unexpected response:', data);
        throw new Error('EMPTY_RESPONSE');
    }
    // تنظيف الرد من أي حروف غريبة قبل الإرجاع
    return cleanAIResponse(content);
}

// ─── جلب بيانات طالب (للمشرف العام) ──────────────────────
async function aiGetStudentData(studentEmail) {
    if (currentUserRole !== 'master') return null;
    const email = studentEmail.toLowerCase().trim();

    let userData = {};
    try {
        const userDoc = await db.collection('users_access').doc(email).get();
        if (!userDoc.exists) return null;
        userData = userDoc.data();
    } catch(e) {
        console.error('[AI] aiGetStudentData users_access error:', e);
        throw e;
    }

    // الدروس المشاهدة
    let watchedIds = new Set();
    try {
        const watchedDoc = await db.collection('watched').doc(email).get();
        watchedIds = new Set(watchedDoc.data()?.lessons || []);
    } catch(e) { console.warn('[AI] watched fetch failed:', e.message); }

    // كل الدروس المتاحة لصفوف الطالب
    const allowedGrades = userData.allowedGrades || [];
    let allLessons = [];
    for (const grade of allowedGrades) {
        try {
            const snap = await db.collection('lessons').where('grade', '==', grade).get();
            snap.forEach(d => allLessons.push({ id: d.id, ...d.data() }));
        } catch(e) { console.warn('[AI] lessons fetch failed for grade:', grade, e.message); }
    }

    // بيانات AI chats
    let aiMeta = [];
    let lastActiveData = null;
    try {
        const aiDoc = await db.collection('ai_chats').doc(email).get();
        aiMeta = aiDoc.data()?.metadata || [];
        lastActiveData = aiDoc.data()?.lastActive || null;
    } catch(e) { console.warn('[AI] ai_chats fetch failed:', e.message); }

    return {
        email,
        name:              userData.displayName || userData.googleName || email.split('@')[0],
        photoURL:          userData.photoURL || '',
        role:              userData.role || 'student',
        allowedGrades,
        totalLessons:      allLessons.length,
        watchedCount:      watchedIds.size,
        watchedLessons:    allLessons.filter(l => watchedIds.has(l.id)),
        notWatchedLessons: allLessons.filter(l => !watchedIds.has(l.id)),
        aiChats:           aiMeta,
        hasUsedAI:         aiMeta.length > 0,
        lastActive:        lastActiveData
    };
}

// ─── تهيئة الـ AI لليوزر الحالي ──────────────────────────
async function aiInit() {
    const user = auth.currentUser;
    if (!user) return;
    aiCurrentUser = user;
    const email = user.email.toLowerCase();
    aiAllChats   = aiLoadChats(email);

    // استعادة آخر محادثة فتحها المستخدم (حتى لو ما بعتش فيها)
    const lastId = aiGetLastOpenedChat(email);
    if (lastId) {
        aiActiveChat = aiAllChats.find(c => c.id === lastId) || aiAllChats[0] || null;
    } else {
        aiActiveChat = aiAllChats[0] || null;
    }

    // تحميل الذاكرة + بيانات المنصة + الطلاب (للمشرف)
    await Promise.all([
        aiInitMemories(email),
        aiLoadPlatformData(),
        aiLoadMasterStudentsContext()
    ]);
}

// ─── نظام الذاكرة طويلة المدى ─────────────────────────────
async function aiInitMemories(email) {
    try {
        const doc = await db.collection('ai_memories').doc(email).get();
        aiMemories = doc.data()?.memories || [];
    } catch { aiMemories = []; }
}

function aiGetMemories() { return aiMemories; }

async function aiSaveMemory(text) {
    const user = auth.currentUser;
    if (!user) return { success: false, reason: 'no_user' };
    if (aiMemories.length >= AI_MAX_MEMORIES) return { success: false, reason: 'full' };
    const memory = {
        id: 'mem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        text: text.trim().substring(0, 300),
        createdAt: Date.now()
    };
    aiMemories.push(memory);
    await aiSyncMemories(user.email.toLowerCase());
    return { success: true, memory };
}

async function aiDeleteMemory(memoryId) {
    const user = auth.currentUser;
    if (!user) return;
    aiMemories = aiMemories.filter(m => m.id !== memoryId);
    await aiSyncMemories(user.email.toLowerCase());
}

async function aiClearMemories() {
    const user = auth.currentUser;
    if (!user) return;
    aiMemories = [];
    await aiSyncMemories(user.email.toLowerCase());
}

async function aiSyncMemories(email) {
    if (!db) return;
    try {
        await db.collection('ai_memories').doc(email).set({
            memories: aiMemories, lastUpdated: Date.now()
        });
    } catch (e) { console.error('[AI Memory] Sync error:', e); }
}

// ─── كشف أسئلة الاختيار من متعدد ─────────────────────────
function aiDetectQuiz(text) {
    const arabicRx = /^([أابجده])\s*\)\s+(.+)$/gm;
    const arabicMatches = [...text.matchAll(arabicRx)];
    if (arabicMatches.length >= 2)
        return arabicMatches.map(m => ({ label: m[1], text: m[2].trim() }));

    const englishRx = /^([A-D])\s*\)\s+(.+)$/gim;
    const englishMatches = [...text.matchAll(englishRx)];
    if (englishMatches.length >= 2)
        return englishMatches.map(m => ({ label: m[1].toUpperCase(), text: m[2].trim() }));

    return null;
}