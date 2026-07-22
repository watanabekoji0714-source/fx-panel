// fx-panel 共通ユーティリティ（risk_panel.html / analysis_panel.html / character_panel.html で共有）
// プロジェクト管理・シート読み込みまわりの重複実装をここに集約している。
// 日付パース（parseDate / parseDateInfo）はファイルごとに挙動が微妙に異なるため、
// 意図的にここには含めず各ファイル側に残している。

// ================= プロジェクト管理 =================
const PROJECTS_KEY = 'tradingProjects';
const ACTIVE_PROJECT_KEY = 'tradingActiveProjectId';

function loadProjects() {
  try { return JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]'); } catch (e) { return []; }
}
function saveProjects(list) { localStorage.setItem(PROJECTS_KEY, JSON.stringify(list)); }
function getActiveProjectId() { return localStorage.getItem(ACTIVE_PROJECT_KEY) || ''; }
function setActiveProjectId(id) { localStorage.setItem(ACTIVE_PROJECT_KEY, id); }
function newProjectId() { return 'p_' + Date.now() + '_' + Math.floor(Math.random() * 1000); }
function getProjectById(id) { return loadProjects().find(p => p.id === id) || null; }

// 旧バージョン（プロジェクト機能追加前）の設定をFundoraプロジェクトとして移行し、
// 他口座の空プロジェクトも合わせて用意する
function migrateLegacyIfNeeded() {
  let projects = loadProjects();
  if (projects.length) return projects;

  // GitHub Pages等の新しいオリジンで開いた初回は旧設定が存在しないため、
  // 動作確認済みのFundoraシートURLをデフォルトとして使う（プロジェクト管理画面からいつでも変更可）
  const FUNDORA_DEFAULT_URL = 'https://docs.google.com/spreadsheets/d/1dqL306EB8rI-RUZj6xWIQnkFRlS8_9syV5G_PMyG_h8/edit?gid=980747558#gid=980747558';
  const FUNDORA_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSefmLDGLfYRskTeB6rA_piFhgitZMQMWjlvVVWqObdLI3G_-Q/viewform?usp=header';
  const legacyUrl = localStorage.getItem('riskPanelSheetUrl') || localStorage.getItem('riskPanelCsvUrl') || FUNDORA_DEFAULT_URL;
  const legacySettings = JSON.parse(localStorage.getItem('riskPanelSettings') || '{}');

  const toNum = (v, def) => { const n = Number(String(v || '').replace(/,/g, '')); return isNaN(n) || !n ? def : n; };

  projects = [
    {
      id: newProjectId(), name: 'Fundora マスタープラン', sheetUrl: legacyUrl, formUrl: FUNDORA_FORM_URL,
      initialCapital: toNum(legacySettings.initialCapital, 60000000),
      maxDD: toNum(legacySettings.maxDD, 6000000),
      dailyLimitPct: toNum(legacySettings.dailyLimitPct, 5),
      targetPct: toNum(legacySettings.step1TargetPct, 8),
      tzOffsetHours: 0,
    },
    { id: newProjectId(), name: 'Fintokei トレード大会', sheetUrl: '', formUrl: '', initialCapital: 0, maxDD: 0, dailyLimitPct: 5, targetPct: 8, tzOffsetHours: 0 },
    { id: newProjectId(), name: 'Fintokei クオーツプラン', sheetUrl: '', formUrl: '', initialCapital: 1000000, maxDD: 100000, dailyLimitPct: 5, targetPct: 8, tzOffsetHours: 0 },
    { id: newProjectId(), name: 'HFM ハイレバ', sheetUrl: '', formUrl: '', initialCapital: 0, maxDD: 0, dailyLimitPct: 10, targetPct: 0, tzOffsetHours: 0 },
  ];
  saveProjects(projects);
  setActiveProjectId(projects[0].id);
  return projects;
}

function refreshProjectSelect() {
  const projects = loadProjects();
  const sel = document.getElementById('projectSelect');
  const active = getActiveProjectId();
  sel.innerHTML = projects.map(p => `<option value="${p.id}">${escapeHtml(p.name)}${p.sheetUrl ? '' : '（未設定）'}</option>`).join('');
  if (projects.find(p => p.id === active)) sel.value = active;
  else if (projects.length) { sel.value = projects[0].id; setActiveProjectId(projects[0].id); }
  document.getElementById('emptyBanner').style.display = projects.length ? 'none' : 'block';
}

function refreshProjectList() {
  const projects = loadProjects();
  const active = getActiveProjectId();
  const listEl = document.getElementById('projectList');
  listEl.innerHTML = projects.map(p => `
    <div class="proj-list-item">
      <span class="name">${p.id === active ? '✅ ' : ''}${escapeHtml(p.name)}${p.sheetUrl ? '' : '（URL未設定）'}</span>
      <span class="actions">
        <button class="secondary" data-action="select" data-id="${p.id}">選択</button>
        <button class="secondary" data-action="edit" data-id="${p.id}">編集</button>
      </span>
    </div>`).join('');
  listEl.querySelectorAll('button[data-action="select"]').forEach(btn => {
    btn.addEventListener('click', () => { setActiveProjectId(btn.dataset.id); refreshProjectSelect(); refreshProjectList(); loadData(); });
  });
  listEl.querySelectorAll('button[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => loadProjectIntoForm(btn.dataset.id));
  });
}

// ================= 汎用ユーティリティ =================
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

function toNumber(v) {
  if (v == null) return NaN;
  const cleaned = String(v).replace(/[¥,%\s]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? NaN : n;
}

function parseSheetUrl(input) {
  const idMatch = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const gidMatch = input.match(/[?#&]gid=(\d+)/);
  if (!idMatch) return null;
  return { id: idMatch[1], gid: gidMatch ? gidMatch[1] : '0' };
}

function loadViaJSONP(sheetId, gid) {
  return new Promise((resolve, reject) => {
    const cbName = 'gvizCallback_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
    let done = false;
    const script = document.createElement('script');
    function cleanup() { delete window[cbName]; if (script.parentNode) script.parentNode.removeChild(script); clearTimeout(timer); }
    window[cbName] = function (response) {
      if (done) return; done = true; cleanup();
      try {
        if (!response || !response.table || !response.table.rows) { reject(new Error('シートのデータ形式を読み取れませんでした')); return; }
        const rows = response.table.rows.map(r => (r.c || []).map(cell => {
          if (!cell) return '';
          if (cell.f !== undefined && cell.f !== null) return cell.f;
          if (cell.v !== undefined && cell.v !== null) return cell.v;
          return '';
        }));
        resolve(rows);
      } catch (e) { reject(e); }
    };
    const timer = setTimeout(() => { if (done) return; done = true; cleanup(); reject(new Error('タイムアウトしました（共有設定を確認してください）')); }, 12000);
    script.onerror = function () { if (done) return; done = true; cleanup(); reject(new Error('スクリプトの読み込みに失敗しました')); };
    script.src = 'https://docs.google.com/spreadsheets/d/' + sheetId + '/gviz/tq?gid=' + gid + '&tqx=responseHandler:' + cbName;
    document.head.appendChild(script);
  });
}

// ================= フリックでタブ切り替え（親のindex.htmlに通知） =================
(function () {
  let startX = 0, startY = 0, tracking = false;
  const THRESHOLD = 60;
  document.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    tracking = true;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const touch = e.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if (Math.abs(dx) > THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.5) {
      try {
        window.parent.postMessage({ source: 'fxpanel', type: 'swipe', direction: dx < 0 ? 'left' : 'right' }, window.location.origin);
      } catch (e) {}
    }
  }, { passive: true });
})();
