/* ─────────────────────────────────────────────────────
   AI Video Transcriber · app.js  v3 (multi-task queue)
   ───────────────────────────────────────────────────── */

class App {
  constructor() {
    this.taskId   = null;   // most recent task (for download compat)
    this.lang     = 'zh';
    this.taskData = null;
    this.token    = localStorage.getItem('vt2_token') || '';
    this.username = localStorage.getItem('vt2_username') || '';
    this._authTab = 'login';
    this.sp = { on: false, cur: 0, target: 15, interval: null, stage: 'prep' };

    // per-task tracking: taskId → { url, el, es, sp, pollN, done }
    this._taskCards = {};
    this._progTaskId = null;  // which task is currently shown in the main progress panel

    this.i18n = {
      zh: {
        badge: 'AI 驱动',
        title_h: 'AI <span>视频转录器</span>',
        subtitle: '粘贴任意平台视频链接，自动转录并生成 AI 摘要',
        ph_url: '粘贴 YouTube、B 站、TikTok 等视频链接…',
        btn_start: '开始转录',
        btn_fetch: '获取',
        btn_copy: '复制',
        btn_dl: '下载',
        btn_clear: '清空',
        lbl_lang: '摘要语言',
        lbl_ai_settings: 'AI 设置',
        lbl_base_url: 'API 地址',
        lbl_api_key: 'API Key',
        lbl_model: '模型',
        lbl_history: '历史记录',
        lbl_progress: '处理进度',
        opt_default: '— 使用服务器默认 —',
        empty_text: '粘贴视频链接，让 AI 来处理',
        empty_hint: '支持 YouTube · B站 · TikTok · 30+ 平台',
        tab_raw: '原文字稿',
        tab_script: '转录文本',
        tab_summary: 'AI 摘要',
        tab_trans: '翻译',
        step_fetch: '检测字幕',
        step_dl: '下载音频',
        step_asr: '语音识别',
        step_ai: 'AI 整理',
        step_done: '完成',
        msg_preparing: '准备中…',
        msg_fetching: '正在获取模型…',
        msg_models_ok: (n) => `已加载 ${n} 个模型`,
        msg_models_err: '获取模型失败',
        msg_copied: '已复制',
        msg_processing: '处理中…',
        msg_dl_audio: '正在下载音频…',
        msg_parse: '正在解析视频…',
        msg_asr: '正在转录音频…',
        msg_optimize: '正在优化文本…',
        msg_summary: '正在生成摘要…',
        msg_subtitle_found: '字幕获取成功！正在处理…',
        msg_no_subtitle: '未找到字幕，正在下载音频…',
        msg_detecting: '正在检测字幕…',
        msg_done: '处理完成！',
        mode_subtitle: '⚡ 字幕模式',
        mode_funasr: '🎙 FunASR 模式',
        err_url: '请输入有效的视频链接',
        err_prefix: '处理失败：',
        err_no_file: '没有可下载的文件',
        err_dl: '下载失败：',
        chars: (n) => `${n.toLocaleString()} 字`,
        footer: '本工具是 <a href="https://sipsip.ai" target="_blank">sipsip.ai</a> 的一部分 — 转录任意视频，每日 AI 简报发送到邮箱。',
        lang_toggle: '切换为 English',
      },
      en: {
        badge: 'AI Powered',
        title_h: 'AI <span>Video Transcriber</span>',
        subtitle: 'Paste any video URL for automatic transcription and AI summary',
        ph_url: 'Paste YouTube, TikTok, Bilibili or any video URL…',
        btn_start: 'Transcribe',
        btn_fetch: 'Fetch',
        btn_copy: 'Copy',
        btn_dl: 'Download',
        btn_clear: 'Clear',
        lbl_lang: 'Summary language',
        lbl_ai_settings: 'AI Settings',
        lbl_base_url: 'API Base URL',
        lbl_api_key: 'API Key',
        lbl_model: 'Model',
        lbl_history: 'History',
        lbl_progress: 'Processing',
        opt_default: '— use server default —',
        empty_text: 'Paste a video URL above',
        empty_hint: 'YouTube · Bilibili · TikTok · 30+ platforms',
        tab_raw: 'Raw Transcript',
        tab_script: 'Transcript',
        tab_summary: 'AI Summary',
        tab_trans: 'Translation',
        step_fetch: 'Subtitles',
        step_dl: 'Download',
        step_asr: 'Transcribe',
        step_ai: 'AI',
        step_done: 'Done',
        msg_preparing: 'Preparing…',
        msg_fetching: 'Fetching models…',
        msg_models_ok: (n) => `${n} models loaded`,
        msg_models_err: 'Failed to fetch models',
        msg_copied: 'Copied!',
        msg_processing: 'Processing…',
        msg_dl_audio: 'Downloading audio…',
        msg_parse: 'Parsing video…',
        msg_asr: 'Transcribing audio…',
        msg_optimize: 'Optimizing transcript…',
        msg_summary: 'Generating summary…',
        msg_subtitle_found: 'Subtitles found! Processing…',
        msg_no_subtitle: 'No subtitles, downloading audio…',
        msg_detecting: 'Detecting subtitles…',
        msg_done: 'Done!',
        mode_subtitle: '⚡ Subtitle',
        mode_funasr: '🎙 FunASR',
        err_url: 'Please enter a valid video URL',
        err_prefix: 'Error: ',
        err_no_file: 'No file available',
        err_dl: 'Download failed: ',
        chars: (n) => `${n.toLocaleString()} chars`,
        footer: 'Part of <a href="https://sipsip.ai" target="_blank">sipsip.ai</a> — transcribe any video and get daily AI briefs from your favorite creators.',
        lang_toggle: '切换为中文',
      }
    };

    this._init();
  }

  _authHeaders() {
    return this.token ? { 'Authorization': 'Bearer ' + this.token } : {};
  }

  t(k, ...a) {
    const v = (this.i18n[this.lang] || this.i18n.zh)[k] || this.i18n.zh[k] || k;
    return typeof v === 'function' ? v(...a) : v;
  }

  /* ── Init ──────────────────────────────────────────── */
  _init() {
    this.$ = (id) => document.getElementById(id);
    this._injectQueueCSS();
    this._applyI18n();
    this._bindNav();
    this._bindForm();
    this._bindSettings();
    this._bindTabs();
    this._bindCopy();
    this._bindDownload();
    this._bindHistory();
    this._loadSettings();
    this._bindAuth();
    this._updateAuthNav();
    this._renderHistory();
    this._resumeActiveTask();
    this._restoreLastResult();
  }

  /* ── Task queue card CSS ───────────────────────────── */
  _injectQueueCSS() {
    if (document.getElementById('queueCardCSS')) return;
    const s = document.createElement('style');
    s.id = 'queueCardCSS';
    s.textContent = `
      #taskQueuePanel { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
      #taskQueuePanel:empty { display: none; }
      .tq-card {
        display: flex; align-items: center; gap: 10px;
        padding: 10px 14px;
        background: var(--card-bg, #1e1e2e);
        border: 1px solid var(--border, #2a2a3e);
        border-radius: 10px;
        font-size: 13px;
        transition: opacity .4s, transform .4s;
      }
      .tq-card.tq-done { border-color: #22c55e44; }
      .tq-card.tq-error { border-color: #ef444444; }
      .tq-card.tq-fade { opacity: 0; transform: translateY(-6px); }
      .tq-icon { font-size: 14px; flex-shrink: 0; color: var(--accent, #7c3aed); }
      .tq-body { flex: 1; min-width: 0; }
      .tq-url { display: block; color: var(--text, #e2e8f0); font-weight: 500;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
      .tq-status { font-size: 11px; color: var(--text-secondary, #94a3b8); margin-top: 2px; }
      .tq-bar-wrap { height: 3px; border-radius: 2px; background: var(--border,#2a2a3e); margin-top: 5px; }
      .tq-bar { height: 100%; border-radius: 2px; background: var(--accent,#7c3aed);
                transition: width .5s ease; }
      .tq-bar.done { background: #22c55e; }
      .tq-bar.error { background: #ef4444; }
      .tq-badge {
        flex-shrink: 0; font-size: 10px; padding: 2px 8px;
        border-radius: 20px; white-space: nowrap;
      }
      .tq-badge.queued  { background: #f59e0b22; color: #f59e0b; border: 1px solid #f59e0b44; }
      .tq-badge.running { background: var(--accent-glow,#7c3aed22); color: var(--accent,#7c3aed); border: 1px solid var(--accent,#7c3aed)44; }
      .tq-badge.done    { background: #22c55e22; color: #22c55e; border: 1px solid #22c55e44; }
      .tq-badge.error   { background: #ef444422; color: #ef4444; border: 1px solid #ef444444; }
      .tq-close { background: none; border: none; cursor: pointer; color: var(--text-secondary,#94a3b8);
                  font-size: 13px; padding: 2px 4px; line-height: 1; flex-shrink: 0;
                  opacity: .6; transition: opacity .15s; }
      .tq-close:hover { opacity: 1; }
    `;
    document.head.appendChild(s);
  }

  /* ── Task card management ──────────────────────────── */
  _getOrCreateQueuePanel() {
    let panel = this.$('taskQueuePanel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'taskQueuePanel';
      const form = this.$('videoForm');
      form.parentNode.insertBefore(panel, form.nextSibling);
    }
    return panel;
  }

  _addTaskCard(taskId, url) {
    const panel = this._getOrCreateQueuePanel();
    const card  = document.createElement('div');
    card.className = 'tq-card';
    card.id = `tqc_${taskId}`;

    const shortUrl = url.length > 55 ? url.slice(0, 52) + '…' : url;
    card.innerHTML = `
      <i class="fas fa-film tq-icon"></i>
      <div class="tq-body">
        <span class="tq-url" title="${this._esc(url)}">${this._esc(shortUrl)}</span>
        <div class="tq-status" id="tqs_${taskId}">准备中…</div>
        <div class="tq-bar-wrap"><div class="tq-bar" id="tqb_${taskId}" style="width:0%"></div></div>
      </div>
      <span class="tq-badge queued" id="tqbadge_${taskId}">排队中</span>
      <button class="tq-close" title="关闭" onclick="window.app._dismissTaskCard('${taskId}')">
        <i class="fas fa-xmark"></i>
      </button>
    `;
    panel.appendChild(card);
    this._taskCards[taskId] = { url, el: card, es: null, pollN: 0, progress: 0, done: false };
  }

  _updateTaskCard(taskId, status, progress, message) {
    const card = this._taskCards[taskId];
    if (!card || card.done) return;

    const statusEl = document.getElementById(`tqs_${taskId}`);
    const barEl    = document.getElementById(`tqb_${taskId}`);
    const badgeEl  = document.getElementById(`tqbadge_${taskId}`);

    if (message && statusEl) statusEl.textContent = message;

    if (progress != null && barEl) {
      const p = Math.max(card.progress, progress);
      card.progress = p;
      barEl.style.width = p + '%';
    }

    if (badgeEl) {
      if (status === 'queued') {
        badgeEl.className = 'tq-badge queued'; badgeEl.textContent = '排队中';
      } else if (status === 'processing') {
        badgeEl.className = 'tq-badge running'; badgeEl.textContent = '处理中';
      } else if (status === 'completed') {
        badgeEl.className = 'tq-badge done';   badgeEl.textContent = '已完成';
        if (barEl) { barEl.style.width = '100%'; barEl.className = 'tq-bar done'; }
        card.el.classList.add('tq-done');
        if (statusEl) statusEl.textContent = '转录完成';
      } else if (status === 'error') {
        badgeEl.className = 'tq-badge error';  badgeEl.textContent = '失败';
        if (barEl) barEl.className = 'tq-bar error';
        card.el.classList.add('tq-error');
      }
    }
  }

  _dismissTaskCard(taskId) {
    const card = this._taskCards[taskId];
    if (!card) return;
    if (card.es) { card.es.close(); card.es = null; }
    card.el.classList.add('tq-fade');
    setTimeout(() => { card.el.remove(); delete this._taskCards[taskId]; }, 400);
  }

  _scheduleRemoveTaskCard(taskId, delay = 4000) {
    setTimeout(() => this._dismissTaskCard(taskId), delay);
  }

  /* ── Resume in-progress task after page refresh ─────── */
  _restoreLastResult() {
    // If no active task is being resumed, show the last viewed result
    const active = localStorage.getItem('vt2_active_tasks');
    if (active) return; // active task takes priority
    try {
      const saved = JSON.parse(localStorage.getItem('vt2_last_result') || 'null');
      if (saved && (saved.raw_script || saved.script || saved.summary)) {
        this._showResults(saved, true);
      }
    } catch (_) {}
  }

  _removeActiveTask(taskId) {
    try {
      const arr = JSON.parse(localStorage.getItem('vt2_active_tasks') || '[]');
      const filtered = arr.filter(t => t.id !== taskId);
      if (filtered.length) {
        localStorage.setItem('vt2_active_tasks', JSON.stringify(filtered));
      } else {
        localStorage.removeItem('vt2_active_tasks');
      }
    } catch (_) {}
  }

  async _resumeActiveTask() {
    // Migrate legacy single-task key to array
    try {
      const old = JSON.parse(localStorage.getItem('vt2_active_task') || 'null');
      if (old?.id) {
        const arr = JSON.parse(localStorage.getItem('vt2_active_tasks') || '[]');
        if (!arr.find(t => t.id === old.id)) arr.push(old);
        localStorage.setItem('vt2_active_tasks', JSON.stringify(arr));
        localStorage.removeItem('vt2_active_task');
      }
    } catch (_) {}

    let savedTasks;
    try { savedTasks = JSON.parse(localStorage.getItem('vt2_active_tasks') || '[]'); } catch (_) { savedTasks = []; }
    if (!savedTasks.length) return;

    for (const saved of savedTasks) {
      if (!saved?.id) { this._removeActiveTask(saved?.id); continue; }
      try {
        const r = await fetch(`/api/task-status/${saved.id}`);
        if (!r.ok) { this._removeActiveTask(saved.id); continue; }
        const task = await r.json();
        if (task.status === 'completed') {
          this._removeActiveTask(saved.id);
          this.taskId = saved.id;
          this._hideProg();
          this._showResults({ ...task, task_id: saved.id });
        } else if (task.status === 'error') {
          this._removeActiveTask(saved.id);
        } else if (task.status === 'processing' || task.status === 'queued') {
          this.taskId = saved.id;
          this._addTaskCard(saved.id, saved.url || '');
          if (!this._progTaskId) {
            this._progTaskId = saved.id;
            this._initSP();
            this._showProg();
            this._resetSteps();
            const prog = task.progress || 0;
            this._updateProg(prog, task.message || '', true);
          }
          this._updateTaskCard(saved.id, task.status, task.progress || 0, task.message || '');
          this._connectSSEForTask(saved.id);
        } else {
          this._removeActiveTask(saved.id);
        }
      } catch (_) {
        this._removeActiveTask(saved.id);
      }
    }
  }

  /* ── i18n ──────────────────────────────────────────── */
  _applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const v = this.t(el.dataset.i18n);
      if (typeof v === 'string') el.textContent = v;
    });
    document.querySelectorAll('[data-i18n-h]').forEach(el => {
      const v = this.t(el.dataset.i18nH);
      if (typeof v === 'string') el.innerHTML = v;
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
      const v = this.t(el.dataset.i18nPh);
      if (typeof v === 'string') el.placeholder = v;
    });
    document.title = this.lang === 'zh' ? 'AI 视频转录器' : 'AI Video Transcriber';
    document.documentElement.lang = this.lang === 'zh' ? 'zh-CN' : 'en';
    const _lt = this.$('langText'); if (_lt) _lt.textContent = this.lang === 'zh' ? 'English' : '中文';
  }

  /* ── Nav ───────────────────────────────────────────── */
  _bindNav() {
    this.$('langToggle').addEventListener('click', () => {
      this.lang = this.lang === 'zh' ? 'en' : 'zh';
      this.$('langText').textContent = this.lang === 'zh' ? 'English' : '中文';
      this._applyI18n();
    });
  }

  /* ── Auth ──────────────────────────────────────────── */
  _updateAuthNav() {
    const btn  = this.$('authNavBtn');
    const text = this.$('authNavText');
    if (!btn) return;
    if (this.token && this.username) {
      text.textContent = this.username + ' · 退出';
      btn.onclick = () => {
        if (confirm('确定退出登录？')) {
          this.token = ''; this.username = '';
          localStorage.removeItem('vt2_token');
          localStorage.removeItem('vt2_username');
          this._updateAuthNav();
          this._renderHistory();
        }
      };
    } else {
      text.textContent = '登录';
      btn.onclick = () => this._openAuthModal('login');
    }
  }

  _openAuthModal(tab = 'login') {
    this._authTab = tab;
    this._setAuthTab(tab);
    this.$('authErr').textContent = ''; this.$('authErr').classList.remove('show');
    this.$('authUsername').value = ''; this.$('authPassword').value = '';
    this.$('authModal').classList.add('show');
    document.body.style.overflow = 'hidden';
    setTimeout(() => this.$('authUsername').focus(), 100);
  }

  _closeAuthModal() {
    this.$('authModal').classList.remove('show');
    document.body.style.overflow = '';
  }

  _setAuthTab(tab) {
    this._authTab = tab;
    document.querySelectorAll('.auth-tab-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.authTab === tab));
    this.$('authModalTitle').textContent = tab === 'login' ? '登录' : '注册账号';
    this.$('authSubmit').textContent = tab === 'login' ? '登录' : '注册';
    this.$('authErr').textContent = ''; this.$('authErr').classList.remove('show');
  }

  _bindAuth() {
    const overlay = this.$('authModal');
    if (!overlay) return;

    this.$('authModalClose').addEventListener('click', () => this._closeAuthModal());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this._closeAuthModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this._closeAuthModal(); });

    document.querySelectorAll('.auth-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => this._setAuthTab(btn.dataset.authTab));
    });

    this.$('authSubmit').addEventListener('click', () => this._submitAuth());
    this.$('authPassword').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._submitAuth();
    });
  }

  async _submitAuth() {
    const username = this.$('authUsername').value.trim();
    const password = this.$('authPassword').value;
    const errEl    = this.$('authErr');
    const submitEl = this.$('authSubmit');

    if (!username) { errEl.textContent = '请输入用户名'; errEl.classList.add('show'); return; }
    if (!password) { errEl.textContent = '请输入密码'; errEl.classList.add('show'); return; }

    submitEl.disabled = true;
    submitEl.textContent = '请稍候…';
    errEl.classList.remove('show');

    const endpoint = this._authTab === 'login' ? '/api/auth/login' : '/api/auth/register';
    try {
      const fd = new FormData();
      fd.append('username', username); fd.append('password', password);
      const r = await fetch(endpoint, { method: 'POST', body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'Error');
      this.token    = d.token;
      this.username = d.username;
      localStorage.setItem('vt2_token', this.token);
      localStorage.setItem('vt2_username', this.username);
      this._closeAuthModal();
      this._updateAuthNav();
      this._renderHistory();
    } catch (e) {
      errEl.textContent = e.message;
      errEl.classList.add('show');
    } finally {
      submitEl.disabled = false;
      submitEl.textContent = this._authTab === 'login' ? '登录' : '注册';
    }
  }

  /* ── Form ──────────────────────────────────────────── */
  _bindForm() {
    this.$('videoForm').addEventListener('submit', e => {
      e.preventDefault(); this._start();
    });

    this.$('videoUrl').addEventListener('paste', (e) => {
      const pasted = (e.clipboardData || window.clipboardData).getData('text');
      const urlRe = /https?:\/\/[^\s\u4e00-\u9fff\u3000-\u303f\uff01-\uff60\u2018-\u201f\u300a-\u300f\u3008-\u3009\u201c\u201d\u2018\u2019]+/;
      let match = pasted.match(urlRe);
      if (match) {
        let url = match[0].replace(/[.,;:!?)>\]'"]+$/, '');
        if (url !== pasted.trim()) {
          e.preventDefault();
          const input = this.$('videoUrl');
          input.value = url;
          input.dispatchEvent(new Event('input'));
          input.style.borderColor = 'var(--accent)';
          input.style.boxShadow   = '0 0 0 3px var(--accent-glow)';
          setTimeout(() => { input.style.borderColor = ''; input.style.boxShadow = ''; }, 1200);
        }
      }
    });
  }

  /* ── Settings ──────────────────────────────────────── */
  _bindSettings() {
    const toggle = this.$('settingsToggle');
    const body   = this.$('settingsBody');
    toggle.addEventListener('click', () => {
      const open = body.classList.toggle('open');
      toggle.classList.toggle('open', open);
    });
    this.$('fetchModelsBtn').addEventListener('click', () => this._fetchModels());
    const debounced = this._debounce(() => {
      if (this.$('modelBaseUrl').value.trim() && this.$('apiKeyInput').value.trim())
        this._fetchModels(true);
    }, 900);
    this.$('modelBaseUrl').addEventListener('input', debounced);
    this.$('apiKeyInput').addEventListener('input', debounced);
    ['modelBaseUrl','apiKeyInput','modelSelect','summaryLang'].forEach(id =>
      this.$(id).addEventListener('change', () => this._saveSettings())
    );
  }

  _saveSettings() {
    try {
      localStorage.setItem('vt2_settings', JSON.stringify({
        baseUrl: this.$('modelBaseUrl').value,
        apiKey:  this.$('apiKeyInput').value,
        model:   this.$('modelSelect').value,
        lang:    this.$('summaryLang').value,
      }));
    } catch (_) {}
  }

  _loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem('vt2_settings') || '{}');
      if (s.baseUrl) this.$('modelBaseUrl').value = s.baseUrl;
      if (s.apiKey)  this.$('apiKeyInput').value  = s.apiKey;
      if (s.lang)    this.$('summaryLang').value   = s.lang;
      this._savedModel = s.model || '';
      if (s.baseUrl || s.apiKey) {
        this.$('settingsBody').classList.add('open');
        this.$('settingsToggle').classList.add('open');
        if (s.baseUrl && s.apiKey) setTimeout(() => this._fetchModels(true), 400);
      }
    } catch (_) {}
  }

  async _fetchModels(silent = false) {
    const url = this.$('modelBaseUrl').value.trim().replace(/\/$/, '');
    const key = this.$('apiKeyInput').value.trim();
    if (!url || !key) {
      if (!silent) this._setFetchStatus('err', 'URL & Key required');
      return;
    }
    const btn  = this.$('fetchModelsBtn');
    const icon = this.$('fetchIcon');
    btn.disabled = true;
    icon.className = 'fas fa-spinner fa-spin';
    if (!silent) this._setFetchStatus('', this.t('msg_fetching'));
    try {
      const fd = new FormData();
      fd.append('base_url', url); fd.append('api_key', key);
      const r = await fetch('/api/models', { method: 'POST', body: fd });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      const models = d.data || d.models || [];
      const sel = this.$('modelSelect');
      sel.innerHTML = `<option value="">${this.t('opt_default')}</option>`;
      models.forEach(m => {
        const o = document.createElement('option');
        o.value = m.id; o.textContent = m.name || m.id;
        sel.appendChild(o);
      });
      if (this._savedModel) { sel.value = this._savedModel; this._savedModel = ''; }
      this._setFetchStatus('ok', this.t('msg_models_ok', models.length));
    } catch (e) {
      this._setFetchStatus('err', this.t('msg_models_err') + ': ' + e.message);
    } finally {
      btn.disabled = false; icon.className = 'fas fa-rotate';
    }
  }

  _setFetchStatus(cls, msg) {
    const el = this.$('fetchStatus');
    el.className = 'fetch-status' + (cls ? ' ' + cls : '');
    el.textContent = msg;
  }

  /* ── Tabs ──────────────────────────────────────────── */
  _bindTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => this._switchTab(btn.dataset.tab));
    });
  }

  _switchTab(name) {
    document.querySelectorAll('.tab-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === name)
    );
    document.querySelectorAll('.tab-pane').forEach(p =>
      p.classList.toggle('active', p.id === name + 'Tab')
    );
  }

  /* ── Copy ──────────────────────────────────────────── */
  _bindCopy() {
    const pairs = [
      ['copyRaw',    () => this.$('rawContent').textContent],
      ['copyScript', () => this.$('scriptContent').innerText],
      ['copySummary',() => this.$('summaryContent').innerText],
      ['copyTrans',  () => this.$('transContent').innerText],
    ];
    pairs.forEach(([id, getText]) => {
      this.$(id).addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        try {
          await navigator.clipboard.writeText(getText());
          const orig = btn.innerHTML;
          btn.innerHTML = `<i class="fas fa-check"></i> ${this.t('msg_copied')}`;
          btn.classList.add('copied');
          setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('copied'); }, 2000);
        } catch (_) {}
      });
    });
  }

  /* ── Download ──────────────────────────────────────── */
  _bindDownload() {
    const pairs = [
      ['dlRaw',    'raw'],
      ['dlScript', 'script'],
      ['dlSummary','summary'],
      ['dlTrans',  'translation'],
    ];
    pairs.forEach(([id, type]) => {
      this.$(id).addEventListener('click', () => this._download(type));
    });
  }

  async _download(type) {
    if (!this.taskId) { this._showErr(this.t('err_no_file')); return; }
    try {
      const r = await fetch(`/api/task-status/${this.taskId}`);
      if (!r.ok) throw new Error('status failed');
      const task = await r.json();
      let filename;
      if      (type === 'raw')         filename = task.raw_script_file || `raw_${task.safe_title||'x'}_${task.short_id||'x'}.md`;
      else if (type === 'script')      filename = task.script_path    ? task.script_path.split('/').pop()      : `transcript_${task.safe_title||'x'}_${task.short_id||'x'}.md`;
      else if (type === 'summary')     filename = task.summary_path   ? task.summary_path.split('/').pop()     : `summary_${task.safe_title||'x'}_${task.short_id||'x'}.md`;
      else if (type === 'translation') filename = task.translation_path ? task.translation_path.split('/').pop() : null;
      if (!filename) { this._showErr(this.t('err_no_file')); return; }
      const a = document.createElement('a');
      a.href = `/api/download/${encodeURIComponent(filename)}`;
      a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    } catch (e) { this._showErr(this.t('err_dl') + e.message); }
  }

  /* ── History ───────────────────────────────────────── */
  _bindHistory() {
    this.$('clearHistory').addEventListener('click', () => {
      if (confirm('清空全部历史记录？')) {
        localStorage.removeItem('vt2_history');
        this._renderHistory();
      }
    });
  }

  async _saveHistory(data) {
    try {
      let h = JSON.parse(localStorage.getItem('vt2_history') || '[]');
      h = h.filter(x => x.taskId !== data.taskId);
      h.unshift({ ...data, date: new Date().toISOString() });
      h = h.slice(0, 15);
      localStorage.setItem('vt2_history', JSON.stringify(h));
    } catch (_) {}

    if (this.token) {
      try {
        const fd = new FormData();
        Object.entries({
          task_id: data.taskId || '',
          title: data.title || '',
          url: data.url || '',
          raw_script: data.raw_script || '',
          script: data.script || '',
          summary: data.summary || '',
          translation: data.translation || '',
          detected_language: data.detected_language || '',
          summary_language: data.summary_language || '',
          safe_title: data.safe_title || '',
          short_id: data.short_id || '',
        }).forEach(([k, v]) => fd.append(k, v));
        const r = await fetch('/api/history', {
          method: 'POST', body: fd,
          headers: this._authHeaders(),
        });
        if (r.status === 401) {
          // Token expired — clear it silently
          this.token = null; this.username = null;
          localStorage.removeItem('vt2_token'); localStorage.removeItem('vt2_username');
          this._updateAuthNav();
        }
      } catch (_) {}
    }

    this._renderHistory();
  }

  async _renderHistory() {
    const sec  = this.$('historySection');
    const list = this.$('historyList');
    let h = [];

    // Always load from localStorage first for instant display
    try { h = JSON.parse(localStorage.getItem('vt2_history') || '[]').slice(0, 3); } catch (_) {}

    if (this.token) {
      try {
        const r = await fetch('/api/history?limit=3', { headers: this._authHeaders() });
        if (r.status === 401) {
          // Token expired/invalid — clear it and revert to guest mode
          this.token = null; this.username = null;
          localStorage.removeItem('vt2_token'); localStorage.removeItem('vt2_username');
          this._updateAuthNav();
          // h already set from localStorage above
        } else if (r.ok) {
          const data = await r.json();
          const serverItems = (data.items || []).map(item => ({
            taskId: item.task_id,
            title: item.title,
            date: item.date,
            raw_script: item.raw_script,
            script: item.script,
            summary: item.summary,
            translation: item.translation,
            detected_language: item.detected_language,
            summary_language: item.summary_language,
            safe_title: item.safe_title,
            short_id: item.short_id,
            url: item.url,
          }));
          if (serverItems.length) h = serverItems;
        }
      } catch (_) {}
    }

    if (!h.length) { sec.style.display = 'none'; return; }
    sec.style.display = '';

    list.innerHTML = h.map((item, i) => {
      const date = item.date ? new Date(item.date).toLocaleDateString('zh-CN') : '';
      const lang = item.detected_language || '';
      return `
        <div class="history-card" data-idx="${i}">
          <div class="hc-body">
            <div class="hc-title">${this._esc(item.title || '无标题')}</div>
            <div class="hc-meta">${date}${lang ? ' · ' + lang : ''}</div>
          </div>
          <i class="fas fa-chevron-right hc-arrow"></i>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.history-card').forEach(card => {
      card.addEventListener('click', () => {
        const item = h[+card.dataset.idx];
        if (item) this._showResults({ ...item, video_title: item.title });
      });
    });
  }

  _esc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── Duplicate URL check ───────────────────────────── */
  async _checkDuplicateUrl(url) {
    if (this.token) {
      try {
        const r = await fetch('/api/history/by-url?url=' + encodeURIComponent(url), { headers: this._authHeaders() });
        if (r.ok) { const d = await r.json(); if (d.found) return d.item; }
      } catch (_) {}
    } else {
      try {
        const h = JSON.parse(localStorage.getItem('vt2_history') || '[]');
        const found = h.find(x => x.url === url);
        if (found) return found;
      } catch (_) {}
    }
    return null;
  }

  _showDupNotice(item) {
    let el = this.$('dupNotice');
    if (!el) {
      el = document.createElement('div');
      el.id = 'dupNotice';
      el.style.cssText = 'margin-top:10px;padding:12px 16px;background:var(--card-bg,#1e1e2e);border:1px solid var(--accent,#7c3aed);border-radius:10px;font-size:13px;color:var(--text-secondary,#aaa);display:flex;align-items:center;gap:10px;flex-wrap:wrap;';
      this.$('videoForm').appendChild(el);
    }
    const title = this._esc(item.title || item.video_title || '该视频');
    el.innerHTML = `
      <i class="fas fa-circle-info" style="color:var(--accent,#7c3aed);flex-shrink:0;"></i>
      <span style="flex:1"><b>${title}</b> 已有转录记录，无需重复转录。</span>
      <button id="dupViewBtn" style="padding:5px 12px;background:var(--accent,#7c3aed);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;white-space:nowrap;">查看已有结果</button>
      <button id="dupIgnoreBtn" style="padding:5px 12px;background:transparent;color:var(--text-secondary,#aaa);border:1px solid var(--border,#333);border-radius:6px;cursor:pointer;font-size:12px;white-space:nowrap;">忽略，重新转录</button>
    `;
    el.style.display = 'flex';
    this._dupItem = item;
    this.$('dupViewBtn').onclick   = () => { this._hideDupNotice(); this._showResults({ ...item, video_title: item.title || item.video_title }); };
    this.$('dupIgnoreBtn').onclick = () => { this._hideDupNotice(); this._start(true); };
  }

  _hideDupNotice() {
    const el = this.$('dupNotice');
    if (el) el.style.display = 'none';
    this._dupItem = null;
  }

  /* ── Start transcription ───────────────────────────── */
  async _start(skipDupCheck = false) {
    const btn = this.$('submitBtn');
    if (btn.disabled) return;
    const url = this.$('videoUrl').value.trim();
    if (!url) { this._showErr(this.t('err_url')); return; }

    if (!skipDupCheck) {
      const existing = await this._checkDuplicateUrl(url);
      if (existing) { this._showDupNotice(existing); return; }
    }
    this._hideDupNotice();
    try { localStorage.removeItem('vt2_last_result'); } catch (_) {}

    // Disable only during the HTTP POST
    btn.disabled = true;
    btn.innerHTML = `<span class="spin"></span> 提交中…`;
    this._hideErr();

    try {
      const fd = new FormData();
      fd.append('url', url);
      fd.append('summary_language', this.$('summaryLang').value);
      const key  = this.$('apiKeyInput').value.trim();
      const burl = this.$('modelBaseUrl').value.trim().replace(/\/$/, '');
      const mid  = this.$('modelSelect').value;
      if (key)  fd.append('api_key',        key);
      if (burl) fd.append('model_base_url', burl);
      if (mid)  fd.append('model_id',       mid);

      const r = await fetch('/api/process-video', { method: 'POST', body: fd });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.detail || `HTTP ${r.status}`);
      }
      const d = await r.json();
      const taskId = d.task_id;

      // Re-enable form immediately — user can queue more videos
      btn.disabled = false;
      btn.innerHTML = `<i class="fas fa-arrow-right"></i> <span>${this.t('btn_start')}</span>`;
      this.$('videoUrl').value = '';

      this.taskId = taskId; // keep last task for download compat

      // Add task card to queue panel
      this._addTaskCard(taskId, url);

      // Only take over the main progress panel if nothing is currently processing there
      if (!this._progTaskId) {
        this._switchProgTo(taskId);
      }

      // Persist for resume after refresh
      try {
        const _at = JSON.parse(localStorage.getItem('vt2_active_tasks') || '[]');
        if (!_at.find(t => t.id === taskId)) _at.push({ id: taskId, url });
        localStorage.setItem('vt2_active_tasks', JSON.stringify(_at));
      } catch (_) {}

      // Connect SSE for this task
      this._connectSSEForTask(taskId);
      this._saveSettings();

    } catch (err) {
      this._showErr(this.t('err_prefix') + err.message);
      btn.disabled = false;
      btn.innerHTML = `<i class="fas fa-arrow-right"></i> <span>${this.t('btn_start')}</span>`;
    }
  }

  /* ── Switch main progress panel to a specific task ─── */
  _switchProgTo(taskId) {
    this._progTaskId = taskId;
    this._initSP();
    this._showProg();
    this._resetSteps();
    this._updateProg(5, this.t('msg_preparing'), true);
  }

  /* ── SSE per task ──────────────────────────────────── */
  _connectSSEForTask(taskId) {
    const es = new EventSource(`/api/task-stream/${taskId}`);
    const card = this._taskCards[taskId];
    if (card) card.es = es;
    const isProgTask = () => this._progTaskId === taskId;

    es.onmessage = (ev) => {
      try {
        const task = JSON.parse(ev.data);
        if (task.type === 'heartbeat') return;

        if (task.status === 'queued') {
          const pos = task.queue_position || 1;
          const qmsg = pos > 1 ? `排队中，第 ${pos} 位` : '即将开始处理…';
          this._updateTaskCard(taskId, 'queued', 0, qmsg);
          if (isProgTask()) this._renderProg(0, qmsg);
          return;
        }

        // Queued task just became active — grab the panel if it's free
        if (task.status === 'processing' && !this._progTaskId) {
          this._switchProgTo(taskId);
        }

        this._updateTaskCard(taskId, task.status, task.progress, task.message);
        if (isProgTask()) this._updateProg(task.progress, task.message, true);

        if (task.status === 'completed') {
          es.close();
          if (card) card.es = null;
          this._stopSP();
          if (isProgTask()) {
            this._progTaskId = null;
            this._hideProg();
          }
          this._removeActiveTask(taskId);
          this._showResults({ ...task, task_id: taskId });
          this._scheduleRemoveTaskCard(taskId, 4000);
        } else if (task.status === 'error') {
          es.close();
          if (card) card.es = null;
          this._stopSP();
          if (isProgTask()) {
            this._progTaskId = null;
            this._hideProg();
            this._showErr(task.error || this.t('err_prefix'));
          }
          this._removeActiveTask(taskId);
          this._scheduleRemoveTaskCard(taskId, 6000);
        }
      } catch (_) {}
    };

    es.onerror = () => {
      es.close();
      if (card) card.es = null;
      const c = this._taskCards[taskId];
      if (c) c.pollN = 0;
      this._pollTask(taskId);
    };
  }

  async _pollTask(taskId) {
    const card = this._taskCards[taskId];
    if (!card || card.done) return;
    const isProgTask = () => this._progTaskId === taskId;

    try {
      const r = await fetch(`/api/task-status/${taskId}`);
      if (r.ok) {
        const task = await r.json();
        if (task?.status === 'completed') {
          this._stopSP();
          if (isProgTask()) { this._progTaskId = null; this._hideProg(); }
          this._removeActiveTask(taskId);
          this._showResults({ ...task, task_id: taskId });
          this._scheduleRemoveTaskCard(taskId, 4000);
          return;
        } else if (task?.status === 'error') {
          this._stopSP();
          if (isProgTask()) {
            this._progTaskId = null;
            this._hideProg();
            this._showErr(task.error || this.t('err_prefix'));
          }
          this._updateTaskCard(taskId, 'error', null, task.error || '失败');
          this._removeActiveTask(taskId);
          this._scheduleRemoveTaskCard(taskId, 6000);
          return;
        } else if (task?.status === 'queued') {
          const pos = task.queue_position || 1;
          const qmsg = pos > 1 ? `排队中，第 ${pos} 位` : '即将开始处理…';
          this._updateTaskCard(taskId, 'queued', 0, qmsg);
          if (isProgTask()) this._renderProg(0, qmsg);
          setTimeout(() => this._pollTask(taskId), 3000); return;
        } else if (task?.status === 'processing') {
          if (!this._progTaskId) this._switchProgTo(taskId);
          this._updateTaskCard(taskId, 'processing', task.progress, task.message);
          if (isProgTask() && task.progress) this._updateProg(task.progress, task.message, true);
          setTimeout(() => this._pollTask(taskId), 3000); return;
        }
      }
    } catch (_) {}

    const n = (card.pollN || 0) + 1;
    if (card) card.pollN = n;
    if (n < 12) { setTimeout(() => this._pollTask(taskId), 5000); }
    else if (isProgTask()) { this._showErr(this.t('err_prefix') + 'connection lost'); }
  }

  /* ── Progress ──────────────────────────────────────── */
  _updateProg(pct, msg, fromServer = false) {
    if (fromServer) {
      this._stopSP();
      const safeP = Math.max(this.sp?.cur || 0, pct || 0);
      this.sp.cur = safeP;
      this._renderProg(safeP, msg);
      this._updateStage(safeP, msg);
      if (pct > this.sp.target) this.sp.target = Math.min(pct + 8, 99);
      this._startSP();
    } else {
      this._renderProg(pct, msg);
    }
  }

  _updateStage(pct, msg) {
    const m = (msg || '').toLowerCase();
    if (m.includes('获取成功') || m.includes('subtitle found') || m.includes('字幕获取')) {
      this.sp.stage = 'subtitle'; this.sp.target = 55;
      this._setModeBadge('subtitle');
      this._setStep(1);
    } else if (m.includes('未找到字幕') || m.includes('no subtitle') || m.includes('下载')) {
      this.sp.stage = 'dl'; this.sp.target = 55;
      this._setModeBadge('funasr');
      this._setStep(1);
    } else if (m.includes('检测') || m.includes('detect')) {
      this.sp.stage = 'fetch'; this.sp.target = 30;
      this._setStep(0);
    } else if (m.includes('转录') || m.includes('transcrib') || m.includes('funasr')) {
      this.sp.stage = 'asr'; this.sp.target = 75;
      this._setStep(2);
    } else if (m.includes('优化') || m.includes('optimiz') || m.includes('摘要') || m.includes('summary')) {
      this.sp.stage = 'ai'; this.sp.target = 90;
      this._setStep(3);
    } else if (m.includes('完成') || m.includes('complet')) {
      this.sp.stage = 'done'; this.sp.target = 100;
      this._setStep(4);
    }
    if (pct >= this.sp.target) this.sp.target = Math.min(pct + 8, 99);
  }

  _setStep(activeIdx) {
    const steps = ['step-fetch','step-dl','step-asr','step-ai','step-done'];
    steps.forEach((id, i) => {
      const el = this.$(id);
      if (!el) return;
      el.classList.toggle('done',   i < activeIdx);
      el.classList.toggle('active', i === activeIdx);
    });
  }

  _resetSteps() {
    ['step-fetch','step-dl','step-asr','step-ai','step-done'].forEach(id => {
      const el = this.$(id);
      if (el) { el.classList.remove('done','active'); }
    });
  }

  _setModeBadge(mode) {
    const el = this.$('modeBadge');
    if (!el) return;
    if (mode === 'subtitle') {
      el.textContent = this.t('mode_subtitle');
      el.className = 'mode-badge subtitle'; el.style.display = 'inline-block';
      this.$('progFill').classList.add('subtitle-mode');
    } else if (mode === 'funasr') {
      el.textContent = this.t('mode_funasr');
      el.className = 'mode-badge funasr'; el.style.display = 'inline-block';
      this.$('progFill').classList.remove('subtitle-mode');
    }
  }

  _initSP() {
    this.sp = { on: false, cur: 0, target: 15, interval: null, stage: 'prep' };
  }
  _startSP() {
    if (this.sp.interval) clearInterval(this.sp.interval);
    this.sp.on = true;
    this.sp.interval = setInterval(() => this._tickSP(), 500);
  }
  _stopSP() {
    if (this.sp.interval) { clearInterval(this.sp.interval); this.sp.interval = null; }
    this.sp.on = false;
  }
  _tickSP() {
    if (!this.sp.on || this.sp.cur >= this.sp.target) return;
    const speeds = { fetch:.4, subtitle:.5, dl:.18, asr:.14, ai:.22, done:.5 };
    let inc = speeds[this.sp.stage] || .2;
    const rem = this.sp.target - this.sp.cur;
    if (rem < 5) inc *= .25;
    const next = Math.min(this.sp.cur + inc, this.sp.target);
    if (next > this.sp.cur) {
      this.sp.cur = next;
      this._renderProg(next, this._stageMsg());
    }
  }
  _stageMsg() {
    const map = {
      fetch: this.t('msg_detecting'), subtitle: this.t('msg_subtitle_found'),
      dl: this.t('msg_dl_audio'), asr: this.t('msg_asr'),
      ai: this.t('msg_optimize'), done: this.t('msg_done'),
    };
    return map[this.sp.stage] || this.t('msg_processing');
  }

  _renderProg(pct, msg) {
    const p = Math.round(pct * 10) / 10;
    this.$('progPct').textContent = `${p}%`;
    this.$('progFill').style.width = `${p}%`;

    const m = (msg || '').toLowerCase();
    let label = msg;
    if      (m.includes('获取成功') || m.includes('subtitle found')) label = this.t('msg_subtitle_found');
    else if (m.includes('未找到字幕') || m.includes('no subtitle'))   label = this.t('msg_no_subtitle');
    else if (m.includes('检测') && m.includes('字幕'))                label = this.t('msg_detecting');
    else if (m.includes('下载') || m.includes('download'))           label = this.t('msg_dl_audio');
    else if (m.includes('解析') || m.includes('pars'))               label = this.t('msg_parse');
    else if (m.includes('转录') || m.includes('transcrib'))          label = this.t('msg_asr');
    else if (m.includes('优化') || m.includes('optimiz'))            label = this.t('msg_optimize');
    else if (m.includes('摘要') || m.includes('summary'))            label = this.t('msg_summary');
    else if (m.includes('完成') || m.includes('complet'))            label = this.t('msg_done');
    else if (m.includes('准备') || m.includes('prepar'))             label = this.t('msg_preparing');

    this.$('progMsg').textContent = label;
  }

  _showProg() {
    this.$('emptyState').style.display = 'none';
    this.$('resPanel').classList.remove('show');
    this.$('progPanel').classList.add('show');
    const mb = this.$('modeBadge');
    if (mb) { mb.style.display = 'none'; mb.className = 'mode-badge'; }
    this.$('progFill').classList.remove('subtitle-mode');
  }
  _hideProg() {
    this.$('progPanel').classList.remove('show');
    if (!this.$('resPanel').classList.contains('show')) {
      const es = this.$('emptyState');
      if (es) es.style.display = '';
    }
  }

  /* ── Results ───────────────────────────────────────── */
  _showResults(task, fromCache = false) {
    this.taskData = task;
    const raw     = task.raw_script || '';
    const script  = task.script    || '';
    const summary = task.summary   || '';
    const trans   = task.translation || '';
    const title   = task.video_title || task.title || '';

    this.$('resTitle').textContent = title;

    const meta = this.$('resMeta');
    meta.innerHTML = '';
    if (task.detected_language) {
      const langNames = { zh:'中文', en:'English', ja:'日本語', ko:'한국어', es:'Español', fr:'Français', de:'Deutsch' };
      const b = document.createElement('span');
      b.className = 'res-tag accent';
      b.innerHTML = `<i class="fas fa-language"></i> ${langNames[task.detected_language] || this._esc(task.detected_language)}`;
      meta.appendChild(b);
    }
    const charCount = raw.length || script.length;
    if (charCount > 0) {
      const b = document.createElement('span');
      b.className = 'res-tag';
      b.innerHTML = `<i class="fas fa-file-lines" style="font-size:10px;"></i> ${this.t('chars', charCount)}`;
      meta.appendChild(b);
    }

    if (!raw && task.raw_script_file) {
      this._fetchRawFile(task.raw_script_file);
    }
    this.$('rawContent').textContent = raw || (task.raw_script_file ? '正在加载原文字稿…' : '（原文字稿不可用，请重新转录以获取）');
    this.$('rawStat').textContent = raw ? this.t('chars', raw.length) : '';

    this.$('scriptContent').innerHTML = script ? marked.parse(script) : '';
    this.$('scriptStat').textContent = script ? this.t('chars', script.length) : '';

    this.$('summaryContent').innerHTML = summary ? marked.parse(summary) : '';
    this.$('summaryStat').textContent = summary ? this.t('chars', summary.length) : '';

    const showTrans = trans && task.detected_language && task.summary_language
      && task.detected_language !== task.summary_language;
    if (showTrans) {
      this.$('transContent').innerHTML = marked.parse(trans);
      this.$('transStat').textContent = this.t('chars', trans.length);
      this.$('transTabBtn').style.display = 'inline-flex';
    } else {
      this.$('transTabBtn').style.display = 'none';
    }

    this.$('resPanel').classList.add('show');
    this._switchTab(raw ? 'raw' : 'summary');
    this.$('resPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (!fromCache) {
      try {
        localStorage.setItem('vt2_last_result', JSON.stringify({
          ...task, video_title: task.video_title || task.title || title, title,
        }));
      } catch (_) {}
      this._saveHistory({
        taskId: task.taskId || task.task_id || this.taskId, title,
        url: task.url || '',
        raw_script: raw, script, summary, translation: trans,
        detected_language: task.detected_language,
        summary_language: task.summary_language,
        script_path: task.script_path, summary_path: task.summary_path,
        raw_script_file: task.raw_script_file,
        translation_path: task.translation_path,
        safe_title: task.safe_title, short_id: task.short_id,
      });
    }
  }

  /* ── Fetch raw file from server ───────────────────── */
  async _fetchRawFile(filename) {
    try {
      const r = await fetch(`/api/download/${encodeURIComponent(filename)}`);
      if (!r.ok) throw new Error('not found');
      const text = await r.text();
      const clean = text.replace(/\n\nsource: https?:\/\/[^\n]+\n?$/, '').trim();
      const el = this.$('rawContent');
      el.textContent = clean || '（原文字稿为空）';
      this.$('rawStat').textContent = clean ? this.t('chars', clean.length) : '';
    } catch (_) {
      const el = this.$('rawContent');
      if (el.textContent.includes('正在加载')) {
        el.textContent = '（原文字稿文件不存在，请重新转录）';
      }
    }
  }

  /* ── UI helpers ────────────────────────────────────── */
  _showErr(msg) {
    this.$('errMsg').textContent = msg;
    this.$('errBanner').classList.add('show');
    setTimeout(() => this._hideErr(), 7000);
  }
  _hideErr() { this.$('errBanner').classList.remove('show'); }

  _debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }
}

document.addEventListener('DOMContentLoaded', () => { window.app = new App(); });
window.addEventListener('beforeunload', () => {
  if (window.app) {
    Object.values(window.app._taskCards || {}).forEach(c => { if (c.es) c.es.close(); });
  }
});
