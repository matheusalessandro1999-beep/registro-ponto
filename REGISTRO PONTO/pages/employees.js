
let currentUser  = null;
let activeFilter = '';
let _store = null;
let _allPonto = {};
let _resolvePromocao = null;
let _admissaoVerificada = false;
let _page = 1;
const PAGE_SIZE  = 48;
let _debounceTimer = null;
let _metricsCache  = {};
let _pendentesAjuste = null;
const NIVEL_COR = { admin_master:'#4f8ef7', diretoria:'#fb923c', gerencia:'#a78bfa', coordenacao:'#fbbf24', encarregado:'#34d399', lider:'rgba(255,255,255,0.5)' };

// APT_KEYS e MONTHS agora em shared.js
const escHtml = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function debounce(fn, ms) {
  return function(...args) {
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => fn.apply(this, args), ms);
  };
}

function computeMetricsCache(emp) {
  const id = emp.id;
  if (_metricsCache[id]) return _metricsCache[id];
  const totalAbs = getTotalFaltasEmp(emp);
  const score = calcScore(emp, _store, calcBonus(emp));
  const st = getStatus(score);
  const assid = Math.round(calcAssid(emp, _store?.config?.maxAbs, totalAbs));
  const aptAvg = calcAptMedia(emp).toFixed(1);
  const lider = getLiderDoFuncionario(emp);
  const alert = hasAlert(emp);
  const sparkData = (() => {
    try {
      const allPonto  = _allPonto;
      const ano = emp.year || new Date().getFullYear();
      return Array.from({length:12}, (_, m) => {
        const key  = `${emp.id}_${ano}_${String(m+1).padStart(2,'0')}`;
        const dias = allPonto[key] || {};
        let f = 0;
        Object.entries(dias).forEach(([diaStr, s]) => {
          if (new Date(ano, m, parseInt(diaStr)).getDay() === 0) return;
          if (s === 'falta') f += 1;
        });
        return Object.keys(dias).length > 0 ? f : (emp.absences?.[m] || 0);
      });
    } catch(e) { console.error('[computeMetricsCache] absences:', e); return emp.absences || Array(12).fill(0); }
  })();
  _metricsCache[id] = { score, st, assid, aptAvg, totalAbs, lider, alert, sparkData };
  return _metricsCache[id];
}

// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
// INIT
// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
document.addEventListener('DOMContentLoaded', async () => {
  currentUser = await requireSession();
  if (!currentUser) return;
  if (typeof canSee === 'function' && !canSee(currentUser, 'employees')) {
    showToast && showToast('❌ R Acesso negado.','error');
    setTimeout(() => window.location.href = '../index.html', 2000); return;
  }

  initTheme();
  initSidebar('employees', currentUser);

  // Botão "Novo Funcionário" só para quem pode criar
  const btnNovo = document.getElementById('btn-novo');
  if (btnNovo) {
    const podeCreate = (typeof can === 'function')
      ? can(currentUser, 'employees', 'create')
      : true;
    btnNovo.style.display = podeCreate ? '' : 'none';
  }

  await renderCards();

  const urlParams = new URLSearchParams(window.location.search);
  const editEmpId = urlParams.get('editEmpId');
  if (editEmpId) {
    setTimeout(() => editEmployee(parseInt(editEmpId)), 400);
  }
  hideLoading();
});

// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
// SCORE HELPERS — usa shared.js (calcScore, calcAssid, calcAptMedia, getWeights, getStatus)
// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
function calcBonus(emp) {
  const BONUS_POR_DIA = 0.5;
  const BONUS_MAX = 5;
  try {
    const allPonto = _allPonto;
    const agora = new Date();
    const ano = agora.getFullYear();
    const mes = agora.getMonth();
    const feriadosCustom = _store?.config?.feriadosCustom || [];
    const ferNac = [
      {d:1,m:0},{d:21,m:3},{d:1,m:4},{d:7,m:8},
      {d:12,m:9},{d:2,m:10},{d:15,m:10},{d:25,m:11}
    ];
    const key  = `${emp.id}_${ano}_${String(mes+1).padStart(2,'0')}`;
    const dias = allPonto[key] || {};
    let diasBonus = 0;
    Object.entries(dias).forEach(([dStr, status]) => {
      if (status !== 'presente') return;
      const d = parseInt(dStr);
      const dow = new Date(ano, mes, d).getDay();
      if (dow === 0) { diasBonus++; return; }
      if (ferNac.some(f => f.d===d && f.m===mes)) { diasBonus++; return; }
      const mesStr = String(mes+1).padStart(2,'0');
      const diaStr = String(d).padStart(2,'0');
      if (feriadosCustom.some(f => f.chave===`${mesStr}-${diaStr}`)) diasBonus++;
    });
    return Math.min(BONUS_MAX, diasBonus * BONUS_POR_DIA);
  } catch(e) { console.error('[calcBonus]', e); return 0; }
}
function hasAlert(emp) {
  return calcAptMedia(emp) >= 7 && calcAssid(emp, _store?.config?.maxAbs, getTotalFaltasEmp(emp)) < 70;
}
function getHeatColor(v) {
  if (v===0) return '#34d399';
  if (v<=1)  return '#4f8ef7';
  if (v<=2)  return '#fbbf24';
  if (v<=3)  return '#fb923c';
  return '#f87171';
}

// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
// ESCOPO DE DADOS
// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
function getMyEmployees() {
  return getSupervisedEmployees(currentUser, true);
}

function isLeadershipRole(roleName) {
  if (!roleName) return false;
  const lower = roleName.toLowerCase();
  return lower.includes('líder') || lower.includes('lider') ||
    lower.includes('encarreg') ||
    lower.includes('coordenaç') || lower.includes('coordenac') ||
    lower.includes('gerênc') || lower.includes('gerenc') ||
    lower.includes('gerent') ||
    lower.includes('diretor') ||
    lower.includes('supervisor') ||
    lower.includes('admin') ||
    lower.includes('chef');
}

function canEditEmp(emp) {
  if (typeof canEdit === 'function') return canEdit(currentUser, 'employees', emp);
  // Self-edit: líder pode editar o próprio card
  if (emp && String(emp.id) === String(currentUser.id)) return true;
  return false;
}
function canDeleteEmp(emp) {
  if (typeof canDelete === 'function') return canDelete(currentUser, 'employees', emp);
  return false;
}
function canTransferEmp() {
  return (typeof can==='function') ? can(currentUser,'employees','transfer') : false;
}
function canOcorrenciaEmp() {
  return (typeof can==='function') ? can(currentUser,'employees','ocorrencia') : false;
}
function canDemitirEmp() {
  return (typeof can==='function') ? can(currentUser,'employees','demitir') : false;
}
function canVerDemitidos() {
  return (typeof can==='function') ? can(currentUser,'employees','view_demitidos') : false;
}

// Retorna o líder/responsável direto do funcionário
function getLiderDoFuncionario(emp) {
  const supId = String(emp.supervisor_id || '');

  // Priority 1: supervisor real (busca em users E employees)
  if (supId) {
    const sup = (_store?.users || {})[supId] || (_store?.employees||[]).find(e => String(e.id) === supId || String(e.login_id) === supId);
    if (sup && sup.id !== ADMIN_ID && sup.nivel !== 'admin_master') return sup;
  }

  // Fallback: departamento/turno (caso raro de supervisor_id inexistente)
  // Considera líderes de ambos os arrays
  const allLeaders = [
    ...Object.values(_store?.users || {}),
    ...(_store?.employees||[]).filter(e => e.nivel && e.nivel !== 'admin_master')
  ].sort((a, b) => String(a.id).localeCompare(String(b.id)));

  const dept  = emp.dept  || '';
  const turno = emp.turno || '';

  const PRIORIDADE = ['lider','encarregado','coordenacao','gerencia','diretoria'];

  for (const nivel of PRIORIDADE) {
    const candidatos = allLeaders.filter(u => {
      if (u.id === ADMIN_ID || u.nivel === 'admin_master') return false;
      if ((u.nivel || 'lider') !== nivel) return false;
      if (['gerencia','diretoria'].includes(nivel)) return true;

      const depts = u.perfil?.depts || [];
      const setor = u.setor || '';
      const liderTurno = u.perfil?.turno || '';

      const deptOk = (depts.length || setor)
        ? depts.includes(dept) || setor === dept
        : supId === String(u.id);

      const turnoOk = liderTurno ? liderTurno === turno : true;
      return deptOk && turnoOk;
    });

    if (!candidatos.length) continue;
    if (supId) {
      const supMatch = candidatos.find(u => String(u.id) === supId);
      if (supMatch) return supMatch;
    }
    return candidatos[0];
  }

  return null;
}

function getTotalFaltasEmp(emp) {
  try {
    const allPonto = _allPonto;
    const ano = emp.year || new Date().getFullYear();
    let total = 0;
    let temDados = false;
    for (let m = 0; m < 12; m++) {
      const mes = String(m + 1).padStart(2, '0');
      const key = `${emp.id}_${ano}_${mes}`;
      const dias = allPonto[key] || {};
      if (Object.keys(dias).length > 0) temDados = true;
      Object.entries(dias).forEach(([diaStr, s]) => {
        if (new Date(ano, m, parseInt(diaStr)).getDay() === 0) return;
        if (s === 'falta') total += 1;
      });
    }
    return temDados ? total : (emp.absences||[]).reduce((a,b)=>a+b, 0);
  } catch(e) {
    console.error('[getTotalFaltasEmp]', e);
    try { return (emp.absences||[]).reduce((a,b)=>a+b, 0); } catch(e2) { return 0; }
  }
}

// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
// POPULAR SELECTS
// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
function populateFilialSelect() {
  const emps = getMyEmployees();  // sync - reads _store
  const filiais = [...new Set(emps.map(e=>e.filial))].filter(Boolean).sort();
  const sel = document.getElementById('filial-select');
  const cur = sel.value;
  sel.innerHTML = '<option value="">Todas as filiais</option>' +
    filiais.map(f=>`<option value="${f}" ${f===cur?'selected':''}>${f}</option>`).join('');
}

function populateDeptSelect() {
  const emps = getMyEmployees();  // sync - reads _store
  const depts  = [...new Set(emps.map(e=>e.dept))].filter(Boolean).sort();
  const sel = document.getElementById('dept-select');
  const cur = sel.value;
  sel.innerHTML = '<option value="">Todos os departamentos</option>' +
    depts.map(d=>`<option value="${d}" ${d===cur?'selected':''}>${d}</option>`).join('');
}

async function populateModalSelects(emp) {
  const store = await getStore();
   const opt = (list, val) =>
    `<option value="">— Selecione —</option>` +
    list.map(x=>`<option value="${x.nome||x.name}" ${(x.nome||x.name)===val?'selected':''}>${escHtml(x.nome||x.name)}</option>`).join('');

  document.getElementById('f-dept').innerHTML = opt(store.depts, emp?.dept  || '');
  document.getElementById('f-role').innerHTML = opt(store.funcoes, emp?.role  || '');
  document.getElementById('f-filial').innerHTML = opt(store.filiais, emp?.filial|| '');
  document.getElementById('f-turno').innerHTML  = opt(store.turnos,  emp?.turno || '');
  // Supervisor select  busca de store.users E store.employees com nivel
  const supId = emp?.supervisor_id || '';
  const supEl = document.getElementById('f-supervisor');
  const users = Object.values(store.users||{});
  const empLeaders = (store.employees||[]).filter(e => e.nivel && e.nivel !== 'admin_master' && !e.demitido);
  const todosSupervisores = [
    ...users.filter(u => u.nivel && u.nivel !== 'admin_master'),
    ...empLeaders.filter(e => !users.some(u => String(u.id) === String(e.id)))
  ];
  supEl.innerHTML =
    `<option value="">— Selecione —</option>` +
    todosSupervisores
      .sort((a,b)=>(a.name||'').localeCompare(b.name||'', 'pt-BR'))
      .map(u => `<option value="${u.id}" ${String(u.id)===String(supId)?'selected':''}>${escHtml(u.name)} · ${escHtml(u.nivel||'')}</option>`).join('');
}

// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
// FILTRO
// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
function setFilter(el, val) {
  activeFilter = val;
  document.querySelectorAll('.filter-chip').forEach(function(c) { c.classList.remove('active'); });
  el.classList.add('active');
  renderCards();
}

// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
// RENDER CARDS
// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
let _renderingMutex = null;
async function renderCards(fromPageNav = false) {
  if (_renderingMutex) { _renderingMutex.abort = true; }
  const mutex = _renderingMutex = { abort: false };
  try {
  if (!_store) {
    _store = await getStore();
    if (mutex.abort) return;
    _allPonto = await LS.get('rh_ponto', {});
    _metricsCache = {};

    if (_store?.employees?.length) {
      const before = _store.employees.length;
      const seen = new Set();
      _store.employees = _store.employees.filter(e => {
        if (e.id == null) return false;
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      });
      if (_store.employees.length < before) {
        console.log(`[Dedup] ${before - _store.employees.length} duplicata(s) removida(s) do store.employees`);
        await saveStore(_store);
      }
    }

    // Dedup historico_cargos (entradas iguais com mesmo cargo+tipo+data)
    let histFix = false;
    _store.employees.forEach(e => {
      if (e.historico_cargos?.length) {
        const antes = e.historico_cargos.length;
        e.historico_cargos = e.historico_cargos.filter((h, i, arr) =>
          i === arr.findIndex(x => x.cargo === h.cargo && x.tipo === h.tipo && x.data === h.data)
        );
        if (e.historico_cargos.length < antes) histFix = true;
      }
    });
    if (histFix) await saveStore(_store);
  }

  if (mutex.abort) return;
  const ocorrencias = await LS.get('rh_ocorrencias', []);
  _pendentesAjuste = new Set(
    ocorrencias
      .filter(o => o.status === 'pendente')
      .map(o => String(o.empId))
  );

  if (mutex.abort) return;
  if (!_admissaoVerificada) {
    _admissaoVerificada = true;
    await verificarAdmissaoFaltando();
  }

  if (!fromPageNav) _page = 1;

  const search = document.getElementById('search-input').value.toLowerCase();
  const filialSel = document.getElementById('filial-select').value;
  const deptSel = document.getElementById('dept-select').value;

  const todos = getMyEmployees();
  let ativos = todos.filter(e => !e.demitido && !e.nivel);
  const demitidos = todos.filter(e => !!e.demitido && !e.nivel);

  populateFilialSelect();
  if (filialSel) document.getElementById('filial-select').value = filialSel;
  populateDeptSelect();
  if (deptSel) document.getElementById('dept-select').value = deptSel;

  ativos = ativos.filter(e => {
    const matchName = e.name.toLowerCase().includes(search);
    const matchFilial = !filialSel || e.filial === filialSel;
    const matchDept = !deptSel || e.dept === deptSel;
    const c = computeMetricsCache(e);
    const matchStatus = !activeFilter || c.st.tag === activeFilter;
    return matchName && matchFilial && matchDept && matchStatus;
  });

  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const estaEmFerias = e =>
    e.ferias && e.data_ferias_inicio && e.data_ferias_fim &&
    new Date(e.data_ferias_inicio + 'T00:00:00') <= hoje &&
    new Date(e.data_ferias_fim + 'T00:00:00') >= hoje;
  const isIrregular = e => e.afastado || e.maternidade || estaEmFerias(e);

  let sortKey = (document.getElementById('sort-select')?.value) || 'name';
  ativos.sort(function(a, b) {
    let aIrreg = isIrregular(a) ? 1 : 0;
    let bIrreg = isIrregular(b) ? 1 : 0;
    if (aIrreg !== bIrreg) return aIrreg - bIrreg;
    if (sortKey === 'score' || sortKey === 'score_desc') {
      let sa = computeMetricsCache(a).score;
      let sb = computeMetricsCache(b).score;
      return sortKey === 'score_desc' ? sa - sb : sb - sa;
    }
    if (sortKey === 'name_desc') {
      return (b.name||'').localeCompare(a.name||'', 'pt-BR', { sensitivity:'base' });
    }
    if (sortKey === 'dept' || sortKey === 'filial') {
      let ac = sortKey === 'dept' ? (a.dept||'') : (a.filial||'');
      let bc = sortKey === 'dept' ? (b.dept||'') : (b.filial||'');
      if (ac !== bc) return ac.localeCompare(bc, 'pt-BR', { sensitivity:'base' });
    }
    return (a.name||'').localeCompare(b.name||'', 'pt-BR', { sensitivity:'base' });
  });

  const totalPages = Math.max(1, Math.ceil(ativos.length / PAGE_SIZE));
  if (_page > totalPages) _page = totalPages;
  const start = (_page - 1) * PAGE_SIZE;
  const pageEmps = ativos.slice(start, start + PAGE_SIZE);

  const grid = document.getElementById('emp-grid');
  if (!ativos.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <p style="font-size:14px">Nenhum funcionário encontrado</p>
        <p style="font-size:12px;margin-top:6px">Tente mudar os filtros ou cadastre um novo funcionário.</p>
      </div>`;
  } else {
    grid.innerHTML = pageEmps.map(emp => buildCard(emp)).join('');
  }

  renderPagination(totalPages, ativos.length);

  const secDemitidos  = document.getElementById('demitidos-section');
  const podeDemitidos = canVerDemitidos();
  if (podeDemitidos && demitidos.length) {
    document.getElementById('demitidos-count').textContent = demitidos.length;
    document.getElementById('demitidos-grid').innerHTML = demitidos.map(emp => buildCardDemitido(emp)).join('');
    secDemitidos.style.display = '';
  } else {
    secDemitidos.style.display = 'none';
  }
  } catch(e) { console.error('[renderCards]', e); }
}

function goToPage(p) {
  _page = p;
  renderCards(true);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderPagination(totalPages, totalEmps) {
  const el = document.getElementById('pagination');
  if (totalPages <= 1) { el.innerHTML = ''; return; }
  let html = `<span class="page-info">${totalEmps} funcionários · Página ${_page} de ${totalPages}</span>`;
  html += `<button class="page-btn" onclick="goToPage(${_page-1})" ${_page<=1?'disabled':''}>⬹ Anterior</button>`;
  for (let i = Math.max(1, _page-2); i <= Math.min(totalPages, _page+2); i++) {
    html += `<button class="page-btn ${i===_page?'active':''}" onclick="goToPage(${i})">${i}</button>`;
  }
  html += `<button class="page-btn" onclick="goToPage(${_page+1})" ${_page>=totalPages?'disabled':''}>Próximo ⬺</button>`;
  el.innerHTML = html;
}

function buildCard(emp) {
  const c = computeMetricsCache(emp);
  const perfExibir = emp.perf_history?.[currentMonthKey()] ?? emp.perf ?? 0;
  const ini = (emp.name||'?').split(' ').map(x=>x[0]).filter(Boolean).slice(0,2).join('').toUpperCase() || '??';
  const podEdit = canEditEmp(emp);
  const podTransfer = canTransferEmp();
  const podOcorr = canOcorrenciaEmp();

  const maxAbs = Math.max(...c.sparkData, 1);
  const spark  = c.sparkData.map(v => {
    const h = v===0 ? 3 : Math.round((v/maxAbs)*22)+2;
    const cor = getHeatColor(v);
    return `<div class="sparkline-bar" style="height:${h}px;background:${cor}"></div>`;
  }).join('');

  const barColor = c.score>=85?'#34d399':c.score>=70?'#4f8ef7':c.score>=55?'#fbbf24':'#f87171';

  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const emFerias = emp.ferias && emp.data_ferias_inicio && emp.data_ferias_fim &&
    new Date(emp.data_ferias_inicio+'T00:00:00') <= hoje &&
    new Date(emp.data_ferias_fim+'T00:00:00') >= hoje;
  const banner = emp.afastado
    ? `<div class="emp-banner afastado">🚫 AFASTADO</div>`
    : emp.maternidade
      ? `<div class="emp-banner maternidade">🤰 LICENÇA MATERNIDADE${emp.data_maternidade_fim?' · retorno '+new Date(emp.data_maternidade_fim+'T00:00:00').toLocaleDateString('pt-BR'):''}</div>`
      : emFerias
        ? `<div class="emp-banner ferias">🏖️ FÉRIAS${emp.data_ferias_fim?' · até '+new Date(emp.data_ferias_fim+'T00:00:00').toLocaleDateString('pt-BR'):''}</div>`
        : '';
  const topPad = (emp.afastado || emp.maternidade || emFerias) ? 'margin-top:26px' : '';

  return `
  <div class="emp-card ${emp.maternidade ? 'maternidade-card' : ''}" style="${emp.afastado?'border-color:rgba(239,68,68,.4)':emFerias?'border-color:rgba(34,211,238,.4)':''}">
    ${banner}
    <div class="emp-card-header" style="${topPad}">
      <div class="emp-avatar">${emp.foto ? `<img src="${escHtml(emp.foto)}" style="width:42px;height:42px;border-radius:50%;object-fit:cover">` : ini}</div>
      <div class="emp-info">
        <div class="emp-name">${escHtml(emp.name)}</div>
        ${_pendentesAjuste?.has(String(emp.id)) ? `<div style="font-size:10px;color:#fbbf24;font-weight:700;line-height:1.3">⏳ Ajuste pendente</div>` : ''}
        <div class="emp-role">${escHtml(emp.role||'')}${emp.dept?' · '+escHtml(emp.dept):''}</div>
      </div>
    </div>

    ${c.alert ? `<div class="emp-alert">⚠️ Alta aptidão, baixa assiduidade</div>` : ''}

    <div class="emp-metrics">
      <div class="emp-metric">
        <div class="emp-metric-val perf">${perfExibir}%</div>
        <div class="emp-metric-label">Desemp.</div>
      </div>
      <div class="emp-metric">
        <div class="emp-metric-val apt">${c.aptAvg}</div>
        <div class="emp-metric-label">Apt./10</div>
      </div>
      <div class="emp-metric">
        <div class="emp-metric-val assid ${c.assid<70?'low':''}">${c.assid}%</div>
        <div class="emp-metric-label">Assid.</div>
      </div>
      <div class="emp-metric">
        <div class="emp-metric-val faltas">${c.totalAbs}</div>
        <div class="emp-metric-label">Faltas</div>
      </div>
    </div>

    <div class="emp-card-footer">
      <div class="emp-score">${c.score}</div>
      <span class="tag ${c.st.cls}">${c.st.label}</span>
    </div>

    ${emp.filial||emp.turno ? `
    <div class="emp-tags">
      ${emp.filial?`<span class="emp-tag filial">🏢 ${emp.filial}</span>`:''}
      ${emp.turno ?`<span class="emp-tag turno">🕐 ${emp.turno}</span>`:''}
    </div>` : ''}

    ${emp.matricula ? `
    <div class="emp-matricula">
      🪪 Matrícula: <strong>${emp.matricula}</strong>
    </div>` : ''}

    ${emp.data_admissao ? `
    <div style="font-size:10px;color:var(--muted);margin-top:4px;display:flex;align-items:center;gap:4px">
      📅 Desde ${new Date(emp.data_admissao+'T00:00:00').toLocaleDateString('pt-BR')}
    </div>` : ''}

    ${c.lider ? `
    <div class="emp-lider">
      <span style="width:8px;height:8px;border-radius:50%;background:${NIVEL_COR[c.lider.nivel]||'var(--muted)'};flex-shrink:0"></span>
      <span>Resp.: <strong style="color:var(--text)">${c.lider.name}</strong></span>
    </div>` : ''}
    <div class="emp-actions-bottom">
      ${podEdit ? `<button class="emp-btn edit" data-action="edit" data-id="${emp.id}" title="Editar">✏️</button>` : ''}
      ${podTransfer ? `<button class="emp-btn transfer" data-action="transfer" data-id="${emp.id}" title="Transferir">🔄</button>` : ''}
      ${podOcorr ? `<button class="emp-btn ocorr" data-action="ocorr" data-id="${emp.id}" title="Ocorrência">📝</button>` : ''}
    </div>
  </div>`;
}

const debouncedRender = debounce(renderCards, 250);

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('emp-grid')?.addEventListener('click', e => {
    const btn = e.target.closest('.emp-btn[data-action]');
    if (!btn) return;
    const id = parseInt(btn.dataset.id);
    const act  = btn.dataset.action;
    if (act === 'edit') editEmployee(id);
    else if (act === 'del') deleteEmployee(id);
    else if (act === 'transfer') openTransferModal(id);
    else if (act === 'ocorr') openOcorrenciaModal(id, 'emp');
    else if (act === 'pdf') gerarRelatorioPDF(id);
  });
  document.getElementById('demitidos-grid')?.addEventListener('click', e => {
    const btn = e.target.closest('.emp-btn[data-action]');
    if (!btn) return;
    const id = parseInt(btn.dataset.id);
    const act  = btn.dataset.action;
    if (act === 'del') deleteEmployee(id);
    else if (act === 'pdf') gerarRelatorioPDF(id);
  });
});

// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
// MODAL  ABRIR / FECHAR (currentMonthKey em shared.js)
// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
function openModal(emp) {
  document.getElementById('modal-title').textContent = emp ? 'Editar Funcionário' : 'Novo Funcionário';
  document.getElementById('f-edit-id').value = emp?.id || '';
  document.getElementById('f-name').value = emp?.name || '';
  document.getElementById('f-perf').value = emp?.perf_history?.[currentMonthKey()] ?? emp?.perf ?? '';
  document.getElementById('f-matricula').value = emp?.matricula  || '';
  document.getElementById('f-data-admissao').value = emp?.data_admissao || '';
  document.getElementById('f-role-original').value = emp?.role || '';

  // Afastado
  document.getElementById('f-afastado').checked = !!emp?.afastado;
  document.getElementById('f-data-afastamento').value = emp?.data_afastamento || '';
  document.getElementById('afastado-date-wrap').style.display = emp?.afastado ? 'block' : 'none';

  // Férias
  document.getElementById('f-ferias').checked = !!emp?.ferias;
  document.getElementById('f-ferias-inicio').value = emp?.data_ferias_inicio || '';
  document.getElementById('f-ferias-fim').value = emp?.data_ferias_fim || '';
  document.getElementById('ferias-date-wrap').style.display = emp?.ferias ? 'block' : 'none';

  // Maternidade
  document.getElementById('f-maternidade').checked = !!emp?.maternidade;
  document.getElementById('f-data-maternidade').value = emp?.data_maternidade || '';
  document.getElementById('f-data-maternidade-fim').value = emp?.data_maternidade_fim || '';
  document.getElementById('maternidade-date-wrap').style.display = emp?.maternidade ? 'block' : 'none';

  // Demissão  só exibe em edição e com permissão
  const podeDemitir = canDemitirEmp();
  const demissaoSec = document.getElementById('demissao-section');
  demissaoSec.style.display = (podeDemitir && !!emp?.id) ? '' : 'none';
  if (podeDemitir && emp?.id) {
    document.getElementById('f-demitido').checked = !!emp?.demitido;
    document.getElementById('f-data-demissao').value = emp?.data_demissao || '';
    document.getElementById('f-motivo-demissao').value = emp?.motivo_demissao || '';
    document.getElementById('demitido-date-wrap').style.display = emp?.demitido ? 'block' : 'none';
  }

  // Foto
  const fotoVal = emp?.foto || '';
  document.getElementById('f-foto').value = fotoVal;
  const prevEl = document.getElementById('foto-preview-modal');
  if (fotoVal) {
    const fotoSafe = fotoVal.startsWith('data:') ? fotoVal : escHtml(fotoVal);
    prevEl.innerHTML = `<img src="${fotoSafe}" alt="foto">`;
  } else {
    const nm  = emp?.name || '';
    const ini = nm.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase() || '?';
    prevEl.innerHTML = `<span id="foto-ini-modal">${ini}</span>`;
  }

  // Campos de líder  preenche dados mas mantém oculto
  // (exibido dinamicamente via onChange do cargo)
  const leaderSection  = document.getElementById('leader-fields');
  const roleSelect = document.getElementById('f-role');
  leaderSection.style.display = 'none';
  document.getElementById('f-login-id').value = emp?.login_id || '';
  document.getElementById('f-pass').value = '';
  if (emp?.nivel) {
    document.getElementById('f-nivel').value = emp.nivel;
  }

  // Mostrar campos de líder quando cargo for de liderança
  const podePromover = getUserPerfil(currentUser) === 'admin_master'
    || (typeof can==='function' && can(currentUser,'employees','promover'));
  const isSelfEdit = emp?.id && String(emp.id) === String(currentUser.id);
  roleSelect.onchange = function() {
    if (!podePromover && !isSelfEdit) { leaderSection.style.display = 'none'; return; }
    if (isLeadershipRole(this.value)) {
      const isAdmin = getUserPerfil(currentUser) === 'admin_master';
      const nivelSelect = document.getElementById('f-nivel');
      const ORDEM = ['lider','encarregado','coordenacao','gerencia','diretoria'];
      const userLevel = currentUser.nivel || 'lider';
      const userIdx = ORDEM.indexOf(userLevel);
      const maxAllowedIdx = isAdmin ? ORDEM.length - 1 : userIdx;
      const currentVal = nivelSelect.value || '';
      nivelSelect.innerHTML =
        `<option value="">— Sem acesso —</option>` +
        ORDEM.slice(0, maxAllowedIdx + 1).map(n => {
          const LABELS = { lider:'👷 Líder Operacional', encarregado:'🔰 Encarregado', coordenacao:'📋 Coordenação', gerencia:'📊 Gerência', diretoria:'🏢 Diretoria' };
          return `<option value="${n}" ${currentVal === n ? 'selected' : ''}>${LABELS[n]}</option>`;
        }).join('');
      if (!nivelSelect.value && emp?.nivel) nivelSelect.value = emp.nivel;
      // Self-edit: não pode trocar o próprio nivel
      nivelSelect.disabled = isSelfEdit;
      leaderSection.style.display = '';
    } else {
      leaderSection.style.display = 'none';
    }
  };

  // Se o cargo atual já é liderança, mostra os campos
  if (roleSelect.value && isLeadershipRole(roleSelect.value)) {
    roleSelect.onchange();
  }

  // Histórico de cargos (somente em edição)
  const histLabel = document.getElementById('historico-section-label');
  const histList  = document.getElementById('historico-cargos-list');
  if (emp?.id && emp?.historico_cargos?.length) {
    histLabel.style.display = '';
    histList.style.display  = '';
    renderHistoricoCargos(emp.historico_cargos);
  } else {
    histLabel.style.display = 'none';
    histList.style.display  = 'none';
  }

  populateModalSelects(emp);

  document.getElementById('modal-overlay').classList.add('open');
  document.getElementById('f-name').focus();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

async function editEmployee(id) {
  const emp = ((await getStore()).employees||[]).find(e=>e.id===id);
  if (!emp) return;
  if (!canEditEmp(emp)) { showToast('⚠️ Sem permissão para editar este funcionário.','warn'); return; }
  openModal(emp);
}

async function deleteEmployee(id) {
  const store = await getStore();
  const emp = (store.employees||[]).find(e=>e.id===id);
  if (!emp) return;
  if (!canDeleteEmp(emp)) { showToast('⚠️ Sem permissão para excluir este funcionário.','warn'); return; }
  const confirmed = await showConfirmModal(`Excluir "<strong>${emp.name}</strong>"?\n\nEsta ação não pode ser desfeita.`);
  if (!confirmed) return;

  const backup = store.employees.filter(e => e.id !== id);
  _store = null;
  _allPonto = null;
  store.employees = backup;

  try {
    await saveStore(store);
  } catch(e) {
    store.employees.push(emp);
    try { await saveStore(store); } catch(e2) { console.warn('[deleteEmployee] Falha ao restaurar backup:', e2); }
    showToast('❌ Erro ao excluir. A operação foi revertida.','error');
    return;
  }

  try {
    const ponto = await LS.get('rh_ponto', {});
    Object.keys(ponto).forEach(function(k) { if (k.startsWith(String(id)+'_')) delete ponto[k]; });
    await LS.set('rh_ponto', ponto);
  } catch(e) { console.warn('[deleteEmployee] Erro ao limpar rh_ponto:', e); }

  try {
    const ocorrencias = await LS.get('rh_ocorrencias', []);
    const filtradas = ocorrencias.filter(function(o) { return String(o.empId) !== String(id); });
    if (filtradas.length !== ocorrencias.length) {
      await LS.set('rh_ocorrencias', filtradas);
    }
  } catch(e) { console.warn('[deleteEmployee] Erro ao limpar rh_ocorrencias:', e); }

  await registrarLog('excluiu', 'Funcionários', `Removeu: <strong>${emp.name}</strong>`);
  showToast('✅ Funcionário excluído.');
}

// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
// VALIDAÇÃO ON BLUR
// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
function showFieldError(id, msg) {
  const el = document.getElementById(id);
  let err = el.parentNode.querySelector('.field-error');
  if (!err) {
    err = document.createElement('div');
    err.className = 'field-error';
    err.style.cssText = 'font-size:11px;color:#f87171;margin-top:4px;display:flex;align-items:center;gap:4px';
    el.parentNode.appendChild(err);
  }
  err.innerHTML = '⚠️ ' + msg;
  el.style.borderColor = '#f87171';
}
function clearFieldError(id) {
  const el = document.getElementById(id);
  const err = el.parentNode.querySelector('.field-error');
  if (err) err.remove();
  el.style.borderColor = '';
}
function validateField(id, checkFn, msg) {
  const val = document.getElementById(id).value.trim();
  if (!val || !checkFn(val)) { showFieldError(id, msg); return false; }
  clearFieldError(id);
  return true;
}
function validateFieldRequired(id, label) {
  const val = document.getElementById(id).value.trim();
  if (!val) { showFieldError(id, label + ' é obrigatório.'); return false; }
  clearFieldError(id);
  return true;
}
function validateMatriculaOnBlur() {
  const val = document.getElementById('f-matricula').value.trim();
  if (!val) { showFieldError('f-matricula', 'Matrícula é obrigatória.'); return false; }
  if (!/^\d+$/.test(val)) { showFieldError('f-matricula', 'Apenas números.'); return false; }
  if (val.length > 6) { showFieldError('f-matricula', 'Máx. 6 dígitos.'); return false; }
  clearFieldError('f-matricula');
  return true;
}
function limparValidacao(e) {
  clearFieldError(e.id);
}

// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
// SALVAR
// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
let _saving = false;
async function saveEmployee() {
  if (_saving) return;
  _saving = true;
  const btn = document.querySelector('button[onclick="saveEmployee()"]');
  if (btn) btn.textContent = '⏳ Salvando...';
  try {
  const name = document.getElementById('f-name').value.trim();
  if (!name) { showToast('⚠️ Nome é obrigatório.','warn'); document.getElementById('f-name').focus(); return; }

  const editId = document.getElementById('f-edit-id').value;
  const newRole = document.getElementById('f-role').value;
  const newDept = document.getElementById('f-dept').value;
  const newFilial  = document.getElementById('f-filial').value;
  const newTurno = document.getElementById('f-turno').value;
  const matricula  = document.getElementById('f-matricula').value.trim();
  const supervisor = document.getElementById('f-supervisor').value;

  if (!matricula) { showToast('⚠️ Matrícula é obrigatória.','warn'); document.getElementById('f-matricula').focus(); return; }
  if (!/^\d+$/.test(matricula)) { showToast('⚠️ Matrícula deve conter apenas números.','warn'); document.getElementById('f-matricula').focus(); return; }
  if (matricula.length > 6) { showToast('⚠️ Matrícula deve ter no máximo 6 dígitos.','warn'); document.getElementById('f-matricula').focus(); return; }
  if (!newDept) { showToast('⚠️ Selecione o departamento.','warn'); document.getElementById('f-dept').focus(); return; }
  if (!newRole) { showToast('⚠️ Selecione a função/cargo.','warn'); document.getElementById('f-role').focus(); return; }
  if (!newFilial) { showToast('⚠️ Selecione a filial.','warn'); document.getElementById('f-filial').focus(); return; }
  if (!newTurno)  { showToast('⚠️ Selecione o turno.','warn'); document.getElementById('f-turno').focus();  return; }
  if (!supervisor) { showToast('⚠️ Selecione o responsável.','warn'); document.getElementById('f-supervisor').focus(); return; }
  const dataAdmissao = document.getElementById('f-data-admissao').value || null;

  const podeDemitir  = canDemitirEmp();
  const novoDemitido = podeDemitir ? document.getElementById('f-demitido').checked : false;
  const dataDemissao = novoDemitido ? (document.getElementById('f-data-demissao').value || null)  : null;
  const motivoDemissao = novoDemitido ? (document.getElementById('f-motivo-demissao').value.trim() || '') : '';

  if (novoDemitido && !dataDemissao) {
    showToast('⚠️ Informe a data de demissão.','warn');
    document.getElementById('f-data-demissao').focus(); return;
  }
  if (novoDemitido && !motivoDemissao) {
    showToast('⚠️ Informe o motivo da demissão.','warn');
    document.getElementById('f-motivo-demissao').focus(); return;
  }

  const store = await getStore();
  if (!store.employees) store.employees = [];

  const dupMat = (store.employees || []).find(e =>
    e.matricula === matricula &&
    String(e.id) !== String(editId)
  );
  if (dupMat) {
    showToast(`⚠️ Matrícula "${matricula}" já está em uso por ${dupMat.name}.`,'warn');
    document.getElementById('f-matricula').focus(); return;
  }

  const afastado = document.getElementById('f-afastado').checked;
  const ferias = document.getElementById('f-ferias').checked;
  const maternidade = document.getElementById('f-maternidade').checked;
  const data_afastamento = afastado ? (document.getElementById('f-data-afastamento').value||null) : null;
  const data_ferias_inicio = ferias ? (document.getElementById('f-ferias-inicio').value||null) : null;
  const data_ferias_fim = ferias ? (document.getElementById('f-ferias-fim').value||null) : null;
  const data_maternidade = maternidade ? (document.getElementById('f-data-maternidade').value||null) : null;
  const data_maternidade_fim = maternidade ? (document.getElementById('f-data-maternidade-fim').value||null) : null;

  const leaderSection = document.getElementById('leader-fields');
  const podeCamposLider = leaderSection.style.display !== 'none';
  const loginId = podeCamposLider ? document.getElementById('f-login-id').value.trim() : '';
  const pass = podeCamposLider ? document.getElementById('f-pass').value : '';
  const nivel = podeCamposLider ? document.getElementById('f-nivel').value : '';

  // Validação de líder: se cargo é liderança, login/senha/nivel são obrigatórios
  const cargoEhLideranca = newRole && isLeadershipRole(newRole);
  if (cargoEhLideranca || podeCamposLider) {
    if (!loginId) {
      showToast('⚠️ Defina um ID de acesso para o cargo de liderança.','warn');
      document.getElementById('f-login-id').focus(); return;
    }
    if (!nivel) {
      showToast('⚠️ Selecione o nível de acesso para o cargo de liderança.','warn');
      document.getElementById('f-nivel').focus(); return;
    }
    if (!editId && pass.length < 6) {
      showToast('⚠️ Defina uma senha com mínimo 6 caracteres para o nível de acesso.','warn');
      document.getElementById('f-pass').focus(); return;
    }
    if (editId && pass && pass.length < 6) {
      showToast('⚠️ A senha deve ter no mínimo 6 caracteres.','warn');
      document.getElementById('f-pass').focus(); return;
    }
    if (!editId && store.employees.some(e => e.login_id === loginId)) {
      showToast('⚠️ Este ID de acesso já está em uso.','warn');
      document.getElementById('f-login-id').focus(); return;
    }
  }

  const dataFields = {
    name,
    dept: newDept, role: newRole, filial: newFilial, turno: newTurno,
    matricula,
    perf: parseInt(document.getElementById('f-perf').value)||70,
    perf_history: { [currentMonthKey()]: parseInt(document.getElementById('f-perf').value)||70 },
    year: new Date().getFullYear(),
    afastado, data_afastamento,
    ferias, data_ferias_inicio, data_ferias_fim,
    maternidade, data_maternidade, data_maternidade_fim,
    supervisor_id:  document.getElementById('f-supervisor').value || null,
    foto: document.getElementById('f-foto').value || null,
    data_admissao: dataAdmissao,
    demitido: novoDemitido,
    data_demissao: dataDemissao,
    motivo_demissao: motivoDemissao,
    login_id: loginId || null,
    nivel: nivel || null,
  };

  if (editId) {
    const idx = store.employees.findIndex(e => String(e.id) === String(editId));
    if (idx < 0) { showToast('❌ R Funcionário não encontrado.','error'); return; }

    const old = store.employees[idx];
    let historico_cargos = old.historico_cargos ? [...old.historico_cargos] : [];
    const oldRole = old.role;
    const eraDemitido  = !!old.demitido;

    // Detectar mudança de cargo   promoção ou transferência
    if (oldRole && newRole && oldRole !== newRole && !novoDemitido) {
      const isPromocao = await perguntarPromocao(oldRole, newRole);
      historico_cargos.push({
        cargo: newRole, dept: newDept, filial: newFilial, turno: newTurno,
        data:  new Date().toISOString().split('T')[0],
        tipo:  isPromocao ? 'promocao' : 'transferencia',
      });
    }

    // Novo desligamento  exige confirmação explícita (ação irreversível)
    if (novoDemitido && !eraDemitido) {
      const confirmado = await perguntarDemissao(name);
      if (!confirmado) return; // usuário cancelou  não salva nada
    }

    // Registra no histórico de cargos
    if (novoDemitido && !eraDemitido) {
      historico_cargos.push({
        cargo:  old.role || '❌ ',
        dept: old.dept || '',
        filial: old.filial || '',
        turno:  old.turno  || '',
        data: dataDemissao,
        tipo: 'desligamento',
        motivo: motivoDemissao,
      });
    }

    // Supervisor: se vazio, remove explicitamente (null = sem supervisor)
    if (!dataFields.supervisor_id) {
      dataFields.supervisor_id = null;
    }
    // Senha: se não foi preenchida no form, mantém a existente
    if (!pass) dataFields.pass = old.pass || null;
    else dataFields.pass = pass;
    // Deduplica histórico (mesmo cargo+tipo+data só aparece uma vez)
    historico_cargos = historico_cargos.filter((h, i, arr) =>
      i === arr.findIndex(x => x.cargo === h.cargo && x.tipo === h.tipo && x.data === h.data)
    );
    const merged = { ...old, ...dataFields, historico_cargos };
    merged.perf_history = { ...(old.perf_history||{}), ...(dataFields.perf_history||{}) };
    store.employees[idx] = merged;
  } else {
    // Novo funcionário
    const newId = Date.now();
    const historico_cargos = [];
    if (newRole) {
      historico_cargos.push({
        cargo: newRole, dept: newDept, filial: newFilial, turno: newTurno,
        data:  dataAdmissao || new Date().toISOString().split('T')[0],
        tipo:  'admissao',
      });
    }
    const selectedSup = document.getElementById('f-supervisor').value;
    const supervisor_id = selectedSup || String(currentUser.id);
    const novoEmp = { id: newId, ...dataFields, historico_cargos, supervisor_id, pass: pass || null };
    store.employees.push(novoEmp);
    if (!dataAdmissao) await criarOcorrenciaAdmissaoFaltando(novoEmp);
  }

  // Persiste no Firebase PRIMEIRO, depois mostra feedback
  try {
    await saveStore(store);
    _store = null;
    _allPonto = null;
    closeModal();

    if (!editId) {
      await registrarLog('criou', 'Funcionários', `Novo registro: <strong>${name}</strong> · ${newDept||''}`);
      showToast('✅ Funcionário cadastrado!');
    } else {
      await registrarLog('editou', 'Funcionários', `<strong>${name}</strong> · dados atualizados`);
      if (novoDemitido && !eraDemitido) {
        const dtFmt = dataDemissao
          ? new Date(dataDemissao + 'T00:00:00').toLocaleDateString('pt-BR') : '❌';
        await registrarLog('desligou', 'Funcionários',
          `🔴 Desligamento de <strong>${name}</strong> — Data: ${dtFmt}` +
          (motivoDemissao ? ` — Motivo: ${motivoDemissao}` : ''));
        showToast('🔴 Funcionário desligado e movido para desligados.');
      } else {
        showToast('✅ Funcionário atualizado!');
      }
    }

    const urlParams = new URLSearchParams(window.location.search);
    const editEmpId = urlParams.get('editEmpId');
    if (editEmpId) {
      const ocorrencias = await LS.get('rh_ocorrencias', []);
      const occ = ocorrencias.find(o => String(o.empId) === editEmpId && o.tipo?.toLowerCase() === 'ajuste' && o.status === 'pendente');
      if (occ) {
        window.location.href = `ocorrencias.html?openOcorrenciaId=${occ.id}`;
        return;
      }
    }
  } catch (e) {
    console.error('[saveEmployee]', e);
    showToast('🔴 Erro ao salvar. Verifique sua conexão e tente novamente.', 'error');
  }
} finally {
  _saving = false;
  const btn = document.querySelector('button[onclick="saveEmployee()"]');
  if (btn) btn.textContent = '💾 Salvar Funcionário';
}
}

// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
// TOGGLE AFASTADO / F0RIAS / MATERNIDADE
// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
function toggleAfastado() {
  const checked = document.getElementById('f-afastado').checked;
  document.getElementById('afastado-date-wrap').style.display = checked ? 'block' : 'none';
  if (checked && !document.getElementById('f-data-afastamento').value) {
    document.getElementById('f-data-afastamento').value = new Date().toISOString().split('T')[0];
  }
}

function calcFimFerias() {
  const inicioVal = document.getElementById('f-ferias-inicio').value;
  if (!inicioVal) return;
  const inicio = new Date(inicioVal + 'T00:00:00');
  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 29); // 30 dias corridos = início + 29
  document.getElementById('f-ferias-fim').value = fim.toISOString().split('T')[0];
}

function toggleFerias() {
  const checked = document.getElementById('f-ferias').checked;
  document.getElementById('ferias-date-wrap').style.display = checked ? 'block' : 'none';
  if (checked) {
    const hoje = new Date();
    if (!document.getElementById('f-ferias-inicio').value)
      document.getElementById('f-ferias-inicio').value = hoje.toISOString().split('T')[0];
    // Sempre recalcula o fim com base no início informado
    calcFimFerias();
  }
}

function calcRetornoMaternidade() {
  const inicioVal = document.getElementById('f-data-maternidade').value;
  if (!inicioVal) return;
  const inicio = new Date(inicioVal + 'T00:00:00');
  const retorno = new Date(inicio);
  retorno.setDate(retorno.getDate() + 119);
  document.getElementById('f-data-maternidade-fim').value = retorno.toISOString().split('T')[0];
}

function toggleMaternidade() {
  const checked = document.getElementById('f-maternidade').checked;
  document.getElementById('maternidade-date-wrap').style.display = checked ? 'block' : 'none';
  if (checked) {
    const hoje = new Date();
    if (!document.getElementById('f-data-maternidade').value)
      document.getElementById('f-data-maternidade').value = hoje.toISOString().split('T')[0];
    // Sempre recalcula o retorno com base no início informado
    calcRetornoMaternidade();
  }
}

// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
// TRANSFERIR FUNCIONÁRIO
// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
async function openTransferModal(id) {
  const store = await getStore();
  const emp = (store.employees||[]).find(e=>e.id===id);
  if (!emp) return;

  const opt = (list, curVal) =>
    `<option value="">— Manter atual (${escHtml(curVal||'—')}) —</option>` +
    list.map(x=>`<option value="${x.nome||x.name}">${escHtml(x.nome||x.name)}</option>`).join('');

  document.getElementById('tr-emp-name').textContent = emp.name;
  document.getElementById('tr-edit-id').value = id;
  // Popula líderes (busca de store.users E store.employees com nivel)
  const allLeaders = [
    ...Object.values(store.users||{}),
    ...(store.employees||[]).filter(e => e.nivel && e.nivel !== 'admin_master')
  ];
  const leaderAtual = allLeaders.find(u=>u.id===emp.supervisor_id);
  const lideres = allLeaders
    .filter(u=>u.nivel && u.nivel !== 'admin_master')
    .sort((a,b)=>(a.name||'').localeCompare(b.name||'', 'pt-BR'));
  document.getElementById('tr-lider').innerHTML =
    `<option value="">— Manter líder atual (${escHtml(leaderAtual?.name||'—')}) —</option>` +
    lideres.map(u=>`<option value="${u.id}">${escHtml(u.name)} · ${escHtml(u.nivel||'')}</option>`).join('');

  document.getElementById('tr-dept').innerHTML = opt(store.depts||[], emp.dept);
  document.getElementById('tr-role').innerHTML = opt(store.funcoes||[], emp.role);
  document.getElementById('tr-filial').innerHTML = opt(store.filiais||[], emp.filial);
  document.getElementById('tr-turno').innerHTML  = opt(store.turnos||[],  emp.turno);

  document.getElementById('modal-transfer').classList.add('open');
}

function closeTransferModal() {
  document.getElementById('modal-transfer').classList.remove('open');
}

async function saveTransfer() {
  const id = document.getElementById('tr-edit-id').value;
  const store = await getStore();
  const idx = (store.employees||[]).findIndex(e=>String(e.id)===String(id));
  if (idx < 0) { showToast('❌ R Funcionário não encontrado.','error'); return; }

  const backup = JSON.parse(JSON.stringify(store.employees[idx]));

  const dept = document.getElementById('tr-dept').value;
  const role = document.getElementById('tr-role').value;
  const filial = document.getElementById('tr-filial').value;
  const turno  = document.getElementById('tr-turno').value;

  if (dept) store.employees[idx].dept = dept;
  if (role) store.employees[idx].role = role;
  if (filial) store.employees[idx].filial = filial;
  if (turno)  store.employees[idx].turno  = turno;

  const novoLider = document.getElementById('tr-lider').value;
  if (novoLider) {
    store.employees[idx].supervisor_id = String(novoLider);
  }

  try {
    _store = null;
    _allPonto = null;
    _metricsCache = {};
    await saveStore(store);
    closeTransferModal();
    await registrarLog('editou', 'Funcionários', `Transferiu: <strong>${store.employees[idx]?.name||''}</strong>`);
    showToast('✅ Funcionário transferido!');
  } catch (e) {
    store.employees[idx] = backup;
    console.error('[saveTransfer]', e);
    showToast('❌ Erro ao transferir. Alterações revertidas.', 'err');
  }
}

document.getElementById('modal-transfer').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeTransferModal();
});
document.getElementById('modal-transfer').addEventListener('keydown', e => {
  if (e.key === 'Escape') closeTransferModal();
});

// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
// OCORR`NCIA DO FUNCIONÁRIO
// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
async function openOcorrenciaModal(id, tipo) {
  const store = await getStore();
  const emp = (store.employees||[]).find(e=>e.id===id);
  if (!emp) return;

  document.getElementById('oc-target-name').textContent = emp.name;
  document.getElementById('oc-edit-id').value = id;
  document.getElementById('oc-tipo-ref').value  = 'funcionario';
  document.getElementById('oc-tipo').value = '';
  document.getElementById('oc-desc').value = '';
  const _agora = new Date();
  _agora.setMinutes(_agora.getMinutes() - _agora.getTimezoneOffset());
  document.getElementById('oc-data').value = _agora.toISOString().slice(0,16);

  document.getElementById('modal-ocorrencia-emp').classList.add('open');
}

function closeOcorrenciaModal() {
  document.getElementById('modal-ocorrencia-emp').classList.remove('open');
}

async function saveOcorrencia() {
  const refId = document.getElementById('oc-edit-id').value;
  const tipo  = document.getElementById('oc-tipo').value;
  const desc  = document.getElementById('oc-desc').value.trim();
  const data  = document.getElementById('oc-data').value;

  if (!tipo) { showToast('⚠️ Selecione o tipo de ocorrência.','warn'); return; }
  if (!desc) { showToast('⚠️ Descreva a ocorrência.','warn'); document.getElementById('oc-desc').focus(); return; }

  const store  = await getStore();
  const emp = (store.employees||[]).find(e=>String(e.id)===String(refId));

  // Salva em rh_ocorrencias  mesma chave que ocorrencias.html lê
  const novaOcorrencia = {
    id: uid(),
    ts: (() => {
      if (!data) return new Date().toISOString();
      const d = new Date(data);
      return isNaN(d) ? new Date().toISOString() : d.toISOString();
    })(),
    empId: emp?.id,
    empName: emp?.name  || '❌ ',
    empDept: emp?.dept  || '❌ ',
    tipo,
    desc,
    obs: '',
    status: 'pendente',
    respName:  currentUser.name,
    respId: currentUser.id,
    createdAt: new Date().toISOString(),
  };
  await window.DB.setMerge('rh_ocorrencias', (current) => {
    const list = Array.isArray(current) ? [...current] : [];
    list.unshift(novaOcorrencia);
    return list;
  });
  await registrarLog('criou', 'Ocorrências', `Ocorrência <strong>${tipo}</strong> para <strong>${emp?.name||'❌ '}</strong>`);
  closeOcorrenciaModal();
  showToast('✅ Ocorrência registrada!');
}

document.getElementById('modal-ocorrencia-emp').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeOcorrenciaModal();
});
document.getElementById('modal-ocorrencia-emp').addEventListener('keydown', e => {
  if (e.key === 'Escape') closeOcorrenciaModal();
});

// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
// FECHAR MODAL AO CLICAR FORA
// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

//  Foto do funcionário 
function processarFoto(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    showToast('⚠️ A foto deve ter no máximo 2 MB.','warn');
    input.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      canvas.width  = 80;
      canvas.height = 80;
      const ctx = canvas.getContext('2d');
      // Crop centralizado
      const size = Math.min(img.width, img.height);
      const sx = (img.width  - size) / 2;
      const sy = (img.height - size) / 2;
      ctx.drawImage(img, sx, sy, size, size, 0, 0, 80, 80);
      const base64 = canvas.toDataURL('image/jpeg', 0.65);
      document.getElementById('f-foto').value = base64;
      document.getElementById('foto-preview-modal').innerHTML =
        `<img src="${base64}" alt="foto">`;
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  input.value = ''; // reset para permitir reselecionar
}

function removerFoto() {
  document.getElementById('f-foto').value = '';
  const nm  = document.getElementById('f-name').value.trim();
  const ini = nm.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase() || '?';
  document.getElementById('foto-preview-modal').innerHTML =
    `<span id="foto-ini-modal">${ini}</span>`;
}


//  Verificação de nome duplicado 
async function verificarNomeDuplicado() {
  const nome = document.getElementById('f-name').value.trim().toLowerCase();
  const editId  = document.getElementById('f-edit-id').value;
  const aviso = document.getElementById('nome-duplicado-aviso');
  aviso.style.display = 'none';
  aviso.innerHTML = '';

  if (!nome || nome.length < 3) return;

  const store = await getStore();
  const dups  = (store.employees || []).filter(e =>
    e.name.toLowerCase() === nome &&
    String(e.id) !== String(editId)
  );

  if (!dups.length) return;

  const allLeaders = [...Object.values(store.users||{}), ...(store.employees||[]).filter(e => e.nivel && e.nivel !== 'admin_master')];
  const itens = dups.map(e => {
    const lider = allLeaders.find(u => u.id === e.supervisor_id);
    return `<div class="dup-item">
      👤 <strong>${escHtml(e.name)}</strong>
      ${e.dept ? ` · 🏢 ${escHtml(e.dept)}` : ''}
      ${e.filial ? ` · 🏭 ${escHtml(e.filial)}` : ''}
      ${e.turno  ? ` · 🕐 ${escHtml(e.turno)}`  : ''}
      ${e.role ? ` · 💼 ${escHtml(e.role)}` : ''}
      ${e.matricula ? ` · 🪪 ${escHtml(e.matricula)}` : ''}
      ${lider ? ` · 👷 ${escHtml(lider.name)}` : ''}
    </div>`;
  }).join('');

  aviso.innerHTML = `⚠️ <strong>Atenção!</strong> Já existe ${dups.length > 1 ? dups.length + ' funcionários' : 'um funcionário'} com este nome:${itens}`;
  aviso.style.display = 'block';
}
// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
// PROMO!ÒO  mini modal com Promise
// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
function perguntarPromocao(oldCargo, newCargo) {
  return new Promise(resolve => {
    _resolvePromocao = resolve;
    document.getElementById('prom-old-cargo').textContent = oldCargo || '❌ ';
    document.getElementById('prom-new-cargo').textContent = newCargo || '❌ ';
    const el = document.getElementById('modal-promocao');
    el.style.display = 'flex';
  });
}
function responderPromocao(isPromocao) {
  document.getElementById('modal-promocao').style.display = 'none';
  if (_resolvePromocao) { _resolvePromocao(isPromocao); _resolvePromocao = null; }
}

// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
// DEMISSÒO  confirmação obrigatória (ação irreversível)
// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
let _resolveDemissao = null;

function perguntarDemissao(nomeEmp) {
  return new Promise(resolve => {
    _resolveDemissao = resolve;
    document.getElementById('demissao-confirm-name').textContent = nomeEmp || '❌ ';
    document.getElementById('modal-demissao-confirm').style.display = 'flex';
  });
}

function responderDemissao(confirmado) {
  document.getElementById('modal-demissao-confirm').style.display = 'none';
  if (_resolveDemissao) { _resolveDemissao(confirmado); _resolveDemissao = null; }
}

// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
// TOGGLE DEMITIDO
// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
function toggleDemitido() {
  const checked = document.getElementById('f-demitido').checked;
  document.getElementById('demitido-date-wrap').style.display = checked ? 'block' : 'none';
  if (checked && !document.getElementById('f-data-demissao').value)
    document.getElementById('f-data-demissao').value = new Date().toISOString().split('T')[0];
}

// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
// HISTRICO DE CARGOS  render no modal
// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
function renderHistoricoCargos(historico) {
  const el = document.getElementById('historico-cargos-list');
  if (!historico || !historico.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:8px 0">Nenhum histórico registrado.</div>'; return;
  }
  const CFG = {
    admissao: { icon:'📌', label:'Admissão', cls:'admissao' },
    promocao: { icon:'⭐', label:'Promoção', cls:'promocao' },
    transferencia: { icon:'🔄', label:'Transferência', cls:'transferencia' },
    desligamento:  { icon:'🔴', label:'Desligamento',  cls:'desligamento'  },
  };
  const hist = historico.filter((h, i, arr) =>
    i === arr.findIndex(x => x.cargo === h.cargo && x.tipo === h.tipo && x.data === h.data)
  );
  el.innerHTML = [...hist].reverse().map(h => {
    const c = CFG[h.tipo] || { icon:'📝', label:'Registro', cls:'admissao' };
    const data = h.data ? new Date(h.data+'T00:00:00').toLocaleDateString('pt-BR') : '❌';
    const info = [h.dept, h.filial, h.turno].filter(Boolean).join(' · ');
    return `<div class="historico-item">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:17px;flex-shrink:0">${c.icon}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700;color:var(--text)">${escHtml(h.cargo||'❌')}</div>
          ${info?`<div style="font-size:11px;color:var(--muted);margin-top:2px">${escHtml(info)}</div>`:''}
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div><span class="hist-tipo-badge ${c.cls}">${c.label}</span></div>
          <div style="font-size:10px;color:var(--muted);margin-top:4px">${data}</div>
        </div>
      </div>
      ${h.motivo?`<div style="margin-top:6px;font-size:11px;color:var(--muted);padding-left:27px;font-style:italic">"${escHtml(h.motivo)}"</div>`:''}
    </div>`;
  }).join('');
}

// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
// CARD DEMITIDO
// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
function buildCardDemitido(emp) {
  const c = computeMetricsCache(emp);
  const ini = (emp.name||'?').split(' ').map(x=>x[0]).filter(Boolean).slice(0,2).join('').toUpperCase() || '??';
  const dtAdm = emp.data_admissao ? new Date(emp.data_admissao+'T00:00:00').toLocaleDateString('pt-BR') : '❌ ';
  const dtDem = emp.data_demissao ? new Date(emp.data_demissao+'T00:00:00').toLocaleDateString('pt-BR') : '❌ ';
  const promos = (emp.historico_cargos||[]).filter(h=>h.tipo==='promocao').length;
  let tempoStr = '';
  if (emp.data_admissao && emp.data_demissao) {
    const ms = new Date(emp.data_demissao+'T00:00:00') - new Date(emp.data_admissao+'T00:00:00');
    const dias = Math.max(0, Math.round(ms/86400000));
    const anos = Math.floor(dias/365);
    const meses = Math.floor((dias%365)/30);
    tempoStr = anos>0 ? `${anos}a ${meses}m` : `${meses} mês${meses!==1?'es':''}`;
  }
  return `<div class="emp-card demitido-card">
    <div class="emp-banner demitido">🔴 DESLIGADO</div>
    <div class="emp-card-header" style="margin-top:26px;opacity:.75">
      <div class="emp-avatar" style="background:linear-gradient(135deg,#f87171,#fb923c)">
        ${emp.foto?`<img src="${escHtml(emp.foto)}" style="width:42px;height:42px;border-radius:50%;object-fit:cover;filter:grayscale(.4)">`:ini}
      </div>
      <div class="emp-info">
        <div class="emp-name" style="color:var(--muted)">${escHtml(emp.name)}</div>
        <div class="emp-role">${escHtml(emp.role||'')}${emp.dept?' · '+escHtml(emp.dept):''}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px;opacity:.85">
      <div style="text-align:center;padding:6px;background:var(--surface2);border-radius:8px;border:1px solid var(--border)">
        <div style="font-family:var(--font-head);font-size:11px;font-weight:800;color:var(--muted)">${dtAdm}</div>
        <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-top:2px">Admissão</div>
      </div>
      <div style="text-align:center;padding:6px;background:var(--surface2);border-radius:8px;border:1px solid var(--border)">
        <div style="font-family:var(--font-head);font-size:11px;font-weight:800;color:#f87171">${dtDem}</div>
        <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-top:2px">Demissão</div>
      </div>
      <div style="text-align:center;padding:6px;background:var(--surface2);border-radius:8px;border:1px solid var(--border)">
        <div style="font-family:var(--font-head);font-size:11px;font-weight:800;color:var(--accent)">${tempoStr||'❌'}</div>
        <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-top:2px">Período</div>
      </div>
    </div>
    <div class="emp-metrics" style="opacity:.7">
      <div class="emp-metric"><div class="emp-metric-val apt">${c.aptAvg}</div><div class="emp-metric-label">Apt./10</div></div>
      <div class="emp-metric"><div class="emp-metric-val faltas">${c.totalAbs}</div><div class="emp-metric-label">Faltas</div></div>
      <div class="emp-metric"><div class="emp-metric-val" style="color:var(--green)">${promos}</div><div class="emp-metric-label">Promoções</div></div>
      <div class="emp-metric"><div class="emp-metric-val" style="color:var(--accent2)">${c.score}</div><div class="emp-metric-label">Score</div></div>
    </div>
    ${emp.motivo_demissao?`<div style="margin:6px 0;padding:7px 10px;border-radius:8px;background:rgba(248,113,113,.06);border:1px solid rgba(248,113,113,.15);font-size:11px;color:var(--muted)"><strong style="color:#f87171">Motivo:</strong> ${emp.motivo_demissao.length>80?emp.motivo_demissao.slice(0,80)+'⬦':emp.motivo_demissao}</div>`:''}
    ${emp.matricula?`<div class="emp-matricula" style="opacity:.6">🪪 <strong>${emp.matricula}</strong></div>`:''}
    <div class="emp-actions-bottom">
      ${canDeleteEmp(emp) ? `<button class="emp-btn del" data-action="del" data-id="${emp.id}" title="Excluir permanentemente" style="margin-right:auto">🗑️ Excluir</button>` : ''}
      <button class="emp-btn pdf" data-action="pdf" data-id="${emp.id}" style="width:auto;padding:0 12px;font-size:11px;font-weight:600;gap:5px" title="Relatório PDF">
        📄 Relatório PDF
      </button>
    </div>
  </div>`;
}

// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
// VERIFICAR ADMISSÒO FALTANDO
// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
async function verificarAdmissaoFaltando() {
  try {
    const emps = getMyEmployees().filter(e => !e.demitido && !e.data_admissao);
    if (!emps.length) return;
    const lista = await LS.get('rh_ocorrencias', []);
    const agora = new Date().toISOString();
    let novas = 0;
    for (const emp of emps) {
      const jaExiste = lista.some(o =>
        String(o.empId) === String(emp.id) && o.tipo?.toLowerCase() === 'ajuste' && (o.desc||'').includes('data de admissão')
      );
      if (jaExiste) continue;
      lista.unshift({
        id: uid(), ts: agora, empId: emp.id, empName: emp.name||'❌ ', empDept: emp.dept||'❌ ',
        tipo: 'ajuste',
        desc: `⚠️ Preencher a data de admissão de ${emp.name}. Campo obrigatório para relatórios e controle de tempo na empresa.`,
        obs: '', status: 'pendente', respName: 'Sistema', respId: 'sistema', createdAt: agora,
        originalDataAdmissao: null,
      });
      novas++;
    }
      if (novas > 0) {
        await window.DB.setMerge('rh_ocorrencias', (current) => {
          const base = Array.isArray(current) ? [...current] : [];
          lista.forEach(item => { if (!base.some(b => b.id === item.id)) base.unshift(item); });
          return base;
        });
      }
  } catch(e) { console.error('[verificarAdmissaoFaltando]', e); }
}

async function criarOcorrenciaAdmissaoFaltando(emp) {
  try {
    const agora = new Date().toISOString();
    const nova = {
      id: uid(), ts: agora, empId: emp.id, empName: emp.name||'❌ ', empDept: emp.dept||'❌ ',
      tipo: 'ajuste',
      desc: `a️ Preencher a data de admissão de ${emp.name}. Campo obrigatório para relatórios e controle de tempo na empresa.`,
      obs: '', status: 'pendente', respName: currentUser?.name||'Sistema', respId: currentUser?.id||'sistema', createdAt: agora,
      originalDataAdmissao: emp?.data_admissao || null,
    };
    await window.DB.setMerge('rh_ocorrencias', (current) => {
      const list = Array.isArray(current) ? [...current] : [];
      list.unshift(nova);
      return list;
    });
  } catch(e) { console.error('[criarOcorrenciaAdmissaoFaltando]', e); }
}

// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
// GERAR RELATRIO PDF DE DESLIGAMENTO
// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
async function gerarRelatorioPDF(id) {
  if (!window.jspdf) { showToast('⚠️ Biblioteca PDF carregando. Tente novamente.','warn'); return; }
  showToast('✅ Gerando relatório PDF...','ok');
  const store = _store || await getStore();
  const emp = (store.employees||[]).find(e=>e.id===id);
  if (!emp) { showToast('❌ R Funcionário não encontrado.','error'); return; }

  const todasOc  = await LS.get('rh_ocorrencias', []);
  const ocEmp = todasOc.filter(o => String(o.empId) === String(id));
  const allPonto = await LS.get('rh_ponto', {});

  //  Datas 
  const dtAdm = emp.data_admissao ? new Date(emp.data_admissao+'T00:00:00') : null;
  const dtDem = emp.data_demissao ? new Date(emp.data_demissao+'T00:00:00') : new Date();
  let tempoEmpresa = '❌ ';
  let diasTotais = 0;
  if (dtAdm) {
    diasTotais = Math.max(0, Math.round((dtDem - dtAdm) / 86400000));
    const anosT  = Math.floor(diasTotais / 365);
    const mesesT = Math.floor((diasTotais % 365) / 30);
    const diasR  = diasTotais - anosT*365 - mesesT*30;
    if (anosT > 0 && mesesT > 0) tempoEmpresa = `${anosT} ano${anosT>1?'s':''} e ${mesesT} mês${mesesT>1?'es':''}`;
    else if (anosT > 0) tempoEmpresa = `${anosT} ano${anosT>1?'s':''}`;
    else if (mesesT > 0) tempoEmpresa = `${mesesT} mês${mesesT>1?'es':''}`;
    else tempoEmpresa = `${diasTotais} dia${diasTotais>1?'s':''}`;
  }

  //  Faltas  todos os anos 
  const anoInicio = dtAdm ? dtAdm.getFullYear() : (emp.year || new Date().getFullYear());
  const anoFim = dtDem.getFullYear();
  const faltasPorAno = {};
  let totalF = 0, totalA = 0;

  for (let ano = anoInicio; ano <= anoFim; ano++) {
    const meses = [];
    for (let m = 0; m < 12; m++) {
      const key  = `${emp.id}_${ano}_${String(m+1).padStart(2,'0')}`;
      const dias = allPonto[key] || {};
      let faltas = 0, atestados = 0;
      const diasFalta = [];
      Object.entries(dias).forEach(([d, s]) => {
        if (s === 'falta') { faltas++; diasFalta.push(d.padStart(2,'0')); }
        if (s === 'atestado') { atestados++; }
      });
      if (faltas === 0 && atestados === 0 && ano === (emp.year || new Date().getFullYear())) {
        faltas = emp.absences?.[m] || 0;
      }
      meses.push({ mes: MONTHS[m], mesIdx: m, faltas, atestados, diasFalta });
      totalF += faltas;
      totalA += atestados;
    }
    faltasPorAno[ano] = meses;
  }

  const promos  = (emp.historico_cargos||[]).filter(h => h.tipo === 'promocao').length;
  const APT_KEYS_PDF = ['qual','prio','know','comm','prod','assid','org','equip','cria','motv'];
  const aptAvg  = (() => {
    const c = emp.competencies || {};
    return (APT_KEYS_PDF.reduce((s,k) => s+(c[k]||0), 0) / APT_KEYS_PDF.length).toFixed(1);
  })();
  const w_pdf = getWeights(store);
  const score = Math.min(100, Math.round(
    (emp.perf||0) * (w_pdf.perf/100) +
    parseFloat(aptAvg) * 10 * (w_pdf.apt/100) +
    Math.max(0, 100 - (totalF / ((store.config?.maxAbs)||36)) * 100) * (w_pdf.abs/100)
  ));
  const maxAbsVal = store.config?.maxAbs || 36;
  const assidPct  = Math.max(0, Math.round(100 - (totalF / maxAbsVal) * 100));

  // """"""""""""""""""""""""""""""""""""""""""""""""""""
  // PALETA  Branco elegante, corporativo premium
  // """"""""""""""""""""""""""""""""""""""""""""""""""""
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });

  // Cores  tema claro institucional
  const W = [255,255,255]; // branco
  const BG= [246,248,251]; // cinza levíssimo
  const BG2=[237,242,248]; // cinza médio
  const NAVY  = [4, 21, 46]; // azul escuro (quase preto)
  const NAVY2 = [12, 40, 80]; // azul médio
  const RED = [212, 1, 56]; // vermelho Nagumo
  const BLUE  = [2, 54, 101]; // azul Nagumo
  const CYAN  = [60, 203, 219]; // ciano Nagumo
  const GREEN = [10, 124, 78];
  const YELLOW= [180, 83, 9];
  const MUTED = [100, 120, 145];
  const BORDER= [210, 220, 232];
  const TEXT  = [15, 30, 55];
  const GRAY  = [145, 160, 180];

  const lm = 14, rm = 196, pw = rm - lm;
  let y = 0;

  //  Helpers 
  const sf = (style, size, color) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    if (color) doc.setTextColor(...color);
  };
  const fl = (color) => doc.setFillColor(...color);
  const dr = (color, w=0.3) => { doc.setDrawColor(...color); doc.setLineWidth(w); };
  const addPage = (need=18) => {
    if (y + need > 268) {
      doc.addPage();
      _pdfDrawPageBg(doc, W, BG, lm, rm, pw);
      y = 22;
    }
  };

  //  Seção título premium 
  const sectionHeader = (title, _icon, yy) => {
    // barra vermelha esquerda
    fl(RED); doc.rect(lm, yy - 1, 3, 6, 'F');
    // quadrado decorativo (substitui icone Unicode)
    fl(NAVY2); doc.rect(lm + 5, yy + 0.5, 3, 3, 'F');
    sf('bold', 9, NAVY);
    doc.text(title.toUpperCase(), lm + 11, yy + 3.5);
    // linha fina abaixo
    dr(BORDER, 0.3);
    doc.line(lm, yy + 6.5, rm, yy + 6.5);
    return yy + 10;
  };

  // """"""""""""""""""""""""""""""""""""""""""""""""""""
  // PÁGINA 1  CAPA ELEGANTE
  // """"""""""""""""""""""""""""""""""""""""""""""""""""
  // Fundo branco total
  fl(W); doc.rect(0, 0, 210, 297, 'F');

  //  Barra superior Navy  cabeçalho institucional 
  fl(NAVY); doc.rect(0, 0, 210, 48, 'F');

  // Detalhe vermelho lateral esquerdo (marca Nagumo)
  fl(RED); doc.rect(0, 0, 5, 48, 'F');
  // Micro linha ciano
  fl(CYAN); doc.rect(5, 0, 1.5, 48, 'F');

  // Texto do cabeçalho
  sf('bold', 18, W);
  doc.text('CD NAGUMO', lm + 10, 16);
  sf('normal', 8.5, [180, 200, 225]);
  doc.text('Departamento de Recursos Humanos', lm + 10, 23);
  sf('normal', 7, [120, 150, 185]);
  doc.text('Sistema Integrado de Gestao de Pessoas', lm + 10, 30);

  // Badge tipo doc  canto direito
  fl(RED); doc.roundedRect(rm - 58, 12, 58, 14, 2, 2, 'F');
  sf('bold', 7.5, W);
  doc.text('TERMO DE DESLIGAMENTO', rm - 58 + 29, 17, {align:'center'});
  sf('normal', 6.5, [255,200,210]);
  doc.text('Documento Oficial', rm - 58 + 29, 22.5, {align:'center'});

  // Data geração  canto inferior direito do header
  sf('normal', 6.5, [150, 175, 210]);
  doc.text('Gerado em ' + new Date().toLocaleDateString('pt-BR', {day:'2-digit',month:'long',year:'numeric'}), rm, 40, {align:'right'});

  //  Área hero  foto + nome 
  // Card cinza levíssimo abaixo do header
  fl(BG); doc.rect(0, 48, 210, 52, 'F');
  fl(BORDER); doc.rect(0, 99.5, 210, 0.5, 'F');

  // Foto / Avatar
  const avX = lm + 4, avY = 53, avR = 18;
  if (emp.foto && emp.foto.startsWith('data:image')) {
    try {
      fl(W); doc.circle(avX + avR, avY + avR, avR + 2, 'F');
      dr(RED, 1);  doc.circle(avX + avR, avY + avR, avR + 2);
      doc.addImage(emp.foto, 'JPEG', avX, avY, avR*2, avR*2, '', 'FAST');
    } catch(e) { _pdfAvatarBg(doc, emp, avX, avY, avR, NAVY, BLUE, W); }
  } else {
    _pdfAvatarBg(doc, emp, avX, avY, avR, NAVY, BLUE, W);
  }

  // Nome e informações
  const nx = avX + avR*2 + 10;
  sf('bold', 22, NAVY);
  doc.text(emp.name || '-', nx, 66);
  sf('bold', 10, RED);
  doc.text(emp.role || 'Cargo nao informado', nx, 74);
  sf('normal', 8.5, MUTED);
  const infoStr = [emp.dept, emp.filial, emp.turno].filter(Boolean).join('  /  ');
  if (infoStr) doc.text(infoStr, nx, 81);
  if (emp.matricula) {
    sf('normal', 7.5, GRAY);
    doc.text('Matricula: ' + emp.matricula, nx, 88);
  }

  // Badge status DESLIGADO
  fl(RED); doc.roundedRect(nx, 91, 36, 7, 1.5, 1.5, 'F');
  sf('bold', 7, W);
  doc.text('DESLIGADO', nx + 18, 95.8, {align:'center'});

  //  KPIs em 2 linhas de 3 cards  mais espaço para texto 
  y = 108;
  const kpis = [
    { label:'Data de Admissão', value: dtAdm ? dtAdm.toLocaleDateString('pt-BR') : '❌ ', color: BLUE, small: true },
    { label:'Data de Demissão', value: emp.data_demissao ? new Date(emp.data_demissao+'T00:00:00').toLocaleDateString('pt-BR') : '❌ ', color: RED, small: true },
    { label:'Tempo na Empresa', value: tempoEmpresa || '❌ ', color: NAVY2, small: true },
    { label:'Score Final', value: String(score), color: score>=85?GREEN:score>=70?BLUE:score>=55?YELLOW:RED, small: false },
    { label:'Total de Faltas',  value: String(totalF), color: totalF>10?RED:totalF>5?YELLOW:MUTED, small: false },
    { label:'Promoções', value: String(promos), color: promos>0?GREEN:MUTED, small: false },
  ];
  const kCols = 3;
  const kGap  = 4;
  const kW = (pw - kGap * (kCols - 1)) / kCols;
  const kH = 26;
  const kRows = 2;
  kpis.forEach((k, i) => {
    const col = i % kCols;
    const row = Math.floor(i / kCols);
    const kx  = lm + col * (kW + kGap);
    const ky  = y + row * (kH + 4);
    // Card fundo branco com borda suave
    fl(W); doc.roundedRect(kx, ky, kW, kH, 2.5, 2.5, 'F');
    dr(BORDER, 0.3); doc.roundedRect(kx, ky, kW, kH, 2.5, 2.5, 'S');
    // Barra colorida topo
    fl(k.color); doc.roundedRect(kx, ky, kW, 2.5, 1.5, 1.5, 'F');
    // Valor principal
    sf('bold', k.small ? 9 : 14, k.color);
    doc.text(k.value, kx + kW/2, ky + (k.small ? 15 : 16), {align:'center', maxWidth: kW - 4});
    // Label
    sf('normal', 6.5, MUTED);
    doc.text(k.label.toUpperCase(), kx + kW/2, ky + 22.5, {align:'center', maxWidth: kW - 4});
  });
  y += kRows * (kH + 4) + 4;

  // """"""""""""""""""""""""""""""""""""""""""""""""""""
  // SE!ÒO: DESEMPENHO & COMPET`NCIAS
  // """"""""""""""""""""""""""""""""""""""""""""""""""""
  addPage(80);
  y = sectionHeader('Desempenho & Competências', '❌ ', y);

  // 3 indicadores grandes lado a lado  visual corporativo refinado
  const indW = pw / 3 - 3;
  const indH = 32;
  const indItems = [
    { label:'Desempenho Geral', value:`${emp.perf||0}%`,  sub:'meta: 0 70%',  color:(emp.perf||0)>=80?GREEN:(emp.perf||0)>=60?BLUE:RED,  pct:(emp.perf||0) },
    { label:'Aptidao Media', value:`${aptAvg}/10`, sub:'todas as competencias',  color:parseFloat(aptAvg)>=7?GREEN:parseFloat(aptAvg)>=5?BLUE:RED, pct:parseFloat(aptAvg)*10 },
    { label:'Assiduidade', value:`${assidPct}%`, sub:`${totalF} falta${totalF!==1?'s':''} registrada${totalF!==1?'s':''}`, color:assidPct>=80?GREEN:assidPct>=60?YELLOW:RED, pct:assidPct },
  ];

  indItems.forEach((ind, i) => {
    const ix = lm + i * (indW + 4.5);
    // Card fundo BG com borda colorida no topo
    fl(BG); doc.roundedRect(ix, y, indW, indH, 3, 3, 'F');
    dr(ind.color, 0.4); doc.roundedRect(ix, y, indW, indH, 3, 3, 'S');
    // Barra colorida topo mais grossa
    fl(ind.color); doc.roundedRect(ix, y, indW, 3.5, 2, 2, 'F');
    // Valor grande centralizado
    sf('bold', 18, ind.color);
    doc.text(ind.value, ix + indW/2, y + 17, {align:'center'});
    // Label em negrito
    sf('bold', 7.5, TEXT);
    doc.text(ind.label.toUpperCase(), ix + indW/2, y + 24, {align:'center'});
    // Sub-label
    sf('normal', 6, MUTED);
    doc.text(ind.sub, ix + indW/2, y + 28.5, {align:'center', maxWidth: indW - 6});
    // Barra de progresso na parte inferior
    const barY = y + indH - 5;
    fl([220, 230, 242]); doc.roundedRect(ix + 6, barY, indW - 12, 2.5, 1, 1, 'F');
    fl(ind.color); doc.roundedRect(ix + 6, barY, (indW - 12) * (ind.pct / 100), 2.5, 1, 1, 'F');
  });
  y += indH + 8;

  // Grade de competências  2 colunas com divisor central
  addPage(70);
  const APT_LABELS_PDF = {qual:'Qualidade',prio:'Proatividade',know:'Conhecimento',comm:'Comunicacao',prod:'Produtividade',assid:'Assiduidade',org:'Organizacao',equip:'Trab. em Equipe',cria:'Criatividade',motv:'Motivacao'};

  // Título da subseção
  sf('bold', 7.5, MUTED);
  doc.text('AVALIACAO POR COMPETENCIA (0 a 10)', lm, y);
  y += 5;

  const colW2 = (pw - 6) / 2; // largura de cada coluna (com gap de 6mm entre elas)
  const rowH2 = 12; // altura de cada linha de competência
  const totalRows = Math.ceil(APT_KEYS_PDF.length / 2);

  // Fundo do bloco inteiro
  fl([248, 250, 252]); doc.roundedRect(lm, y, pw, totalRows * rowH2 + 4, 2, 2, 'F');
  dr(BORDER, 0.3); doc.roundedRect(lm, y, pw, totalRows * rowH2 + 4, 2, 2, 'S');

  // Linha divisória central vertical
  dr([200, 215, 230], 0.4);
  doc.line(lm + colW2 + 3, y + 2, lm + colW2 + 3, y + totalRows * rowH2 + 2);

  APT_KEYS_PDF.forEach((k, i) => {
    const val = emp.competencies?.[k] ?? 5;
    const col = i % 2;
    const row = Math.floor(i / 2);
    const bx = lm + col * (colW2 + 6) + 3;
    const by = y + 2 + row * rowH2;
    const barColor = val >= 8 ? GREEN : val >= 6 ? BLUE : val >= 4 ? YELLOW : RED;

    // Fundo alternado por linha (aplica nas 2 colunas ao mesmo tempo)
    if (col === 0 && row % 2 === 0) {
      fl([240, 244, 250]);
      doc.rect(lm + 0.5, by, pw - 1, rowH2 - 0.5, 'F');
    }

    // Quadrado colorido indicador
    fl(barColor); doc.rect(bx, by + 4, 3, 3, 'F');

    // Label da competência
    sf('bold', 7.5, TEXT);
    doc.text(APT_LABELS_PDF[k], bx + 5, by + 7);

    // Nota numérica + /10
    sf('bold', 9, barColor);
    doc.text(`${val}`, bx + colW2 - 22, by + 7.5, {align:'right'});
    sf('normal', 6.5, MUTED);
    doc.text('/10', bx + colW2 - 14, by + 7.5, {align:'right'});

    // Mini barra de progresso
    const barX  = bx + colW2 - 13;
    const barW  = 12;
    fl(BG2); doc.roundedRect(barX, by + 4.5, barW, 2.5, 1, 1, 'F');
    fl(barColor); doc.roundedRect(barX, by + 4.5, barW * (val / 10), 2.5, 1, 1, 'F');
  });

  y += totalRows * rowH2 + 8;

  // """"""""""""""""""""""""""""""""""""""""""""""""""""
  // SE!ÒO: MOTIVO DO DESLIGAMENTO
  // """"""""""""""""""""""""""""""""""""""""""""""""""""
  if (emp.motivo_demissao) {
    addPage(30);
    y = sectionHeader('Motivo do Desligamento', '❌ 0', y);
    const mLines = doc.splitTextToSize(emp.motivo_demissao, pw - 18);
    const boxH = Math.max(20, mLines.length * 5.5 + 12);
    // Card vermelho sutil
    fl([255, 243, 245]); doc.roundedRect(lm, y, pw, boxH, 2.5, 2.5, 'F');
    dr([245, 190, 200], 0.4); doc.roundedRect(lm, y, pw, boxH, 2.5, 2.5, 'S');
    fl(RED); doc.roundedRect(lm, y, 4, boxH, 1.5, 1.5, 'F');
    // Texto
    sf('bold', 7.5, RED);
    doc.text('DECLARACAO OFICIAL', lm + 9, y + 7);
    sf('normal', 8.5, TEXT);
    doc.text(mLines, lm + 9, y + 13.5);
    y += boxH + 8;
  }

  // """"""""""""""""""""""""""""""""""""""""""""""""""""
  // SE!ÒO: HISTRICO DE CARGOS
  // """"""""""""""""""""""""""""""""""""""""""""""""""""
  const hist = emp.historico_cargos || [];
  addPage(24);
  y = sectionHeader('Trajetória na Empresa', '❌ ', y);

  if (!hist.length) {
    sf('italic', 8, MUTED);
    doc.text('Nenhum histórico de cargo registrado.', lm + 4, y + 5);
    y += 12;
  } else {
    const TIPO_CFG2 = {
      admissao: { label:'ADMISSAO', color: BLUE, dot:[2,54,101]  },
      promocao: { label:'PROMOCAO', color: GREEN,  dot:[10,124,78] },
      transferencia: { label:'TRANSFERENCIA', color: YELLOW, dot:[180,83,9]  },
      desligamento:  { label:'DESLIGAMENTO',  color: RED, dot:[212,1,56]  },
    };

    hist.forEach((h, hi) => {
      addPage(16);
      const tc  = TIPO_CFG2[h.tipo] || { label:'REGISTRO', color: MUTED, dot: MUTED };
      const dH  = h.data ? new Date(h.data+'T00:00:00').toLocaleDateString('pt-BR') : '❌ ';
      const inf = [h.dept, h.filial, h.turno].filter(Boolean).join(' / ');
      const isLast = hi === hist.length - 1;

      // Linha do timeline
      fl(hi % 2 === 0 ? BG : W); doc.roundedRect(lm, y, pw, 13, 1.5, 1.5, 'F');

      // Dot do timeline
      fl(tc.dot); doc.circle(lm + 5, y + 6.5, 2.5, 'F');

      // Tipo badge
      sf('bold', 6.5, tc.color);
      doc.text(tc.label, lm + 13, y + 5.5);
      // Cargo
      sf('bold', 9, NAVY);
      doc.text(h.cargo || '-', lm + 13, y + 10);
      // Info contextual
      if (inf) { sf('normal', 7, MUTED); doc.text(inf, lm + 60, y + 10); }
      // Data
      sf('normal', 7, MUTED);
      doc.text(dH, rm, y + 8, {align:'right'});
      y += 14;
    });
    y += 2;
  }

  // """"""""""""""""""""""""""""""""""""""""""""""""""""
  // SE!ÒO: REGISTRO DE AUS`NCIAS
  // """"""""""""""""""""""""""""""""""""""""""""""""""""
  addPage(30);
  const anosComDados2 = Object.keys(faltasPorAno).map(Number).sort();
  y = sectionHeader(`Registro de Ausências  (${anoInicio}${anoFim!==anoInicio?'  '+anoFim:''})`, '❌ 0', y);

  if (totalF === 0 && totalA === 0) {
    fl([235, 252, 243]); doc.roundedRect(lm, y, pw, 14, 2, 2, 'F');
    dr([150, 220, 180], 0.3); doc.roundedRect(lm, y, pw, 14, 2, 2, 'S');
    fl(GREEN); doc.roundedRect(lm, y, 4, 14, 1.5, 1.5, 'F');
    sf('bold', 8.5, GREEN);
    doc.text('Excelente assiduidade - nenhuma falta ou atestado registrado.', lm + 9, y + 9);
    y += 20;
  } else {
    for (const ano of anosComDados2) {
      const meses = faltasPorAno[ano];
      const comDados2 = meses.filter(m => m.faltas > 0 || m.atestados > 0);
      if (!comDados2.length) continue;

      addPage(14);
      // Cabeçalho do ano
      fl(NAVY2); doc.roundedRect(lm, y, pw, 8, 1.5, 1.5, 'F');
      sf('bold', 9, W);
      doc.text(String(ano), lm + 5, y + 5.5);
      const anoF2 = meses.reduce((a,b)=>a+b.faltas,0);
      const anoA2 = meses.reduce((a,b)=>a+b.atestados,0);
      sf('normal', 7.5, [180, 210, 240]);
      doc.text(`${anoF2} falta${anoF2!==1?'s':''} / ${anoA2} atestado${anoA2!==1?'s':''}`, rm - 4, y + 5.5, {align:'right'});
      y += 10;

      comDados2.forEach((fm, fi) => {
        addPage(9);
        fl(fi % 2 === 0 ? BG : W); doc.roundedRect(lm, y, pw, 8, 1, 1, 'F');

        // Mês
        sf('bold', 8, TEXT);
        doc.text(`${fm.mes}/${ano}`, lm + 4, y + 5.5);

        // Faltas badge
        if (fm.faltas > 0) {
          fl(fm.faltas>=5?RED:[255,220,225]);
          doc.roundedRect(lm + 30, y + 1.5, 18, 5, 1.5, 1.5, 'F');
          sf('bold', 7, fm.faltas>=5?W:RED);
          doc.text(`${fm.faltas} falta${fm.faltas>1?'s':''}`, lm + 39, y + 5, {align:'center'});
        }

        // Atestados badge
        if (fm.atestados > 0) {
          fl([230, 240, 255]);
          doc.roundedRect(lm + 51, y + 1.5, 22, 5, 1.5, 1.5, 'F');
          sf('bold', 7, BLUE);
          doc.text(`${fm.atestados} atestado${fm.atestados>1?'s':''}`, lm + 62, y + 5, {align:'center'});
        }

        // Dias específicos
        if (fm.diasFalta.length) {
          sf('normal', 6.5, MUTED);
          const dStr = 'Dias: ' + fm.diasFalta.sort((a,b)=>+a-+b).join(', ');
          doc.text(dStr, lm + 76, y + 5.5, {maxWidth: pw - 72});
        }

        y += 9;
      });
      y += 4;
    }
  }

  // """"""""""""""""""""""""""""""""""""""""""""""""""""
  // SE!ÒO: OCORR`NCIAS
  // """"""""""""""""""""""""""""""""""""""""""""""""""""
  addPage(28);
  y = sectionHeader('Ocorrências Registradas', '❌ ', y);

  const TIPO_OC_CLR = {
    Justificativa: BLUE, Ajuste: YELLOW, 'Ocorrência': [200,80,0],
    Entrada: GREEN, Saída: RED, Advertência: RED, Elogio: GREEN,
  };

  if (!ocEmp.length) {
    sf('italic', 8.5, MUTED);
    doc.text('Nenhuma ocorrencia registrada durante o vinculo.', lm + 4, y + 5);
    y += 14;
  } else {
    ocEmp.forEach((oc, oi) => {
      const ocDt  = oc.ts ? new Date(oc.ts).toLocaleDateString('pt-BR') : '❌ ';
      const ocCor = TIPO_OC_CLR[oc.tipo] || MUTED;
      const dL = oc.desc ? doc.splitTextToSize(oc.desc, pw - 22) : [];
      const boxH  = 10 + (dL.length > 0 ? dL.length * 4.5 + 3 : 0);
      addPage(boxH + 4);

      fl(oi % 2 === 0 ? BG : W); doc.roundedRect(lm, y, pw, boxH, 1.5, 1.5, 'F');
      dr(BORDER, 0.3); doc.roundedRect(lm, y, pw, boxH, 1.5, 1.5, 'S');

      // Barra colorida lateral
      fl(ocCor); doc.roundedRect(lm, y, 3.5, boxH, 1, 1, 'F');

      // Badge tipo
      fl(ocCor.map ? ocCor : ocCor);
      const badgeW = doc.getTextWidth((oc.tipo||'❌ ').toUpperCase()) / 2.835 * 0.6 + 10;
      fl([...ocCor.map(v=>Math.min(255,v+160))]);
      doc.roundedRect(lm+7, y+2, badgeW, 5, 1, 1, 'F');
      sf('bold', 6.5, ocCor);
      doc.text((oc.tipo||'-').toUpperCase(), lm+7+badgeW/2, y+5.5, {align:'center'});

      // Data
      sf('normal', 7, MUTED);
      doc.text(ocDt, rm - 2, y + 6, {align:'right'});

      // Responsável
      sf('normal', 6.5, MUTED);
      doc.text('por: ' + (oc.respName||'-'), rm - 2, y + 10.5, {align:'right'});

      // Descrição
      if (dL.length) {
        sf('normal', 7.5, TEXT);
        doc.text(dL, lm + 7, y + 13);
      }
      y += boxH + 4;
    });
  }

  // """"""""""""""""""""""""""""""""""""""""""""""""""""
  // RODAP0 + ASSINATURA em todas as páginas
  // """"""""""""""""""""""""""""""""""""""""""""""""""""
  const totalPags = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPags; p++) {
    doc.setPage(p);

    // Linha separadora do rodapé
    fl(BG2); doc.rect(0, 278, 210, 0.8, 'F');
    fl(W); doc.rect(0, 278.8, 210, 18.2, 'F');

    // Detalhe vermelho lateral no rodapé
    fl(RED); doc.rect(0, 278, 5, 18.5, 'F');

    sf('bold', 7.5, NAVY);
    doc.text('CD NAGUMO', lm + 2, 285);
    sf('normal', 6.5, MUTED);
    doc.text('CD NAGUMO - RH Performance', lm + 2, 290);
    doc.text('Documento gerado eletronicamente - nao requer assinatura fisica', lm + 2, 294.5);

    sf('bold', 7.5, NAVY);
    doc.text(emp.name, rm, 283, {align:'right'});
    sf('normal', 6.5, MUTED);
    doc.text('Desligado em ' + (emp.data_demissao ? new Date(emp.data_demissao+'T00:00:00').toLocaleDateString('pt-BR') : '-'), rm, 288, {align:'right'});

    // Paginação
    sf('bold', 6.5, [200, 215, 230]);
    doc.text(`${p} / ${totalPags}`, 105, 293, {align:'center'});

    // Linha de assinatura apenas na última página
    if (p === totalPags) {
      addPage(30);
      // Bloco de assinaturas
      const sigY = y + 6;
      if (sigY < 265) {
        dr(BORDER, 0.3);
        // Assinatura colaborador
        doc.line(lm, sigY + 20, lm + 78, sigY + 20);
        sf('normal', 7, MUTED);
        doc.text('Assinatura do Colaborador', lm + 39, sigY + 24, {align:'center'});
        sf('bold', 7, TEXT);
        doc.text(emp.name || '-', lm + 39, sigY + 28, {align:'center'});

        // Assinatura RH
        doc.line(rm - 78, sigY + 20, rm, sigY + 20);
        sf('normal', 7, MUTED);
        doc.text('Responsavel de RH', rm - 39, sigY + 24, {align:'center'});
        sf('bold', 7, TEXT);
        doc.text('Departamento de Recursos Humanos', rm - 39, sigY + 28, {align:'center'});

        // Data e cidade
        sf('normal', 7, MUTED);
        const hoje = new Date();
        doc.text(`${[emp.filial||''].filter(Boolean).join('')}${emp.filial?', ':''}` +
          hoje.toLocaleDateString('pt-BR', {day:'2-digit',month:'long',year:'numeric'}),
          105, sigY + 34, {align:'center'});
      }
    }
  }

  const arq = `relatorio_desligamento_${emp.name.replace(/\s+/g,'_')}_${new Date().toLocaleDateString('pt-BR').replace(/\//g,'-')}.pdf`;
  doc.save(arq);
  showToast('✅ Relatório PDF gerado com sucesso!','ok');
}

//  Auxiliares de PDF 
function _pdfDrawPageBg(doc, W, BG, lm, rm, pw) {
  doc.setFillColor(...W); doc.rect(0, 0, 210, 297, 'F');
}

function _pdfAvatarBg(doc, emp, x, y, r, NAVY, BLUE, W) {
  // Fundo gradiente simulado (dois círculos)
  doc.setFillColor(...BLUE); doc.circle(x+r, y+r, r+1.5, 'F');
  doc.setFillColor(...NAVY); doc.circle(x+r+2, y+r-2, r, 'F');
  // Anel branco externo
  doc.setDrawColor(255,255,255);
  doc.setLineWidth(1.2);
  doc.circle(x+r, y+r, r+1.5);
  // Iniciais
  const ini = (emp.name||'?').split(' ').map(w=>w[0]).filter(Boolean).slice(0,2).join('').toUpperCase() || '??';
  doc.setFont('helvetica','bold'); doc.setFontSize(r*1.1); doc.setTextColor(...W);
  doc.text(ini, x+r, y+r+r*0.38, {align:'center'});
}

//  Auto-refresh: re-renderiza quando dados chegam via sync 
window.addEventListener('page-refresh', async function () {
  console.log('[Employees] Dados atualizados, re-renderizando...');
  _store = null;
  _allPonto = null;
  _metricsCache = {};
  setTimeout(function () { renderCards(); }, 0);
});

