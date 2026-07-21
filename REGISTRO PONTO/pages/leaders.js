// ════════════════════════════════════════════════════════
// CONSTANTES
// ════════════════════════════════════════════════════════
// APT_KEYS em shared.js

const NIVEL_META = {
  admin_master: { label:'Admin Master', emoji:'\u{1F6E1}\uFE0F', cor:'#f87171' },
  diretoria:    { label:'Diretoria',    emoji:'\u{1F3E2}', cor:'#fb923c' },
  gerencia:     { label:'Ger\u00EAncia',     emoji:'\u{1F4CA}', cor:'#fbbf24' },
  coordenacao:  { label:'Coordena\u00E7\u00E3o',  emoji:'\u{1F4CB}', cor:'#a78bfa' },
  encarregado:  { label:'Encarregado',  emoji:'\u{1F530}', cor:'#22d3ee' },
  lider:        { label:'L\u00EDder',        emoji:'\u{1F477}', cor:'#4f8ef7' },
};
const HIERARQUIA_ORDER = ['diretoria','gerencia','coordenacao','encarregado','lider'];
const ORDEM_IDX        = ['lider','encarregado','coordenacao','gerencia','diretoria'];
let _showDemitidosFlag = false;

const HIER_LABEL = {
  diretoria:   { text:'\u{1F3E2} Diretoria',           cls:'diretoria'   },
  gerencia:    { text:'\u{1F4CA} Ger\u00EAncia',            cls:'gerencia'    },
  coordenacao: { text:'\u{1F4CB} Coordena\u00E7\u00E3o',         cls:'coordenacao' },
  encarregado: { text:'\u{1F530} Encarregado',         cls:'encarregado' },
  lider:       { text:'\u{1F477} Lideran\u00E7a Operacional', cls:'lider'     },
};

// ════════════════════════════════════════════════════════
// ESTADO
// ════════════════════════════════════════════════════════
let currentUser   = null;
let _store        = null;
let _allPonto     = {};
let _treeRootId   = null;
let _treePath     = [];

// ════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  currentUser = await requireSession();
  if (!currentUser) return;
  if (typeof canSee === 'function' && !canSee(currentUser, 'leaders')) {
    showToast && showToast('❌ Acesso negado.','error');
    setTimeout(() => window.location.href = '../index.html', 2000); return;
  }
  initTheme();
  initSidebar('leaders', currentUser);
  const isAdmin = getUserPerfil(currentUser) === 'admin_master';
  renderLeaders();
  hideLoading();
});

// ════════════════════════════════════════════════════════
// SCORE HELPERS (síncronos — usam cache _store/_allPonto; getWeights em shared.js)
// ════════════════════════════════════════════════════════
function calcAptMedia(emp) {
  const c = emp.competencies || {};
  return APT_KEYS.reduce((s,k)=>s+(c[k]||0),0) / APT_KEYS.length;
}
function getTotalFaltasEmp(emp) {
  try {
    const ano = emp.year || new Date().getFullYear();
    let total    = 0;
    let temDados = false;
    for (let m = 0; m < 12; m++) {
      const key  = `${emp.id}_${ano}_${String(m+1).padStart(2,'0')}`;
      const dias = _allPonto[key] || {};
      if (Object.keys(dias).length > 0) temDados = true;
      Object.entries(dias).forEach(([diaStr, s]) => {
        if (new Date(ano, m, parseInt(diaStr)).getDay() === 0) return;
        if (s === 'falta') total += 1;
      });
    }
    return temDados ? total : (emp.absences||[]).reduce((a,b)=>a+b, 0);
  } catch(e) { return (emp.absences||[]).reduce((a,b)=>a+b, 0); }
}
function calcAssid(emp) {
  if (emp.afastado || emp.maternidade) return 100;
  const total  = getTotalFaltasEmp(emp);
  const maxAbs = _store?.config?.maxAbs || 36;
  return Math.max(0, 100 - (total / maxAbs) * 100);
}
function calcBonus(emp) {
  const BONUS_POR_DIA = 0.5, BONUS_MAX = 5;
  try {
    const ano = emp.year || new Date().getFullYear();
    const feriadosCustom = _store?.config?.feriadosCustom || [];
    const ferNac = [{d:1,m:0},{d:21,m:3},{d:1,m:4},{d:7,m:8},{d:12,m:9},{d:2,m:10},{d:15,m:10},{d:25,m:11}];
    let diasBonus = 0;
    for (let m = 1; m <= 12; m++) {
      const key  = `${emp.id}_${ano}_${String(m).padStart(2,'0')}`;
      const dias = _allPonto[key] || {};
      Object.entries(dias).forEach(([dStr, status]) => {
        if (status !== 'presente') return;
        const d = parseInt(dStr), dow = new Date(ano,m-1,d).getDay();
        if (dow === 0) { diasBonus++; return; }
        if (ferNac.some(f=>f.d===d&&f.m===(m-1))) { diasBonus++; return; }
        const mesStr=String(m).padStart(2,'0'), diaStr=String(d).padStart(2,'0');
        if (feriadosCustom.some(f=>f.chave===`${mesStr}-${diaStr}`)) diasBonus++;
      });
    }
    return Math.min(BONUS_MAX, diasBonus * BONUS_POR_DIA);
  } catch(e) { return 0; }
}
function calcScore(emp) {
  const w = getWeights();
  const base = emp.perf*(w.perf/100)+calcAptMedia(emp)*10*(w.apt/100)+calcAssid(emp)*(w.abs/100);
  return Math.min(100, Math.round(base + calcBonus(emp)));
}

// ════════════════════════════════════════════════════════
// HELPERS DE ESCOPO
// ════════════════════════════════════════════════════════
function getMeusDepts(leader) {
  const depts = leader.perfil?.depts || [];
  const setor = leader.setor || '';
  return [...new Set([...depts, ...(setor ? [setor] : [])])];
}
function getMeusFiliais(leader) {
  const arr = leader.perfil?.filiais;
  if (arr && arr.length) return arr;
  return leader.perfil?.filial ? [leader.perfil.filial] : [];
}
function getMeusTurnos(leader) {
  const arr = leader.perfil?.turnos;
  if (arr && arr.length) return arr;
  return leader.perfil?.turno ? [leader.perfil.turno] : [];
}
function getEffectiveFiliais(leader, allEmps) {
  const explicit = getMeusFiliais(leader);
  if (explicit.length) return explicit;
  const ownedFiliais = [...new Set(
    allEmps.filter(e => e.filial && String(e.supervisor_id||e.owner_id||e.ownerId)===String(leader.id)).map(e=>e.filial)
  )];
  if (ownedFiliais.length) return ownedFiliais;
  const depts  = getMeusDepts(leader);
  const turnos = getMeusTurnos(leader);
  if (!depts.length) return [];
  return [...new Set(
    allEmps.filter(e => {
      const dOk = depts.includes(e.dept);
      const tOk = turnos.length ? turnos.includes(e.turno) : true;
      return dOk && tOk && e.filial;
    }).map(e=>e.filial)
  )];
}
function getTeamEmps(leader, allEmps) {
  const depts  = getMeusDepts(leader);
  const turnos = getMeusTurnos(leader);
  const direct = allEmps.filter(e=>String(e.supervisor_id||e.owner_id||e.ownerId)===String(leader.id));
  if (!depts.length) return direct;
  let filiais = getMeusFiliais(leader);
  if (!filiais.length) {
    filiais = [...new Set(allEmps.filter(e=>e.filial&&String(e.supervisor_id||e.owner_id||e.ownerId)===String(leader.id)).map(e=>e.filial))];
  }
  const sistemMultiFilial = new Set(allEmps.filter(e=>e.filial).map(e=>e.filial)).size > 1;
  const filialOkSemDef    = !sistemMultiFilial;
  const directIds = new Set(direct.map(e=>e.id));
  const scope = allEmps.filter(e => {
    if (directIds.has(e.id)) return false;
    if (e.supervisor_id && String(e.supervisor_id) !== String(leader.id)) return false;
    const deptOk   = depts.includes(e.dept);
    const turnoOk  = turnos.length  ? turnos.includes(e.turno)   : true;
    const filialOk = filiais.length ? filiais.includes(e.filial) : filialOkSemDef;
    return deptOk && turnoOk && filialOk;
  });
  return [...direct, ...scope];
}
function getSubordinados(leader, allUsers, allEmps) {
  const meuIdx      = ORDEM_IDX.indexOf(leader.nivel||'lider');
  const meusDepts   = getMeusDepts(leader);
  const meusTurnos  = getMeusTurnos(leader);
  const meusFiliais = allEmps ? getEffectiveFiliais(leader, allEmps) : getMeusFiliais(leader);
  return allUsers.filter(u => {
    if (u.id===ADMIN_ID||u.nivel==='admin_master'||u.id===leader.id) return false;
    const uIdx = ORDEM_IDX.indexOf(u.nivel||'lider');
    if (uIdx >= meuIdx) return false;
    if (!meusDepts.length) return false;
    const deptOk = meusDepts.some(d=>getMeusDepts(u).includes(d));
    if (!deptOk) return false;
    const uTurnos = getMeusTurnos(u);
    if (meusTurnos.length||uTurnos.length) {
      if (!meusTurnos.length||!uTurnos.length||!meusTurnos.some(t=>uTurnos.includes(t))) return false;
    }
    const uFiliais = allEmps ? getEffectiveFiliais(u, allEmps) : getMeusFiliais(u);
    const filialPass = !(meusFiliais.length||uFiliais.length)||
      (meusFiliais.length&&uFiliais.length&&meusFiliais.some(f=>uFiliais.includes(f)));
    return filialPass;
  });
}
function getTeamTotal(leader, store) {
  const allEmps  = (store.employees || []).filter(e => !e.demitido);
  const allUsers = _getAllLeaders(store).filter(e => !e.demitido && String(e.id)!==String(leader.id) && String(e.login_id)!==String(leader.id));
  const meuIdx   = ORDEM_IDX.indexOf(leader.nivel||'lider');
  const meusDepts= getMeusDepts(leader);
  const meusTurnos=getMeusTurnos(leader);
  let meusFiliais = getMeusFiliais(leader);
  if (!meusFiliais.length) {
    meusFiliais = [...new Set(allEmps.filter(e=>e.filial&&String(e.supervisor_id||e.owner_id||e.ownerId)===String(leader.id)).map(e=>e.filial))];
  }
  const sistemMultiFilial = new Set(allEmps.filter(e=>e.filial).map(e=>e.filial)).size > 1;
  const filialOkSemDef    = !sistemMultiFilial;
  const directEmps = allEmps.filter(e=>String(e.supervisor_id||e.owner_id||e.ownerId)===String(leader.id));
  const directIds = new Set(directEmps.map(e=>e.id));
  let totalFuncionarios;
  if (!meusDepts.length) {
    totalFuncionarios = directEmps.length;
  } else {
    const scopeCount = allEmps.filter(e=>{
      if (directIds.has(e.id)) return false;
      if (e.supervisor_id && String(e.supervisor_id) !== String(leader.id)) return false;
      const deptOk   = meusDepts.includes(e.dept);
      const turnoOk  = meusTurnos.length ? meusTurnos.includes(e.turno) : true;
      const filialOk = meusFiliais.length ? meusFiliais.includes(e.filial) : filialOkSemDef;
      return deptOk && turnoOk && filialOk;
    }).length;
    totalFuncionarios = directEmps.length + scopeCount;
  }
  const subordinados = allUsers.filter(u=>{
    const uIdx = ORDEM_IDX.indexOf(u.nivel||'lider');
    if (uIdx>=meuIdx) return false;
    if (!meusDepts.length) return false;
    const deptOk = meusDepts.some(d=>getMeusDepts(u).includes(d));
    if (!deptOk) return false;
    const uTurnos = getMeusTurnos(u);
    const turnoOk = (meusTurnos.length&&uTurnos.length) ? meusTurnos.some(t=>uTurnos.includes(t)) : true;
    const uFiliais = getEffectiveFiliais(u, allEmps);
    if (meusFiliais.length||uFiliais.length) {
      if (!meusFiliais.length||!uFiliais.length||!meusFiliais.some(f=>uFiliais.includes(f))) return false;
    }
    return turnoOk;
  });
  return totalFuncionarios + subordinados.length;
}

// ════════════════════════════════════════════════════════
// RENDER LEADERS
// ════════════════════════════════════════════════════════
async function renderLeaders() {
  if (!_store) {
    _store    = await getStore();
    _allPonto = await LS.get('rh_ponto', {});
  }
  const store   = _store;
  const isAdmin = getUserPerfil(currentUser) === 'admin_master';

  const showDemitidos = _showDemitidosFlag;
  const allLeaders = _getAllLeaders(store)
    .filter(l => !l.demitido || showDemitidos || getTeamTotal(l, store) > 0)
    .sort((a,b) => (a.name||'').localeCompare(b.name||'', 'pt-BR'));

  const totalDemitidos = _getAllLeaders(store).filter(l => l.demitido).length;
  const btnDem = document.getElementById('toggle-demitidos');
  if (btnDem) {
    btnDem.style.display = totalDemitidos ? '' : 'none';
    btnDem.textContent = showDemitidos ? '\u{1F534} Ocultar ex-l\u00EDderes' : `\u{1F534} Ex-l\u00EDderes (${totalDemitidos})`;
  }

  const sel = document.getElementById('ldr-select');
  const cur = sel?.value || '';
  if (sel) {
    sel.innerHTML = '<option value="">\u{1F465} Todos os l\u00EDderes</option>' +
      allLeaders.map(u=>`<option value="${u.id}"${u.id===cur?' selected':''}>${u.name}</option>`).join('');
    if (cur) sel.value = cur;
  }
  const selectedId = sel?.value || '';

  let leaders = selectedId ? allLeaders.filter(u=>u.id===selectedId) : allLeaders;

  const countEl = document.getElementById('filter-count');
  if (countEl) countEl.textContent = `${leaders.length} ${leaders.length===1?'l\u00EDder':'l\u00EDderes'}`;

  const grid = document.getElementById('leaders-grid');
  if (!leaders.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">\u{1F9D1}\u{200D}\u{1F4BC}</div>
      <p style="font-size:14px">Nenhum l\u00EDder encontrado</p>
      <p style="font-size:12px;margin-top:6px">Cadastre novos l\u00EDderes pelo bot\u00E3o acima.</p></div>`;
    return;
  }

  const grupos = {};
  HIERARQUIA_ORDER.forEach(n => grupos[n] = []);
  leaders.forEach(u => {
    const n = u.nivel||'lider';
    if (grupos[n]) grupos[n].push(u); else grupos['lider'].push(u);
  });

  let html = '';
  HIERARQUIA_ORDER.forEach(nivel => {
    const lista = grupos[nivel];
    if (!lista.length) return;
    const meta = HIER_LABEL[nivel];
    html += `<div class="hier-sep">
      <span class="hier-label ${meta.cls}">${meta.text}</span>
      <div class="hier-line"></div>
      <span class="hier-count">${lista.length} ${lista.length===1?'pessoa':'pessoas'}</span>
    </div>`;
    lista.forEach(u => { html += buildCard(u, store, isAdmin); });
  });

  grid.innerHTML = html;
}

// ════════════════════════════════════════════════════════
// BUILD CARD
// ════════════════════════════════════════════════════════
function buildCard(leader, store, isAdmin) {
  const allEmps  = (store.employees || []).filter(e => !e.demitido);
  const team     = getTeamEmps(leader, allEmps);
  const nivel    = leader.nivel || 'lider';
  const meta     = NIVEL_META[nivel] || NIVEL_META['lider'];

  const totalTime   = team.length;
  const totalHier   = getTeamTotal(leader, store);
  const avgDesemp   = totalTime ? Math.round(team.reduce((s,e)=>s+e.perf,0)/totalTime) : 0;
  const avgAssid    = totalTime ? Math.round(team.reduce((s,e)=>s+calcAssid(e),0)/totalTime) : 0;
  const totalFaltas = Math.round(team.reduce((s,e)=>s+getTotalFaltasEmp(e),0));
  const promos      = team.filter(e=>calcScore(e)>=85).length;
  const riscos      = team.filter(e=>calcScore(e)<55).length;
  const leaderScore = totalTime ? +(team.reduce((s,e)=>s+calcAptMedia(e),0)/totalTime).toFixed(1) : 0;

  const ini      = leader.name.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();
  const rolePart = [leader.perfil?.funcao||'', leader.setor||(leader.perfil?.depts||[])[0]||''].filter(Boolean).join(' \u00B7 ');
  const filiais  = getMeusFiliais(leader);
  const turnos   = getMeusTurnos(leader);

  const mesKey   = (() => { const n=new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`; })();
  const aptPend  = team.filter(e=>!e.afastado&&!e.demitido&&!(e.competencies_history||{})[mesKey]);
  const temApt   = aptPend.length > 0;

  const shown  = team.slice(0,5);
  const extras = team.length - shown.length;
  const avBubs = shown.map(e=>{
    const i = e.name.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();
    return `<div class="av-bubble" title="${e.name}">${i}</div>`;
  }).join('') + (extras>0 ? `<div class="av-more">+${extras}</div>` : '');

  const podOcorr = typeof can==='function' && can(currentUser,'leaders','ocorrencia');

  const adminBtns = (isAdmin || podOcorr) ? `
    <div class="lcard-actions" data-lid="${leader.id}">
      ${isAdmin ? `<button class="btn btn-ghost btn-sm" data-action="edit-leader">\u270F\uFE0F Editar</button>` : ''}
      ${podOcorr ? `<button class="btn btn-sm btn-oc" data-action="oc-leader">\u{1F4DD} Ocorr\u00EAncia</button>` : ''}
    </div>` : '';

  return `
  <div class="lcard lvl-${nivel}${temApt?' apt-pendente':''}"
       data-lid="${leader.id}">
    <div class="lcard-header">
      <div class="lcard-header-bg"></div>
      <div class="lcard-stripe"></div>
      <div class="lcard-lvl-badge" style="background:${meta.cor}22;color:${meta.cor};border:1px solid ${meta.cor}44">
        ${meta.emoji} ${meta.label}
      </div>
    </div>
    <div class="lcard-identity">
      <div class="lcard-avatar" style="background:${leader.foto?'transparent':`linear-gradient(135deg,${meta.cor},${meta.cor}88)`}">
        ${leader.foto?`<img src="${leader.foto}" style="width:52px;height:52px;border-radius:50%;object-fit:cover">`:ini}
      </div>
      <div class="lcard-info">
        <div class="lcard-name">${leader.name}</div>
        <div class="lcard-role">${rolePart||nivel}</div>
      </div>
    </div>
    ${leader.matricula ? `<div class="lcard-matricula">\u{1FAAA} Matr\u00EDcula: <strong>${leader.matricula}</strong></div>` : ''}
    ${!leader.demitido && !leader.matricula ? `<div class="lcard-admissao-pendente">\u26A0\uFE0F Matr\u00EDcula pendente</div>` : ''}
    ${leader.data_admissao ? `<div class="lcard-admissao">\u{1F4C5} Desde ${new Date(leader.data_admissao+'T00:00:00').toLocaleDateString('pt-BR')}</div>` : ''}
    ${!leader.demitido && !leader.data_admissao ? `<div class="lcard-admissao-pendente">\u26A0\uFE0F Data de admiss\u00E3o pendente</div>` : ''}
    <div class="lcard-metrics">
      <div class="lcard-metric">
        <div class="lcard-metric-val v-team">${totalHier}</div>
        <div class="lcard-metric-lbl">Time</div>
      </div>
      <div class="lcard-metric">
        <div class="lcard-metric-val v-desemp">${avgDesemp}%</div>
        <div class="lcard-metric-lbl">Desempenho</div>
      </div>
      <div class="lcard-metric">
        <div class="lcard-metric-val v-score">${leaderScore}</div>
        <div class="lcard-metric-lbl">Score</div>
      </div>
    </div>
    <div class="lcard-stats">
      <div class="lcard-stat">
        <div class="lcard-stat-lbl">Assiduidade</div>
        <div class="lcard-stat-val ${avgAssid>=80?'stat-green':avgAssid>=60?'stat-warn':'stat-red'}">${totalTime?avgAssid+'%':'—'}</div>
      </div>
      <div class="lcard-stat">
        <div class="lcard-stat-lbl">Faltas</div>
        <div class="lcard-stat-val stat-text">${totalFaltas}</div>
      </div>
      <div class="lcard-stat">
        <div class="lcard-stat-lbl">Promo\u00E7\u00E3o</div>
        <div class="lcard-stat-val stat-green">${promos}</div>
      </div>
      <div class="lcard-stat">
        <div class="lcard-stat-lbl">Risco</div>
        <div class="lcard-stat-val ${riscos>0?'stat-red':'stat-text'}">${riscos}</div>
      </div>
    </div>
    ${totalTime>0 ? `
    <div class="lcard-team">
      <div class="lcard-team-lbl">Equipe \u00B7 ${totalHier} ${totalHier===1?'pessoa':'pessoas'}</div>
      ${avBubs}
    </div>` : ''}
    ${filiais.length||turnos.length ? `
    <div class="lcard-tags">
      ${filiais.map(f=>`<span class="tag tag-filial">\u{1F3ED} ${f}</span>`).join('')}
      ${turnos.map(t=>`<span class="tag tag-turno">\u{1F550} ${t}</span>`).join('')}
    </div>` : ''}
    ${temApt ? `
    <div class="lcard-apt" data-action="goto-aptidoes">
      \u{1F3AF} ${aptPend.length} funcion\u00E1rio${aptPend.length>1?'s':''} sem avalia\u00E7\u00E3o este m\u00EAs
      <span style="margin-left:auto;font-size:10px;opacity:.7">\u2192 Avaliar</span>
    </div>` : ''}
    <div class="lcard-org-hint">
      <span>\u{1F333}</span> Clique para ver o organograma
    </div>
    ${adminBtns}
  </div>`;
}

// ════════════════════════════════════════════════════════
// ÁRVORE HIERÁRQUICA
// ════════════════════════════════════════════════════════
function openOrg(leaderId) {
  _treeRootId = leaderId;
  _treePath   = [];
  renderTreeModal(leaderId);
  document.getElementById('ov-org').classList.add('open');
}

function closeOrg() {
  document.getElementById('ov-org').classList.remove('open');
  _treeRootId = null;
  _treePath   = [];
}

function _findLeader(store, id) {
  return store?.users?.[id] || (store.employees||[]).find(e =>
    e.nivel && (String(e.id) === String(id) || e.login_id === id)
  );
}

function _getAllLeaders(store) {
  const fromEmps = (store.employees||[]).filter(e => e.nivel && e.nivel !== 'admin_master');
  const seen = new Set(fromEmps.map(e => e.login_id || e.id));
  const fromUsers = Object.entries(store.users||{})
    .filter(([k,v]) => v.nivel && v.nivel !== 'admin_master' && k !== 'admin' && !seen.has(v.login_id || k))
    .map(([k,v]) => ({ ...v, id: v.id || k, login_id: v.login_id || k }));
  return [...fromEmps, ...fromUsers];
}

function renderTreeModal(leaderId) {
  const store  = _store;
  const leader = _findLeader(store, leaderId);
  if (!leader) return;

  const meta = NIVEL_META[leader.nivel||'lider'] || NIVEL_META.lider;
  const ini  = leader.name.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();

  document.getElementById('tree-modal-name').textContent = leader.name;
  document.getElementById('tree-modal-sub').textContent  = `${meta.emoji} ${meta.label} \u00B7 \u00C1rvore de responsabilidades`;
  const hAv = document.getElementById('tree-header-avatar');
  hAv.style.background = leader.foto ? 'transparent' : `linear-gradient(135deg,${meta.cor},${meta.cor}99)`;
  hAv.innerHTML = leader.foto
    ? `<img src="${leader.foto}" style="width:48px;height:48px;border-radius:50%;object-fit:cover">` : ini;

  renderTreeBreadcrumb(leaderId);
  renderTreeBody(leaderId);
}

function renderTreeBreadcrumb(currentId) {
  const bc = document.getElementById('tree-breadcrumb');
  if (!_treePath.length) { bc.innerHTML = ''; return; }

  const parts = _treePath.map((node, i) => {
    const isLast = i === _treePath.length - 1;
    if (isLast) return `<span class="bc-item current">${node.name}</span>`;
    return `<span class="bc-item" data-nav-id="${node.id}" data-nav-idx="${i}">${node.name}</span>
            <span class="bc-sep">\u203A</span>`;
  });

  const rootLeader = _findLeader(_store, _treeRootId);
  if (rootLeader && _treePath[0]?.id !== _treeRootId) {
    bc.innerHTML = `<span class="bc-item" data-nav-id="${_treeRootId}" data-nav-idx="-1">${rootLeader.name}</span>
                    <span class="bc-sep">\u203A</span>` + parts.join('');
  } else {
    bc.innerHTML = parts.join('');
  }
}

function navigateTreeTo(id, pathIdx) {
  if (pathIdx === -1) {
    _treePath = [];
  } else {
    _treePath = _treePath.slice(0, pathIdx + 1);
  }
  renderTreeModal(id);
}

function navigateTreeDown(leaderId) {
  const leader = _findLeader(_store, leaderId);
  if (!leader) return;
  _treePath.push({ id: leaderId, name: leader.name });
  renderTreeModal(leaderId);
}

function renderTreeBody(leaderId) {
  const store  = _store;
  const leader = _findLeader(store, leaderId);
  const body   = document.getElementById('tree-modal-body');
  if (!leader) {
    body.innerHTML = '<div class="tree-empty"><div class="tree-empty-icon">\u{1F50D}</div><p>L\u00EDder n\u00E3o encontrado.</p></div>';
    return;
  }

  const allLeaders  = _getAllLeaders(store).filter(l => !l.demitido);
  const allEmps     = (store.employees || []).filter(e => !e.demitido);
  const meta        = NIVEL_META[leader.nivel||'lider'] || NIVEL_META.lider;
  const ini         = leader.name.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();
  const team        = getTeamEmps(leader, allEmps);
  const subordinados= getSubordinados(leader, allLeaders, allEmps);
  const totalTime   = getTeamTotal(leader, store);
  const avgScore    = team.length ? Math.round(team.reduce((s,e)=>s+calcScore(e),0)/team.length) : 0;
  const promos      = team.filter(e=>calcScore(e)>=85).length;
  const riscos      = team.filter(e=>calcScore(e)<55).length;

  let html = '';

  html += `
  <div class="tree-root-card">
    <div class="tree-root-avatar" style="background:${leader.foto?'transparent':`linear-gradient(135deg,${meta.cor},${meta.cor}88)`}">
      ${leader.foto?`<img src="${leader.foto}" style="width:48px;height:48px;border-radius:50%;object-fit:cover">`:ini}
    </div>
    <div class="tree-root-info">
      <div class="tree-root-name">${leader.name}</div>
      <div class="tree-root-meta">${meta.emoji} ${meta.label}${leader.perfil?.funcao?' \u00B7 '+leader.perfil.funcao:''}</div>
    </div>
    <div style="text-align:right;flex-shrink:0">
      <div style="font-family:var(--font-head);font-size:24px;font-weight:800;color:var(--accent2)">${totalTime}</div>
      <div style="font-size:10px;color:var(--muted)">sob responsabilidade</div>
    </div>
  </div>`;

  if (team.length) {
    html += `<div class="tree-stats-row">
      <div class="tree-stat-pill">\u{1F465} ${team.length} operacional</div>
      <div class="tree-stat-pill" style="color:var(--accent2)">\u{2B50} Score m\u00E9dio: ${avgScore}</div>
      ${promos ? `<div class="tree-stat-pill" style="color:var(--green)">\u{1F3C6} ${promos} promo\u00E7\u00E3o</div>` : ''}
      ${riscos ? `<div class="tree-stat-pill" style="color:var(--red)">\u{1F534} ${riscos} em risco</div>` : ''}
    </div>`;
  }

  if (subordinados.length) {
    html += `<div class="tree-connector">
      <div class="tree-connector-label">\u{1F454} L\u00EDderes subordinados (${subordinados.length})</div>`;

    subordinados
      .sort((a,b) => ORDEM_IDX.indexOf(b.nivel||'lider') - ORDEM_IDX.indexOf(a.nivel||'lider'))
      .forEach(sub => {
        const sm     = NIVEL_META[sub.nivel||'lider'] || NIVEL_META.lider;
        const sIni   = sub.name.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();
        const subTot = getTeamTotal(sub, store);

        html += `
        <div class="tree-sub-card clickable" data-nav-down="${sub.id}">
          <div class="tree-sub-avatar" style="background:${sub.foto?'transparent':`linear-gradient(135deg,${sm.cor},${sm.cor}88)`}">
            ${sub.foto?`<img src="${sub.foto}" style="width:36px;height:36px;border-radius:50%;object-fit:cover">`:sIni}
          </div>
          <div class="tree-sub-info">
            <div class="tree-sub-name">${sub.name}</div>
            <div class="tree-sub-meta">${sm.emoji} ${sm.label}${sub.perfil?.funcao?' \u00B7 '+sub.perfil.funcao:''}</div>
          </div>
          <div class="tree-sub-stats">
            <span class="tree-sub-stat">${subTot} ${subTot===1?'pessoa':'pessoas'}</span>
          </div>
          <span class="tree-sub-badge" style="background:${sm.cor}18;color:${sm.cor};border:1px solid ${sm.cor}33">
            ${sm.emoji} ${sm.label}
          </span>
        </div>`;
      });

    html += `</div>`;
  }

  if (team.length) {
    html += `<div class="tree-connector">
      <div class="tree-connector-label">\u{1F477} Funcion\u00E1rios operacionais (${team.length})</div>
      <div class="tree-emp-cards">`;

    team.forEach(emp => {
      const eIni = emp.name.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();
      const score = calcScore(emp);
      const scoreColor = score>=85?'#34d399':score>=70?'#4f8ef7':score>=55?'#fbbf24':'#f87171';
      html += `
        <div class="tree-emp-card">
          <div class="tree-emp-avatar">
            ${emp.foto?`<img src="${emp.foto}" style="width:30px;height:30px;border-radius:50%;object-fit:cover">`:eIni}
          </div>
          <div class="tree-emp-info">
            <div class="tree-emp-name">${emp.name}</div>
            <div class="tree-emp-meta">${emp.role||emp.dept||'\u2014'}</div>
          </div>
          <span style="font-family:var(--font-head);font-size:14px;font-weight:800;color:${scoreColor};flex-shrink:0">${score}</span>
        </div>`;
    });

    html += `</div></div>`;
  }

  if (!subordinados.length && !team.length) {
    html += `<div class="tree-empty">
      <div class="tree-empty-icon">\u{1F3DD}\uFE0F</div>
      <p style="font-size:14px;margin-bottom:6px">Nenhuma equipe ainda</p>
      <p style="font-size:12px;color:var(--muted)">Este l\u00EDder ainda n\u00E3o tem subordinados ou funcion\u00E1rios associados.</p>
    </div>`;
  }

  body.innerHTML = html;
}

// ════════════════════════════════════════════════════════
// DROPDOWN
// ════════════════════════════════════════════════════════
async function onSelectChange() {
  const sel = document.getElementById('ldr-select');
  const id  = sel?.value || '';
  await renderLeaders();
  if (id) openOrg(id);
}

// ════════════════════════════════════════════════════════
// MODAL NOVO/EDITAR LÍDER
// ════════════════════════════════════════════════════════
async function openModal(leader) {
  const store = await getStore();
  const isEdit = !!leader;
  document.getElementById('edit-title').textContent = isEdit ? 'Editar L\u00EDder' : 'Novo L\u00EDder';
  document.getElementById('f-edit-id').value = leader?.id || '';

  const fotoVal = leader?.foto || '';
  document.getElementById('f-foto').value = fotoVal;
  const prev = document.getElementById('foto-prev');
  if (fotoVal) {
    prev.innerHTML = `<img src="${fotoVal}" alt="foto">`;
  } else {
    const nm  = leader?.name||'';
    const ini = nm.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase()||'?';
    prev.innerHTML = `<span id="foto-ini">${ini}</span>`;
  }

  document.getElementById('f-name').value  = leader?.name||'';
  document.getElementById('f-id').value    = leader?.id||'';
  document.getElementById('f-matricula').value = leader?.matricula||'';
  document.getElementById('f-data-admissao').value = leader?.data_admissao||'';
  document.getElementById('f-role').value  = leader?.perfil?.funcao||'';
  document.getElementById('f-nivel').value = leader?.nivel||'lider';
  document.getElementById('f-pass').value  = '';

  const idInp = document.getElementById('f-id');
  idInp.disabled = isEdit; idInp.style.opacity = isEdit?'.5':'1';
  document.getElementById('pass-wrap').style.display = isEdit?'none':'';

  const demSec = document.getElementById('demissao-section');
  if (isEdit) {
    demSec.style.display = '';
    document.getElementById('f-demitido').checked = !!leader.demitido;
    document.getElementById('f-data-demissao').value = leader.data_demissao || '';
    document.getElementById('f-motivo-demissao').value = leader.motivo_demissao || '';
    document.getElementById('demitido-date-wrap').style.display = leader.demitido ? 'flex' : 'none';
  } else {
    demSec.style.display = 'none';
  }

  const checks = (listId, items, selectedArr, emoji) => {
    const el = document.getElementById(listId);
    if (!items.length) { el.innerHTML=`<div style="color:var(--muted);font-size:12px">Nenhum cadastrado.</div>`; return; }
    el.innerHTML = items.map(x=>`
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--text);padding:6px 10px;border-radius:6px;background:var(--surface2);border:1px solid var(--border)">
        <input type="checkbox" value="${x.nome}" ${selectedArr.includes(x.nome)?'checked':''}
          style="accent-color:var(--accent);width:16px;height:16px">
        ${emoji} ${x.nome}
      </label>`).join('');
  };

  const selFiliais = leader?.perfil?.filiais||(leader?.perfil?.filial?[leader.perfil.filial]:[]);
  const selTurnos  = leader?.perfil?.turnos ||(leader?.perfil?.turno ?[leader.perfil.turno] :[]);
  const selDepts   = leader?.perfil?.depts  ||[];

  checks('f-filiais-list', store.filiais||[], selFiliais, '\u{1F3ED}');
  checks('f-turnos-list',  store.turnos||[],  selTurnos,  '\u{1F550}');
  checks('f-depts-list',   store.depts||[],   selDepts,   '\u{1F3E2}');

  document.getElementById('ov-edit').classList.add('open');
  document.getElementById('f-name').focus();
}

function closeModal() { document.getElementById('ov-edit').classList.remove('open'); }

async function editLeader(id) {
  const store  = await getStore();
  const leader = _findLeader(store, id);
  if (!leader) return;
  openModal(leader);
}

async function saveLeader() {
  const name   = document.getElementById('f-name').value.trim();
  const id     = document.getElementById('f-id').value.trim();
  const nivel  = document.getElementById('f-nivel').value;
  const editId = document.getElementById('f-edit-id').value;

  if (!name)          { showToast('\u26A0\uFE0F Nome \u00E9 obrigat\u00F3rio.','warn'); return; }
  if (!editId && !id) { showToast('\u26A0\uFE0F ID de acesso \u00E9 obrigat\u00F3rio.','warn'); return; }

  const matricula = document.getElementById('f-matricula').value.trim();
  if (!matricula) { showToast('\u26A0\uFE0F Matr\u00EDcula \u00E9 obrigat\u00F3ria.','warn'); document.getElementById('f-matricula').focus(); return; }
  if (!/^\d+$/.test(matricula)) { showToast('\u26A0\uFE0F Matr\u00EDcula deve conter apenas n\u00FAmeros.','warn'); document.getElementById('f-matricula').focus(); return; }
  if (matricula.length > 6) { showToast('\u26A0\uFE0F Matr\u00EDcula deve ter no m\u00E1ximo 6 d\u00EDgitos.','warn'); document.getElementById('f-matricula').focus(); return; }

  const dataAdmissao = document.getElementById('f-data-admissao').value || null;

  const store = await getStore();
  const pass  = document.getElementById('f-pass').value;
if (!editId && pass.length<6) { showToast('\u26A0\uFE0F Senha com m\u00EDnimo 6 caracteres.','warn'); return; }
  if (!editId && (store.employees?.some(e => e.login_id === id) || store.users?.[id])) { showToast('\u274C Este ID j\u00E1 est\u00E1 cadastrado.','error'); return; }
  const dupMat = (store.employees||[]).find(e => e.matricula === matricula && String(e.login_id) !== editId && String(e.id) !== editId);
  if (dupMat) { showToast(`\u26A0\uFE0F Matr\u00EDcula "${matricula}" j\u00E1 est\u00E1 em uso por ${dupMat.name}.`,'warn'); document.getElementById('f-matricula').focus(); return; }

  const depts   = [...document.querySelectorAll('#f-depts-list input:checked')].map(c=>c.value);
  const filiais = [...document.querySelectorAll('#f-filiais-list input:checked')].map(c=>c.value);
  const turnos  = [...document.querySelectorAll('#f-turnos-list input:checked')].map(c=>c.value);
  const perfil  = { filiais, turnos, filial:filiais[0]||'', turno:turnos[0]||'', funcao:document.getElementById('f-role').value, depts };

if (editId) {
    const leader = _findLeader(store, editId);
    if (!leader) { showToast('\u274C Líder não encontrado.','error'); return; }
    const fotoLider = document.getElementById('f-foto').value || leader.foto || null;
    const demitido = document.getElementById('f-demitido').checked;
    const dataDemissao = demitido ? (document.getElementById('f-data-demissao').value || null) : null;
    const motivoDemissao = demitido ? (document.getElementById('f-motivo-demissao').value.trim() || '') : '';
    if (demitido && !leader.demitido) {
      if (getTeamTotal(leader, store) > 0) {
        showToast('\u274C Transfira os subordinados antes de desligar este l\u00EDder.','error'); return;
      }
      if (!dataDemissao) { showToast('\u26A0\uFE0F Informe a data de desligamento.','warn'); return; }
    }
    const updated = { ...leader, name, nivel, perfil, foto:fotoLider, matricula, data_admissao: dataAdmissao, demitido, data_demissao: dataDemissao, motivo_demissao: motivoDemissao };
    const leaderIdx = store.employees.findIndex(e => String(e.login_id) === String(editId) || String(e.id) === String(editId));
    if (leaderIdx >= 0) {
      store.employees[leaderIdx] = updated;
    } else {
      store.employees.push({ id: editId, name, login_id: editId, pass: leader.pass||'', nivel, setor:depts[0]||'', perfil, foto:fotoLider, matricula, data_admissao: dataAdmissao, demitido, data_demissao: dataDemissao, motivo_demissao: motivoDemissao, dept:depts[0]||'', role:perfil.funcao||'', filial:filiais[0]||'', turno:turnos[0]||'', supervisor_id:null, perf:0 });
    }
    await registrarLog('editou','L\u00EDderes',`Editou: <strong>${name}</strong>`);
    showToast('\u2705 L\u00EDder atualizado!');
  } else {
    const fotoNovo = document.getElementById('f-foto').value || null;
    store.employees.push({ id, name, login_id:id, pass, nivel, setor:depts[0]||'', perfil, foto:fotoNovo, matricula, data_admissao: dataAdmissao, dept:depts[0]||'', role:perfil.funcao||'', filial:filiais[0]||'', turno:turnos[0]||'', supervisor_id:null, perf:0 });
    await registrarLog('criou','L\u00EDderes',`Novo l\u00EDder: <strong>${name}</strong> (${nivel})`);
    showToast('\u2705 L\u00EDder cadastrado!');
  }

  await saveStore(store);
  _store = null;
  closeModal();
  renderLeaders();
}

async function deleteLeader(id) {
  const store = await getStore();
  const u     = _findLeader(store, id);
  if (!u) return;
  if (!confirm(`Remover o líder "${u.name}"?\nOs funcionários não serão removidos.`)) return;
  const idx = store.employees.findIndex(e => String(e.login_id) === String(id) || String(e.id) === String(id));
  if (idx >= 0) store.employees.splice(idx, 1);
  delete store.users[id];
  await saveStore(store);
  _store = null;
  renderLeaders();
  await registrarLog('excluiu','L\u00EDderes',`Removeu: <strong>${u.name}</strong>`);
  showToast('\u2705 L\u00EDder removido.');
}

// ════════════════════════════════════════════════════════
// OCORRÊNCIA DO LÍDER
// ════════════════════════════════════════════════════════
async function openOcorrencia(id) {
  const store  = await getStore();
  const leader = _findLeader(store, id);
  if (!leader) return;
  document.getElementById('oc-name').textContent = leader.name;
  document.getElementById('oc-id').value         = id;
  document.getElementById('oc-tipo').value        = '';
  document.getElementById('oc-desc').value        = '';
  const agora = new Date();
  agora.setMinutes(agora.getMinutes() - agora.getTimezoneOffset());
  document.getElementById('oc-data').value = agora.toISOString().slice(0,16);
  document.getElementById('ov-oc').classList.add('open');
}
function closeOcorrencia() { document.getElementById('ov-oc').classList.remove('open'); }

async function saveOcorrencia() {
  const refId = document.getElementById('oc-id').value;
  const tipo  = document.getElementById('oc-tipo').value;
  const desc  = document.getElementById('oc-desc').value.trim();
  const data  = document.getElementById('oc-data').value;
  if (!tipo) { showToast('\u26A0\uFE0F Selecione o tipo de ocorr\u00EAncia.','warn'); return; }
  if (!desc) { showToast('\u26A0\uFE0F Descreva a ocorr\u00EAncia.','warn'); document.getElementById('oc-desc').focus(); return; }

  const store  = await getStore();
  const leader = (store.employees||[]).find(e => String(e.login_id) === String(refId) || String(e.id) === String(refId));
  const novo = {
    id: uid(), ts:(()=>{ if(!data) return new Date().toISOString(); const d=new Date(data); return isNaN(d)?new Date().toISOString():d.toISOString(); })(),
    empId: refId, empName:leader?.name||'\u2014', empDept:leader?.setor||leader?.perfil?.depts?.[0]||'\u2014',
    tipo, desc, obs:'', status:'pendente',
    respName:currentUser.name, respId:currentUser.id,
    createdAt:new Date().toISOString(), _isLider:true,
  };
  await window.DB.setMerge('rh_ocorrencias', (current) => {
    const list = Array.isArray(current) ? [...current] : [];
    list.unshift(novo);
    return list;
  });
  await registrarLog('criou','Ocorr\u00EAncias',`Ocorr\u00EAncia <strong>${tipo}</strong> para l\u00EDder <strong>${leader?.name||'\u2014'}</strong>`);
  closeOcorrencia();
  showToast('\u2705 Ocorr\u00EAncia registrada!');
}

// ════════════════════════════════════════════════════════
// FOTO
// ════════════════════════════════════════════════════════
function processarFoto(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      canvas.width = 80; canvas.height = 80;
      const ctx  = canvas.getContext('2d');
      const size = Math.min(img.width, img.height);
      const sx   = (img.width-size)/2, sy=(img.height-size)/2;
      ctx.drawImage(img, sx, sy, size, size, 0, 0, 80, 80);
      const base64 = canvas.toDataURL('image/jpeg', 0.65);
      document.getElementById('f-foto').value = base64;
      document.getElementById('foto-prev').innerHTML = `<img src="${base64}" alt="foto">`;
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  input.value = '';
}

function removerFoto() {
  document.getElementById('f-foto').value = '';
  const nm  = document.getElementById('f-name').value.trim();
  const ini = nm.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase()||'?';
  document.getElementById('foto-prev').innerHTML = `<span id="foto-ini">${ini}</span>`;
}

document.addEventListener('DOMContentLoaded', function() {
  // Fechar modais no overlay
  document.getElementById('ov-org').addEventListener('click', function(e) { if(e.target===e.currentTarget) closeOrg(); });
  document.getElementById('ov-edit').addEventListener('click', function(e) { if(e.target===e.currentTarget) closeModal(); });
  document.getElementById('ov-oc').addEventListener('click', function(e) { if(e.target===e.currentTarget) closeOcorrencia(); });

  // ESC fecha modais
  document.addEventListener('keydown', function(e) { if(e.key==='Escape') { closeOrg(); closeModal(); closeOcorrencia(); } });

  // Botões do modal de líder
  document.getElementById('tree-close-btn').addEventListener('click', closeOrg);
  document.getElementById('btn-cancel-edit').addEventListener('click', closeModal);
  document.getElementById('btn-save-leader').addEventListener('click', saveLeader);
  document.getElementById('btn-cancel-oc').addEventListener('click', closeOcorrencia);
  document.getElementById('btn-save-oc').addEventListener('click', saveOcorrencia);

  // Inputs com transformação
  document.getElementById('f-name').addEventListener('input', function() {
    this.value = toTitleCase(this.value.replace(/[^a-zA-ZÀ-ÿ\s]/g,''));
  });
  document.getElementById('f-id').addEventListener('input', function() {
    this.value = this.value.toLowerCase();
  });

  // Foto
  document.getElementById('btn-select-foto').addEventListener('click', function() {
    document.getElementById('foto-input').click();
  });
  document.getElementById('btn-rm-foto').addEventListener('click', removerFoto);
  document.getElementById('foto-input').addEventListener('change', function() { processarFoto(this); });
  document.getElementById('f-demitido').addEventListener('change', function() {
    document.getElementById('demitido-date-wrap').style.display = this.checked ? 'flex' : 'none';
    if (this.checked && !document.getElementById('f-data-demissao').value)
      document.getElementById('f-data-demissao').value = new Date().toISOString().split('T')[0];
  });

  // Select de líder
  document.getElementById('ldr-select').addEventListener('change', onSelectChange);
  document.getElementById('toggle-demitidos').addEventListener('click', function() {
    _showDemitidosFlag = !_showDemitidosFlag;
    renderLeaders();
  });

  // Delegação de eventos no grid de cards
  document.getElementById('leaders-grid').addEventListener('click', function(e) {
    var el = e.target.closest('[data-action]');
    if (el) {
      var action = el.getAttribute('data-action');
      var lcard = el.closest('.lcard');
      if (!lcard) return;
      var lid = lcard.getAttribute('data-lid');
      if (action === 'edit-leader') { editLeader(lid); return; }
      if (action === 'del-leader') { showToast('\u26A0\uFE0F Use a op\u00E7\u00E3o "Desligado" na edi\u00E7\u00E3o do l\u00EDder.','warn'); return; }
      if (action === 'oc-leader') { openOcorrencia(lid); return; }
      if (action === 'goto-aptidoes') { e.stopPropagation(); window.location.href='aptidoes.html'; return; }
    }
    // Clique no card → abre organograma
    var card = e.target.closest('.lcard');
    if (card && !e.target.closest('.lcard-actions')) {
      var lid = card.getAttribute('data-lid');
      if (lid) openOrg(lid);
    }
  });

  // Delegação de eventos na árvore modal
  document.getElementById('tree-modal-body').addEventListener('click', function(e) {
    var el = e.target.closest('[data-nav-down]');
    if (el) { navigateTreeDown(el.getAttribute('data-nav-down')); return; }
  });

  // Delegação de eventos no breadcrumb
  document.getElementById('tree-breadcrumb').addEventListener('click', function(e) {
    var el = e.target.closest('[data-nav-id]');
    if (el) {
      navigateTreeTo(el.getAttribute('data-nav-id'), parseInt(el.getAttribute('data-nav-idx')));
    }
  });
});

window.addEventListener('page-refresh', async function () {
  console.log('[L\u00EDderes] Dados atualizados via sync, re-renderizando...');
  _store = null;
  setTimeout(function () { renderLeaders(); }, 100);
});
