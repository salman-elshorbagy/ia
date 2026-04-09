// ============================================
//  واجهة الذكاء الاصطناعي — El Sherbini AI
//  ai-ui.js
// ============================================

// ─── فتح / إغلاق الـ Modal ────────────────────────────────
function openAIModal() {
    const menu = document.getElementById('drop-menu');
    if (menu) menu.style.display = 'none';
    if (typeof closeDropMenu === 'function') closeDropMenu();

    const modal = document.getElementById('ai-modal');
    if (!modal) return;

    aiInit().then(() => {
        aiRenderSidebar();
        aiRenderMessages();
        modal.classList.add('open');
        lockBodyScroll();
        setTimeout(() => {
            const inp = document.getElementById('ai-msg-input');
            if (inp) inp.focus();
        }, 300);
    });
}

function closeAIModal() {
    const modal = document.getElementById('ai-modal');
    if (!modal) return;
    modal.classList.remove('open');
    unlockBodyScroll();
    aiHideAnalytics();
}

// ─── رسم Sidebar ─────────────────────────────────────────
function aiRenderSidebar() {
    const list   = document.getElementById('ai-chat-list');
    const quotaT = document.getElementById('ai-quota-text');
    const quotaF = document.getElementById('ai-quota-fill');
    const newBtn = document.getElementById('ai-new-chat-btn');
    if (!list) return;

    const count = aiAllChats.length;
    const max   = AI_CONFIG.maxChats;
    const pct   = Math.round((count / max) * 100);

    if (quotaT) quotaT.textContent = `${count} / ${max}`;
    if (quotaF) quotaF.style.width = pct + '%';
    if (newBtn) newBtn.disabled = count >= max;

    // زرار تحليل الطلاب — للمشرف العام فقط
    const masterBtn = document.getElementById('ai-master-btn');
    if (masterBtn) masterBtn.style.display = currentUserRole === 'master' ? 'flex' : 'none';

    list.innerHTML = '';
    if (aiAllChats.length === 0) {
        list.innerHTML = `<div class="ai-empty-list">
            <i class="fas fa-comment-dots"></i>
            <p>ما فيش محادثات لحد دلوقتي</p>
            <small>اضغط + عشان تبدأ</small>
        </div>`;
        return;
    }

    aiAllChats.forEach(chat => {
        const isActive = chat.id === aiActiveChat?.id;
        const item = document.createElement('div');
        item.className = 'ai-chat-item' + (isActive ? ' active' : '');
        item.innerHTML = `
            <div class="ai-chat-item-icon"><i class="fas fa-comment"></i></div>
            <div class="ai-chat-item-info">
                <div class="ai-chat-item-title">${escHtml(chat.title)}</div>
                <div class="ai-chat-item-preview">${chat.messages.length} رسالة</div>
            </div>
            <button class="ai-chat-rename-btn" onclick="aiStartRenameChat('${chat.id}', event)" title="تعديل الاسم">
                <i class="fas fa-pen"></i>
            </button>
            <button class="ai-chat-delete-btn" onclick="aiConfirmDeleteChat('${chat.id}', event)" title="حذف">
                <i class="fas fa-trash-alt"></i>
            </button>`;
        item.addEventListener('click', () => aiSelectChat(chat.id));
        list.appendChild(item);
    });
}

// ─── تعديل اسم المحادثة (inline) ─────────────────────────
function aiStartRenameChat(chatId, e) {
    e.stopPropagation();
    const chat = aiAllChats.find(c => c.id === chatId);
    if (!chat) return;

    // إيجاد الـ item وتحويل العنوان لـ input
    const items = document.querySelectorAll('.ai-chat-item');
    let targetItem = null;
    items.forEach(item => {
        const renameBtn = item.querySelector('.ai-chat-rename-btn');
        if (renameBtn?.getAttribute('onclick')?.includes(chatId)) targetItem = item;
    });
    if (!targetItem) return;

    const titleEl = targetItem.querySelector('.ai-chat-item-title');
    if (!titleEl) return;

    const currentTitle = chat.title;
    titleEl.innerHTML = `<input type="text" class="ai-chat-rename-input"
        value="${escHtml(currentTitle)}"
        maxlength="40"
        onclick="event.stopPropagation()"
        onkeydown="aiHandleRenameKey(event, '${chatId}')" />`;

    const input = titleEl.querySelector('input');
    if (input) {
        input.focus();
        input.select();
        input.addEventListener('blur', () => {
            aiFinishRename(chatId, input.value);
        });
    }
}

function aiHandleRenameKey(e, chatId) {
    e.stopPropagation();
    if (e.key === 'Enter') {
        const input = e.target;
        aiFinishRename(chatId, input.value);
        input.blur();
    } else if (e.key === 'Escape') {
        aiRenderSidebar(); // رجع للاسم القديم
    }
}

function aiFinishRename(chatId, newTitle) {
    const trimmed = (newTitle || '').trim();
    if (trimmed) {
        aiRenameChat(chatId, trimmed); // يحدّث localStorage + Firestore
    }
    aiRenderSidebar();
}

// ─── اختيار محادثة ───────────────────────────────────────
function aiSelectChat(chatId) {
    aiActiveChat = aiAllChats.find(c => c.id === chatId) || null;
    // حفظ آخر محادثة فتحها المستخدم
    const email = auth.currentUser?.email?.toLowerCase();
    if (email && aiActiveChat) aiSaveLastOpenedChat(email, chatId);
    aiRenderSidebar();
    aiRenderMessages();
    aiHideAnalytics();
    if (window.innerWidth <= 640) {
        document.getElementById('ai-sidebar')?.classList.remove('ai-sidebar-open');
        document.getElementById('ai-sidebar-overlay')?.classList.remove('show');
    }
    setTimeout(() => {
        const inp = document.getElementById('ai-msg-input');
        if (inp) inp.focus();
    }, 100);
}

// ─── محادثة جديدة ─────────────────────────────────────────
function aiNewChat() {
    if (aiAllChats.length >= AI_CONFIG.maxChats) {
        aiShowToast('وصلت للحد الأقصى! احذف محادثة قديمة الأول 🔒', 'warn');
        return;
    }
    const chat = aiCreateChat();
    if (!chat) return;
    aiActiveChat = chat;
    aiRenderSidebar();
    aiRenderMessages();
    aiHideAnalytics();
    // إغلاق sidebar تلقائياً دايماً عند محادثة جديدة
    document.getElementById('ai-sidebar')?.classList.remove('ai-sidebar-open');
    document.getElementById('ai-sidebar-overlay')?.classList.remove('show');
    document.getElementById('ai-msg-input')?.focus();
}

// ─── تأكيد حذف محادثة ────────────────────────────────────
function aiConfirmDeleteChat(chatId, e) {
    e.stopPropagation();
    aiDeleteChat(chatId);
    aiRenderSidebar();
    aiRenderMessages();
    aiShowToast('تم حذف المحادثة ✅', 'success');
}

// ─── رسم الرسائل ─────────────────────────────────────────
function aiRenderMessages() {
    const wrap = document.getElementById('ai-messages-wrap');
    if (!wrap) return;
    if (!aiActiveChat || aiActiveChat.messages.length === 0) {
        wrap.innerHTML = aiEmptyStateHTML();
        return;
    }
    wrap.innerHTML = '';
    aiActiveChat.messages.forEach(msg => aiAppendMsgEl(msg, false));
    // scroll للأسفل عند التحميل الأول فقط
    setTimeout(() => { wrap.scrollTop = wrap.scrollHeight; }, 60);
}

function aiEmptyStateHTML() {
    const name = document.getElementById('user-first-name')?.innerText?.trim() || 'يا صاحبي';
    return `<div class="ai-empty-state">
        <div class="ai-empty-icon"><i class="fas fa-robot"></i></div>
        <h3>أهلاً ${escHtml(name)}! 👋</h3>
        <p>أنا مساعد الشربيني الذكي، موجود هنا عشان أساعدك في دروس الكيمياء والعلوم 🎓</p>
        <div class="ai-suggestions">
            <button class="ai-suggestion" onclick="aiSendSuggestion(this)">
                <i class="fas fa-flask"></i> اشرحلي قانون
            </button>
            <button class="ai-suggestion" onclick="aiSendSuggestion(this)">
                <i class="fas fa-atom"></i> الفرق بين
            </button>
            <button class="ai-suggestion" onclick="aiSendSuggestion(this)">
                <i class="fas fa-graduation-cap"></i> ذاكرني في
            </button>
            <button class="ai-suggestion" onclick="aiSendSuggestion(this)">
                <i class="fas fa-question-circle"></i> ما هو
            </button>
        </div>
    </div>`;
}

// ─── إضافة رسالة للـ DOM ──────────────────────────────────
function aiAppendMsgEl(msg, scroll = true) {
    const wrap = document.getElementById('ai-messages-wrap');
    if (!wrap) return;
    const es = wrap.querySelector('.ai-empty-state');
    if (es) es.remove();

    const div = document.createElement('div');
    div.className = `ai-msg ai-msg-${msg.role}`;
    div.dataset.msgId = msg.ts || Date.now();

    const time        = new Date(msg.ts).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    const isUser      = msg.role === 'user';
    const avatarClass = isUser ? 'ai-msg-avatar-user' : 'ai-msg-avatar-ai';

    let avatarInner = '';
    if (isUser) {
        const userPhoto = auth.currentUser?.photoURL;
        if (userPhoto) {
            avatarInner = `<img src="${userPhoto}" referrerpolicy="no-referrer"
                style="width:32px;height:32px;border-radius:10px;object-fit:cover;display:block;"
                onerror="this.style.display='none'">`;
        } else {
            avatarInner = '<i class="fas fa-user-graduate"></i>';
        }
    } else {
        avatarInner = '<i class="fas fa-robot"></i>';
    }

    // أدوات الرسالة
    const toolsHtml = isUser
        ? `<div class="ai-msg-tools">
               <button class="ai-tool-btn" onclick="aiCopyMessage(this)" title="نسخ"><i class="fas fa-copy"></i></button>
               <button class="ai-tool-btn ai-tool-edit" onclick="aiEditMessage(this)" title="تعديل وإعادة توليد"><i class="fas fa-pen"></i></button>
           </div>`
        : `<div class="ai-msg-tools">
               <button class="ai-tool-btn" onclick="aiCopyMessage(this)" title="نسخ"><i class="fas fa-copy"></i></button>
           </div>`;

    div.innerHTML = `
        <div class="ai-msg-avatar ${avatarClass}">${avatarInner}</div>
        <div class="ai-msg-body">
            <div class="ai-msg-bubble">${aiFormatText(msg.content)}</div>
            <div class="ai-msg-footer">
                <div class="ai-msg-time">${time}</div>
                ${toolsHtml}
            </div>
        </div>`;

    wrap.appendChild(div);

    // ── عرض الصورة المحفوظة عند تحميل التاريخ (إعادة الفتح / Refresh) ──
    if (isUser && msg.imageBase64) {
        const imgDataUrl = `data:${msg.imageType || 'image/jpeg'};base64,${msg.imageBase64}`;
        aiInjectImageIntoBubble(div, imgDataUrl);
    }

    // ── أزرار MCQ / TF للرسائل المحفوظة (إعادة رسم أو تحميل تاريخ) ──
    if (!isUser) {
        const msgBodyEl = div.querySelector('.ai-msg-body');
        if (msgBodyEl) {
            const quizOptions = aiDetectQuiz(msg.content);
            if (quizOptions) {
                msgBodyEl.appendChild(_aiMakeQuizContainer(quizOptions));
            } else if (msg.isTF) {
                msgBodyEl.appendChild(_aiMakeTrueFalseContainer());
            }
        }
    }

    // scroll ذكي: فقط لو المستخدم في الأسفل أصلاً
    if (scroll) {
        const atBottom = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 80;
        if (atBottom) setTimeout(() => { wrap.scrollTop = wrap.scrollHeight; }, 30);
    }

    return div;
}

// ─── Typing indicator ────────────────────────────────────
function aiShowTyping() {
    const wrap = document.getElementById('ai-messages-wrap');
    if (!wrap) return;
    document.getElementById('ai-typing-indicator')?.remove();
    const div = document.createElement('div');
    div.className = 'ai-msg ai-msg-assistant ai-typing-msg';
    div.id = 'ai-typing-indicator';
    div.innerHTML = `
        <div class="ai-msg-avatar ai-msg-avatar-ai ai-thinking-avatar">
            <i class="fas fa-robot"></i>
        </div>
        <div class="ai-msg-body">
            <div class="ai-msg-bubble ai-thinking-bubble">
                <div class="ai-thinking-label">
                    <span>جاري التفكير</span>
                    <span class="ai-think-dots"><span>.</span><span>.</span><span>.</span></span>
                </div>
                <div class="ai-typing-dots">
                    <span></span><span></span><span></span>
                </div>
            </div>
        </div>`;
    wrap.appendChild(div);
    wrap.scrollTop = wrap.scrollHeight;
}

function aiHideTyping() {
    document.getElementById('ai-typing-indicator')?.remove();
}

// ─── إرسال رسالة ─────────────────────────────────────────
async function aiSendMessage() {
    if (aiIsLoading) return;
    if (aiIsRecording) aiStopVoice();

    const input    = document.getElementById('ai-msg-input');
    const text     = input?.value?.trim();
    const hasImage = !!_aiPendingImage;

    if (!text && !hasImage) return;

    if (!aiActiveChat) {
        if (aiAllChats.length >= AI_CONFIG.maxChats) {
            aiShowToast('وصلت للحد الأقصى! احذف محادثة قديمة الأول 🔒', 'warn');
            return;
        }
        const chat = aiCreateChat();
        if (!chat) return;
        aiActiveChat = chat;
        aiRenderSidebar();
    }

    const msgText = text || (hasImage ? '📸 حللي الصورة دي' : '');
    input.value = '';
    aiAutoResize(input);

    // بناء محتوى الرسالة (نضيف prefix للصورة)
    const userMsgContent = hasImage && !text ? '📸 حللي الصورة دي' : (hasImage ? `📸 ${text}` : text);

    // ─── الإصلاح الجذري: نبني imageDataToSend أولاً قبل aiAddMessageToChat ───
    // السبب: aiAddMessageToChat كان بيتستدعى بدون imageData فـ msg.imageBase64 ما بيتحفظش أبداً
    const imageDataToSend = hasImage
        ? { base64: _aiPendingImage.base64, type: _aiPendingImage.type }
        : null;

    // الآن نمرر imageDataToSend عشان يتحفظ imageBase64 و imageType في الرسالة
    const userMsg = aiAddMessageToChat(aiActiveChat.id, 'user', userMsgContent, imageDataToSend);

    // عرض الرسالة + الصورة في الـ DOM
    const userMsgEl = aiAppendMsgEl(userMsg, true);
    if (hasImage && userMsgEl) {
        aiInjectImageIntoBubble(userMsgEl, _aiPendingImage.objectUrl);
    }
    aiRenderSidebar();

    // نمسح الـ pending image بعد ما حفظنا بياناتها
    aiClearPendingImage();

    aiIsLoading = true;
    const sendBtn = document.getElementById('ai-send-btn');
    if (sendBtn) sendBtn.disabled = true;
    aiShowTyping();

    try {
        const rawReply = await aiCallAPI(aiActiveChat.messages, imageDataToSend);
        aiHideTyping();

        // ── استخراج markers قبل الحفظ ──
        const hasTF     = /\[TRUE_FALSE\]/.test(rawReply);
        const saveMatch = rawReply.match(/\[SAVE_MEMORY:\s*(.+?)\]/);
        // ننظف الرد من الـ markers قبل الحفظ والعرض
        let cleanReply  = rawReply
            .replace(/\[SAVE_MEMORY:[^\]]*\]/g, '')
            .replace(/\[TRUE_FALSE\]/g, '')
            .trim();

        if (saveMatch) {
            const toSave = saveMatch[1].trim();
            const result = await aiSaveMemory(toSave);
            if (result.success) {
                aiUpdateMemoryCount();
                cleanReply = cleanReply
                    ? cleanReply + `\n\n💾 حفظت في ذاكرتي: "${toSave}"`
                    : `💾 تمام! حفظت في ذاكرتي: "${toSave}"`;
            } else if (result.reason === 'full') {
                cleanReply = cleanReply || `الذاكرة ممتلئة (${AI_MAX_MEMORIES}/${AI_MAX_MEMORIES}) ❌\nاضغط على "ذاكرتي" عشان تحذف حاجة.`;
            }
        }

        const aiMsg = aiAddMessageToChat(aiActiveChat.id, 'assistant', cleanReply, null, { isTF: hasTF });

        // ── حفظ تحليل الصورة على رسالة المستخدم (للسياق في الرسائل اللاحقة) ──
        // لو الرسالة دي كانت فيها صورة: نحفظ رد الـ AI كـ imageAnalysis عشان يتذكره في الرسائل الجاية
        if (imageDataToSend && userMsg) {
            userMsg.imageAnalysis = cleanReply.substring(0, 600);
            const _imgEmail = auth.currentUser?.email?.toLowerCase();
            if (_imgEmail) aiSaveChats(_imgEmail, aiAllChats);
        }

        await aiAppendMsgAnimated(aiMsg, hasTF);
        aiRenderSidebar();

    } catch (err) {
        aiHideTyping();
        console.error('[AI] sendMessage error:', err.message, err.original || err);
        let errText = '⚠️ حصلت مشكلة تقنية — جرب تاني';
        const code  = err.message || '';
        if (code === 'NETWORK')           errText = '🌐 مش قادر أوصل للمساعد — تأكد من الإنترنت';
        else if (code === 'HTTP_401' || code === 'HTTP_403') errText = '🔑 مفتاح الـ AI منتهي — تواصل مع الإدارة';
        else if (code === 'HTTP_429') {
            // تمييز بين rate limit (طلبات كثيرة) و daily token limit
            let isDaily = false;
            try {
                const bodyObj  = JSON.parse(err.body || '{}');
                const errMsg429 = (bodyObj?.error?.message || '').toLowerCase();
                isDaily = errMsg429.includes('day') || errMsg429.includes('daily') ||
                          errMsg429.includes('per day') || errMsg429.includes('exceeded') ||
                          errMsg429.includes('tokens per day');
            } catch {}
            if (isDaily) {
                errText = '🚫 تم الوصول للحد اليومي من استخدام الذكاء الاصطناعي، حاول لاحقاً أو انتظر إعادة التعيين';
                aiStartRateLimitCooldown(120); // cooldown دقيقتان للـ daily limit
            } else {
                errText = '⏱️ كثير طلبات في وقت قصير — انتظر دقيقة وحاول تاني';
                aiStartRateLimitCooldown(60);  // cooldown دقيقة للـ rate limit
            }
        }
        else if (code === 'HTTP_404')     errText = '🤖 المودل مش موجود — تواصل مع الإدارة';
        else if (code.startsWith('HTTP_5')) errText = '🔧 سيرفر الـ AI واقف — جرب بعد شوية';
        else if (code === 'EMPTY_RESPONSE') errText = '🤔 المساعد ما ردش — جرب تاني';
        const errMsg = aiAddMessageToChat(aiActiveChat.id, 'assistant', errText);
        aiAppendMsgEl(errMsg);
    } finally {
        aiIsLoading = false;
        // لا نعيد تفعيل الزر لو في cooldown فعّال (بعد 429)
        if (_aiRateLimitUntil <= Date.now()) {
            if (sendBtn) sendBtn.disabled = false;
        }
        input?.focus();
    }
}

function aiSendSuggestion(btn) {
    const text  = btn.innerText.trim();
    const input = document.getElementById('ai-msg-input');
    if (!input) return;
    input.value = text + ' ';
    input.focus();
    aiAutoResize(input);
}

function aiHandleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        aiSendMessage();
    }
}

function aiAutoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

// ─── Toast ─────────────────────────────────────────────────
function aiShowToast(msg, type = 'success') {
    const toast = document.getElementById('ai-toast');
    if (!toast) return;
    const icon = { success: 'check-circle', warn: 'exclamation-triangle', error: 'times-circle' };
    toast.innerHTML = `<i class="fas fa-${icon[type] || 'info-circle'}"></i><span>${msg}</span>`;
    toast.className = `ai-toast show ${type}`;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toast.className = 'ai-toast'; }, 3000);
}

// ─── Format text — آمن ومنظم ────────────────────────────
function aiFormatText(text) {
    if (!text) return '';

    // الخطوة 1: استخراج الأرقام/الروابط وتبديلها بـ tokens قبل الـ escaping
    const tokens = [];
    let processed = text;

    // wa.me links أولاً
    processed = processed.replace(/https?:\/\/wa\.me\/([\d]+)/g, (m, num) => {
        const i = tokens.length;
        tokens.push({ type: 'wa', num });
        return `\x01T${i}\x01`;
    });

    // أرقام مصرية خام (01xxxxxxxxx) — بعد ما استخرجنا wa.me
    processed = processed.replace(/\b(01[0-9]{9})\b/g, (m, num) => {
        const i = tokens.length;
        tokens.push({ type: 'phone', num });
        return `\x01T${i}\x01`;
    });

    // الخطوة 2: HTML escape + markdown
    let s = processed
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/\*\*(.*?)\*\*/gs, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/gs,     '<em>$1</em>')
        .replace(/`(.*?)`/g,        '<code>$1</code>')
        .replace(/\n/g,             '<br>');

    // الخطوة 3: روابط عامة (https — غير wa.me)
    s = s.replace(/(https?:\/\/(?!wa\.me)[^\s<"'&\x01]+)/g, url => {
        const label = url.length > 45 ? url.slice(0, 42) + '…' : url;
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="ai-link">${label}</a>`;
    });

    // الخطوة 4: إعادة الـ tokens كأزرار واتساب
    s = s.replace(/\x01T(\d+)\x01/g, (m, idx) => {
        const t = tokens[parseInt(idx)];
        if (!t) return m;
        const fullNum    = t.type === 'phone' ? '2' + t.num : t.num;
        const displayNum = t.type === 'phone' ? t.num
            : t.num.startsWith('2') ? '0' + t.num.slice(2) : t.num;
        return `<a href="https://wa.me/${fullNum}" target="_blank" rel="noopener noreferrer" class="ai-wa-btn"><i class="fab fa-whatsapp"></i> ${displayNum}</a>`;
    });

    return s;
}

function escHtml(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Sidebar Toggle (Mobile) ─────────────────────────────
function aiToggleSidebar() {
    const sb  = document.getElementById('ai-sidebar');
    const ov  = document.getElementById('ai-sidebar-overlay');
    const open = sb?.classList.toggle('ai-sidebar-open');
    if (ov) ov.classList.toggle('show', open);
}

// ─── Master Analytics ─────────────────────────────────────
async function aiShowMasterAnalytics() {
    if (currentUserRole !== 'master') {
        aiShowToast('هذه الخاصية للمشرف العام فقط 🔒', 'error');
        return;
    }

    // إغلاق sidebar تلقائياً
    document.getElementById('ai-sidebar')?.classList.remove('ai-sidebar-open');
    document.getElementById('ai-sidebar-overlay')?.classList.remove('show');

    const panel = document.getElementById('ai-analytics-panel');
    if (!panel) return;

    aiHideChat();
    aiHideMemoryPanel();
    panel.style.display = 'flex';
    panel.onclick = (e) => e.stopPropagation();

    panel.innerHTML = `<div class="ai-analytics-loading">
        <div class="ai-analytics-spinner"></div>
        <p>جاري تحميل قائمة الطلاب...</p>
    </div>`;

    try {
        const snap = await db.collection('users_access').get();
        const students = [];
        snap.forEach(doc => {
            const d = doc.data();
            if (d.role !== 'master') students.push({ email: doc.id, ...d });
        });

        panel.onclick = (e) => e.stopPropagation();
    panel.innerHTML = `
        <div class="ai-analytics-header">
            <button class="ai-analytics-back" onclick="aiHideAnalytics()">
                <i class="fas fa-arrow-right"></i> رجوع
            </button>
            <h3>📊 تحليل الطلاب</h3>
        </div>
        <div class="ai-analytics-search-wrap">
            <i class="fas fa-search"></i>
            <input type="text" id="ai-analytics-search" placeholder="ابحث بالإيميل أو الاسم..."
                oninput="aiFilterStudents(this.value)" />
        </div>
        <div class="ai-students-grid" id="ai-students-grid">
            ${students.length === 0
                ? '<div class="ai-no-students">لا يوجد طلاب بعد</div>'
                : students.map(s => aiStudentCardHTML(s)).join('')
            }
        </div>`;

    } catch(err) {
        console.error('[AI Analytics]', err);
        panel.innerHTML = `<div class="ai-analytics-error">
            <i class="fas fa-exclamation-triangle"></i>
            <p>حدث خطأ في التحميل</p>
            <p style="font-size:11px;opacity:.5;">${err.message || ''}</p>
            <button onclick="aiHideAnalytics()">رجوع</button>
        </div>`;
    }
}

function aiStudentCardHTML(s) {
    const name     = s.displayName || s.googleName || s.email;
    const grades   = (s.allowedGrades || []).map(g => AI_GRADE_MAP[g] || g).join(' · ');
    const initials = (name || '?').charAt(0).toUpperCase();
    const avatarHtml = s.photoURL
        ? `<img src="${escHtml(s.photoURL)}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.style.display='none'">`
        : `<div class="ai-avatar-placeholder">${initials}</div>`;

    return `<div class="ai-student-card" onclick="event.stopPropagation(); aiLoadStudentReport('${escHtml(s.email)}')" data-name="${escHtml(name)}" data-email="${escHtml(s.email)}">
        <div class="ai-student-avatar">${avatarHtml}</div>
        <div class="ai-student-info">
            <div class="ai-student-name">${escHtml(name)}</div>
            <div class="ai-student-email">${escHtml(s.email)}</div>
            ${grades ? `<div class="ai-student-grades">${grades}</div>` : ''}
        </div>
        <i class="fas fa-chevron-left ai-student-arrow"></i>
    </div>`;
}

function aiFilterStudents(q) {
    const grid  = document.getElementById('ai-students-grid');
    if (!grid) return;
    const lower = q.toLowerCase();
    grid.querySelectorAll('.ai-student-card').forEach(card => {
        const name  = (card.dataset.name  || '').toLowerCase();
        const email = (card.dataset.email || '').toLowerCase();
        card.style.display = (!q || name.includes(lower) || email.includes(lower)) ? '' : 'none';
    });
}

// ─── تقرير طالب مفصّل ────────────────────────────────────
async function aiLoadStudentReport(email) {
    const panel = document.getElementById('ai-analytics-panel');
    if (!panel) return;

    panel.onclick = (e) => e.stopPropagation();
    panel.innerHTML = `<div class="ai-analytics-loading">
        <div class="ai-analytics-spinner"></div>
        <p>جاري تحميل بيانات الطالب...</p>
    </div>`;

    try {
        const data = await aiGetStudentData(email);
        if (!data) {
            panel.innerHTML = `<div class="ai-analytics-error">
                <i class="fas fa-user-slash"></i>
                <p>الطالب ده مش موجود في النظام</p>
                <button onclick="aiShowMasterAnalytics()">رجوع</button>
            </div>`;
            return;
        }

        const pct      = data.totalLessons > 0 ? Math.round((data.watchedCount / data.totalLessons) * 100) : 0;
        const grades   = data.allowedGrades.map(g => AI_GRADE_MAP[g] || g).join(' · ');
        const initials = data.name.charAt(0).toUpperCase();
        const avatarHtml = data.photoURL
            ? `<img src="${escHtml(data.photoURL)}" referrerpolicy="no-referrer" class="ai-report-avatar-img">`
            : `<div class="ai-report-avatar-placeholder">${initials}</div>`;

        const aiChatsCount   = data.aiChats.length;
        const aiQuestionsAll = data.aiChats.flatMap(c => c.questions || []);
        const aiLastActive   = data.lastActive
            ? new Date(data.lastActive).toLocaleDateString('ar-EG')
            : 'لم يستخدمه بعد';
        const barColor = pct >= 80 ? '#22c55e' : pct >= 50 ? '#c5a059' : '#ef4444';

        panel.innerHTML = `
        <div class="ai-report-wrap">
            <div class="ai-analytics-header">
                <button class="ai-analytics-back" onclick="aiShowMasterAnalytics()">
                    <i class="fas fa-arrow-right"></i> الطلاب
                </button>
                <h3>تقرير الطالب</h3>
            </div>

            <div class="ai-report-profile">
                <div class="ai-report-avatar">${avatarHtml}</div>
                <div class="ai-report-profile-info">
                    <div class="ai-report-name">${escHtml(data.name)}</div>
                    <div class="ai-report-email">${escHtml(data.email)}</div>
                    ${grades ? `<div class="ai-report-grades">${grades}</div>` : ''}
                </div>
            </div>

            <div class="ai-report-stats">
                <div class="ai-stat-card ai-anim-1">
                    <div class="ai-stat-num">${data.watchedCount}</div>
                    <div class="ai-stat-lbl">درس شافه</div>
                    <div class="ai-stat-icon"><i class="fas fa-eye"></i></div>
                </div>
                <div class="ai-stat-card ai-anim-2">
                    <div class="ai-stat-num">${data.totalLessons}</div>
                    <div class="ai-stat-lbl">إجمالي الدروس</div>
                    <div class="ai-stat-icon"><i class="fas fa-book"></i></div>
                </div>
                <div class="ai-stat-card ai-anim-3">
                    <div class="ai-stat-num">${pct}%</div>
                    <div class="ai-stat-lbl">نسبة الإنجاز</div>
                    <div class="ai-stat-icon"><i class="fas fa-chart-line"></i></div>
                </div>
                <div class="ai-stat-card ${data.hasUsedAI ? 'ai-stat-green' : 'ai-stat-dim'} ai-anim-4">
                    <div class="ai-stat-num">${aiChatsCount}</div>
                    <div class="ai-stat-lbl">محادثة AI</div>
                    <div class="ai-stat-icon"><i class="fas fa-robot"></i></div>
                </div>
            </div>

            <div class="ai-report-section ai-anim-5">
                <div class="ai-report-section-title">
                    <i class="fas fa-chart-bar"></i> تقدم المشاهدات
                </div>
                <div class="ai-progress-track">
                    <div class="ai-progress-fill" data-target="${pct}" style="background:${barColor}; width:0%;"></div>
                </div>
                <div class="ai-progress-labels">
                    <span style="color:${barColor}">${pct}%</span>
                    <span>${data.watchedCount} / ${data.totalLessons}</span>
                </div>
            </div>

            <div class="ai-report-section ai-anim-6">
                <div class="ai-report-section-title">
                    <i class="fas fa-check-circle" style="color:#22c55e"></i>
                    الدروس اللي شافها (${data.watchedLessons.length})
                </div>
                <div class="ai-lessons-list">
                    ${data.watchedLessons.length === 0
                        ? '<div class="ai-no-data">لم يشاهد أي درس بعد</div>'
                        : data.watchedLessons.slice(0,10).map(l =>
                            `<div class="ai-lesson-item ai-watched">
                                <i class="fas fa-${l.type === 'image' ? 'image' : 'play-circle'}"></i>
                                <span>${escHtml(l.title)}</span>
                            </div>`
                          ).join('') +
                          (data.watchedLessons.length > 10
                            ? `<div class="ai-more">+${data.watchedLessons.length - 10} درس تاني...</div>` : '')
                    }
                </div>
            </div>

            ${data.notWatchedLessons.length > 0 ? `
            <div class="ai-report-section ai-anim-7">
                <div class="ai-report-section-title">
                    <i class="fas fa-clock" style="color:#f59e0b"></i>
                    الدروس اللي لسه ما شافهاش (${data.notWatchedLessons.length})
                </div>
                <div class="ai-lessons-list">
                    ${data.notWatchedLessons.slice(0,5).map(l =>
                        `<div class="ai-lesson-item ai-not-watched">
                            <i class="fas fa-${l.type === 'image' ? 'image' : 'play-circle'}"></i>
                            <span>${escHtml(l.title)}</span>
                        </div>`
                    ).join('')}
                    ${data.notWatchedLessons.length > 5
                        ? `<div class="ai-more">+${data.notWatchedLessons.length - 5} درس تاني...</div>` : ''}
                </div>
            </div>` : ''}

            <div class="ai-report-section ai-anim-8">
                <div class="ai-report-section-title">
                    <i class="fas fa-robot" style="color:#c5a059"></i>
                    استخدام المساعد الذكي
                </div>
                ${data.hasUsedAI ? `
                <div class="ai-usage-info">
                    <div class="ai-usage-badge ai-badge-yes">✅ استخدم المساعد</div>
                    <div class="ai-usage-stat">آخر استخدام: ${aiLastActive}</div>
                    <div class="ai-usage-stat">عدد المحادثات: ${aiChatsCount}</div>
                    <div class="ai-usage-stat">عدد الأسئلة: ${aiQuestionsAll.length}</div>
                </div>
                ${aiQuestionsAll.length > 0 ? `
                <div class="ai-questions-title">أسئلته:</div>
                <div class="ai-questions-list">
                    ${aiQuestionsAll.slice(0,8).map((q, i) =>
                        `<div class="ai-question-item ai-anim-q" style="animation-delay:${i*0.08}s">
                            <span class="ai-q-num">${i+1}</span>
                            <span>${escHtml(q)}</span>
                        </div>`
                    ).join('')}
                    ${aiQuestionsAll.length > 8
                        ? `<div class="ai-more">+${aiQuestionsAll.length - 8} سؤال تاني...</div>` : ''}
                </div>` : ''}
                ` : `
                <div class="ai-usage-info">
                    <div class="ai-usage-badge ai-badge-no">❌ لم يستخدم المساعد بعد</div>
                </div>`}
            </div>

            <button class="ai-analyze-btn" onclick="aiAnalyzeStudentWithAI('${escHtml(data.email)}', ${data.watchedCount}, ${data.totalLessons}, ${aiQuestionsAll.length})">
                <i class="fas fa-brain"></i> تحليل ذكي بالـ AI
            </button>
        </div>`;

        setTimeout(() => {
            const bar = panel.querySelector('.ai-progress-fill');
            if (bar) bar.style.width = (bar.dataset.target || '0') + '%';
        }, 200);

    } catch(err) {
        console.error('aiLoadStudentReport error:', err);
        panel.innerHTML = `<div class="ai-analytics-error">
            <i class="fas fa-exclamation-triangle"></i>
            <p>حدث خطأ في تحميل البيانات</p>
            <p style="font-size:11px;opacity:.5;">${err.message || ''}</p>
            <button onclick="aiShowMasterAnalytics()">رجوع</button>
        </div>`;
    }
}

// ─── تحليل الطالب بالـ AI ─────────────────────────────────
async function aiAnalyzeStudentWithAI(email, watched, total, qCount) {
    aiHideAnalytics();
    aiShowChat();

    if (!aiActiveChat) {
        if (aiAllChats.length >= AI_CONFIG.maxChats) {
            aiShowToast('احذف محادثة قديمة الأول!', 'warn');
            return;
        }
        const chat = aiCreateChat();
        aiActiveChat = chat;
        aiRenderSidebar();
    }

    const prompt = `أنا المشرف العام على المنصة. حللّلي بيانات الطالب ده بشكل ذكي وودود:
- الإيميل: ${email}
- الدروس اللي شافها: ${watched} من ${total} درس إجمالي
- نسبة الإنجاز: ${total > 0 ? Math.round((watched/total)*100) : 0}%
- أسئلته للمساعد الذكي: ${qCount} سؤال

اعمل تحليل ذكي مفصّل وقدّم توصيات للمتابعة 🎯`;

    aiRenderMessages();
    const userMsg = aiAddMessageToChat(aiActiveChat.id, 'user', prompt);
    aiAppendMsgEl(userMsg);

    aiIsLoading = true;
    const sendBtn = document.getElementById('ai-send-btn');
    if (sendBtn) sendBtn.disabled = true;
    aiShowTyping();

    try {
        const reply = await aiCallAPI(aiActiveChat.messages);
        aiHideTyping();
        const aiMsg = aiAddMessageToChat(aiActiveChat.id, 'assistant', reply);
        await aiAppendMsgAnimated(aiMsg);
        aiRenderSidebar();
    } catch (err) {
        aiHideTyping();
        const errMsg = aiAddMessageToChat(aiActiveChat.id, 'assistant', '⚠️ حصلت مشكلة في التحليل — جرب تاني');
        aiAppendMsgEl(errMsg);
    } finally {
        aiIsLoading = false;
        if (sendBtn) sendBtn.disabled = false;
    }
}

function aiHideAnalytics() {
    const panel = document.getElementById('ai-analytics-panel');
    if (panel) panel.style.display = 'none';
    aiHideMemoryPanel();
    aiShowChat();
}

function aiHideChat() {
    const chatArea = document.getElementById('ai-chat-area');
    if (chatArea) chatArea.style.display = 'none';
}

function aiShowChat() {
    const chatArea = document.getElementById('ai-chat-area');
    if (chatArea) chatArea.style.display = 'flex';
}

// ─── أنيميشن الكتابة ─────────────────────────────────────
async function aiAnimateTyping(bubbleEl, fullText) {
    const wrap   = document.getElementById('ai-messages-wrap');
    const tokens = fullText.match(/[\u0600-\u06FF\w]+|\s+|[^\u0600-\u06FF\w\s]/g) || [fullText];
    let built = '';
    bubbleEl.innerHTML = '<span class="ai-type-cursor">▌</span>';

    for (let i = 0; i < tokens.length; i++) {
        built += tokens[i];
        bubbleEl.innerHTML = aiFormatText(built) + '<span class="ai-type-cursor">▌</span>';
        const t = tokens[i];
        let delay = 18;
        if (/[.!?؟،\n]/.test(t)) delay = 65;
        else if (/^\s+$/.test(t))  delay = 5;
        await new Promise(r => setTimeout(r, delay));

        // scroll ذكي فقط — لا نجبر المستخدم
        if (i % 10 === 0 && wrap) {
            const atBottom = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 80;
            if (atBottom) wrap.scrollTop = wrap.scrollHeight;
        }
    }
    bubbleEl.innerHTML = aiFormatText(fullText);
    // scroll أخير ذكي
    if (wrap) {
        const atBottom = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 80;
        if (atBottom) wrap.scrollTop = wrap.scrollHeight;
    }
}

async function aiAppendMsgAnimated(msg, isTF = false) {
    const wrap = document.getElementById('ai-messages-wrap');
    if (!wrap) return;
    wrap.querySelector('.ai-empty-state')?.remove();

    const div = document.createElement('div');
    div.className = 'ai-msg ai-msg-assistant';
    div.dataset.msgId = msg.ts || Date.now();
    const time = new Date(msg.ts).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    div.innerHTML = `
        <div class="ai-msg-avatar ai-msg-avatar-ai"><i class="fas fa-robot"></i></div>
        <div class="ai-msg-body">
            <div class="ai-msg-bubble" id="ai-anim-bubble-${msg.ts}"></div>
            <div class="ai-msg-footer">
                <div class="ai-msg-time">${time}</div>
                <div class="ai-msg-tools">
                    <button class="ai-tool-btn" onclick="aiCopyMessage(this)" title="نسخ"><i class="fas fa-copy"></i></button>
                </div>
            </div>
        </div>`;
    wrap.appendChild(div);

    const bubbleEl = div.querySelector('.ai-msg-bubble');
    const msgBody  = div.querySelector('.ai-msg-body');
    await aiAnimateTyping(bubbleEl, msg.content);

    // ── أزرار التفاعل تحت الـ body مباشرة (ليست داخل الـ bubble) ──
    const quizOptions = aiDetectQuiz(msg.content);
    if (quizOptions && msgBody) {
        const quizEl = _aiMakeQuizContainer(quizOptions);
        msgBody.appendChild(quizEl);
    } else if (isTF && msgBody) {
        const tfEl = _aiMakeTrueFalseContainer();
        msgBody.appendChild(tfEl);
    }

    // scroll ذكي
    const atBottom = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 100;
    if (atBottom) wrap.scrollTop = wrap.scrollHeight;
}

// ─── أسئلة الاختيار المتعدد ─────────────────────────────
// Factory: تُنشئ container DOM جاهز يُضاف لـ .ai-msg-body
function _aiMakeQuizContainer(options) {
    const container = document.createElement('div');
    container.className = 'ai-quiz-container';
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'ai-quiz-btn';
        btn.dataset.label = opt.label;
        btn.innerHTML = `<span class="ai-quiz-label">${escHtml(opt.label)})</span> ${escHtml(opt.text)}`;
        btn.addEventListener('click', () => aiHandleQuizAnswer(btn, opt, container));
        container.appendChild(btn);
    });
    return container;
}

// Backward-compat wrapper (تستخدمه الدوال القديمة)
function aiRenderQuizOptions(parentEl, options) {
    const body = parentEl.querySelector?.('.ai-msg-body') || parentEl;
    body.appendChild(_aiMakeQuizContainer(options));
    const wrap = document.getElementById('ai-messages-wrap');
    if (wrap) setTimeout(() => { wrap.scrollTop = wrap.scrollHeight; }, 60);
}

async function aiHandleQuizAnswer(clickedBtn, option, container) {
    if (container.dataset.answered) return;
    container.dataset.answered = '1';

    const allBtns = container.querySelectorAll('.ai-quiz-btn');
    allBtns.forEach(b => {
        b.disabled = true;
        b.classList.add('ai-quiz-disabled');
    });
    clickedBtn.classList.remove('ai-quiz-disabled');
    clickedBtn.classList.add('ai-quiz-selected');
    clickedBtn.innerHTML += ' <span class="ai-quiz-thinking"><i class="fas fa-circle-notch fa-spin"></i></span>';

    if (!aiActiveChat) return;

    const choiceText = `اخترت: ${option.label}) ${option.text}`;
    const userMsg = aiAddMessageToChat(aiActiveChat.id, 'user', choiceText);
    aiAppendMsgEl(userMsg);
    aiRenderSidebar();

    aiIsLoading = true;
    const sendBtn = document.getElementById('ai-send-btn');
    if (sendBtn) sendBtn.disabled = true;
    aiShowTyping();

    try {
        const rawReply = await aiCallAPI(aiActiveChat.messages);
        aiHideTyping();
        const hasTF     = /\[TRUE_FALSE\]/.test(rawReply);
        const cleanRaw  = rawReply.replace(/\[TRUE_FALSE\]/g, '').trim();
        const isCorrect = cleanRaw.includes('✅');
        const isWrong   = cleanRaw.includes('❌');

        clickedBtn.querySelector('.ai-quiz-thinking')?.remove();

        if (isCorrect) {
            // إجابة صح: الزر اللي اختاره بالأخضر
            clickedBtn.classList.remove('ai-quiz-disabled', 'ai-quiz-selected');
            clickedBtn.classList.add('ai-quiz-correct');
            clickedBtn.innerHTML += ' ✅';
        } else if (isWrong) {
            // إجابة غلط: الزر اللي اختاره بالأحمر
            clickedBtn.classList.remove('ai-quiz-disabled', 'ai-quiz-selected');
            clickedBtn.classList.add('ai-quiz-wrong');
            clickedBtn.innerHTML += ' ❌';

            // محاولة استخراج الإجابة الصحيحة من رد الـ AI وإضاءتها بالأخضر
            const correctLabelMatch =
                cleanRaw.match(/الإجابة\s+الصحيحة\s+هي?\s*[:\-]?\s*([أابجده])\s*\)/) ||
                cleanRaw.match(/الصواب\s+هو\s*[:\-]?\s*([أابجده])\s*\)/) ||
                cleanRaw.match(/✅\s*([أابجده])\s*\)/) ||
                cleanRaw.match(/^([أابجده])\s*\)\s+.+✅/m);

            if (correctLabelMatch) {
                const correctLabel = correctLabelMatch[1];
                allBtns.forEach(b => {
                    if (b.dataset.label === correctLabel && b !== clickedBtn) {
                        b.classList.remove('ai-quiz-disabled');
                        b.classList.add('ai-quiz-correct');
                    }
                });
            }
        }

        const aiMsg = aiAddMessageToChat(aiActiveChat.id, 'assistant', cleanRaw, null, { isTF: hasTF });
        await aiAppendMsgAnimated(aiMsg, hasTF);
        aiRenderSidebar();
    } catch (err) {
        aiHideTyping();
        clickedBtn.querySelector('.ai-quiz-thinking')?.remove();
        const errMsg = aiAddMessageToChat(aiActiveChat.id, 'assistant', '⚠️ حصلت مشكلة — جرب تاني');
        aiAppendMsgEl(errMsg);
    } finally {
        aiIsLoading = false;
        if (sendBtn) sendBtn.disabled = false;
    }
}

// ─── صح / غلط ────────────────────────────────────────────
function _aiMakeTrueFalseContainer() {
    const container = document.createElement('div');
    container.className = 'ai-tf-container';

    const trueBtn  = document.createElement('button');
    trueBtn.className = 'ai-tf-btn ai-tf-true';
    trueBtn.innerHTML = '<i class="fas fa-check"></i> صح ✅';

    const falseBtn = document.createElement('button');
    falseBtn.className = 'ai-tf-btn ai-tf-false';
    falseBtn.innerHTML = '<i class="fas fa-times"></i> غلط ❌';

    const handler = async (chosen, btn) => {
        if (container.dataset.answered) return;
        container.dataset.answered = '1';
        trueBtn.disabled = falseBtn.disabled = true;
        [trueBtn, falseBtn].forEach(b => b.classList.add('ai-tf-dim'));
        btn.classList.remove('ai-tf-dim');
        btn.classList.add('ai-tf-selected');

        if (!aiActiveChat) return;
        const choiceText = chosen === 'true' ? 'إجابتي: صح ✅' : 'إجابتي: غلط ❌';
        const userMsg = aiAddMessageToChat(aiActiveChat.id, 'user', choiceText);
        aiAppendMsgEl(userMsg);
        aiRenderSidebar();

        aiIsLoading = true;
        const sendBtn = document.getElementById('ai-send-btn');
        if (sendBtn) sendBtn.disabled = true;
        aiShowTyping();
        try {
            const rawReply = await aiCallAPI(aiActiveChat.messages);
            aiHideTyping();
            const hasTF    = /\[TRUE_FALSE\]/.test(rawReply);
            const cleanRaw = rawReply.replace(/\[TRUE_FALSE\]/g, '').trim();
            const isCorrect = cleanRaw.includes('✅');
            const isWrong   = cleanRaw.includes('❌');
            btn.classList.remove('ai-tf-selected');
            if (isCorrect) {
                btn.classList.add('ai-tf-correct');
            } else if (isWrong) {
                btn.classList.add('ai-tf-wrong');
                // الإجابة الصح تضيء بالأخضر
                const otherBtn = (chosen === 'true') ? falseBtn : trueBtn;
                otherBtn.classList.remove('ai-tf-dim');
                otherBtn.classList.add('ai-tf-correct');
            }
            const aiMsg = aiAddMessageToChat(aiActiveChat.id, 'assistant', cleanRaw, null, { isTF: hasTF });
            await aiAppendMsgAnimated(aiMsg, hasTF);
            aiRenderSidebar();
        } catch {
            aiHideTyping();
            const errMsg = aiAddMessageToChat(aiActiveChat.id, 'assistant', '⚠️ حصلت مشكلة — جرب تاني');
            aiAppendMsgEl(errMsg);
        } finally {
            aiIsLoading = false;
            if (sendBtn) sendBtn.disabled = false;
        }
    };

    trueBtn.addEventListener('click',  () => handler('true',  trueBtn));
    falseBtn.addEventListener('click', () => handler('false', falseBtn));
    container.appendChild(trueBtn);
    container.appendChild(falseBtn);
    return container;
}

// Backward-compat
function aiRenderTrueFalseOptions(parentEl) {
    const body = parentEl.querySelector?.('.ai-msg-body') || parentEl;
    body.appendChild(_aiMakeTrueFalseContainer());
}

// ─── لوحة الذاكرة ────────────────────────────────────────
function aiShowMemoryPanel() {
    // إغلاق sidebar تلقائياً على الموبايل
    if (window.innerWidth <= 900) {
        document.getElementById('ai-sidebar')?.classList.remove('ai-sidebar-open');
        document.getElementById('ai-sidebar-overlay')?.classList.remove('show');
    }
    aiHideChat();
    const analytics = document.getElementById('ai-analytics-panel');
    if (analytics) analytics.style.display = 'none';
    const panel = document.getElementById('ai-memory-panel');
    if (!panel) return;
    panel.style.display = 'flex';
    panel.onclick = (e) => e.stopPropagation();
    aiRenderMemoryPanel();
}

function aiHideMemoryPanel() {
    const panel = document.getElementById('ai-memory-panel');
    if (panel) panel.style.display = 'none';
}

function aiRenderMemoryPanel() {
    const panel = document.getElementById('ai-memory-panel');
    if (!panel) return;
    const memories = aiGetMemories();
    const count    = memories.length;
    const max      = AI_MAX_MEMORIES;
    const pct      = Math.round((count / max) * 100);
    const barColor = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#c5a059';

    panel.innerHTML = `
    <div class="ai-memory-wrap">
        <div class="ai-analytics-header">
            <button class="ai-analytics-back" onclick="aiHideMemoryPanel(); aiShowChat();">
                <i class="fas fa-arrow-right"></i> رجوع
            </button>
            <h3>🧠 ذاكرتي</h3>
            <span class="ai-mem-count-badge" style="color:${barColor}">${count}/${max}</span>
        </div>
        <div class="ai-mem-quota-wrap">
            <div class="ai-quota-track">
                <div class="ai-quota-fill" style="width:${pct}%; background:${barColor};"></div>
            </div>
        </div>
        ${count > 0 ? `
        <div class="ai-mem-actions">
            <button class="ai-mem-clear-btn" onclick="aiClearAllMemoriesUI()">
                <i class="fas fa-trash-alt"></i> حذف كل الذاكرة
            </button>
        </div>` : ''}
        <div class="ai-memory-list" id="ai-memory-list">
            ${count === 0
                ? `<div class="ai-mem-empty">
                    <i class="fas fa-brain"></i>
                    <p>الذاكرة فارغة</p>
                    <small>قول للمساعد "تذكر أن..." لحفظ معلومة</small>
                   </div>`
                : memories.map(m => aiMemoryItemHTML(m)).join('')
            }
        </div>
    </div>`;
}

function aiMemoryItemHTML(m) {
    const date   = new Date(m.createdAt).toLocaleDateString('ar-EG');
    const safeId = m.id.replace(/[^a-zA-Z0-9_]/g, '_');
    return `
    <div class="ai-mem-item" id="memitem_${safeId}">
        <div class="ai-mem-item-body">
            <p class="ai-mem-text">${escHtml(m.text)}</p>
            <span class="ai-mem-date">${date}</span>
        </div>
        <button class="ai-mem-del-btn" onclick="aiRemoveMemoryUI('${m.id}','${safeId}')">
            <i class="fas fa-trash-alt"></i>
        </button>
    </div>`;
}

async function aiRemoveMemoryUI(memoryId, safeId) {
    const item = document.getElementById(`memitem_${safeId}`);
    if (item) {
        item.style.animation = 'aiMemDel .3s forwards';
        setTimeout(async () => {
            await aiDeleteMemory(memoryId);
            aiRenderMemoryPanel();
            aiUpdateMemoryCount();
        }, 280);
    } else {
        await aiDeleteMemory(memoryId);
        aiRenderMemoryPanel();
        aiUpdateMemoryCount();
    }
}

async function aiClearAllMemoriesUI() {
    await aiClearMemories();
    aiRenderMemoryPanel();
    aiUpdateMemoryCount();
    aiShowToast('تم مسح الذاكرة بالكامل ✅', 'success');
}

function aiUpdateMemoryCount() {
    const el = document.getElementById('ai-memory-count');
    if (el) el.textContent = `${aiGetMemories().length}/${AI_MAX_MEMORIES}`;
}

// ─── التسجيل الصوتي (Microphone) ────────────────────────
let aiSpeechRecognition = null;
let aiIsRecording       = false;
let aiPreRecordingText  = ''; // ✅ يحفظ النص الموجود قبل التسجيل
let _aiPendingImage     = null; // { base64, type, objectUrl }
let _aiRateLimitUntil   = 0;   // timestamp — cooldown بعد 429

function aiToggleVoice() {
    // تحقق من دعم API
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        aiShowToast('متصفحك مش بيدعم التسجيل الصوتي — جرّب Chrome 🎤', 'error');
        return;
    }
    // على الموبايل: نطلب إذن الميكروفون صراحةً أولاً
    if (!aiIsRecording && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                // وقفنا الـ stream الفوري — المطلوب فقط تأكيد الإذن
                stream.getTracks().forEach(t => t.stop());
                aiStartVoice();
            })
            .catch(err => {
                console.error('[AI Mic]', err.name, err.message);
                if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                    aiShowToast('مسموحتش بالميكروفون — افتح الإعدادات وامنح الإذن 🎤', 'error');
                } else if (err.name === 'NotFoundError') {
                    aiShowToast('مفيش ميكروفون متاح على الجهاز 🎤', 'error');
                } else {
                    aiShowToast('خطأ في الوصول للميكروفون: ' + err.name, 'error');
                }
            });
        return;
    }
    aiIsRecording ? aiStopVoice() : aiStartVoice();
}

function aiStartVoice() {
    const SR  = window.SpeechRecognition || window.webkitSpeechRecognition;
    const inp = document.getElementById('ai-msg-input');

    // ✅ حفظ النص الموجود في الـ input قبل ما نبدأ التسجيل
    aiPreRecordingText = inp ? inp.value : '';

    aiSpeechRecognition = new SR();
    aiSpeechRecognition.lang            = 'ar-EG';
    aiSpeechRecognition.continuous      = false;
    aiSpeechRecognition.interimResults  = true;

    const micBtn = document.getElementById('ai-mic-btn');

    aiSpeechRecognition.onstart = () => {
        aiIsRecording = true;
        if (micBtn) micBtn.classList.add('ai-mic-recording');
        aiShowToast('🎤 تكلم دلوقتي...', 'success');
    };

    aiSpeechRecognition.onresult = (e) => {
        const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
        const input = document.getElementById('ai-msg-input');
        if (input) {
            // ✅ الإضافة على النص الموجود بدل الاستبدال
            const sep = aiPreRecordingText && !aiPreRecordingText.endsWith(' ') ? ' ' : '';
            input.value = aiPreRecordingText + sep + transcript;
            aiAutoResize(input);
        }
    };

    aiSpeechRecognition.onerror = (e) => {
        console.error('[AI Voice] error:', e.error);
        const msgs = {
            'not-allowed':    'لم يُمنح إذن الميكروفون ⚠️',
            'network':        'خطأ في الشبكة أثناء التسجيل ⚠️',
            'no-speech':      null, // صامت — مش خطأ
            'audio-capture':  'تعذر الوصول للميكروفون ⚠️',
            'service-not-allowed': 'الخدمة غير مسموح بها — تأكد من HTTPS ⚠️'
        };
        const msg = msgs[e.error];
        if (msg) aiShowToast(msg, 'error');
        aiStopVoice();
    };

    aiSpeechRecognition.onend = () => aiStopVoice();

    try {
        aiSpeechRecognition.start();
    } catch(e) {
        console.error('[AI Voice] start error:', e);
        aiShowToast('تعذّر بدء التسجيل — تأكد من HTTPS ⚠️', 'error');
        aiStopVoice();
    }
}

// ─── زر الإضافة (+) وإرفاق الصور ───────────────────────
function aiToggleAttachMenu() {
    const isMobile = window.innerWidth <= 640 ||
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile) {
        // موبايل → Bottom Sheet
        aiShowBottomSheet();
    } else {
        // كمبيوتر → قائمة منسدلة عادية
        const menu = document.getElementById('ai-attach-menu');
        if (!menu) return;
        const isOpen = menu.classList.toggle('show');
        if (isOpen) {
            setTimeout(() => {
                document.addEventListener('click', _aiCloseAttachOnClickOut, { once: true });
            }, 10);
        }
    }
}

// ── Bottom Sheet للموبايل ─────────────────────────────────
function aiShowBottomSheet() {
    // إزالة قديم
    document.getElementById('ai-attach-bottom-sheet-el')?.remove();

    const sheet = document.createElement('div');
    sheet.id        = 'ai-attach-bottom-sheet-el';
    sheet.className = 'ai-attach-bottom-sheet';
    sheet.innerHTML = `
        <div class="ai-abs-backdrop"></div>
        <div class="ai-abs-content">
            <div class="ai-abs-handle"></div>
            <div class="ai-abs-title">اختر نوع المحتوى</div>
            <div class="ai-abs-options">
                <button class="ai-abs-opt-btn" onclick="aiUploadImage(); aiCloseBottomSheet();">
                    <div class="ai-abs-icon"><i class="fas fa-image"></i></div>
                    رفع صورة
                </button>
                <button class="ai-abs-opt-btn" onclick="aiOpenCamera(); aiCloseBottomSheet();">
                    <div class="ai-abs-icon"><i class="fas fa-camera"></i></div>
                    كاميرا
                </button>
            </div>
        </div>`;

    const modal = document.getElementById('ai-modal');
    if (!modal) return;
    modal.appendChild(sheet);

    sheet.querySelector('.ai-abs-backdrop')?.addEventListener('click', aiCloseBottomSheet);

    // animation
    requestAnimationFrame(() => {
        requestAnimationFrame(() => sheet.classList.add('show'));
    });
}

function aiCloseBottomSheet() {
    const sheet = document.getElementById('ai-attach-bottom-sheet-el');
    if (!sheet) return;
    sheet.classList.remove('show');
    setTimeout(() => sheet.remove(), 350);
}

function _aiCloseAttachOnClickOut(e) {
    if (!e.target.closest('#ai-attach-menu') && !e.target.closest('#ai-attach-btn')) {
        document.getElementById('ai-attach-menu')?.classList.remove('show');
    }
}

function aiCloseAttachMenu() {
    document.getElementById('ai-attach-menu')?.classList.remove('show');
}

function aiUploadImage() {
    aiCloseAttachMenu();
    const fileInput = document.createElement('input');
    fileInput.type   = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = (e) => { if (e.target.files[0]) aiHandleImageFile(e.target.files[0]); };
    fileInput.click();
}

function aiOpenCamera() {
    aiCloseAttachMenu();
    aiCloseBottomSheet();

    const isMobile = window.innerWidth <= 640 ||
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile) {
        // موبايل → file input مع capture (يفتح كاميرا الجهاز مباشرة)
        const fileInput = document.createElement('input');
        fileInput.type    = 'file';
        fileInput.accept  = 'image/*';
        fileInput.capture = 'environment';
        fileInput.onchange = (e) => { if (e.target.files[0]) aiHandleImageFile(e.target.files[0]); };
        fileInput.click();
    } else {
        // كمبيوتر → WebRTC getUserMedia
        aiOpenCameraWebRTC();
    }
}

// ── WebRTC Camera للكمبيوتر ───────────────────────────────
async function aiOpenCameraWebRTC() {
    const modal = document.getElementById('ai-modal');
    if (!modal) return;

    // إنشاء الـ overlay
    const overlay = document.createElement('div');
    overlay.id        = 'ai-camera-overlay';
    overlay.className = 'ai-camera-overlay';
    overlay.innerHTML = `
        <div class="ai-camera-modal">
            <div class="ai-camera-header">
                <span><i class="fas fa-camera" style="color:var(--ai-gold);margin-left:8px;"></i> التقاط صورة</span>
                <button class="ai-camera-close-btn" id="ai-camera-close-btn">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="ai-camera-video-wrap">
                <video id="ai-camera-video" autoplay playsinline muted></video>
            </div>
            <button class="ai-camera-capture-btn" id="ai-camera-capture-btn" title="التقاط">
                <i class="fas fa-camera"></i>
            </button>
        </div>`;

    modal.appendChild(overlay);
    requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('show')));

    let stream = null;
    const video      = overlay.querySelector('#ai-camera-video');
    const closeBtn   = overlay.querySelector('#ai-camera-close-btn');
    const captureBtn = overlay.querySelector('#ai-camera-capture-btn');

    const stopCamera = () => {
        if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 280);
    };

    closeBtn.addEventListener('click', stopCamera);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) stopCamera(); });

    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        video.srcObject = stream;
        await video.play().catch(() => {});
    } catch (err) {
        console.error('[AI WebRTC Camera]', err.name, err.message);
        stopCamera();
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            aiShowToast('مسموحتش بالكاميرا — افتح الإعدادات وامنح الإذن 📷', 'error');
        } else if (err.name === 'NotFoundError') {
            aiShowToast('مفيش كاميرا متاحة على الجهاز 📷', 'error');
        } else {
            aiShowToast('تعذّر الوصول للكاميرا: ' + err.name, 'error');
        }
        return;
    }

    captureBtn.addEventListener('click', () => {
        const canvas = document.createElement('canvas');
        canvas.width  = video.videoWidth  || 1280;
        canvas.height = video.videoHeight || 720;
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
            if (!blob) { aiShowToast('فشل التقاط الصورة ⚠️', 'error'); return; }
            const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
            stopCamera();
            aiHandleImageFile(file);
        }, 'image/jpeg', 0.88);
    });
}

function aiHandleImageFile(file) {
    if (!file || !file.type.startsWith('image/')) {
        aiShowToast('الملف ده مش صورة! ⚠️', 'error');
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        aiShowToast('الصورة كبيرة أوي — الحد الأقصى 5MB ⚠️', 'warn');
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        const dataUrl = e.target.result;
        const base64  = dataUrl.split(',')[1];
        _aiPendingImage = { base64, type: file.type, objectUrl: dataUrl };
        aiShowImagePreviewBar(dataUrl);
        // فوكس على الـ input عشان المستخدم يقدر يكتب سؤاله
        document.getElementById('ai-msg-input')?.focus();
    };
    reader.readAsDataURL(file);
}

function aiShowImagePreviewBar(dataUrl) {
    document.getElementById('ai-image-preview-bar')?.remove();
    const bar = document.createElement('div');
    bar.id        = 'ai-image-preview-bar';
    bar.className = 'ai-image-preview-bar';
    bar.innerHTML = `
        <div class="ai-img-prev-thumb">
            <img src="${dataUrl}" alt="صورة" onclick="aiOpenImageFullscreen('${dataUrl}')">
            <div class="ai-img-prev-overlay"><i class="fas fa-expand-alt"></i></div>
        </div>
        <span class="ai-img-prev-label"><i class="fas fa-image"></i> صورة جاهزة للإرسال</span>
        <button class="ai-img-prev-remove" onclick="aiClearPendingImage()" title="إزالة">
            <i class="fas fa-times"></i>
        </button>`;
    const inputBar = document.getElementById('ai-input-bar');
    if (inputBar) inputBar.insertBefore(bar, inputBar.firstChild);
}

function aiClearPendingImage() {
    _aiPendingImage = null;
    document.getElementById('ai-image-preview-bar')?.remove();
}

// ─── حقن الصورة داخل فقاعة الرسالة ──────────────────────
function aiInjectImageIntoBubble(msgEl, imageUrl) {
    const bubble = msgEl?.querySelector('.ai-msg-bubble');
    if (!bubble) return;
    const imgWrap = document.createElement('div');
    imgWrap.className = 'ai-msg-img-wrap';
    const img = document.createElement('img');
    img.className = 'ai-msg-image';
    img.src       = imageUrl;
    img.alt       = 'صورة مرفقة';
    img.loading   = 'lazy';
    img.onclick   = () => aiOpenImageFullscreen(imageUrl);
    imgWrap.appendChild(img);
    bubble.insertBefore(imgWrap, bubble.firstChild);
}

// ─── عرض الصورة في وضع ملء الشاشة ───────────────────────
function aiOpenImageFullscreen(url) {
    document.getElementById('ai-img-fullscreen')?.remove();
    const overlay = document.createElement('div');
    overlay.id        = 'ai-img-fullscreen';
    overlay.className = 'ai-img-fullscreen';
    overlay.innerHTML = `
        <button class="ai-img-fs-close" onclick="document.getElementById('ai-img-fullscreen').remove()">
            <i class="fas fa-times"></i>
        </button>
        <img src="${url}" alt="صورة">`;
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
    document.getElementById('ai-modal').appendChild(overlay);
}

function aiStopVoice() {
    aiIsRecording      = false;
    aiPreRecordingText = '';
    const micBtn = document.getElementById('ai-mic-btn');
    if (micBtn) micBtn.classList.remove('ai-mic-recording');
    try { aiSpeechRecognition?.stop(); } catch(e) {}
    aiSpeechRecognition = null;
}

// ─── Cooldown بعد 429 — يمنع إعادة المحاولة الفورية ────────
function aiStartRateLimitCooldown(seconds) {
    _aiRateLimitUntil = Date.now() + seconds * 1000;
    const sendBtn = document.getElementById('ai-send-btn');
    if (!sendBtn) return;
    sendBtn.disabled  = true;
    const origHTML    = sendBtn.innerHTML;
    const tick = () => {
        const remaining = Math.ceil((_aiRateLimitUntil - Date.now()) / 1000);
        if (remaining <= 0) {
            _aiRateLimitUntil = 0;
            sendBtn.disabled  = false;
            sendBtn.innerHTML = origHTML;
            return;
        }
        sendBtn.innerHTML = `<i class="fas fa-clock"></i><span style="font-size:11px;margin-right:3px">${remaining}s</span>`;
        setTimeout(tick, 1000);
    };
    tick();
}

// ─── نسخ رسالة ───────────────────────────────────────────
function aiCopyMessage(btn) {
    const bubble = btn.closest('.ai-msg-body')?.querySelector('.ai-msg-bubble');
    if (!bubble) return;
    // نسخ النص بدون HTML
    const text = bubble.innerText || bubble.textContent || '';
    navigator.clipboard.writeText(text).then(() => {
        aiShowToast('تم النسخ ✅', 'success');
        const icon = btn.querySelector('i');
        if (icon) {
            icon.className = 'fas fa-check';
            setTimeout(() => { icon.className = 'fas fa-copy'; }, 1500);
        }
    }).catch(() => {
        // fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        aiShowToast('تم النسخ ✅', 'success');
    });
}

// ─── تعديل رسالة + إعادة توليد ───────────────────────────
function aiEditMessage(btn) {
    if (!aiActiveChat) return;
    const msgDiv  = btn.closest('.ai-msg');
    if (!msgDiv) return;
    const bubble  = msgDiv.querySelector('.ai-msg-bubble');
    const msgId   = parseInt(msgDiv.dataset.msgId);
    const msgIdx  = aiActiveChat.messages.findIndex(m => m.ts === msgId);
    if (msgIdx < 0 || !bubble) return;

    const currentMsg  = aiActiveChat.messages[msgIdx];
    const currentText = currentMsg.content || '';
    // نزيل prefix الصورة من النص المعروض في الـ input
    const displayText = currentText
        .replace(/^📸\s+/,'')
        .replace(/^📸$/,'')
        .trim();

    bubble.innerHTML = '';

    // لو في صورة محفوظة مع الرسالة: نعرض preview ثابت
    if (currentMsg.imageBase64) {
        const imgDataUrl = `data:${currentMsg.imageType || 'image/jpeg'};base64,${currentMsg.imageBase64}`;
        const imgPreview = document.createElement('div');
        imgPreview.className = 'ai-edit-img-preview';
        imgPreview.innerHTML = `
            <img src="${imgDataUrl}" alt="صورة مرفقة" onclick="aiOpenImageFullscreen('${imgDataUrl}')" title="اضغط للتكبير">
            <span class="ai-edit-img-label"><i class="fas fa-image"></i> الصورة مرفقة وسيتم إرسالها مع التعديل</span>`;
        bubble.appendChild(imgPreview);
    }

    const input = document.createElement('textarea');
    input.className   = 'ai-edit-input';
    input.value       = displayText;
    input.rows        = 3;
    bubble.appendChild(input);
    input.focus();
    input.select();

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'ai-edit-confirm-btn';
    confirmBtn.innerHTML = '<i class="fas fa-paper-plane"></i> إعادة إرسال';
    confirmBtn.onclick = () => aiConfirmEdit(
        msgDiv, msgIdx, input.value,
        currentMsg.imageBase64 || null,
        currentMsg.imageType   || null
    );
    bubble.appendChild(confirmBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'ai-edit-cancel-btn';
    cancelBtn.innerHTML = '<i class="fas fa-times"></i>';
    cancelBtn.onclick = () => aiRenderMessages();
    bubble.appendChild(cancelBtn);
}

async function aiConfirmEdit(msgDiv, msgIdx, newText, savedBase64 = null, savedType = null) {
    newText = (newText || '').trim();
    // يجب أن يكون فيه نص أو صورة
    if (!newText && !savedBase64) { aiRenderMessages(); return; }
    if (!aiActiveChat) { aiRenderMessages(); return; }

    const email = auth.currentUser?.email?.toLowerCase();
    if (!email) return;

    // حذف الرسالة المعدّلة وكل ما بعدها (رد الـ AI القديم)
    aiActiveChat.messages = aiActiveChat.messages.slice(0, msgIdx);
    aiSaveChats(email, aiAllChats);

    // إعادة رسم
    aiRenderMessages();

    // لو في صورة محفوظة: نعيد تعيينها كـ pending image
    if (savedBase64) {
        const mimeType = savedType || 'image/jpeg';
        const dataUrl  = `data:${mimeType};base64,${savedBase64}`;
        _aiPendingImage = { base64: savedBase64, type: mimeType, objectUrl: dataUrl };
        aiShowImagePreviewBar(dataUrl);
    }

    const input = document.getElementById('ai-msg-input');
    if (input) {
        input.value = newText;
        aiAutoResize(input);
    }
    await aiSendMessage();
}

// ─── كشف صح/غلط ──────────────────────────────────────────
function aiDetectTrueFalse(text) {
    return /\[TRUE_FALSE\]/.test(text);
}

// NOTE: aiRenderTrueFalseOptions is defined earlier (backward-compat wrapper for _aiMakeTrueFalseContainer)

// ─── ميزة "اسأل عن الكلمة" (word selection popup) ─────────
let _aiWordPopupTimer = null;

function aiInitWordSelection() {
    const modalEl = document.getElementById('ai-modal');
    if (!modalEl) return;

    const showPopup = (e) => {
        clearTimeout(_aiWordPopupTimer);
        _aiWordPopupTimer = setTimeout(() => {
            // إزالة popup قديم
            document.getElementById('ai-word-popup')?.remove();

            const sel  = window.getSelection();
            const text = sel?.toString()?.trim();
            if (!text || text.length < 2 || text.length > 200) return;

            // تأكد إن التحديد داخل منطقة رسائل الـ AI
            const wrap = document.getElementById('ai-messages-wrap');
            if (!wrap || !sel.anchorNode || !wrap.contains(sel.anchorNode)) return;

            // موضع الـ popup
            const range = sel.getRangeAt(0);
            const rect  = range.getBoundingClientRect();
            const modalRect = modalEl.getBoundingClientRect();

            const popup = document.createElement('div');
            popup.id    = 'ai-word-popup';
            popup.className = 'ai-word-popup';
            popup.innerHTML = `<i class="fas fa-robot"></i> اسأل عن: "${text.length > 30 ? text.slice(0,28)+'…' : text}"`;

            // positioning relative to modal
            const top  = rect.top  - modalRect.top  - 44;
            const left = rect.left - modalRect.left + (rect.width / 2);
            popup.style.cssText = `top:${top}px;left:${left}px;transform:translateX(-50%);`;

            popup.addEventListener('click', (ev) => {
                ev.stopPropagation();
                popup.remove();
                sel.removeAllRanges();
                const input = document.getElementById('ai-msg-input');
                if (input) {
                    input.value = text;
                    aiAutoResize(input);
                    input.focus();
                }
                aiSendMessage();
            });

            modalEl.appendChild(popup);

            // إخفاء تلقائي بعد 4 ثواني
            setTimeout(() => popup.remove(), 4000);
        }, 300);
    };

    const hidePopup = (e) => {
        // لو ضغط خارج الـ popup
        if (!e.target.closest('#ai-word-popup')) {
            clearTimeout(_aiWordPopupTimer);
            setTimeout(() => document.getElementById('ai-word-popup')?.remove(), 150);
        }
    };

    document.addEventListener('mouseup',  showPopup);
    document.addEventListener('touchend', showPopup);
    document.addEventListener('mousedown', hidePopup);
}

// ─── إصلاح الكيبورد على الموبايل ────────────────────────
function aiInitMobileKeyboard() {
    if (!window.visualViewport) return;
    const modal = document.getElementById('ai-modal');
    if (!modal) return;

    let lastHeight = window.visualViewport.height;

    window.visualViewport.addEventListener('resize', () => {
        const vv     = window.visualViewport;
        const newH   = vv.height;
        const newTop = vv.offsetTop || 0;

        // نطبّق الأبعاد على الـ modal فقط بدون أي تأثير على باقي الصفحة
        modal.style.height = newH + 'px';
        modal.style.top    = newTop + 'px';
        modal.style.bottom = 'auto';

        // لو الكيبورد اتفتح (ارتفاع اصغر): scroll للأسفل في الرسائل
        if (newH < lastHeight) {
            setTimeout(() => {
                const wrap = document.getElementById('ai-messages-wrap');
                if (wrap) wrap.scrollTop = wrap.scrollHeight;
            }, 80);
        }
        lastHeight = newH;
    });

    // لما الـ modal يتفتح نعيد الحجم الطبيعي
    const observer = new MutationObserver(() => {
        if (!modal.classList.contains('open')) {
            modal.style.height = '';
            modal.style.top    = '';
            modal.style.bottom = '';
        }
    });
    observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
}

// تشغيل عند فتح الـ modal
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(aiInitWordSelection, 500);
    aiInitMobileKeyboard();
});