/* ─────────────────────────────────────────────────────
   AI Video Transcriber · app.js  v2
   ───────────────────────────────────────────────────── */

class App {
  constructor() {
    this.taskId   = null;
    this.es       = null;
    this.lang     = 'zh';
    this.taskData = null;
    this._pollN   = 0;

    this.sp = { on: false, cur: 0, target: 15, interval: null, stage: 'prep' };

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

  t(k, ...a) {
    const v = (this.i18n[this.lang] || this.i18n.zh)[k] || this.i18n.zh[k] || k;
    return typeof v === 'function' ? v(...a) : v;
  }

  /* ── Init ──────────────────────────────────────────── */
  _init() {
    this.$ = (id) => document.getElementById(id);
    this._applyI18n();
    this._bindNav();
    this._bindForm();
    this._bindSettings();
    this._bindTabs();
    this._bindCopy();
    this._bindDownload();
    this._bindHistory();
    this._loadSettings();
    this._renderHistory();
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
  }

  /* ── Nav ───────────────────────────────────────────── */
  _bindNav() {
    this.$('langToggle').addEventListener('click', () => {
      this.lang = this.lang === 'zh' ? 'en' : 'zh';
      this.$('langText').textContent = this.lang === 'zh' ? 'English' : '中文';
      this._applyI18n();
    });
  }

  /* ── Form ──────────────────────────────────────────── */
  _bindForm() {
    this.$('videoForm').addEventListener('submit', e => {
      e.preventDefault(); this._start();
    });

    // Auto-extract URL from pasted text — handles URLs embedded anywhere in text,
    // including directly adjacent to Chinese/Japanese/Korean characters with no spaces.
    this.$('videoUrl').addEventListener('paste', (e) => {
      const pasted = (e.clipboardData || window.clipboardData).getData('text');
      // Stop chars: whitespace | CJK unified ideographs | CJK/fullwidth punctuation | common punctuation
      const urlRe = /https?:\/\/[^\s\u4e00-\u9fff\u3000-\u303f\uff01-\uff60\u2018-\u201f\u300a-\u300f\u3008-\u3009\u201c\u201d\u2018\u2019]+/;
      let match = pasted.match(urlRe);
      if (match) {
        // Strip any trailing ASCII punctuation that leaked in (e.g. trailing . , ! ? ) ] >)
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

  _saveHistory(data) {
    try {
      let h = JSON.parse(localStorage.getItem('vt2_history') || '[]');
      h = h.filter(x => x.taskId !== data.taskId);
      h.unshift({ ...data, date: new Date().toISOString() });
      h = h.slice(0, 15);
      localStorage.setItem('vt2_history', JSON.stringify(h));
    } catch (_) {}
    this._renderHistory();
  }

  _renderHistory() {
    try {
      const h = JSON.parse(localStorage.getItem('vt2_history') || '[]');
      const sec  = this.$('historySection');
      const list = this.$('historyList');
      if (!h.length) { sec.style.display = 'none'; return; }
      sec.style.display = '';
      list.innerHTML = h.map((item, i) => `
        <div class="history-card" data-idx="${i}">
          <div class="history-card-title">${this._esc(item.title || 'Untitled')}</div>
          <div class="history-card-meta">${new Date(item.date).toLocaleDateString()}</div>
        </div>
      `).join('');
      list.querySelectorAll('.history-card').forEach(card => {
        card.addEventListener('click', () => {
          const item = h[+card.dataset.idx];
          if (item) this._showResults(item);
        });
      });
    } catch (_) {}
  }

  _esc(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── Start transcription ───────────────────────────── */
  async _start() {
    if (this.$('submitBtn').disabled) return;
    const url = this.$('videoUrl').value.trim();
    if (!url) { this._showErr(this.t('err_url')); return; }

    this._setLoading(true);
    this._hideErr();
    this._showProg();
    this._resetSteps();

    try {
      const fd = new FormData();
      fd.append('url', url);
      fd.append('summary_language', this.$('summaryLang').value);
      const key = this.$('apiKeyInput').value.trim();
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
      this.taskId = d.task_id;
      this._initSP();
      this._updateProg(5, this.t('msg_preparing'), true);
      this._connectSSE();
      this._saveSettings();
    } catch (err) {
      this._showErr(this.t('err_prefix') + err.message);
      this._setLoading(false); this._hideProg();
    }
  }

  /* ── SSE ───────────────────────────────────────────── */
  _connectSSE() {
    if (!this.taskId) return;
    this.es = new EventSource(`/api/task-stream/${this.taskId}`);
    this.es.onmessage = (ev) => {
      try {
        const task = JSON.parse(ev.data);
        if (task.type === 'heartbeat') return;
        this._updateProg(task.progress, task.message, true);
        if (task.status === 'completed') {
          this._stopSP(); this._stopSSE(); this._setLoading(false); this._hideProg();
          this._showResults(task);
        } else if (task.status === 'error') {
          this._stopSP(); this._stopSSE(); this._setLoading(false); this._hideProg();
          this._showErr(task.error || this.t('err_prefix'));
        }
      } catch (_) {}
    };
    this.es.onerror = () => {
      this._stopSSE();
      this._pollN = 0;
      this._poll();
    };
  }

  async _poll() {
    try {
      if (!this.taskId) return;
      const r = await fetch(`/api/task-status/${this.taskId}`);
      if (r.ok) {
        const task = await r.json();
        if (task?.status === 'completed') {
          this._stopSP(); this._setLoading(false); this._hideProg();
          this._showResults(task); return;
        } else if (task?.status === 'error') {
          this._stopSP(); this._setLoading(false); this._hideProg();
          this._showErr(task.error || this.t('err_prefix')); return;
        } else if (task?.status === 'processing') {
          if (task.progress) this._updateProg(task.progress, task.message, true);
          setTimeout(() => this._poll(), 3000); return;
        }
      }
    } catch (_) {}
    if (++this._pollN < 10) { setTimeout(() => this._poll(), 5000); }
    else { this._showErr(this.t('err_prefix') + 'connection lost'); this._setLoading(false); }
  }

  _stopSSE() {
    if (this.es) { this.es.close(); this.es = null; }
  }

  /* ── Progress ──────────────────────────────────────── */
  _updateProg(pct, msg, fromServer = false) {
    if (fromServer) {
      this._stopSP();
      this.sp.cur = pct;
      this._renderProg(pct, msg);
      this._updateStage(pct, msg);
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
  _hideProg() { this.$('progPanel').classList.remove('show'); }

  /* ── Results ───────────────────────────────────────── */
  _showResults(task) {
    this.taskData = task;
    const raw     = task.raw_script || '';
    const script  = task.script    || '';
    const summary = task.summary   || '';
    const trans   = task.translation || '';
    const title   = task.video_title || '';

    // Title
    this.$('resTitle').textContent = title;

    // Meta badges
    const meta = this.$('resMeta');
    meta.innerHTML = '';
    if (task.detected_language) {
      const langNames = { zh:'中文', en:'English', ja:'日本語', ko:'한국어', es:'Español', fr:'Français', de:'Deutsch' };
      const b = document.createElement('span');
      b.className = 'res-badge lang';
      b.innerHTML = `<i class="fas fa-language" style="font-size:10px;"></i> ${langNames[task.detected_language] || task.detected_language}`;
      meta.appendChild(b);
    }
    const charCount = raw.length || script.length;
    if (charCount > 0) {
      const b = document.createElement('span');
      b.className = 'res-badge';
      b.innerHTML = `<i class="fas fa-file-lines" style="font-size:10px;"></i> ${this.t('chars', charCount)}`;
      meta.appendChild(b);
    }

    // Raw — if missing, try fetching from the server file
    if (!raw && task.raw_script_file) {
      this._fetchRawFile(task.raw_script_file);
    }
    this.$('rawContent').textContent = raw || (task.raw_script_file ? '正在加载原文字稿…' : '（原文字稿不可用，请重新转录以获取）');
    this.$('rawStat').textContent = raw ? this.t('chars', raw.length) : '';

    // Script
    this.$('scriptContent').innerHTML = script ? marked.parse(script) : '';
    this.$('scriptStat').textContent = script ? this.t('chars', script.length) : '';

    // Summary
    this.$('summaryContent').innerHTML = summary ? marked.parse(summary) : '';
    this.$('summaryStat').textContent = summary ? this.t('chars', summary.length) : '';

    // Translation
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

    // Save to history
    this._saveHistory({
      taskId: this.taskId, title,
      raw_script: raw, script, summary, translation: trans,
      detected_language: task.detected_language,
      summary_language: task.summary_language,
      script_path: task.script_path, summary_path: task.summary_path,
      raw_script_file: task.raw_script_file,
      translation_path: task.translation_path,
      safe_title: task.safe_title, short_id: task.short_id,
    });
  }

  /* ── Fetch raw file from server ───────────────────── */
  async _fetchRawFile(filename) {
    try {
      const r = await fetch(`/api/download/${encodeURIComponent(filename)}`);
      if (!r.ok) throw new Error('not found');
      const text = await r.text();
      // Strip the trailing "source: ..." line that was appended when saving
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
  _setLoading(on) {
    const btn = this.$('submitBtn');
    btn.disabled = on;
    btn.innerHTML = on
      ? `<span class="spin"></span> ${this.t('msg_processing')}`
      : `<i class="fas fa-search"></i> <span>${this.t('btn_start')}</span>`;
  }

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
window.addEventListener('beforeunload', () => { window.app?._stopSSE?.(); });
