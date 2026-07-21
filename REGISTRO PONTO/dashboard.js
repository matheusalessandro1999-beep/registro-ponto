// ════════════════════════════════════════════════════════
// PAINEL IFRAME FULLSCREEN
// ════════════════════════════════════════════════════════
function openPage(url) {
  const panel  = document.getElementById('page-panel');
  const iframe = document.getElementById('page-iframe');
  const btn    = document.getElementById('panel-close-btn');
  iframe.src   = url;
  panel.classList.add('open');
  btn.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closePanel() {
  const panel  = document.getElementById('page-panel');
  const iframe = document.getElementById('page-iframe');
  const btn    = document.getElementById('panel-close-btn');
  panel.classList.remove('open');
  btn.style.display = 'none';
  document.body.style.overflow = '';
  setTimeout(() => { iframe.src = ''; }, 280);
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });

// ════════════════════════════════════════════════════════
// ESTADO
// ════════════════════════════════════════════════════════
let currentUser    = null;
let chartInstances = {};
let _store         = null;
let _debounceTimer = null;
let _metricsCache  = {};
let _ocorrenciasCache = null;
let _rendering     = false;
let selectedMonthKey = currentMonthKey();
let selectedDept     = '';

var DEPT_COLORS = ['#4f8ef7','#34d399','#f472b6','#fb923c','#a78bfa','#22d3ee','#fbbf24','#f87171','#60a5fa','#4ade80'];

// ════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  await bootSync();
  await ensureAdmin();

  const id    = LS_LOCAL.get('rh_session');
  const store = await getStore();
  if (!id || (!store.users[id] && !(store.employees||[]).find(e => e.login_id === id))) { window.location.href = 'login.html'; return; }
  currentUser = store.users[id] || (store.employees||[]).find(e => e.login_id === id);

  if (typeof canSee === 'function' && !canSee(currentUser, 'dashboard')) {
    showToast && showToast('❌ Acesso negado.','error');
    setTimeout(() => window.location.href = 'login.html', 2000); return;
  }

  initTheme();
  initSidebar('dashboard', currentUser);
  await renderDashboard();

  const podeAvaliar = (typeof can==='function') ? can(currentUser,'aptidoes','edit') : true;
  if (podeAvaliar) await verificarAlertaAptidoes();
  hideLoading();
});

// ════════════════════════════════════════════════════════
// ALERTA DE APTIDÕES PENDENTES
// ════════════════════════════════════════════════════════
async function verificarAlertaAptidoes() {
  if (sessionStorage.getItem('apt_alerta_visto')) return;

  const mesAtualKey = currentMonthKey();

  _store = _store || await getStore();
  let meusFuncs = getMyEmployees().filter(e => !e.afastado && !e.maternidade && !e.demitido);

  const pendentes = meusFuncs.filter(e => !(e.competencies_history||{})[mesAtualKey]);
  if (!pendentes.length) return;

  const lista = document.getElementById('apt-alert-list');
  const sub   = document.getElementById('apt-alert-sub');

  sub.innerHTML = `<strong style="color:var(--accent2)">${pendentes.length} funcionário${pendentes.length>1?'s':''}</strong> sem avaliação de aptidões em ${new Date().toLocaleString('pt-BR',{month:'long'})}.
    <br>Avalie as competências para manter os scores atualizados.`;

  lista.innerHTML = pendentes.map(e => {
    const ini = e.name.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();
    const temAlguma = !!(e.competencies_history && Object.keys(e.competencies_history).length);
    return `
    <div class="apt-alert-emp">
      <div class="apt-alert-emp-avatar">${ini}</div>
      <div style="flex:1;min-width:0">
        <div class="apt-alert-emp-name">${e.name}</div>
        <div class="apt-alert-emp-dept">${e.dept||''}${e.role?' · '+e.role:''}</div>
      </div>
      <div class="apt-alert-emp-badge">${temAlguma ? '📅 Mês pendente' : '🆕 Nunca avaliado'}</div>
    </div>`;
  }).join('');
}

window.addEventListener('page-refresh', async function () {
  console.log('[Dashboard] Dados atualizados via sync, re-renderizando...');
  _store = null; _metricsCache = {}; _ocorrenciasCache = null;
  setTimeout(function () { debouncedRender(); }, 100);
});

function fecharAlertaApt() {
  sessionStorage.setItem('apt_alerta_visto', '1');
  document.getElementById('apt-alert-overlay').style.display = 'none';
}

function irParaAptidoes() {
  sessionStorage.setItem('apt_alerta_visto', '1');
  document.getElementById('apt-alert-overlay').style.display = 'none';
  window.location.href = 'pages/aptidoes.html';
}

function sair() {
  if (!confirm('Deseja sair?')) return;
  LS_LOCAL.remove('rh_session');
  window.close();
  setTimeout(() => { window.location.href = 'login.html'; }, 300);
}

function doLogout() { sair(); }

function debounce(fn, ms) {
  return function(...args) {
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => fn.apply(this, args), ms);
  };
}

function computeMetrics(emps) {
  _metricsCache = {};
  emps.forEach(e => {
    const score  = calcScore(e);
    const assid  = Math.round(calcAssid(e));
    const aptAvg = calcAptMedia(e).toFixed(1);
    _metricsCache[e.id] = { score, assid, aptAvg };
  });
}

// ════════════════════════════════════════════════════════
// SCORE HELPERS (alinhados com shared.js)
// ════════════════════════════════════════════════════════
function currentMonthKey() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;
}
function calcAptMedia(emp) {
  const snap = (emp.competencies_history||{})[selectedMonthKey];
  if (snap) return APT_KEYS.reduce((s,k) => s+(snap[k]||0), 0) / APT_KEYS.length;
  const c = emp.competencies || {};
  return APT_KEYS.reduce((s,k) => s+(c[k]||0), 0) / APT_KEYS.length;
}
function calcAssid(emp) {
  if (emp.afastado || emp.maternidade) return 100;
  const mesIdx = getSelectedMonthIndex();
  const total  = (emp.absences||[])[mesIdx] || 0;
  const maxAbs = Math.round((_store?.config?.maxAbs || 36) / 12);
  return Math.max(0, 100-(total/maxAbs)*100);
}
function calcScore(emp) {
  const w = getWeights(_store);
  const perf = (emp.perf_history||{})[selectedMonthKey] ?? emp.perf ?? 0;
  return Math.min(100, Math.round(
    perf*(w.perf/100) + calcAptMedia(emp)*10*(w.apt/100) + calcAssid(emp)*(w.abs/100)
  ));
}
function getMyEmployees() {
  return getSupervisedEmployees(currentUser);
}
function getSelectedMonthIndex() {
  return parseInt(selectedMonthKey.split('-')[1]) - 1;
}
function changeMonth(value) {
  selectedMonthKey = value;
  debouncedRender();
}
function changeDept(value) {
  selectedDept = value;
  debouncedRender();
}
function monthOptionsHTML(selected) {
  const now = new Date();
  let html = '';
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    html += `<option value="${key}"${key===selected?' selected':''}>${label}</option>`;
  }
  return html;
}

// ════════════════════════════════════════════════════════
// RENDER DASHBOARD
// ════════════════════════════════════════════════════════
async function renderDashboard() {
  if (_rendering) return;
  _rendering = true;
  try {
    document.getElementById('dash-date').textContent =
      new Date().toLocaleDateString('pt-BR',{ weekday:'long', year:'numeric', month:'long', day:'numeric' });

    _store = await getStore();
    const store = _store;

    const pPonto  = (typeof can==='function') ? can(currentUser,'ponto','edit')      : true;
    const pApt    = (typeof can==='function') ? can(currentUser,'aptidoes','edit')   : true;
    const pReport = (typeof can==='function') ? canSee(currentUser,'report')         : true;
    const pCreate = (typeof can==='function') ? can(currentUser,'employees','create'): true;

    const todosEmps = getMyEmployees();
    const filiais   = (store.filiais||[]).map(f=>f.nome).filter(Boolean);
    const turnos    = (store.turnos||[]).map(t=>t.nome).filter(Boolean);
    const depts     = [...new Set(todosEmps.map(e=>e.dept))].filter(Boolean).sort();

    const optFilial  = `<option value="">🏭 Todas as filiais</option>` +
      filiais.map(f=>`<option value="${f}">${f}</option>`).join('');
    const optTurno   = `<option value="">🕐 Todos os turnos</option>` +
      turnos.map(t=>`<option value="${t}">${t}</option>`).join('');
    const optDept    = `<option value="">🏢 Todos os setores</option>` +
      depts.map(d=>`<option value="${d}">${d}</option>`).join('');

    const prevFilial = document.getElementById('dash-filter-filial')?.value || '';
    const prevTurno  = document.getElementById('dash-filter-turno')?.value  || '';
    const prevDept   = document.getElementById('dash-filter-dept')?.value   || selectedDept;

    document.getElementById('topbar-actions').innerHTML = `
      <select class="dash-filter-select" id="dash-filter-mes" onchange="changeMonth(this.value)">${monthOptionsHTML(selectedMonthKey)}</select>
      ${depts.length    ? `<select class="dash-filter-select" id="dash-filter-dept"   onchange="changeDept(this.value)">${optDept}</select>`   : ''}
      ${filiais.length  ? `<select class="dash-filter-select" id="dash-filter-filial" onchange="debouncedRender()">${optFilial}</select>` : ''}
      ${turnos.length   ? `<select class="dash-filter-select" id="dash-filter-turno"  onchange="debouncedRender()">${optTurno}</select>`   : ''}
      ${pPonto  ? `<a class="btn btn-cyan"    href="pages/ponto.html"      onclick="">🗓️ Ponto Diário</a>`        : ''}
      ${pApt    ? `<a class="btn btn-purple"  href="pages/aptidoes.html"   onclick="">🎯 Aptidões</a>`            : ''}
      ${pReport ? `<a class="btn btn-green"   href="pages/report.html"     onclick="">📄 Relatório</a>`            : ''}
      ${pCreate ? `<a class="btn btn-primary" href="pages/employees.html"  onclick="">＋ Novo Funcionário</a>`     : ''}`;

    if (prevFilial && document.getElementById('dash-filter-filial'))
      document.getElementById('dash-filter-filial').value = prevFilial;
    if (prevTurno && document.getElementById('dash-filter-turno'))
      document.getElementById('dash-filter-turno').value = prevTurno;
    if (prevDept && document.getElementById('dash-filter-dept'))
      document.getElementById('dash-filter-dept').value = prevDept;

    const filialFiltro = document.getElementById('dash-filter-filial')?.value || '';
    const turnoFiltro  = document.getElementById('dash-filter-turno')?.value  || '';
    const deptFiltro   = document.getElementById('dash-filter-dept')?.value   || '';

    let emps = todosEmps;
    if (deptFiltro)   emps = emps.filter(e => e.dept   === deptFiltro);
    if (filialFiltro) emps = emps.filter(e => e.filial === filialFiltro);
    if (turnoFiltro)  emps = emps.filter(e => e.turno  === turnoFiltro);

    computeMetrics(emps);

    await renderKPIs(emps);
    renderCharts(emps);
    renderTop5(emps);
  } finally { _rendering = false; }
}

const debouncedRender = debounce(renderDashboard, 200);

async function getPendentesCount() {
  const filialFiltro = document.getElementById('dash-filter-filial')?.value || '';
  const turnoFiltro  = document.getElementById('dash-filter-turno')?.value  || '';
  const deptFiltro   = document.getElementById('dash-filter-dept')?.value  || '';

  let meusEmps = getMyEmployees();
  if (deptFiltro)   meusEmps = meusEmps.filter(e => e.dept   === deptFiltro);
  if (filialFiltro) meusEmps = meusEmps.filter(e => e.filial === filialFiltro);
  if (turnoFiltro)  meusEmps = meusEmps.filter(e => e.turno  === turnoFiltro);

  const meusIds = new Set(meusEmps.map(e => String(e.id)));

  if (!_ocorrenciasCache) _ocorrenciasCache = await LS.get('rh_ocorrencias', []);
  const ocs = _ocorrenciasCache.filter(o => o.status === 'pendente' && meusIds.has(String(o.empId)));

  return ocs.length;
}

// ── KPIs ──────────────────────────────────────────────
async function renderKPIs(emps) {
  const total    = emps.length;
  const avgPerf  = total ? Math.round(emps.reduce((s,e)=>s+((e.perf_history||{})[selectedMonthKey] ?? e.perf ?? 0),0)/total) : 0;
  const avgAssid = total ? Math.round(emps.reduce((s,e)=>s+(_metricsCache[e.id]?.assid||0),0)/total) : 0;
  const mesIdx   = getSelectedMonthIndex();
  const totalAbs = emps.reduce((s,e)=>s+((e.absences||[])[mesIdx]||0),0);
  const avgApt   = total ? (emps.reduce((s,e)=>s+parseFloat(_metricsCache[e.id]?.aptAvg||0),0)/total).toFixed(1) : '0.0';
  const promos   = emps.filter(e=>(_metricsCache[e.id]?.score||0)>=85).length;
  const [anoSel, mesSel] = selectedMonthKey.split('-').map(Number);
  const fimMes = new Date(anoSel, mesSel, 0, 23, 59, 59);
  const afas = emps.filter(e => {
    if (e.afastado && e.data_afastamento) return new Date(e.data_afastamento+'T00:00:00') <= fimMes;
    if (e.maternidade && e.data_maternidade) return new Date(e.data_maternidade+'T00:00:00') <= fimMes;
    return false;
  });
  const pendentes = await getPendentesCount();

  const mesLabel = new Date(parseInt(selectedMonthKey.split('-')[0]), parseInt(selectedMonthKey.split('-')[1])-1)
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const aptPendentes = emps.filter(e => !e.afastado && !e.maternidade && !(e.competencies_history||{})[selectedMonthKey]).length;
  const ehMesAtual = selectedMonthKey === currentMonthKey();
  const aptSubText = aptPendentes > 0
    ? `⚠️ ${aptPendentes} sem avaliação`
    : '✅ todos avaliados';

  const kpiItems = [
    { cls:'blue',   label:'Funcionários',       value:total,     sub:'equipe total' },
    { cls:'green',  label:'Desempenho Médio',   value:avgPerf+'%', sub:mesLabel },
    { cls:'cyan',   label:'Assiduidade Média',  value:avgAssid+'%', sub:`${totalAbs} faltas · ${mesLabel}` },
    { cls:'purple', label:'Aptidões Médias',    value:avgApt+'/10', sub:aptSubText,
      alerta: aptPendentes > 0, onclick: aptPendentes > 0 ? "irParaAptidoes()" : "" },
    { cls:'yellow', label:'Candidatos Promoção', value:promos,   sub:'score ≥ 85' },
    { cls:'red',    label:'🚫 Afastados / 🤰 Mat.', value:afas.length,
      sub:afas.length ? afas.slice(0,2).map(e=>e.name.split(' ')[0]).join(', ')+(afas.length>2?'…':'') : 'nenhum afastado' },
    { cls:'orange', label:'📝 Ocorrências',     value:pendentes, sub:'pendentes de aprovação' },
  ];

  document.getElementById('kpi-grid').innerHTML = kpiItems.map(k => {
    const alertCls = k.alerta ? ' alerta-pendente' : '';
    const onclk    = k.onclick ? ` onclick="${k.onclick}"` : '';
    return `
    <div class="kpi-card ${k.cls}${alertCls}"${onclk}${k.alerta?' title="Clique para avaliar aptidões pendentes"':''}>
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value">${k.value}</div>
      <div class="kpi-sub">${k.sub}</div>
    </div>`;
  }).join('');
}

// ── Charts ────────────────────────────────────────────
function destroyChart(id) {
  if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; }
}
const TOOLTIP_BASE = {
  backgroundColor:'#1a1e2e', borderColor:'#2a2f45', borderWidth:1,
  titleColor:'#e2e8f0', bodyColor:'#94a3b8',
};
const SCALES_BASE = {
  x:{ grid:{ color:'rgba(42,47,69,.6)' }, ticks:{ color:'#64748b', font:{ size:10 } } },
  y:{ grid:{ color:'rgba(42,47,69,.6)' }, ticks:{ color:'#64748b', font:{ size:10 } } },
};
function renderCharts(emps) {
  const depts    = [...new Set(emps.map(e=>e.dept))].filter(Boolean).sort();
  const deptAvgs = depts.map(d => {
    const a = emps.filter(e=>e.dept===d);
    return Math.round(a.reduce((s,e)=>s+((e.perf_history||{})[selectedMonthKey] ?? e.perf ?? 0),0)/a.length);
  });
  destroyChart('chart-dept');
  chartInstances['chart-dept'] = new Chart(document.getElementById('chart-dept'), {
    type:'bar',
    data:{ labels:depts, datasets:[{ data:deptAvgs,
      backgroundColor:depts.map((_,i)=>DEPT_COLORS[i%DEPT_COLORS.length]+'B3'),
      borderColor:    depts.map((_,i)=>DEPT_COLORS[i%DEPT_COLORS.length]),
      borderWidth:2, borderRadius:6 }] },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false }, tooltip:{ ...TOOLTIP_BASE, callbacks:{ label:ctx=>` ${ctx.parsed.y}%` } } },
      scales:{ ...SCALES_BASE, y:{ ...SCALES_BASE.y, max:100, ticks:{ ...SCALES_BASE.y.ticks, callback:v=>v+'%' } } } },
  });

  const [anoSel, mesSel] = selectedMonthKey.split('-').map(Number);
  const meses = [];
  const mAbs = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(anoSel, mesSel - 1 - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    const rotulo = d.toLocaleDateString('pt-BR', { month: 'short' }) + (y !== anoSel ? `/${y}` : '');
    meses.push(rotulo);
    mAbs.push(emps.reduce((s, e) => s + ((e.absences||[])[m]||0), 0));
  }
  destroyChart('chart-monthly');
  chartInstances['chart-monthly'] = new Chart(document.getElementById('chart-monthly'), {
    type:'line',
    data:{ labels:meses, datasets:[{ data:mAbs,
      borderColor:'#f87171', backgroundColor:'rgba(248,113,113,.1)',
      fill:true, tension:0.4,
      pointRadius:         mAbs.map((_,i)=>i===mAbs.length-1?7:4),
      pointBackgroundColor:mAbs.map((_,i)=>i===mAbs.length-1?'#fbbf24':'#f87171') }] },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false }, tooltip:{ ...TOOLTIP_BASE, callbacks:{ label:ctx=>` ${ctx.parsed.y} faltas` } } },
      scales:SCALES_BASE },
  });

  const sc = { promo:0, ok:0, watch:0, risk:0 };
  emps.forEach(e => sc[getStatus(_metricsCache[e.id]?.score||0).tag]++);
  destroyChart('chart-status');
  chartInstances['chart-status'] = new Chart(document.getElementById('chart-status'), {
    type:'doughnut',
    data:{ labels:['🏆 Promoção','✅ Regular','⚠️ Atenção','🔴 Risco'],
      datasets:[{ data:[sc.promo,sc.ok,sc.watch,sc.risk],
        backgroundColor:['rgba(52,211,153,.8)','rgba(79,142,247,.8)','rgba(251,191,36,.8)','rgba(248,113,113,.8)'],
        borderColor:['#34d399','#4f8ef7','#fbbf24','#f87171'], borderWidth:2 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'65%',
      plugins:{ legend:{ labels:{ color:'#94a3b8', font:{ size:11 }, padding:16 }, position:'top' },
        tooltip:{ ...TOOLTIP_BASE, callbacks:{ label:ctx=>{
          const pct = emps.length ? Math.round((ctx.parsed/emps.length)*100) : 0;
          return ` ${ctx.parsed} funcionário(s) — ${pct}%`;
        }}}}},
  });
}

// ── Top 5 ─────────────────────────────────────────────
function renderTop5(emps) {
  const sorted = [...emps].sort((a,b)=> (_metricsCache[b.id]?.score||0) - (_metricsCache[a.id]?.score||0)).slice(0,5);
  const medals = ['🥇','🥈','🥉','4°','5°'];
  const cores  = ['#fbbf24','#94a3b8','#c2855a','#64748b','#64748b'];
  if (!sorted.length) {
    document.getElementById('top5-list').innerHTML =
      '<div style="color:var(--muted);padding:30px;text-align:center;font-size:13px">Nenhum funcionário cadastrado ainda.</div>';
    return;
  }
  document.getElementById('top5-list').innerHTML = sorted.map((e,i) => {
    const c     = _metricsCache[e.id] || {};
    const score = c.score || 0;
    const st    = getStatus(score);
    const assid = c.assid || 0;
    const aptAvg = c.aptAvg || '0.0';
    const ini   = e.name.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();
    return `
    <div class="top5-item">
      <div class="top5-medal" style="color:${cores[i]}">${medals[i]}</div>
      <div class="top5-avatar">${ini}</div>
      <div class="top5-info">
        <div class="top5-name">${e.name}</div>
        <div class="top5-dept">${e.dept}</div>
        <div style="display:flex;gap:8px;margin-top:3px;font-size:10px">
          <span style="color:#4f8ef7">🎯 ${(e.perf_history||{})[selectedMonthKey] ?? e.perf ?? 0}%</span>
          <span style="color:#a78bfa">⭐ ${aptAvg}</span>
          <span style="color:${assid>=70?'#34d399':'#f87171'}">📅 ${assid}%</span>
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div class="top5-score">${score}</div>
        <span class="tag ${st.cls}">${st.label}</span>
      </div>
    </div>`;
  }).join('');
}
