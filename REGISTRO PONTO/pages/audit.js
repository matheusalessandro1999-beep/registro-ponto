// ════════════════════════════════════════════════════════
// audit.js — Lógica da página de Registros de Auditoria
// ════════════════════════════════════════════════════════

let currentUser = null;
let tipoFiltro  = '';
let _logsCache  = {};
let _overlay    = null;

const LOG_KEY = 'rh_audit_log';

const USER_COLORS = [
  ['#4f8ef7','#a78bfa'], ['#34d399','#22d3ee'], ['#f87171','#fb923c'],
  ['#fbbf24','#34d399'], ['#a78bfa','#f472b6'], ['#22d3ee','#4f8ef7'],
];
function userColorIdx(id) {
  let h = 0;
  for (let i=0; i<id.length; i++) h = (h*31 + id.charCodeAt(i)) & 0xffffffff;
  return Math.abs(h) % USER_COLORS.length;
}

document.addEventListener('DOMContentLoaded', async () => {
  currentUser = await requireSession();
  if (!currentUser) return;
  if (typeof canSee === 'function' && !canSee(currentUser, 'audit')) {
    showToast && showToast('❌ Acesso negado.','error');
    setTimeout(() => window.location.href = '../index.html', 2000); return;
  }

  initTheme();
  initSidebar('audit', currentUser);

  createModalOverlay();
  setupRowClick();

  await recarregarLogs(true);

  setInterval(() => recarregarLogs(), 30000);
  hideLoading();
});

// ── Modal de detalhes ───────────────────────────────
function createModalOverlay() {
  _overlay = document.createElement('div');
  _overlay.className = 'overlay-detail';
  _overlay.setAttribute('role','dialog');
  _overlay.setAttribute('aria-modal','true');
  _overlay.innerHTML = `
    <div class="modal-detail">
      <div class="modal-detail-header">
        <span style="font-size:14px;font-weight:700;font-family:var(--font-head);color:var(--text);">Detalhes do Registro</span>
        <button class="modal-detail-close" onclick="fecharModalDetalhe()" aria-label="Fechar detalhes">✕ Fechar</button>
      </div>
      <div class="modal-detail-body" id="modal-body"></div>
    </div>`;
  _overlay.addEventListener('click', e => {
    if (e.target === _overlay) fecharModalDetalhe();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && _overlay.classList.contains('open')) fecharModalDetalhe();
  });
  document.body.appendChild(_overlay);
}

function fecharModalDetalhe() {
  if (_overlay) _overlay.classList.remove('open');
}

function abrirModalDetalhe(log) {
  if (!_overlay) return;
  const body = document.getElementById('modal-body');
  if (!body) return;

  const dt = new Date(log.ts);
  const dataHora = dt.toLocaleDateString('pt-BR') + ' ' +
    dt.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });

  const ini = (log.userName||'?').split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();
  const [c1,c2] = USER_COLORS[userColorIdx(log.userId||log.userName||'?')];

  let acaoCls, acaoLabel;
  switch(log.acao) {
    case 'criou':    acaoCls='acao-criou';    acaoLabel='Criou';       break;
    case 'editou':   acaoCls='acao-editou';   acaoLabel='Editou';      break;
    case 'excluiu':  acaoCls='acao-excluiu';  acaoLabel='Excluiu';     break;
    case 'login':    acaoCls='acao-login';    acaoLabel='Login';       break;
    case 'desligou': acaoCls='acao-desligou'; acaoLabel='Desligamento';break;
    default:         acaoCls='acao-outro';    acaoLabel=log.acao||'—';
  }

  body.innerHTML = `
    <div class="detail-campo">
      <div class="detail-campo-label">Data / Hora</div>
      <div class="detail-campo-val">${dataHora}</div>
    </div>
    <div class="detail-campo">
      <div class="detail-campo-label">Usuário</div>
      <div class="detail-campo-val" style="display:flex;align-items:center;gap:10px;">
        <div class="user-avatar" style="background:linear-gradient(135deg,${c1},${c2});width:28px;height:28px;font-size:9px;">${ini}</div>
        <strong>${log.userName||'—'}</strong>
        <span style="color:var(--muted);font-size:11px;">(${log.userId||'—'})</span>
      </div>
    </div>
    <div class="detail-campo">
      <div class="detail-campo-label">Ação</div>
      <div class="detail-campo-val"><span class="acao-badge ${acaoCls}">${acaoLabel}</span></div>
    </div>
    <div class="detail-campo">
      <div class="detail-campo-label">Módulo</div>
      <div class="detail-campo-val">${log.modulo||'—'}</div>
    </div>
    <div class="detail-campo">
      <div class="detail-campo-label">Detalhes</div>
      <div class="detail-campo-val">${log.detalhes||'—'}</div>
    </div>
    <div class="detail-campo">
      <div class="detail-campo-label">Dispositivo</div>
      <div class="detail-campo-val">${log.device||'—'}</div>
    </div>`;

  _overlay.classList.add('open');
}

function setupRowClick() {
  document.getElementById('log-tbody').addEventListener('click', e => {
    const tr = e.target.closest('.log-row');
    if (!tr) return;
    const id = tr.dataset.logId;
    const log = _logsCache[id];
    if (log) abrirModalDetalhe(log);
  });
}

// ── Skeleton loading ────────────────────────────────
function showSkeleton() {
  const tbody = document.getElementById('log-tbody');
  if (!tbody) return;
  tbody.innerHTML = Array.from({length:6}, () => `
    <tr class="skeleton-row">
      <td><div class="skeleton-bar" style="width:110px"></div></td>
      <td><div class="skeleton-cell"><div class="skeleton-avatar"></div><div class="skeleton-bar" style="width:120px"></div></div></td>
      <td><div class="skeleton-bar" style="width:80px"></div></td>
      <td><div class="skeleton-bar" style="width:90px"></div></td>
      <td><div class="skeleton-bar" style="width:180px"></div></td>
      <td><div class="skeleton-bar" style="width:100px"></div></td>
    </tr>`).join('');
}

async function getLogs() {
  const agora  = Date.now();
  const result = [];
  const vistos = new Set();
  const RETENCAO_MS = 604800000;

  try {
    const a = await LS.get('rh_audit_log', []);
    if (Array.isArray(a)) {
      const filtrados = a.filter(l => agora - new Date(l.ts).getTime() < RETENCAO_MS);
      filtrados.forEach(l => {
        if (l?.id && !vistos.has(l.id)) { vistos.add(l.id); result.push(l); }
      });
      if (filtrados.length !== a.length) {
        await LS.set('rh_audit_log', filtrados);
      }
    }
  } catch(_) {}

  try {
    const c = LS_LOCAL.get('rh_audit_log_cache', []);
    if (c.length) {
      c.forEach(l => {
        if (l?.id && !vistos.has(l.id) && agora - new Date(l.ts).getTime() < RETENCAO_MS) {
          result.push(l);
        }
      });
    }
  } catch(_) {}

  result.sort((a, b) => new Date(b.ts) - new Date(a.ts));
  console.log(`[audit] ${result.length} logs carregados`);
  return result;
}

async function recarregarLogs(showLoader) {
  const btn = document.getElementById('btn-reload');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Carregando...'; }
  try {
    if (showLoader) showSkeleton();
    await renderLog();
  } catch(e) {
    console.error('[audit] Falha ao carregar logs:', e);
    const tbody = document.getElementById('log-tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:50px;color:var(--red)">
      ❌ Falha ao carregar registros.${e.code ? ' ('+e.code+')' : ''} Verifique sua conexão e tente novamente.
    </td></tr>`;
    showToast('❌ Falha ao carregar registros de auditoria.', 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔄 Atualizar'; }
  }
}

function setTipo(el, val) {
  tipoFiltro = val;
  document.querySelectorAll('.filter-chip').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
  renderLog();
}

async function renderLog() {
  const search  = document.getElementById('search-input').value.toLowerCase();
  const modulo  = document.getElementById('filter-modulo').value;
  const periodo = parseInt(document.getElementById('filter-periodo').value);

  let logs = await getLogs();
  if (periodo > 0) {
    const corte = new Date();
    corte.setDate(corte.getDate() - periodo);
    logs = logs.filter(l => new Date(l.ts) >= corte);
  }
  if (tipoFiltro) logs = logs.filter(l => l.acao === tipoFiltro);
  if (modulo) logs = logs.filter(l => l.modulo === modulo);
  if (search) logs = logs.filter(l =>
    l.userName?.toLowerCase().includes(search) ||
    l.acao?.toLowerCase().includes(search)     ||
    l.modulo?.toLowerCase().includes(search)   ||
    l.detalhes?.toLowerCase().includes(search)
  );

  document.getElementById('log-count').textContent = `${logs.length} evento${logs.length!==1?'s':''}`;

  const tbody = document.getElementById('log-tbody');
  if (!logs.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:50px;color:var(--muted)">
      Nenhum registro encontrado com esses filtros.
    </td></tr>`;
    return;
  }

  _logsCache = {};
  logs.forEach(l => { _logsCache[l.id] = l; });
  tbody.innerHTML = logs.map(l => buildRow(l)).join('');
}

function buildRow(l) {
  const dt     = new Date(l.ts);
  const data   = dt.toLocaleDateString('pt-BR');
  const hora   = dt.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });

  const ini    = (l.userName||'?').split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();
  const [c1,c2]= USER_COLORS[userColorIdx(l.userId||l.userName||'?')];

  let acaoCls, acaoEmoji, acaoLabel;
  switch(l.acao) {
    case 'criou':    acaoCls='acao-criou';    acaoEmoji='＋';  acaoLabel='Criou';       break;
    case 'editou':   acaoCls='acao-editou';   acaoEmoji='✏️';  acaoLabel='Editou';      break;
    case 'excluiu':  acaoCls='acao-excluiu';  acaoEmoji='🗑️';  acaoLabel='Excluiu';     break;
    case 'login':    acaoCls='acao-login';    acaoEmoji='🔑';  acaoLabel='Login';       break;
    case 'desligou': acaoCls='acao-desligou'; acaoEmoji='🔴';  acaoLabel='Desligamento';break;
    default:         acaoCls='acao-outro';    acaoEmoji='·';   acaoLabel=l.acao||'—';
  }

  return `
  <tr class="log-row" data-log-id="${l.id}">
    <td><div class="log-datetime">${data} ${hora}</div></td>
    <td>
      <div class="user-cell">
        <div class="user-avatar" style="background:linear-gradient(135deg,${c1},${c2})">${ini}</div>
        <div class="user-name">${l.userName||'—'}</div>
      </div>
    </td>
    <td><span class="acao-badge ${acaoCls}">${acaoEmoji} ${acaoLabel}</span></td>
    <td class="log-modulo">${l.modulo||'—'}</td>
    <td class="log-detail">${l.detalhes||'—'}</td>
    <td class="log-device">${l.device||'—'}</td>
  </tr>`;
}

async function exportarCSV() {
  const btn = document.querySelector('.btn-export[onclick*="exportarCSV"]');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Gerando...'; }
  try {
    const logs = await getLogs();
    if (!logs.length) { showToast('⚠️ Nenhum registro para exportar.','warn'); return; }

    const header = ['Data/Hora','Usuário','Ação','Módulo','Detalhes','Dispositivo'];
    const rows   = logs.map(l => {
      const dt  = new Date(l.ts).toLocaleString('pt-BR');
      const det = (l.detalhes||'').replace(/<[^>]+>/g,'');
      return [dt, l.userName||'', l.acao||'', l.modulo||'', det, l.device||''].map(v=>`"${v}"`).join(',');
    });

    const csv  = [header.join(','), ...rows].join('\n');
    const blob = new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const date = new Date().toISOString().slice(0,10);
    a.href     = url;
    a.download = `auditoria-nagumo-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('✅ CSV exportado com sucesso!');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📋 Exportar CSV'; }
  }
}
