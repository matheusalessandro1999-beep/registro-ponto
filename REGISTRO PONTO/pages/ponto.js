const MESES_PT  = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                   'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MESES_SH  = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const DIAS_SEM  = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

const STATUS_META = {
  presente: { emoji:'✅', label:'Presente',  cor:'#34d399', bg:'rgba(52,211,153,.25)',  border:'#34d399'  },
  falta:    { emoji:'✕',  label:'Falta',     cor:'#f87171', bg:'rgba(248,113,113,.25)', border:'#f87171'  },
  feriado:  { emoji:'🎉', label:'Feriado',   cor:'#fbbf24', bg:'rgba(251,191,36,.25)',  border:'#fbbf24'  },
  atestado: { emoji:'🏥', label:'Atestado',  cor:'#ffffff', bg:'rgba(255,255,255,.06)', border:'rgba(255,255,255,.35)' },
  ferias:   { emoji:'🏖️', label:'Férias',    cor:'#fb923c', bg:'rgba(251,146,60,.25)',  border:'#fb923c'  },
  folga:    { emoji:'🌙', label:'Folga',     cor:'#22d3ee', bg:'rgba(34,211,238,.25)',  border:'#22d3ee'  },
  afastado:    { emoji:'🚫', label:'Afastado',            cor:'#f472b6', bg:'rgba(244,114,182,.25)', border:'#f472b6'  },
  maternidade: { emoji:'🤰', label:'Lic. Maternidade',    cor:'#f59e0b', bg:'rgba(251,191,36,.25)',  border:'#f59e0b'  },
  domingo:  { emoji:'☀️',  label:'Domingo',   cor:'#4f8ef7', bg:'rgba(79,142,247,.15)', border:'rgba(79,142,247,.4)' },
  sabado:   { emoji:'',   label:'Sábado',    cor:'#f9a8d4', bg:'rgba(244,114,182,.1)', border:'rgba(244,114,182,.35)' },
};

const PONTO_KEY = 'rh_ponto';
const OC_KEY = 'rh_ocorrencias';

const BLOQ_LABEL = {
  afastado: 'funcionário afastado',
  ferias: 'funcionário em férias',
  maternidade: 'funcionário em licença maternidade',
  sem_dono: 'funcionário sem proprietário — ajuste o perfil',
};

let currentUser  = null;
let _store       = null;
const escHtml = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const escJs = s => String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
const _abrev = n => { const p = n.trim().split(/\s+/); return p.length > 1 ? p[0] + ' ' + p[p.length-1] : p[0]; };
const nomeAbrev = (emp, lista) => {
  const ab = _abrev(emp.name);
  const dup = lista.filter(e => e.id !== emp.id && _abrev(e.name) === ab).length > 0;
  return dup && emp.matricula ? `${ab} · ${emp.matricula}` : ab;
};
let filialAtiva  = '';
let deptAtivo    = '';
let turnoAtivo   = '';
let mesAtivo     = new Date().getMonth();
let anoAtivo     = new Date().getFullYear();
let podeEditar   = false;
let _initialLoad = true;

document.addEventListener('DOMContentLoaded', async () => {
  currentUser = await requireSession();
  if (!currentUser) return;
  if (typeof canSee === 'function' && !canSee(currentUser, 'ponto')) {
    showToast && showToast('❌ Acesso negado.','error');
    setTimeout(() => window.location.href = '../index.html', 2000); return;
  }

  initTheme();
  initSidebar('ponto', currentUser);

  podeEditar = (typeof can === 'function')
    ? can(currentUser, 'ponto', 'edit')
    : true;

  await buildFilialChips();
  buildDeptChips();
  buildMesChips();
  atualizarMesLabel();
  hideLoading();
});

function getMyEmployees() {
  return getSupervisedEmployees(currentUser);
}

function getEmpsDoDepto() {
  if (!deptAtivo) return [];
  let list = getMyEmployees();
  if (filialAtiva) list = list.filter(e=>e.filial===filialAtiva);
  list = list.filter(e=>e.dept===deptAtivo);
  if (turnoAtivo) list = list.filter(e=>e.turno===turnoAtivo);
  return list.sort((a,b)=>(a.name||'').localeCompare(b.name||'','pt-BR'));
}

async function buildFilialChips() {
  _store = await getStore();
  const emps    = getMyEmployees();
  const filiais = [...new Set(emps.map(e=>e.filial))].filter(Boolean).sort();
  const wrap    = document.getElementById('filial-chips');
  if (!wrap) return;

  if (!filiais.length) {
    wrap.innerHTML = `<span style="color:var(--muted);font-size:13px">—</span>`;
    return;
  }

  const todasBtn = filiais.length > 1
    ? `<button class="dept-btn ${!filialAtiva?'active':''}" onclick="selecionarFilial('')">🏭 Todas</button>`
    : '';

  wrap.innerHTML = todasBtn + filiais.map(f=>`
    <button class="dept-btn ${f===filialAtiva?'active':''}" onclick="selecionarFilial('${escJs(f)}')">
      🏭 ${escHtml(f)}
    </button>`).join('');

  if (!filialAtiva && filiais.length === 1) selecionarFilial(filiais[0]);
}

function selecionarFilial(filial) {
  filialAtiva = filial;
  turnoAtivo  = '';
  document.querySelectorAll('#filial-chips .dept-btn').forEach(b=>{
    const label = b.textContent.trim().replace('🏭 ','');
    b.classList.toggle('active', filial === '' ? label === 'Todas' : label === filial);
  });
  buildDeptChips();
}

function buildDeptChips() {
  let emps = getMyEmployees();
  if (filialAtiva) emps = emps.filter(e=>e.filial===filialAtiva);
  const depts = [...new Set(emps.map(e=>e.dept))].filter(Boolean).sort();
  const wrap  = document.getElementById('dept-chips');

  if (!depts.length) {
    wrap.innerHTML = `<span style="color:var(--muted);font-size:13px">Nenhum departamento disponível.</span>`;
    return;
  }

  wrap.innerHTML = depts.map(d=>`
    <button class="dept-btn ${d===deptAtivo?'active':''}" onclick="selecionarDept('${escJs(d)}')">
      🏢 ${escHtml(d)}
    </button>`).join('');

  if (_initialLoad && !deptAtivo) selecionarDept(depts[0]);
}

function selecionarDept(dept) {
  deptAtivo  = dept;
  turnoAtivo = '';
  document.querySelectorAll('#dept-chips .dept-btn').forEach(b=>{
    b.classList.toggle('active', b.textContent.trim().replace('🏢 ','') === dept);
  });
  document.getElementById('grade-badge-dept').textContent = dept;
  atualizarHint();
  buildTurnoChips();
}

function buildTurnoChips() {
  let emps = getMyEmployees();
  if (filialAtiva) emps = emps.filter(e=>e.filial===filialAtiva);
  if (deptAtivo)   emps = emps.filter(e=>e.dept===deptAtivo);
  const turnos = [...new Set(emps.map(e=>e.turno))].filter(Boolean).sort();
  const wrap   = document.getElementById('turno-chips');
  if (!wrap) { renderGrade(); return; }

  if (!turnos.length) {
    wrap.innerHTML = `<span style="color:var(--muted);font-size:13px">—</span>`;
    renderGrade();
    return;
  }

  const todosBtn = turnos.length > 1
    ? `<button class="dept-btn ${!turnoAtivo?'active':''}" onclick="selecionarTurno('')">🕐 Todos</button>`
    : '';

  wrap.innerHTML = todosBtn + turnos.map(t=>`
    <button class="dept-btn ${t===turnoAtivo?'active':''}" onclick="selecionarTurno('${escJs(t)}')">
      🕐 ${escHtml(t)}
    </button>`).join('');

  if (!turnoAtivo && turnos.length === 1) { turnoAtivo = turnos[0]; }
  renderGrade();
}

function selecionarTurno(turno) {
  turnoAtivo = turno;
  document.querySelectorAll('#turno-chips .dept-btn').forEach(b=>{
    const label = b.textContent.trim().replace('🕐 ','');
    b.classList.toggle('active', turno === '' ? label === 'Todos' : label === turno);
  });
  renderGrade();
}

function buildMesChips() {
  const wrap = document.getElementById('mes-chips');
  wrap.innerHTML = MESES_SH.map((m,i)=>`
    <div class="mes-chip ${i===mesAtivo?'active':''}" onclick="selecionarMes(${i})">${m}</div>
  `).join('');
}

function selecionarMes(idx) {
  mesAtivo = idx;
  document.querySelectorAll('.mes-chip').forEach((c,i)=>c.classList.toggle('active',i===idx));
  atualizarMesLabel();
  atualizarHint();
  renderGrade();
}

function navMes(dir) {
  let m = mesAtivo + dir;
  let a = anoAtivo;
  if (m < 0)  { m = 11; a--; }
  if (m > 11) { m = 0;  a++; }
  mesAtivo = m; anoAtivo = a;
  document.querySelectorAll('.mes-chip').forEach((c,i)=>c.classList.toggle('active',i===m));
  atualizarMesLabel();
  atualizarHint();
  renderGrade();
}

function atualizarMesLabel() {
  document.getElementById('mes-atual-label').textContent = `${MESES_PT[mesAtivo]} ${anoAtivo}`;
}

function atualizarHint() {
  const h = document.getElementById('top-hint');
  if (h) h.textContent = `${deptAtivo||'—'} · ${MESES_PT[mesAtivo]} ${anoAtivo} · Clique em qualquer dia para registrar`;
}

function pontoKey(empId) {
  return `${empId}_${anoAtivo}_${String(mesAtivo+1).padStart(2,'0')}`;
}

async function setStatus(empId, dia, status) {
  var key = pontoKey(empId);
  var anterior = ((_pontoCacheLoaded ? _pontoCache : {})[key] || {})[dia] || 'vazio';
  if (anterior === status) return;

  var merged;
  try {
    merged = window.DB.setMergeSync(PONTO_KEY, function (all) {
      var current = all || {};
      var m = current[key] || {};
      if (status === 'vazio') delete m[dia];
      else m[dia] = status;
      current[key] = m;
      return current;
    });
    _pontoCache = merged;
    _pontoCacheLoaded = true;
    _debouncedSyncAbsences();
  } catch (e) {
    console.error('[setStatus] Erro ao salvar ponto:', e);
    showToast('❌ Erro ao salvar marcação. Verifique sua conexão.', 'err');
    throw e;
  }
}

async function syncAbsencesToStore(empId) {
  const store = await getStore();
  const idx   = (store.employees||[]).findIndex(e=>String(e.id)===String(empId));
  if (idx < 0) return;

  const ano      = anoAtivo;
  const allPonto = _pontoCacheLoaded ? _pontoCache : await LS.get(PONTO_KEY, {});
  const absences = Array.from({length:12}, (_, m) => {
    const key  = `${empId}_${ano}_${String(m+1).padStart(2,'0')}`;
    const dias = allPonto[key] || {};
    let faltas = 0;
    Object.entries(dias).forEach(([diaStr, s]) => {
      const dow = new Date(ano, m, parseInt(diaStr)).getDay();
      if (dow === 0) return;
      if (s === 'falta')    faltas += 1;
    });
    return faltas;
  });

  store.employees[idx].absences = absences;
  await saveStore(store);
}

async function syncAbsencesEmBatch(empIds, allPonto, ano) {
  try {
    const store = await getStore();
    ano = ano || anoAtivo;
    let mudou   = false;
    for (const empId of empIds) {
      const idx = (store.employees||[]).findIndex(e=>String(e.id)===String(empId));
      if (idx < 0) continue;
      const absences = Array.from({length:12}, (_, m) => {
        const key  = `${empId}_${ano}_${String(m+1).padStart(2,'0')}`;
        const dias = allPonto[key] || {};
        let faltas = 0;
        Object.entries(dias).forEach(([diaStr, s]) => {
          const dow = new Date(ano, m, parseInt(diaStr)).getDay();
          if (dow === 0) return;
          if (s === 'falta') faltas += 1;
        });
        return faltas;
      });
      store.employees[idx].absences = absences;
      mudou = true;
    }
    if (mudou) await saveStore(store);
  } catch (e) {
    console.error('[syncAbsencesEmBatch]', e);
  }
}

let _debounceTimer = null;
const _debouncedSyncAbsences = () => {
  if (_debounceTimer) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(async () => {
    _debounceTimer = null;
    if (!_pontoCacheLoaded) return;
    const empIds = [...new Set(
      Object.keys(_pontoCache).map(k => k.replace(/_\d+_\d+$/, ''))
    )];
    await syncAbsencesEmBatch(empIds, _pontoCache, anoAtivo);
  }, 2000);
};

const FERIADOS_NACIONAIS = [
  {d:1,  m:0,  nome:'Confraternização Universal'},
  {d:21, m:3,  nome:'Tiradentes'},
  {d:1,  m:4,  nome:'Dia do Trabalho'},
  {d:7,  m:8,  nome:'Independência do Brasil'},
  {d:12, m:9,  nome:'Nossa Sra. Aparecida'},
  {d:2,  m:10, nome:'Finados'},
  {d:15, m:10, nome:'Proclamação da República'},
  {d:25, m:11, nome:'Natal'},
];

function getNomeFeriadoNacional(dia, mes) {
  const f = FERIADOS_NACIONAIS.find(f => f.d===dia && f.m===mes);
  return f ? f.nome : null;
}

function getNomeFeriadoRegional(dia, mes) {
  const lista = _store?.config?.feriadosCustom || [];
  const mesStr = String(mes+1).padStart(2,'0');
  const diaStr = String(dia).padStart(2,'0');
  const chave  = `${mesStr}-${diaStr}`;
  const f = lista.find(f => f.chave === chave);
  return f ? (f.nome || 'Feriado Regional') : null;
}

function isFeriadoNacional(dia, mes) { return !!getNomeFeriadoNacional(dia, mes); }
function isFeriadoRegional(dia, mes) { return !!getNomeFeriadoRegional(dia, mes); }

function getNomeFeriado(dia, mes) {
  return getNomeFeriadoNacional(dia, mes) || getNomeFeriadoRegional(dia, mes) || 'Feriado';
}

let _pontoCache = {};
let _pontoCacheLoaded = false;

let ctxDotEl = null;

let _renderTimer = null;
function _scheduleRender() {
  clearTimeout(_renderTimer);
  _renderTimer = setTimeout(() => renderGrade(), 1200);
}

function getStatusDiaBloqueado(emp, ano, mes, dia) {
  const dt   = new Date(ano, mes, dia); dt.setHours(0,0,0,0);
  const hoje = new Date(); hoje.setHours(0,0,0,0);

  if (emp.afastado && emp.data_afastamento) {
    const inicio = new Date(emp.data_afastamento + 'T00:00:00');
    if (dt >= inicio && dt <= hoje) return 'afastado';
  }

  if (emp.maternidade && emp.data_maternidade) {
    const ini = new Date(emp.data_maternidade + 'T00:00:00');
    if (emp.data_maternidade_fim) {
      const fim = new Date(emp.data_maternidade_fim + 'T00:00:00');
      if (dt >= ini && dt <= fim) return 'maternidade';
    } else {
      if (dt >= ini && dt <= hoje) return 'maternidade';
    }
  }

  if (emp.ferias && emp.data_ferias_inicio && emp.data_ferias_fim) {
    const ini = new Date(emp.data_ferias_inicio + 'T00:00:00');
    const fim = new Date(emp.data_ferias_fim    + 'T00:00:00');
    if (dt >= ini && dt <= fim) return 'ferias';
  }

  const key       = `${emp.id}_${ano}_${String(mes+1).padStart(2,'0')}`;
  const diasPonto = _pontoCache[key] || {};
  const statusSalvo = diasPonto[dia];
  if (statusSalvo === 'afastado' || statusSalvo === 'ferias' || statusSalvo === 'maternidade') {
    return statusSalvo;
  }

  return null;
}

async function gravarHistoricoAfastamento(emps, allPonto) {
  const hoje    = new Date(); hoje.setHours(0,0,0,0);
  const diasMes = new Date(anoAtivo, mesAtivo+1, 0).getDate();
  let   houveMudanca = false;

  for (const emp of emps) {
    let mudouEmp = false;

    if (emp.afastado && emp.data_afastamento) {
      const inicio = new Date(emp.data_afastamento + 'T00:00:00');

      const key    = `${emp.id}_${anoAtivo}_${String(mesAtivo+1).padStart(2,'0')}`;
      const mPonto = allPonto[key] || {};

      for (let d = 1; d <= diasMes; d++) {
        const dt = new Date(anoAtivo, mesAtivo, d); dt.setHours(0,0,0,0);
        if (dt.getDay() === 0) continue;
        if (dt < inicio || dt > hoje) continue;
        if (!mPonto[d] || mPonto[d] === 'afastado') {
          if (mPonto[d] !== 'afastado') {
            mPonto[d] = 'afastado';
            mudouEmp = true;
          }
        }
      }
      if (mudouEmp) allPonto[key] = mPonto;
    }

    if (emp.ferias && emp.data_ferias_inicio && emp.data_ferias_fim) {
      const ini = new Date(emp.data_ferias_inicio + 'T00:00:00');
      const fim = new Date(emp.data_ferias_fim    + 'T00:00:00');

      const key    = `${emp.id}_${anoAtivo}_${String(mesAtivo+1).padStart(2,'0')}`;
      const mPonto = allPonto[key] || {};
      let   mudouFerias = false;

      for (let d = 1; d <= diasMes; d++) {
        const dt = new Date(anoAtivo, mesAtivo, d); dt.setHours(0,0,0,0);
        if (dt.getDay() === 0) continue;
        if (dt < ini || dt > fim) continue;
        if (!mPonto[d] || mPonto[d] === 'ferias') {
          if (mPonto[d] !== 'ferias') {
            mPonto[d]   = 'ferias';
            mudouEmp    = true;
            mudouFerias = true;
          }
        }
      }
      if (mudouFerias) allPonto[key] = mPonto;
    }

    if (emp.maternidade && emp.data_maternidade) {
      const ini = new Date(emp.data_maternidade + 'T00:00:00');
      const fim = emp.data_maternidade_fim
        ? new Date(emp.data_maternidade_fim + 'T00:00:00')
        : hoje;

      const key    = `${emp.id}_${anoAtivo}_${String(mesAtivo+1).padStart(2,'0')}`;
      const mPonto = allPonto[key] || {};
      let   mudouMat = false;

      for (let d = 1; d <= diasMes; d++) {
        const dt = new Date(anoAtivo, mesAtivo, d); dt.setHours(0,0,0,0);
        if (dt.getDay() === 0) continue;
        if (dt < ini || dt > fim) continue;
        if (!mPonto[d] || mPonto[d] === 'maternidade') {
          if (mPonto[d] !== 'maternidade') {
            mPonto[d]   = 'maternidade';
            mudouEmp    = true;
            mudouMat    = true;
          }
        }
      }
      if (mudouMat) allPonto[key] = mPonto;
    }

    if (mudouEmp) houveMudanca = true;
  }

  if (houveMudanca) {
    try {
      window.DB.setMergeSync(PONTO_KEY, function (current) {
        var base = current || {};
        Object.keys(allPonto).forEach(function (k) { base[k] = allPonto[k]; });
        return base;
      });
    } catch (err) {
      console.warn('[gravarHistoricoAfastamento] Falha ao persistir afastamentos:', err.message || err);
    }
  }

  return allPonto;
}

async function renderGrade() {
  _store = await getStore();
  _initialLoad = false;

  const tableEl = document.getElementById('grade-table');
  tableEl.innerHTML = `<tbody><tr><td style="padding:40px;text-align:center;color:var(--muted);font-size:13px">⏳ Carregando...</td></tr></tbody>`;

  let _allPonto;
  if (_pontoCacheLoaded) {
    _allPonto = _pontoCache;
  } else {
    _allPonto = await LS.get(PONTO_KEY, {});
    _pontoCacheLoaded = true;
    _pontoCache = _allPonto;
  }

  const empsParaHistorico = getEmpsDoDepto();
  _allPonto = await gravarHistoricoAfastamento(empsParaHistorico, _allPonto);
  _pontoCache = _allPonto;

  const emps    = empsParaHistorico;
  const hoje    = new Date();
  const diasMes = new Date(anoAtivo, mesAtivo+1, 0).getDate();

  document.getElementById('grade-count').textContent = `${emps.length} funcionário(s)`;

  if (!emps.length) {
    tableEl.innerHTML = `
      <tbody><tr><td style="padding:50px;text-align:center;color:var(--muted)">
        Nenhum funcionário neste departamento.
      </td></tr></tbody>`;
    return;
  }

  let thead = `<thead><tr>
    <th class="emp-col-header">Funcionário</th>`;

  const diasArr = [];
  for (let d=1; d<=diasMes; d++) {
    const dt      = new Date(anoAtivo, mesAtivo, d);
    const dow     = dt.getDay();
    const isDom   = dow === 0;
    const isSab   = dow === 6;
    const isHoje  = (d===hoje.getDate() && mesAtivo===hoje.getMonth() && anoAtivo===hoje.getFullYear());
    const isFerN  = isFeriadoNacional(d, mesAtivo);
    const isFerR  = isFeriadoRegional(d, mesAtivo);
    const isFer   = isFerN || isFerR;
    const nomeFer = isFer ? getNomeFeriado(d, mesAtivo) : '';
    diasArr.push({ d, dow, isDom, isSab, isHoje, isFer, nomeFer });

    let cls = '';
    if (isDom)  cls += ' domingo';
    if (isSab)  cls += ' sabado';
    if (isHoje) cls += ' hoje';
    if (isFer)  cls += ' feriado';

    thead += `<th class="day-col-header${cls}" ${isFer ? `data-feriado="${nomeFer}"` : ''}>
      <div class="day-num">${d}</div>
      <div class="day-dow">${DIAS_SEM[dow]}</div>
    </th>`;
  }

  thead += `</tr></thead>`;

  let tbody = '<tbody>';
  emps.forEach(emp => {
    const _key     = pontoKey(emp.id);
    const pontoMap = _allPonto[_key] || {};
    const ini      = emp.name.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();

    const { bloqueado: bloqHoje, motivo: motivoHoje } = isEmpBloqueado(emp);
    const bloqFuncionario = bloqHoje;

    const avatarStyle = bloqHoje
      ? motivoHoje==='afastado'
        ? 'background:linear-gradient(135deg,#ef4444,#fb923c)'
        : motivoHoje==='maternidade'
          ? 'background:linear-gradient(135deg,#f59e0b,#fbbf24)'
          : motivoHoje==='ferias'
            ? 'background:linear-gradient(135deg,#22d3ee,#4f8ef7)'
            : ''
      : '';

    tbody += `<tr class="emp-row" style="${bloqHoje ? 'opacity:.72' : ''}">
      <td class="emp-info-col">
        <div class="emp-mini-wrap">
          <div class="emp-mini-avatar" style="${avatarStyle}">${ini}</div>
          <div style="flex:1;min-width:0">
    <div class="emp-name-g" data-tooltip="${escHtml(emp.name||'')}">${escHtml(nomeAbrev(emp, emps))}</div>
    <div class="emp-role-g">${escHtml(emp.role||'')}</div>
          </div>
        </div>
      </td>`;

    let cP=0, cF=0, cA=0, cAt=0, cFe=0, cBonus=0;

    diasArr.forEach(({ d, dow, isDom, isSab, isHoje, isFer, nomeFer }) => {
      const statusSalvo = pontoMap[d];

      const bloqDia  = getStatusDiaBloqueado(emp, anoAtivo, mesAtivo, d);
      const colCls   = isDom ? 'domingo-col' : isSab ? 'sabado-col' : '';

      if (bloqDia) {
        const sm = STATUS_META[bloqDia];
        if (bloqDia === 'afastado') cAt++;
        if (bloqDia === 'ferias')   cFe++;

        const periodoAtivo = (() => {
          const hoje2 = new Date(); hoje2.setHours(0,0,0,0);
          if (bloqDia === 'afastado' && emp.afastado) {
            const inicio = emp.data_afastamento
              ? new Date(emp.data_afastamento + 'T00:00:00')
              : new Date(0);
            const dt  = new Date(anoAtivo, mesAtivo, d); dt.setHours(0,0,0,0);
            return dt >= inicio && dt <= hoje2;
          }
          if (bloqDia === 'maternidade' && emp.maternidade && emp.data_maternidade) {
            const ini = new Date(emp.data_maternidade + 'T00:00:00');
            const fim = emp.data_maternidade_fim
              ? new Date(emp.data_maternidade_fim + 'T00:00:00')
              : hoje2;
            const dt  = new Date(anoAtivo, mesAtivo, d); dt.setHours(0,0,0,0);
            return dt >= ini && dt <= fim;
          }
          if (bloqDia === 'ferias' && emp.ferias && emp.data_ferias_inicio && emp.data_ferias_fim) {
            const ini = new Date(emp.data_ferias_inicio + 'T00:00:00');
            const fim = new Date(emp.data_ferias_fim    + 'T00:00:00');
            const dt  = new Date(anoAtivo, mesAtivo, d); dt.setHours(0,0,0,0);
            return dt >= ini && dt <= fim;
          }
          return false;
        })();

        const motivo = periodoAtivo
          ? (bloqDia === 'ferias'
              ? 'Período de férias ativo — edição bloqueada'
              : bloqDia === 'maternidade'
                ? 'Licença Maternidade ativa — edição bloqueada'
                : 'Funcionário afastado — edição bloqueada')
          : (bloqDia === 'ferias'
              ? '🏖️ Histórico de férias — registro preservado'
              : bloqDia === 'maternidade'
                ? '🤰 Histórico de maternidade — registro preservado'
                : '🚫 Histórico de afastamento — registro preservado');

        const dotOpacity = periodoAtivo ? '' : 'opacity:.7;';

        tbody += `<td class="day-cell ${colCls}">
          <div class="status-dot bloqueado ${bloqDia}"
            style="background:${sm.bg};border-color:${sm.border};color:${sm.cor};${dotOpacity}"
            title="${sm.label} — ${motivo}">
            ${sm.emoji}
          </div>
        </td>`;
        return;
      }

      const canEdit  = podeEditar && !bloqDia && !bloqFuncionario;

      if (isDom) {
        if (statusSalvo === 'presente') {
          cP++; cBonus++;
          tbody += `<td class="day-cell domingo-col">
            <div class="status-dot presente-bonus"
              title="☀️ Presente no Domingo (+bônus)"
              ${canEdit ? `onclick="showCtxMenu(event,${emp.id},${d},'presente','domingo')"` : ''}>✅</div>
          </td>`;
        } else if (statusSalvo && statusSalvo !== 'vazio') {
          const sm = STATUS_META[statusSalvo] || STATUS_META.domingo;
          tbody += `<td class="day-cell domingo-col">
            <div class="status-dot ${statusSalvo}"
              style="background:${sm.bg};border-color:${sm.border};color:${sm.cor}"
              title="${sm.label}"
              ${canEdit ? `onclick="showCtxMenu(event,${emp.id},${d},'${statusSalvo}','domingo')"` : ''}>
              ${sm.emoji}
            </div>
          </td>`;
        } else {
          tbody += `<td class="day-cell domingo-col">
            <div class="status-dot domingo-auto"
              title="${bloqFuncionario ? 'Linha bloqueada — ' + (BLOQ_LABEL[motivoHoje] || 'motivo desconhecido') : 'Domingo — clique para marcar presença/bônus'}"
              ${canEdit ? `onclick="showCtxMenu(event,${emp.id},${d},'vazio','domingo')"` : ''}>☀️</div>
          </td>`;
        }
        return;
      }

      if (isSab) {
        const sabDayType = isFer ? 'feriado' : '';
        if (statusSalvo === 'presente') {
          cP++;
          if (isFer) cBonus++;
          tbody += `<td class="day-cell sabado-col">
            <div class="status-dot presente-bonus"
              title="${isFer ? nomeFer + ' — Presente (+bônus)' : 'Presente no Sábado'}"
              ${canEdit ? `onclick="showCtxMenu(event,${emp.id},${d},'presente'${sabDayType ? `,'${sabDayType}'` : ''})"` : ''}>✅</div>
          </td>`;
        } else if (statusSalvo && statusSalvo !== 'vazio') {
          const sm = STATUS_META[statusSalvo] || {};
          if (statusSalvo === 'falta')    cF++;
          if (statusSalvo === 'atestado') cAt++;
          tbody += `<td class="day-cell sabado-col">
            <div class="status-dot ${statusSalvo}"
              style="background:${sm.bg};border-color:${sm.border};color:${sm.cor}"
              title="${isFer ? nomeFer + ' — ' + (sm.label||'') : sm.label}"
              ${canEdit ? `onclick="showCtxMenu(event,${emp.id},${d},'${statusSalvo}'${sabDayType ? `,'${sabDayType}'` : ''})"` : ''}>
              ${sm.emoji}
            </div>
          </td>`;
        } else {
          tbody += `<td class="day-cell sabado-col">
            <div class="status-dot sabado-auto"
              title="${bloqFuncionario ? 'Linha bloqueada — ' + (BLOQ_LABEL[motivoHoje] || 'motivo desconhecido') : (isFer ? nomeFer + ' — clique para marcar presença/bônus' : 'Sábado — clique para marcar')}"
              ${canEdit ? `onclick="showCtxMenu(event,${emp.id},${d},'vazio'${sabDayType ? `,'${sabDayType}'` : ''})"` : ''}></div>
          </td>`;
        }
        return;
      }

      if (isFer && !statusSalvo) {
        tbody += `<td class="day-cell">
          <div class="status-dot feriado"
            title="${nomeFer} — clique para marcar presença/bônus"
            ${canEdit ? `onclick="showCtxMenu(event,${emp.id},${d},'feriado','feriado')"` : ''}>🎉</div>
        </td>`;
        return;
      }

      if (isFer && statusSalvo === 'presente') {
        cP++; cBonus++;
        tbody += `<td class="day-cell">
          <div class="status-dot presente-bonus"
            title="${nomeFer} — Presente (+bônus)"
            ${canEdit ? `onclick="showCtxMenu(event,${emp.id},${d},'presente','feriado')"` : ''}>✅</div>
        </td>`;
        return;
      }

      if (isFer) {
        const sm = STATUS_META[statusSalvo] || {};
        tbody += `<td class="day-cell">
          <div class="status-dot ${statusSalvo||'vazio'}"
            style="${sm ? `background:${sm.bg};border-color:${sm.border};color:${sm.cor}` : ''}"
            title="${nomeFer} — ${sm.label||statusSalvo||'—'}"
            ${canEdit ? `onclick="showCtxMenu(event,${emp.id},${d},'${statusSalvo||'vazio'}','feriado')"` : ''}>
            ${sm.emoji||''}
          </div>
        </td>`;
        return;
      }

      const statusEfetivo = statusSalvo || 'vazio';
      if (statusEfetivo==='presente') cP++;
      if (statusEfetivo==='falta')    cF++;
      if (statusEfetivo==='atestado') cAt++;
      if (statusEfetivo==='ferias')   cFe++;

      const sm       = statusEfetivo !== 'vazio' ? STATUS_META[statusEfetivo] : null;
      const dotStyle = sm ? `background:${sm.bg};border-color:${sm.border};color:${sm.cor}` : '';
      const dotTitle = bloqFuncionario
        ? `${sm?.label || '—'} — linha bloqueada: ${BLOQ_LABEL[motivoHoje] || 'motivo desconhecido'}`
        : (sm ? sm.label : 'Clique para registrar');
      const emoji    = sm ? sm.emoji : '';

      tbody += `<td class="day-cell">
        <div class="status-dot ${statusEfetivo}"
          style="${dotStyle}"
          title="${dotTitle}"
          ${canEdit ? `onclick="showCtxMenu(event,${emp.id},${d},'${statusEfetivo}')"` : ''}>
          ${emoji}
        </div>
      </td>`;
    });

    tbody += `</tr>`;
  });

  tbody += '</tbody>';
  document.getElementById('grade-table').innerHTML = thead + tbody;
}

let ctxEmpId   = null;
let ctxEmpName = '';
let ctxDia     = null;
let ctxAtual   = null;

function showCtxMenu(e, empId, dia, statusAtual, dayType) {
  e.preventDefault();
  e.stopPropagation();
  ctxEmpId = empId; ctxDia = dia; ctxAtual = statusAtual;
  var empList = (typeof getMyEmployees==='function') ? getMyEmployees() : [];
  ctxEmpName = (empList.find(function(e){return String(e.id)===String(empId)})||{}).name || 'funcionário';
  ctxDotEl = e.currentTarget || e.target;

  const menu   = document.getElementById('ctx-menu');
  const options = (dayType === 'domingo' || dayType === 'feriado')
    ? ['presente']
    : ['presente','falta','atestado','folga'];

  menu.innerHTML = options.map(s=>{
    const sm   = STATUS_META[s];
    const ativo = s === statusAtual;
    return `<div class="ctx-item ${ativo?'':''}
      style="${ativo?'background:var(--surface3)':''}"
      onclick="setStatusCtx('${s}')">
      <div class="ctx-dot" style="background:${sm.cor}"></div>
      ${sm.emoji} ${sm.label}
      ${ativo?'<span style="margin-left:auto;font-size:10px;color:var(--muted)">✓</span>':''}
    </div>`;
  }).join('') + `
    <div style="height:1px;background:var(--border);margin:4px 0"></div>
    <div class="ctx-item" onclick="if(confirm('Limpar o status deste dia para '+ctxEmpName+'?'))setStatusCtx('vazio')"
      style="color:var(--muted)">
      <div class="ctx-dot" style="background:var(--surface3);border:1px solid var(--border)"></div>
      Limpar
    </div>`;

  const x = Math.min(e.clientX, window.innerWidth  - 180);
  const y = Math.min(e.clientY, window.innerHeight - 260);
  menu.style.left = x + 'px';
  menu.style.top  = y + 'px';
  menu.classList.add('open');
}

async function setStatusCtx(status) {
  if (ctxEmpId === null) return;
  let store, emp;
  try {
    store = await getStore();
    emp   = (store.employees||[]).find(e=>String(e.id)===String(ctxEmpId));
  } catch (e) {
    console.error('[setStatusCtx] Erro ao carregar store:', e);
    showToast('❌ Erro ao carregar dados.', 'err');
    return;
  }

  if (!_pontoCacheLoaded) {
    try {
      _pontoCache = await LS.get(PONTO_KEY, {});
      _pontoCacheLoaded = true;
    } catch (e) {
      console.error('[setStatusCtx] Erro ao carregar ponto:', e);
      showToast('❌ Erro ao carregar ponto.', 'err');
      return;
    }
  }
  const bloqDia = getStatusDiaBloqueado(emp, anoAtivo, mesAtivo, ctxDia);
  if (bloqDia) {
    const periodoAtivo = (() => {
      if (bloqDia === 'afastado' && emp?.afastado) return true;
      if (bloqDia === 'maternidade' && emp?.maternidade) return true;
      if (bloqDia === 'ferias' && emp?.ferias) return true;
      return false;
    })();
    const motivo = periodoAtivo
      ? (bloqDia === 'ferias' ? 'férias' : bloqDia === 'maternidade' ? 'licença maternidade' : 'afastamento')
      : (bloqDia === 'ferias' ? 'histórico de férias' : bloqDia === 'maternidade' ? 'histórico de maternidade' : 'histórico de afastamento');
    showToast(`🚫 Edição bloqueada — ${emp?.name||'funcionário'}: ${motivo}.`, 'warn');
    closeCtx();
    return;
  }

  const anterior = (_pontoCache[pontoKey(ctxEmpId)] || {})[ctxDia] || 'vazio';
  if (anterior === status) { closeCtx(); return; }

  const sm = STATUS_META[status];

  const empId     = ctxEmpId;
  const dia       = ctxDia;
  const dotEl     = ctxDotEl;
  const dotOldCls = dotEl?.className;
  const dotOldSty = dotEl?.getAttribute('style');
  const dotOldTxt = dotEl?.textContent;
  const dotOldTit = dotEl?.title;
  const empName   = emp?.name || String(empId);

  if (dotEl) {
    if (status === 'vazio') {
      dotEl.className = 'status-dot vazio';
      dotEl.removeAttribute('style');
      dotEl.textContent = '';
      dotEl.title = 'Clique para registrar';
    } else if (sm) {
      dotEl.className = `status-dot ${status}`;
      dotEl.style.cssText = `background:${sm.bg};border-color:${sm.border};color:${sm.cor}`;
      dotEl.textContent = sm.emoji;
      dotEl.title = sm.label;
    }
  }
  closeCtx();

  setStatus(empId, dia, status).then(async () => {
    _scheduleRender();
    if (status === 'atestado') {
      const criada = await _criarOcAtestado(emp, dia);
      if (criada) showToast('🏥 Ocorrência de atestado criada automaticamente. Gerencie em Ocorrências.');
    }
    if (anterior === 'atestado' && status !== 'atestado') {
      if (confirm('🏥 Este dia tinha "Atestado". Deseja remover também a ocorrência de atestado?')) {
        const removida = await _removerOcAtestado(emp, dia);
        if (removida) showToast('🗑️ Ocorrência de atestado removida.');
        else showToast('ℹ️ Nenhuma ocorrência de atestado encontrada para este dia.');
      }
    }
    registrarLog('editou', 'Ponto', `<strong>${empName}</strong> dia ${dia} → ${sm?.emoji||''} ${sm?.label||status}`);
  }).catch(() => {
    if (dotEl) {
      dotEl.className = dotOldCls || 'status-dot vazio';
      if (dotOldSty) dotEl.setAttribute('style', dotOldSty);
      else dotEl.removeAttribute('style');
      dotEl.textContent = dotOldTxt || '';
      dotEl.title = dotOldTit || '';
    }
  });
}

function closeCtx() {
  document.getElementById('ctx-menu').classList.remove('open');
  ctxEmpId = ctxDia = ctxAtual = null; ctxDotEl = null;
}

async function _criarOcAtestado(emp, dia) {
  try {
    const list = await LS.get(OC_KEY, []);
    const exists = list.some(o =>
      o.pontoRef &&
      String(o.pontoRef.empId) === String(emp.id) &&
      o.pontoRef.ano === anoAtivo &&
      o.pontoRef.mes === mesAtivo &&
      o.pontoRef.dia === dia
    );
    if (exists) return false;
    list.unshift({
      id: uid(),
      ts: new Date(anoAtivo, mesAtivo, dia).toISOString(),
      empId: emp.id,
      empName: emp.name,
      empDept: emp.dept || '',
      empFilial: emp.filial || '',
      tipo: 'atestado',
      desc: `Atestado — gerado automaticamente pelo ponto (${dia}/${String(mesAtivo+1).padStart(2,'0')}/${anoAtivo})`,
      obs: '',
      cid: '',
      status: 'pendente',
      respName: currentUser.name,
      respId: currentUser.id,
      createdAt: new Date().toISOString(),
      pontoRef: { empId: emp.id, ano: anoAtivo, mes: mesAtivo, dia },
    });
    await LS.set(OC_KEY, list);
    return true;
  } catch (e) {
    console.error('[criarOcAtestado]', e);
    return false;
  }
}

async function _removerOcAtestado(emp, dia) {
  try {
    const list = await LS.get(OC_KEY, []);
    const antes = list.length;
    const filtrada = list.filter(o => !(
      o.pontoRef &&
      String(o.pontoRef.empId) === String(emp.id) &&
      o.pontoRef.ano === anoAtivo &&
      o.pontoRef.mes === mesAtivo &&
      o.pontoRef.dia === dia
    ));
    if (filtrada.length === antes) return false;
    await LS.set(OC_KEY, filtrada);
    return true;
  } catch (e) {
    console.error('[removerOcAtestado]', e);
    return false;
  }
}

document.addEventListener('click', e=>{
  if (!document.getElementById('ctx-menu').contains(e.target)) closeCtx();
});
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeCtx(); });

const _ferTip = document.getElementById('feriado-tooltip');
document.addEventListener('mouseover', e => {
  const th = e.target.closest('th[data-feriado]');
  if (!th) return;
  _ferTip.textContent = '🎉 ' + th.dataset.feriado;
  _ferTip.classList.add('show');
});
document.addEventListener('mousemove', e => {
  if (!_ferTip.classList.contains('show')) return;
  const th = e.target.closest('th[data-feriado]');
  if (!th) { _ferTip.classList.remove('show'); return; }
  const rect = th.getBoundingClientRect();
  _ferTip.style.left = (rect.left + rect.width/2 - _ferTip.offsetWidth/2) + 'px';
  _ferTip.style.top  = (rect.top - _ferTip.offsetHeight - 10) + 'px';
});
document.addEventListener('mouseleave', () => _ferTip.classList.remove('show'), true);

const _empTip = document.getElementById('emp-tooltip');
document.addEventListener('mouseover', e => {
  const el = e.target.closest('[data-tooltip]');
  if (!el) return;
  _empTip.textContent = el.dataset.tooltip;
  _empTip.style.opacity = '1';
});
document.addEventListener('mousemove', e => {
  const el = e.target.closest('[data-tooltip]');
  if (!el) { _empTip.style.opacity = '0'; return; }
  const rect = el.getBoundingClientRect();
  const tx = rect.left;
  const ty = rect.top - _empTip.offsetHeight - 8;
  const maxX = window.innerWidth - _empTip.offsetWidth - 8;
  _empTip.style.left = Math.min(tx, maxX) + 'px';
  _empTip.style.top  = ty + 'px';
});
document.addEventListener('mouseout', e => {
  if (!e.target.closest('[data-tooltip]')) _empTip.style.opacity = '0';
});

async function lancamentoRapido(status) {
  if (!podeEditar) { showToast('⚠️ Sem permissão para editar ponto.','warn'); return; }
  const diaInput = document.getElementById('lancamento-dia');
  const dia      = parseInt(diaInput.value);
  const diasMes  = new Date(anoAtivo, mesAtivo+1, 0).getDate();

  if (!dia || dia < 1 || dia > diasMes) {
    showToast(`⚠️ Informe um dia válido (1–${diasMes}).`, 'warn');
    diaInput.focus(); return;
  }

  const dtLanc = new Date(anoAtivo, mesAtivo, dia);
  const dowLanc = dtLanc.getDay();
  const isDomLanc = dowLanc === 0;
  const isFerLanc = isFeriadoNacional(dia, mesAtivo) || isFeriadoRegional(dia, mesAtivo);
  if ((isDomLanc || isFerLanc) && status !== 'presente') {
    showToast(`⚠️ ${isFerLanc ? getNomeFeriado(dia, mesAtivo) : 'Domingo'} — só pode marcar "Presente" (bônus).`, 'warn');
    return;
  }

  const emps = getEmpsDoDepto();
  let marcados = 0;
  const changes = {};

  emps.forEach(emp => {
    const { bloqueado: bloqGlobal } = isEmpBloqueado(emp);
    if (bloqGlobal) return;
    const bloqDia = getStatusDiaBloqueado(emp, anoAtivo, mesAtivo, dia);
    if (bloqDia) return;
    const key = pontoKey(emp.id);
    changes[key] = status;
    marcados++;
  });

  if (marcados === 0) {
    showToast(`ℹ️ Nenhum funcionário alterado.`, 'warn');
    return;
  }

  try {
    var merged = window.DB.setMergeSync(PONTO_KEY, function (all) {
      var current = all || {};
      Object.keys(changes).forEach(function (key) {
        var s = changes[key];
        var m = current[key] || {};
        if (s === 'vazio') delete m[dia];
        else m[dia] = s;
        current[key] = m;
      });
      return current;
    });
    _pontoCache = merged;
    _pontoCacheLoaded = true;
  } catch (e) {
    console.error('[lancamentoRapido] Erro ao salvar ponto:', e);
    showToast('❌ Erro ao salvar marcações. Verifique sua conexão.', 'err');
    return;
  }

  const sm   = STATUS_META[status];
  const dept = deptAtivo || 'todos';

  if (marcados > 0) {
    showToast(`✅ ${sm.emoji} ${sm.label} marcado para ${marcados} funcionário(s) no dia ${dia}.`);
    const empIds = emps.filter(emp => {
      const { bloqueado } = isEmpBloqueado(emp);
      return !bloqueado;
    }).map(e => e.id);
    syncAbsencesEmBatch(empIds, merged).catch(e => console.error('[lancamentoRapido] syncAbsencesEmBatch', e));
    renderGrade();
    registrarLog('editou', 'Ponto', `Lançamento rápido: <strong>${sm.emoji} ${sm.label}</strong> — dia ${dia} — ${marcados} func. (${dept})`);
  } else {
    showToast(`ℹ️ Nenhum funcionário alterado.`, 'warn');
  }
}

function atualizarGrade() {
  renderGrade();
  showToast('✅ Grade atualizada!');
}

window.addEventListener('page-refresh', async function () {
  console.log('[Ponto] Dados atualizados via sync, re-renderizando...');
  _pontoCacheLoaded = false;
  _pontoCache = {};
  _store = null;
  setTimeout(function () { renderGrade(); }, 100);
});
