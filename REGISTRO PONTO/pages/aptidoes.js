const escHtml = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const _abrev = n => { const p = n.trim().split(/\s+/); return p.length > 1 ? p[0] + ' ' + p[p.length-1] : p[0]; };
const nomeAbrev = (emp, lista) => {
  const ab = _abrev(emp.name);
  const dup = lista.filter(e => e.id !== emp.id && _abrev(e.name) === ab).length > 0;
  return dup && emp.matricula ? `${ab} · ${emp.matricula}` : ab;
};
const APT_META = {
  qual:  { emoji:'✨', label:'Qualidade'   },
  prio:  { emoji:'⚡', label:'Proatividade'},
  know:  { emoji:'📚', label:'Conhecimento'},
  comm:  { emoji:'💬', label:'Comunicação' },
  prod:  { emoji:'📈', label:'Produtiv.'   },
  assid: { emoji:'📅', label:'Assid.'      },
  org:   { emoji:'🗂️', label:'Organização' },
  equip: { emoji:'🤝', label:'Equipe'      },
  cria:  { emoji:'💡', label:'Criatividade'},
  motv:  { emoji:'🔥', label:'Motivação'   },
};

function currentMonthKey() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;
}
function prevMonthKey() {
  const n = new Date();
  n.setDate(1);
  n.setMonth(n.getMonth()-1);
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;
}

function nextMonthLabel() {
  const n = new Date();
  n.setDate(1);
  n.setMonth(n.getMonth()+1);
  const MESES_SH = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return `${MESES_SH[n.getMonth()]}/${String(n.getFullYear()).slice(2)}`;
}

function isCompetencyLockedThisMonth(emp, key) {
  const snap = (emp.competencies_history||{})[currentMonthKey()];
  return !!(snap && snap[key] != null);
}

function areAllCompetenciesLockedThisMonth(emp) {
  return APT_KEYS.every(k => isCompetencyLockedThisMonth(emp, k));
}

function getAvaliacaoStatus(emp) {
  const hist = emp.competencies_history || {};
  if (hist[currentMonthKey()]) return 'este-mes';
  if (hist[prevMonthKey()])    return 'mes-passado';
  return 'sem-avaliacao';
}

const APT_COLORS = [
  '#34d399','#4f8ef7','#f472b6','#fb923c',
  '#a78bfa','#22d3ee','#fbbf24','#f87171',
  '#60a5fa','#4ade80'
];

let currentUser  = null;
let filtroAtivo  = 'todos';
let podeEditar   = false;
let _store       = null;
let _histChart   = null;
let mesAtivoKey  = '';
let _searchTimer = null;
let _selectsBuilt = false;

const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

document.addEventListener('DOMContentLoaded', async () => {
  currentUser = await requireSession();
  if (!currentUser) return;
  if (typeof canSee === 'function' && !canSee(currentUser, 'aptidoes')) {
    showToast && showToast('❌ Acesso negado.','error');
    setTimeout(() => window.location.href = '../index.html', 2000); return;
  }

  initTheme();
  initSidebar('aptidoes', currentUser);

  podeEditar = (typeof can === 'function')
    ? can(currentUser, 'aptidoes', 'edit')
    : true;

  mesAtivoKey = currentMonthKey();
  document.getElementById('mes-label').textContent = labelFromKey(mesAtivoKey);
  await renderTabela();
  verificarDeadlineBanner();
  hideLoading();
});

// ── Tooltip funcionário (mesmo padrão do ponto.js) ──
document.addEventListener('mouseover', e => {
  const el = e.target.closest('[data-tooltip]');
  if (!el) return;
  const tip = document.getElementById('emp-tooltip');
  if (tip) { tip.textContent = el.dataset.tooltip; tip.style.opacity = '1'; }
});
document.addEventListener('mousemove', e => {
  const el = e.target.closest('[data-tooltip]');
  const tip = document.getElementById('emp-tooltip');
  if (!tip) return;
  if (!el) { tip.style.opacity = '0'; return; }
  const rect = el.getBoundingClientRect();
  tip.style.left = Math.min(rect.left, window.innerWidth - tip.offsetWidth - 8) + 'px';
  tip.style.top = (rect.top - tip.offsetHeight - 8) + 'px';
});
document.addEventListener('mouseout', e => {
  if (!e.target.closest('[data-tooltip]')) {
    const tip = document.getElementById('emp-tooltip');
    if (tip) tip.style.opacity = '0';
  }
});

function getMyEmployees() {
  return getSupervisedEmployees(currentUser);
}

function labelFromKey(key) {
  const [y, m] = key.split('-').map(Number);
  return `${MESES_PT[m-1]} ${y}`;
}
function navMes(dir) {
  const [y, m] = mesAtivoKey.split('-').map(Number);
  const d = new Date(y, m - 1 + dir, 1);
  mesAtivoKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  document.getElementById('mes-label').textContent = labelFromKey(mesAtivoKey);
  renderTabela();
}

function fecharBanner() {
  const banner = document.getElementById('deadline-banner');
  if (banner) banner.style.display = 'none';
  LS_LOCAL.set('rh_deadline_dismiss', currentMonthKey());
}

function verificarDeadlineBanner() {
  const dismiss = LS_LOCAL.get('rh_deadline_dismiss');
  if (dismiss === currentMonthKey()) return;
  const hoje = new Date();
  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  const dia = hoje.getDate();
  const diasRestantes = ultimoDia - dia;
  if (diasRestantes >= 0 && diasRestantes <= 5) {
    const banner = document.getElementById('deadline-banner');
    const dateEl = document.getElementById('deadline-date');
    if (!banner) return;
    const emps = getMyEmployees();
    const todosAvaliados = emps.length > 0 && emps.every(e => areAllCompetenciesLockedThisMonth(e));
    if (todosAvaliados) { banner.style.display = 'none'; return; }
    banner.style.display = 'flex';
    if (dateEl) dateEl.textContent = `dia ${ultimoDia}`;
  }
}

function calcAptMedia(emp, monthKey) {
  const snap = (emp.competencies_history||{})[monthKey];
  if (snap) return APT_KEYS.reduce((s,k)=>s+(snap[k]||0),0)/APT_KEYS.length;
  return 5;
}
function calcAssid(emp, monthIdx) {
  if (emp.afastado || emp.maternidade) return 100;
  if (emp.ferias && emp.data_ferias_inicio && emp.data_ferias_fim) {
    const h = new Date(); h.setHours(0,0,0,0);
    if (new Date(emp.data_ferias_inicio+'T00:00:00') <= h && new Date(emp.data_ferias_fim+'T00:00:00') >= h) return 100;
  }
  const idx = monthIdx ?? new Date().getMonth();
  const abs = (emp.absences||[])[idx] ?? 0;
  const maxAbs = Math.max(1, Math.round((_store?.config?.maxAbs||36) / 12));
  return Math.max(0, 100 - (abs / maxAbs) * 100);
}
function getWeights() {
  const cfg = _store?.config||{};
  let pw = Math.min(80, Math.max(10, parseInt(cfg.perfWeight) || 40));
  let aw = Math.min(80, Math.max(10, parseInt(cfg.aptWeight) || 35));
  if (pw + aw > 90) {
    const sum = pw + aw;
    pw = Math.round(pw * 90 / sum);
    aw = Math.round(aw * 90 / sum);
    if (pw < 10) { pw = 10; aw = 80; }
    if (aw < 10) { aw = 10; pw = 80; }
  }
  return { perf: pw, apt: aw, abs: 100 - pw - aw };
}
function calcScore(emp, monthKey, monthIdx) {
  const w = getWeights();
  const perfVal = emp.perf_history?.[monthKey] ?? emp.perf ?? 0;
  return Math.min(100, Math.round(
    perfVal*(w.perf/100) + calcAptMedia(emp, monthKey)*10*(w.apt/100) + calcAssid(emp, monthIdx)*(w.abs/100)
  ));
}
function prevMonthKeyStr(mk) {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function calcScoreAnterior(emp, mk) {
  const mkAnt = prevMonthKeyStr(mk);
  const snap = (emp.competencies_history||{})[mkAnt];
  if (!snap) return null;
  const w = getWeights();
  const avg = APT_KEYS.reduce((s,k)=>s+(snap[k]||0),0)/APT_KEYS.length;
  const miAnt = parseInt(mkAnt.split('-')[1]) - 1;
  const assid = calcAssid(emp, miAnt);
  const perfVal = emp.perf_history?.[mkAnt] ?? emp.perf ?? 0;
  return Math.min(100, Math.round(
    perfVal*(w.perf/100) + avg*10*(w.apt/100) + assid*(w.abs/100)
  ));
}

function bubbleColor(v) {
  const n = parseFloat(v);
  if (n >= 9)  return { bg:'rgba(52,211,153,.25)',  color:'#34d399' };
  if (n >= 7)  return { bg:'rgba(79,142,247,.25)',  color:'#93C5FD' };
  if (n >= 5)  return { bg:'rgba(251,191,36,.22)',  color:'#fbbf24' };
  if (n >= 3)  return { bg:'rgba(251,146,60,.22)',  color:'#fb923c' };
  return             { bg:'rgba(248,113,113,.22)',  color:'#f87171' };
}

function scoreTagStyle(score) {
  if (score>=85) return 'background:rgba(52,211,153,.2);color:#34d399';
  if (score>=70) return 'background:rgba(79,142,247,.2);color:#4f8ef7';
  if (score>=55) return 'background:rgba(251,191,36,.15);color:#fbbf24';
  return               'background:rgba(248,113,113,.2);color:#f87171';
}

function buildFilialSelect() {
  const emps    = getMyEmployees();
  const filiais = [...new Set(emps.map(e=>e.filial))].filter(Boolean).sort();
  const sel     = document.getElementById('filial-select');
  const cur     = sel.value;
  sel.innerHTML = '<option value="">Todas as filiais</option>' +
    filiais.map(f=>`<option value="${f}" ${f===cur?'selected':''}>${escHtml(f)}</option>`).join('');
}

function buildDeptSelect() {
  const emps  = getMyEmployees();
  const depts = [...new Set(emps.map(e=>e.dept))].filter(Boolean).sort();
  const sel   = document.getElementById('dept-select');
  const cur   = sel.value;
  sel.innerHTML = depts.map(d=>
    `<option value="${d}" ${d===cur?'selected':''}>${escHtml(d)}</option>`
  ).join('') || '<option value="">—</option>';
  if (!sel.value && depts.length) sel.value = depts[0];
}

function buildTurnoSelect() {
  const emps   = getMyEmployees();
  const turnos = [...new Set(emps.map(e=>e.turno))].filter(Boolean).sort();
  const sel    = document.getElementById('turno-select');
  const cur    = sel.value;
  sel.innerHTML = '<option value="">Todos os turnos</option>' +
    turnos.map(t=>`<option value="${t}" ${t===cur?'selected':''}>${escHtml(t)}</option>`).join('');
}

function setFiltro(el, val) {
  filtroAtivo = val;
  document.querySelectorAll('.filter-chip').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
  renderTabela();
}

function onSearchInput() {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(renderTabela, 150);
}

async function renderTabela() {
  _store = await getStore();
  if (!_selectsBuilt) {
    buildFilialSelect();
    buildDeptSelect();
    buildTurnoSelect();
    _selectsBuilt = true;
  }
  const search = document.getElementById('search-input').value.toLowerCase();
  const filial = document.getElementById('filial-select').value;
  const dept   = document.getElementById('dept-select').value;
  const turno  = document.getElementById('turno-select').value;
  let   list   = getMyEmployees();

  if (search) list = list.filter(e=>e.name.toLowerCase().includes(search));
  if (filial) list = list.filter(e=>e.filial===filial);
  if (dept)   list = list.filter(e=>e.dept===dept);
  if (turno)  list = list.filter(e=>e.turno===turno);

  const mk = mesAtivoKey || currentMonthKey();
  const mi = parseInt(mk.split('-')[1]) - 1;
  list = list.filter(e => {
    const avg = calcAptMedia(e, mk);
    if (filtroAtivo==='acima8')  return avg > 8;
    if (filtroAtivo==='6a8')     return avg >= 6 && avg <= 8;
    if (filtroAtivo==='abaixo6') return avg < 6;
    return true;
  });

  document.getElementById('table-badge').textContent = `${list.length} funcionário${list.length!==1?'s':''}`;

  const tbody = document.getElementById('apt-tbody');
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="15" style="text-align:center;padding:50px;color:var(--muted)">
      Nenhum funcionário encontrado com esses filtros.
    </td></tr>`;
    return;
  }

  const sortedList = list.sort((a,b)=>(a.name||'').localeCompare(b.name||'','pt-BR'));
  tbody.innerHTML = sortedList.map(emp => buildRow(emp, sortedList, mk, mi)).join('');
}

function buildRow(emp, lista, mk, mi) {
  mk = mk || currentMonthKey();
  mi = mi ?? parseInt(mk.split('-')[1]) - 1;
  const isMesAtual = mk === currentMonthKey();

  const histMes = (emp.competencies_history||{})[mk];
  const temHist = !!histMes;
  const c = histMes || {};

  const avg    = calcAptMedia(emp, mk).toFixed(1);
  const assid  = Math.round(calcAssid(emp, mi));
  const score  = calcScore(emp, mk, mi);
  const scoreAnt = calcScoreAnterior(emp, mk);
  const ini    = emp.name.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();

  let avgColor;
  { const { color } = bubbleColor(parseFloat(avg)); avgColor = color; }
  const assidColor = assid>=85?'#34d399':assid>=70?'#4f8ef7':assid>=50?'#fbbf24':'#f87171';

  const { bloqueado, motivo } = isEmpBloqueado(emp);
  const podeEditarEste = podeEditar && !bloqueado && isMesAtual;

  const bloqueioBadge = bloqueado ? `
    <span style="margin-left:6px;padding:1px 7px;border-radius:20px;font-size:9px;font-weight:700;
      ${motivo==='afastado'
        ? 'background:rgba(239,68,68,.18);color:#ef4444;border:1px solid rgba(239,68,68,.3)'
        : motivo==='maternidade'
          ? 'background:rgba(251,191,36,.18);color:#f59e0b;border:1px solid rgba(251,191,36,.4)'
          : 'background:rgba(34,211,238,.14);color:#22d3ee;border:1px solid rgba(34,211,238,.3)'}>
      ${motivo==='afastado' ? '🚫 Afastado' : motivo==='maternidade' ? '🤰 Maternidade' : '🏖️ Férias'}
    </span>` : '';

  const scoreCongelado = bloqueado
    ? `<span title="Score congelado durante afastamento/maternidade/férias"
        style="font-size:10px;margin-left:3px;opacity:.7">❄️</span>`
    : '';

  const avalTitles = {
    'avaliado':      `Avaliado em ${labelFromKey(mk)} ✅`,
    'sem-avaliacao': `${labelFromKey(mk)} — valores atuais (sem avaliação histórica) ℹ️`,
  };
  const statusIndicator = `
    <td class="td-status-avaliacao">
      <div class="avaliacao-status ${temHist?'este-mes':'sem-avaliacao'}" title="${avalTitles[temHist?'avaliado':'sem-avaliacao']}"></div>
    </td>`;

  const cells = APT_KEYS.map(k => {
    const v = c[k] != null ? c[k] : 5;
    const { bg, color } = bubbleColor(v);

    if (temHist || isMesAtual) {
      if (!podeEditarEste) {
        if (!isMesAtual) {
          return `<td>
            <span class="score-bubble readonly" style="background:${bg};color:${color}">${v}</span>
          </td>`;
        }
        const motLabel = motivo==='afastado' ? 'afastado' : motivo==='maternidade' ? 'em licença maternidade' : 'em férias';
        return `<td>
          <span class="score-bubble readonly"
            style="background:${bg};color:${color};${bloqueado?'opacity:.55;cursor:not-allowed':''}"
            title="Edição bloqueada — funcionário ${motLabel}">${v}</span>
        </td>`;
      }

      const monthLocked = isCompetencyLockedThisMonth(emp, k);
      if (monthLocked) {
        const tip = `title="🔒 Já avaliado neste mês — próxima avaliação em ${nextMonthLabel()}"`;
        return `<td>
          <div class="score-cell-wrap">
            <span class="score-bubble month-locked" style="background:${bg};color:${color}" ${tip}
              onclick="showToast('🔒 Esta competência já foi avaliada neste mês. Próxima avaliação disponível em ${nextMonthLabel()}.','warn')">${v}</span>
            <span class="lock-badge">🔒</span>
          </div>
        </td>`;
      }

      return `<td>
        <span class="score-bubble" style="background:${bg};color:${color}"
          onclick="startEdit(${emp.id},'${k}',this)">${v}</span>
      </td>`;
    }

    return `<td>
      <span class="score-bubble readonly" style="background:${bg};color:${color};opacity:.55"
        title="Valor atual (sem avaliação registrada em ${labelFromKey(mk)})">${v}</span>
    </td>`;
  }).join('');

  const histCount   = Object.keys(emp.competencies_history||{}).length;
  const btnHistorico = `<button class="btn-historico" onclick="openHistorico(${emp.id})"
    title="${histCount > 0 ? histCount + ' mês(es) de histórico' : 'Sem histórico ainda'}"
    style="width:22px;height:22px;flex-shrink:0">
    📈${histCount > 0 ? `<span style="font-size:7px;margin-left:1px;color:var(--muted)">${histCount}</span>` : ''}
  </button>`;
  const isAdminMaster = currentUser?.nivel === 'admin_master';
  const btnResetMes = (isAdminMaster && !!histMes && isMesAtual) ? `
    <button onclick="resetMesAtual(${emp.id})"
      title="🔄 Limpar avaliações do mês (desbloqueia as competências)"
      style="display:inline-flex;align-items:center;justify-content:center;
        width:22px;height:22px;border-radius:7px;flex-shrink:0;cursor:pointer;
        border:1px solid rgba(248,113,113,.35);background:rgba(248,113,113,.1);
        color:#f87171;font-size:11px;transition:all .15s"
      onmouseover="this.style.background='rgba(248,113,113,.25)'"
      onmouseout="this.style.background='rgba(248,113,113,.1)'">🔄</button>` : '';

  const evolOpacity = !temHist ? '.5' : (bloqueado ? '.65' : '1');
  let evol = '';
  if (scoreAnt !== null && score !== scoreAnt) {
    evol = score > scoreAnt
      ? `<span style="font-size:11px;color:#34d399;margin-left:3px;opacity:${evolOpacity}" title="↑ ${score - scoreAnt} pts vs ${labelFromKey(prevMonthKeyStr(mk))}">↑</span>`
      : `<span style="font-size:11px;color:#f87171;margin-left:3px;opacity:${evolOpacity}" title="↓ ${scoreAnt - score} pts vs ${labelFromKey(prevMonthKeyStr(mk))}">↓</span>`;
  } else if (scoreAnt !== null && score === scoreAnt) {
    evol = `<span style="font-size:11px;color:var(--muted);margin-left:3px;opacity:${evolOpacity}" title="→ manteve vs ${labelFromKey(prevMonthKeyStr(mk))}">→</span>`;
  }
  const scoreTagExtra = !temHist ? `;opacity:.55` : (bloqueado ? `;opacity:.65` : '');
  const scoreTitle = !temHist ? ` title="Valores atuais — sem avaliação registrada em ${labelFromKey(mk)}"` : '';
  scoreHTML = `<span class="score-tag" style="${scoreTagStyle(score)}${scoreTagExtra}"${scoreTitle}>
    ${score}${scoreCongelado}${evol}
  </span>`;

  return `
  <tr data-emp-id="${emp.id}" style="${bloqueado?'opacity:.75':''}">
    <td class="td-emp">
      <div class="emp-cell">
        <div class="emp-mini-avatar"
          style="${motivo==='afastado'     ?'background:linear-gradient(135deg,#ef4444,#fb923c)':
                  motivo==='maternidade'   ?'background:linear-gradient(135deg,#f59e0b,#fbbf24)':
                  motivo==='ferias'        ?'background:linear-gradient(135deg,#22d3ee,#4f8ef7)':''}">
          ${ini}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px">
            <div class="emp-name-text" data-tooltip="${escHtml(emp.name||'')}">${escHtml(nomeAbrev(emp, lista))}${bloqueioBadge}</div>
            ${btnHistorico}
            ${btnResetMes}
          </div>
          <div class="emp-role-text">${escHtml(emp.role||'')}</div>
        </div>
      </div>
    </td>
    ${statusIndicator}
    ${cells}
    <td>
      <span class="med-val" style="color:${avgColor};${bloqueado?'opacity:.6':''}${!temHist?';opacity:.55':''}">${avg}</span>
    </td>
    <td>
      <span class="assid-val" style="color:${assidColor};${bloqueado?'opacity:.6':''}">${assid}%</span>
    </td>
    <td>${scoreHTML}</td>
  </tr>`;
}

function updateRow(empId) {
  const row = document.querySelector(`tr[data-emp-id="${empId}"]`);
  if (!row || !_store) return;
  const emp = (_store.employees||[]).find(e=>String(e.id)===String(empId));
  if (!emp) return;
  const allEmps = getMyEmployees().sort((a,b)=>(a.name||'').localeCompare(b.name||'','pt-BR'));
  const mk = mesAtivoKey || currentMonthKey();
  const mi = parseInt(mk.split('-')[1]) - 1;
  row.outerHTML = buildRow(emp, allEmps, mk, mi);
  if (typeof verificarDeadlineBanner === 'function') verificarDeadlineBanner();
}

let _pickerEmpId = null;
let _pickerKey   = null;

function dismissPicker() {
  const existing = document.getElementById('_score-picker');
  if (existing) existing.remove();
  document.removeEventListener('mousedown', _pickerOutside, true);
  document.removeEventListener('keydown',   _pickerEsc,     true);
  _pickerEmpId = null;
  _pickerKey   = null;
}

function _pickerOutside(e) {
  const picker = document.getElementById('_score-picker');
  if (picker && !picker.contains(e.target)) dismissPicker();
}

function _pickerEsc(e) {
  if (e.key === 'Escape') dismissPicker();
}

async function startEdit(empId, key, cell) {
  if (!podeEditar) return;

  const store = await getStore();
  const emp   = (store.employees||[]).find(e=>String(e.id)===String(empId));
  if (!emp) return;

  const { bloqueado, motivo } = isEmpBloqueado(emp);
  if (bloqueado) {
    const msg = motivo==='afastado'
      ? '🚫 Afastado — edição bloqueada até o retorno.'
      : motivo==='maternidade'
        ? '🤰 Em licença maternidade — edição bloqueada até o retorno.'
        : '🏖️ Em férias — edição bloqueada até o fim do período.';
    showToast(msg, 'warn');
    return;
  }

  if (isCompetencyLockedThisMonth(emp, key)) {
    showToast(`🔒 Esta competência já foi avaliada neste mês. Próxima avaliação disponível em ${nextMonthLabel()}.`, 'warn');
    return;
  }

  dismissPicker();

  _pickerEmpId = empId;
  _pickerKey   = key;
  const snap = (emp.competencies_history||{})[currentMonthKey()] || {};
  const cur = snap[key] ?? 5;
  const meta = APT_META[key];

  const picker = document.createElement('div');
  picker.id = '_score-picker';
  picker.className = 'score-picker';
  picker.innerHTML = `
    <div class="score-picker-label">${meta.emoji} ${meta.label}</div>
    <div class="score-picker-btns">
      ${Array.from({length:11},(_,i)=>`
        <button class="score-picker-btn ${i===cur?'current':''}" data-v="${i}"
          onclick="selectScore(${empId},'${key}',${i})">${i}</button>`).join('')}
    </div>`;

  document.body.appendChild(picker);

  const rect = cell.getBoundingClientRect();
  const pw = picker.offsetWidth || 360;
  const ph = picker.offsetHeight || 70;
  let left = rect.left + rect.width/2 - pw/2;
  let top  = rect.top - ph - 10;
  if (top < 8)         top  = rect.bottom + 10;
  if (left < 8)        left = 8;
  if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
  picker.style.left = left + 'px';
  picker.style.top  = top  + 'px';

  picker.querySelector(`[data-v="${cur}"]`)?.focus();

  setTimeout(() => {
    document.addEventListener('mousedown', _pickerOutside, true);
    document.addEventListener('keydown',   _pickerEsc,     true);
  }, 0);
}

async function selectScore(empId, key, v) {
  dismissPicker();

  const store = await getStore();
  const emps  = store.employees||[];
  const idx   = emps.findIndex(e=>String(e.id)===String(empId));
  if (idx<0) { renderTabela(); return; }
  if (!emps[idx].competencies) emps[idx].competencies = {};

  const snap = emps[idx].competencies_history?.[currentMonthKey()];
  const anterior = snap?.[key] ?? null;
  if (anterior === v) return;

  emps[idx].competencies[key] = v;
  if (!emps[idx].competencies_history) emps[idx].competencies_history = {};
  if (!emps[idx].competencies_history[currentMonthKey()]) emps[idx].competencies_history[currentMonthKey()] = {};
  emps[idx].competencies_history[currentMonthKey()][key] = v;
  store.employees = emps;
  _store = store;

  await saveStore(store);
  updateRow(empId);
  showToast('✅ Competência atualizada!');

  const empName = emps[idx]?.name || String(empId);
  registrarLog('editou', 'Aptidões',
    `<strong>${empName}</strong> — ${key}: <span class="de">${anterior??'—'}</span><span class="seta">→</span><span class="para">${v}</span>`
  );
}

async function resetMesAtual(empId) {
  const store = await getStore();
  const emps  = store.employees || [];
  const idx   = emps.findIndex(e => String(e.id) === String(empId));
  if (idx < 0) { showToast('❌ Funcionário não encontrado.', 'error'); return; }

  const empName = emps[idx].name || String(empId);
  const mes     = currentMonthKey();
  const [ano, m] = mes.split('-');
  const MESES   = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const label   = `${MESES[parseInt(m)-1]}/${ano.slice(2)}`;

  if (!confirm(`🔄 Limpar avaliações de ${empName} em ${label}?\n\nIsso desbloqueará todas as competências para que possam ser avaliadas novamente neste mês.`)) return;

  if (emps[idx].competencies_history && emps[idx].competencies_history[mes]) {
    delete emps[idx].competencies_history[mes];
    store.employees = emps;
    await saveStore(store);
    renderTabela();
    await registrarLog('editou', 'Aptidões', `Reset de avaliações de <strong>${empName}</strong> — mês ${label} desbloqueado`);
    showToast(`🔄 Avaliações de ${label} limpas. Todas as competências liberadas.`);
  } else {
    showToast('ℹ️ Nenhuma avaliação encontrada para este mês.', 'warn');
  }
}

async function openModal(empId) {
  dismissPicker();
  const store = await getStore();
  const emps  = getMyEmployees();
  const emp   = empId ? emps.find(e=>String(e.id)===String(empId)) : null;

  document.getElementById('modal-title').textContent = emp ? `Editar — ${emp.name}` : 'Nova Avaliação';
  document.getElementById('f-edit-id').value = emp?.id || '';

  const sel = document.getElementById('f-emp');
  sel.innerHTML = '<option value="">— Selecione —</option>' +
    emps.map(e=>`<option value="${e.id}" ${String(e.id)===String(empId)?'selected':''}>${escHtml(e.name)} · ${escHtml(e.dept||'')}</option>`).join('');
  sel.disabled = !!emp;
  sel.style.opacity = emp ? '.6' : '1';

  _buildModalGrid(emp);

  document.getElementById('modal-overlay').classList.add('open');
}

function _buildModalGrid(emp) {
  const snap = emp ? ((emp.competencies_history||{})[currentMonthKey()]||null) : null;
  const c    = snap || {};
  const grd  = document.getElementById('modal-apt-grid');
  const banner = document.getElementById('modal-lock-banner');
  const btnSave = document.querySelector('#modal-overlay .btn-primary');

  grd.innerHTML = APT_KEYS.map(k => {
    const isLocked = !!(snap && snap[k] != null);
    const lockLabel = isLocked
      ? `<span style="font-size:9px;font-weight:700;margin-left:4px;color:#fbbf24;
          background:rgba(251,191,36,.15);border:1px solid rgba(251,191,36,.3);
          border-radius:4px;padding:1px 5px">🔒 JÁ AVALIADO</span>` : '';
    return `
    <div class="form-group">
      <label class="form-label">${APT_META[k].emoji} ${APT_META[k].label}${lockLabel}</label>
      <input class="form-input" type="number" id="m-${k}"
        min="0" max="10" value="${c[k]??5}" placeholder="5"
        ${isLocked ? `disabled title="Já avaliado neste mês — liberado em ${nextMonthLabel()}"
          style="opacity:.45;cursor:not-allowed"` : ''}>
    </div>`;
  }).join('');

  const editableCount = APT_KEYS.filter(k => !(snap && snap[k] != null)).length;
  const lockedCount   = APT_KEYS.length - editableCount;

  if (lockedCount > 0 && emp) {
    if (editableCount === 0) {
      banner.innerHTML = `🔒 <strong>Todas as competências já foram avaliadas neste mês.</strong><br>
        <span style="opacity:.85">A próxima avaliação poderá ser realizada em <strong>${nextMonthLabel()}</strong>.</span>`;
      banner.style.display = '';
      if (btnSave) { btnSave.disabled = true; btnSave.style.opacity = '.4'; btnSave.title = `Próxima avaliação em ${nextMonthLabel()}`; }
    } else {
      banner.innerHTML = `🔒 <strong>${lockedCount} competência${lockedCount>1?'s':''} já avaliada${lockedCount>1?'s':''} neste mês</strong> — bloqueada${lockedCount>1?'s':''} até <strong>${nextMonthLabel()}</strong>.<br>
        <span style="opacity:.85">As demais ${editableCount} podem ser avaliadas agora.</span>`;
      banner.style.display = '';
      if (btnSave) { btnSave.disabled = false; btnSave.style.opacity = ''; btnSave.title = ''; }
    }
  } else {
    banner.style.display = 'none';
    if (btnSave) { btnSave.disabled = false; btnSave.style.opacity = ''; btnSave.title = ''; }
  }
}

function onModalEmpChange() {
  const empId = document.getElementById('f-emp').value;
  const emp   = empId ? getMyEmployees().find(e=>String(e.id)===String(empId)) : null;
  _buildModalGrid(emp);
}

function closeModal() {
  dismissPicker();
  document.getElementById('modal-overlay').classList.remove('open');
}

async function saveAvaliacao() {
  const editId = document.getElementById('f-edit-id').value;
  const empSel = document.getElementById('f-emp').value;
  const empId  = editId || empSel;

  if (!empId) { showToast('⚠️ Selecione um funcionário.','warn'); return; }

  const store = await getStore();
  const emps  = store.employees||[];
  const idx   = emps.findIndex(e=>String(e.id)===String(empId));
  if (idx<0) { showToast('❌ Funcionário não encontrado.','error'); return; }

  const { bloqueado, motivo } = isEmpBloqueado(emps[idx]);
  if (bloqueado) {
    const msg = motivo==='afastado'
      ? '🚫 Funcionário afastado. Aptidões não podem ser editadas durante o afastamento.'
      : motivo==='maternidade'
        ? '🤰 Funcionária em licença maternidade. Aptidões não podem ser editadas neste período.'
        : '🏖️ Funcionário em férias. Aptidões não podem ser editadas durante as férias.';
    showToast(msg, 'warn');
    return;
  }

  const snap = ((emps[idx].competencies_history||{})[currentMonthKey()])||null;
  const editableKeys = APT_KEYS.filter(k => !(snap && snap[k] != null));

  if (!editableKeys.length) {
    showToast(`🔒 Todas as competências já foram avaliadas neste mês. Próxima avaliação em ${nextMonthLabel()}.`, 'warn');
    return;
  }

  const competencies = { ...(emps[idx].competencies||{}) };
  editableKeys.forEach(k => {
    const el = document.getElementById(`m-${k}`);
    competencies[k] = el ? Math.min(10,Math.max(0,parseFloat(el.value)||5)) : 5;
  });

  store.employees[idx].competencies = competencies;

  if (!store.employees[idx].competencies_history) store.employees[idx].competencies_history = {};
  const snapAtual = store.employees[idx].competencies_history[currentMonthKey()] || {};
  const novoSnap = { ...snapAtual };
  editableKeys.forEach(k => { novoSnap[k] = competencies[k]; });
  store.employees[idx].competencies_history[currentMonthKey()] = novoSnap;

  _store = store;
  closeModal();
  updateRow(parseInt(empId) || empId);

  const qtd     = editableKeys.length;
  const empName = store.employees[idx]?.name || String(empId);
  showToast(`✅ ${qtd} competência${qtd>1?'s':''} avaliada${qtd>1?'s':''} com sucesso!`);

  saveStore(store).then(() => {
    registrarLog('editou', 'Aptidões',
      `Avaliação de <strong>${empName}</strong> — ${qtd} competência${qtd>1?'s':''} avaliada${qtd>1?'s':''}`
    );
  });
}

async function openHistorico(empId) {
  const store = await getStore();
  const emp   = (store.employees||[]).find(e=>String(e.id)===String(empId));
  if (!emp) return;

  const ini = emp.name.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();
  const hist = emp.competencies_history || {};
  const meses = Object.keys(hist).sort();

  document.getElementById('hist-emp-header').innerHTML = `
    <div class="hist-emp-avatar">${ini}</div>
    <div class="hist-emp-info">
      <div class="hist-emp-name">${escHtml(emp.name)}</div>
      <div class="hist-emp-role">${escHtml(emp.role||'')}${emp.dept?' · '+escHtml(emp.dept):''}</div>
    </div>
    <div class="hist-meses-count">${meses.length} mês${meses.length!==1?'es':''} de histórico</div>`;

  const body = document.getElementById('hist-body');

  if (!meses.length) {
    body.innerHTML = `
      <div class="hist-empty">
        <div class="hist-empty-icon">📊</div>
        <p style="font-size:14px;margin-bottom:6px">Nenhum histórico disponível</p>
        <p style="font-size:12px;color:var(--muted)">As avaliações ficam registradas aqui após a primeira edição.</p>
      </div>`;
    document.getElementById('modal-historico').classList.add('open');
    return;
  }

  const mesesVisiveis = meses.slice(-12);
  const labels = mesesVisiveis.map(mk => {
    const [y, m] = mk.split('-');
    const MESES_SH = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return `${MESES_SH[parseInt(m)-1]}/${y.slice(2)}`;
  });

  const datasets = APT_KEYS.map((k, i) => ({
    label: APT_META[k].emoji + ' ' + APT_META[k].label,
    data: mesesVisiveis.map(mk => hist[mk]?.[k] ?? null),
    borderColor: APT_COLORS[i],
    backgroundColor: APT_COLORS[i] + '22',
    borderWidth: 2,
    pointRadius: 4,
    pointHoverRadius: 7,
    tension: 0.3,
    spanGaps: true,
  }));

  const avgDataset = {
    label: '⭐ Média Geral',
    data: mesesVisiveis.map(mk => {
      if (!hist[mk]) return null;
      const vals = APT_KEYS.map(k => hist[mk][k] ?? 5);
      return +(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1);
    }),
    borderColor: '#ffffff',
    backgroundColor: 'rgba(255,255,255,.08)',
    borderWidth: 3,
    pointRadius: 5,
    pointHoverRadius: 8,
    tension: 0.3,
    spanGaps: true,
    borderDash: [5,3],
  };

  body.innerHTML = `
    <div class="hist-chart-wrap">
      <canvas id="hist-chart-canvas"></canvas>
    </div>
    <div class="hist-legend" id="hist-legend"></div>
    <div style="overflow-x:auto;max-height:160px;border-radius:8px;border:1px solid var(--border)">
      <table class="hist-table">
        <thead>
          <tr>
            <th>Competência</th>
            ${mesesVisiveis.map(mk => {
              const [y,m] = mk.split('-');
              const MESES_SH = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
              return `<th>${MESES_SH[parseInt(m)-1]}/${y.slice(2)}</th>`;
            }).join('')}
          </tr>
        </thead>
        <tbody>
          ${APT_KEYS.map((k,i) => `
            <tr>
              <td>${APT_META[k].emoji} ${APT_META[k].label}</td>
              ${mesesVisiveis.map(mk => {
                const val = hist[mk]?.[k];
                if (val == null) return `<td style="color:var(--muted)">—</td>`;
                const { color } = bubbleColor(val);
                return `<td><span class="hist-val" style="color:${color}">${val}</span></td>`;
              }).join('')}
            </tr>`).join('')}
          <tr style="border-top:2px solid var(--border)">
            <td style="font-weight:800;color:var(--text)">⭐ Média</td>
            ${mesesVisiveis.map(mk => {
              if (!hist[mk]) return `<td style="color:var(--muted)">—</td>`;
              const vals = APT_KEYS.map(k => hist[mk][k] ?? 5);
              const avg = (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1);
              const { color } = bubbleColor(parseFloat(avg));
              return `<td><span class="hist-val" style="color:${color};font-size:13px">${avg}</span></td>`;
            }).join('')}
          </tr>
        </tbody>
      </table>
    </div>`;

  document.getElementById('modal-historico').classList.add('open');

  requestAnimationFrame(() => {
    if (_histChart) { _histChart.destroy(); _histChart = null; }

    const ctx = document.getElementById('hist-chart-canvas');
    if (!ctx) return;

    const isDark = !document.body.classList.contains('light-theme');
    const gridColor = isDark ? 'rgba(42,47,69,.6)' : 'rgba(200,214,227,.7)';
    const tickColor = isDark ? '#64748b' : '#7A9AB5';

    _histChart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [...datasets, avgDataset] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: isDark ? '#1a1e2e' : '#fff',
            borderColor: isDark ? '#2a2f45' : '#C8D6E3',
            borderWidth: 1,
            titleColor: isDark ? '#e2e8f0' : '#04152E',
            bodyColor: isDark ? '#94a3b8' : '#4D6680',
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y != null ? ctx.parsed.y : '—'}`
            }
          },
        },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 10 } } },
          y: {
            min: 0, max: 10,
            grid: { color: gridColor },
            ticks: { color: tickColor, font: { size: 10 }, stepSize: 1 },
          },
        },
      },
    });

    const legEl = document.getElementById('hist-legend');
    if (legEl) {
      legEl.innerHTML = APT_KEYS.map((k,i) => `
        <div class="hist-legend-item">
          <div class="hist-legend-dot" style="background:${APT_COLORS[i]}"></div>
          ${APT_META[k].emoji} ${APT_META[k].label}
        </div>`).join('') + `
        <div class="hist-legend-item">
          <div class="hist-legend-dot" style="background:#fff"></div>
          ⭐ Média
        </div>`;
    }
  });
}

function closeHistorico() {
  document.getElementById('modal-historico').classList.remove('open');
  if (_histChart) { _histChart.destroy(); _histChart = null; }
}

document.getElementById('modal-historico').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeHistorico();
});

document.getElementById('modal-overlay').addEventListener('click', e=>{
  if (e.target===e.currentTarget) closeModal();
});
document.addEventListener('keydown', e=>{
  if (e.key==='Escape') closeModal();
});

(async function() {
  const tip = document.createElement('div');
  tip.id = '_apt-tip';
  tip.style.cssText = [
    'position:fixed','z-index:9999','pointer-events:none',
    'width:260px','background:var(--surface)',
    'border:1px solid var(--border)','border-radius:12px',
    'padding:14px 16px','box-shadow:0 12px 40px rgba(0,0,0,.5)',
    'text-align:left','white-space:normal',
    'opacity:0','transition:opacity .18s','top:0','left:0'
  ].join(';');
  document.body.appendChild(tip);

  document.querySelectorAll('.th-apt').forEach(th => {
    const inner = th.querySelector('.apt-tooltip');
    if (!inner) return;

    th.addEventListener('mouseenter', () => {
      tip.innerHTML = inner.innerHTML;
      tip.style.opacity = '1';
    });

    th.addEventListener('mousemove', e => {
      const tw = 260;
      let left = e.clientX + 12;
      if (left + tw > window.innerWidth - 8) left = e.clientX - tw - 12;
      tip.style.left = left + 'px';
      tip.style.top  = (e.clientY + 14) + 'px';
    });

    th.addEventListener('mouseleave', () => {
      tip.style.opacity = '0';
    });
  });
})();

window.addEventListener('page-refresh', async function () {
  console.log('[Aptidões] Dados atualizados via sync, re-renderizando...');
  _store = null;
  _selectsBuilt = false;
  setTimeout(function () { renderTabela(); }, 100);
});
