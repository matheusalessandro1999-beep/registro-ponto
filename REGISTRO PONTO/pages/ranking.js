// ════════════════════════════════════════════════════════
// ranking.js — Ranking Geral
// ════════════════════════════════════════════════════════

// ── Tooltip global dos pilares ──
const PILAR_TIPS = {};

function buildPilarTips(w) {
  PILAR_TIPS.desemp = `
    <div class="pilar-tip-title">🎯 Pilar 1 — Desempenho (${w.perf}%)</div>
    <div class="pilar-tip-formula">Contribuição = nota × ${w.perf}%</div>
    <div class="pilar-tip-desc">
      Nota de <strong>0 a 100</strong> inserida manualmente pelo líder.
      Representa o rendimento geral — metas, qualidade, volume de trabalho
      ou qualquer critério que o gestor defina.<br><br>
      É o dado mais subjetivo dos três pilares.
    </div>`;

  PILAR_TIPS.apt = `
    <div class="pilar-tip-title">⭐ Pilar 2 — Aptidões (${w.apt}%)</div>
    <div class="pilar-tip-formula">Média(10 competências) × 10 × ${w.apt}%</div>
    <div class="pilar-tip-desc">
      Cada competência recebe uma nota de <strong>0 a 10</strong>.<br>
      A média das 10 é multiplicada por 10 para virar percentual.<br><br>
      <strong>Exemplo:</strong> média 7,5 → 75 pontos brutos → 75 × ${w.apt}% = <strong>${(75*w.apt/100).toFixed(1)} pts</strong> no score final.
    </div>`;

  PILAR_TIPS.assid = `
    <div class="pilar-tip-title">📅 Pilar 3 — Assiduidade (${w.abs}%)</div>
    <div class="pilar-tip-formula">[ 100 − (faltas ÷ 36) × 100 ] × ${w.abs}%</div>
    <div class="pilar-tip-desc">
      Calculado automaticamente pelo registro de ponto.<br><br>
      <strong>Exemplo:</strong> 4 faltas → 100 − (4÷36)×100 = 88,9 pts → 88,9 × ${w.abs}% = <strong>${(88.9*w.abs/100).toFixed(1)} pts</strong> no score final.<br><br>
      ⚠️ Atestado conta como <strong>meia falta</strong>. Máximo tolerado configurável em <em>Configurações</em>.
    </div>`;

  PILAR_TIPS.bonus = `
    <div class="pilar-tip-title">🌟 Bônus Domingo & Feriado</div>
    <div class="pilar-tip-formula">+0,5pt por dia trabalhado · máx. +5pt</div>
    <div class="pilar-tip-desc">
      Cada <strong>domingo</strong> ou <strong>feriado</strong> (nacional ou regional)
      com presença marcada acrescenta <strong>+0,5 ponto</strong> ao score final.<br><br>
      Bônus máximo: <strong>+5 pontos</strong> (10 domingos/feriados trabalhados).<br><br>
      Aparece como <strong>⭐+N</strong> abaixo do score na tabela.
    </div>`;
}

let _pTip = null;

function _positionTip(pill) {
  if (!_pTip) return;
  const rect  = pill.getBoundingClientRect();
  const tw    = _pTip.offsetWidth  || 300;
  const th    = _pTip.offsetHeight || 200;
  let   left  = rect.left + rect.width / 2 - tw / 2;
  let   top   = rect.top - th - 12;
  left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
  if (top < 8) top = rect.bottom + 10;
  _pTip.style.left = left + 'px';
  _pTip.style.top  = top  + 'px';
}

// ════════════════════════════════════════════════════════
// ESTADO
// ════════════════════════════════════════════════════════
let currentUser = null;
let _store      = null;
let _allPonto   = {};
let _pontoCache   = null;
let _pontoCacheT  = 0;
const PONTO_TTL   = 5000;
let sortKey     = 'score';
let sortAsc     = false;

const escHtml = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const MONTHS_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                     'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  _pTip = document.getElementById('pilar-tooltip');

  document.addEventListener('mouseover', e => {
    const pill = e.target.closest('.pilar-pill[data-tip]');
    if (!pill || !_pTip) return;
    const key = pill.dataset.tip;
    if (!PILAR_TIPS[key]) return;
    _pTip.innerHTML = PILAR_TIPS[key];
    _pTip.classList.add('show');
    _positionTip(pill);
  });
  document.addEventListener('mousemove', e => {
    if (!_pTip || !_pTip.classList.contains('show')) return;
    const pill = e.target.closest('.pilar-pill[data-tip]');
    if (!pill) { _pTip.classList.remove('show'); return; }
    _positionTip(pill);
  });
  document.addEventListener('mouseleave', () => {
    if (_pTip) _pTip.classList.remove('show');
  }, true);

  currentUser = await requireSession();
  if (!currentUser) return;
  if (typeof canSee === 'function' && !canSee(currentUser, 'ranking')) {
    showToast && showToast('❌ Acesso negado.','error');
    setTimeout(() => window.location.href = '../index.html', 2000); return;
  }

  initTheme();
  initSidebar('ranking', currentUser);
  await renderRanking();
  buildSelects();
  hideLoading();
});

// ════════════════════════════════════════════════════════
// HELPERS DE SCORE
// ════════════════════════════════════════════════════════
function getWeights() {
  const cfg = _store?.config || {};
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
function calcAptMedia(emp, monthKey) {
  const snap = (emp.competencies_history||{})[monthKey];
  if (snap) return APT_KEYS.reduce((s,k)=>s+(snap[k]||0),0)/APT_KEYS.length;
  const c = emp.competencies || {};
  return APT_KEYS.reduce((s,k)=>s+(c[k]||0),0)/APT_KEYS.length;
}
function monthOverlapVacation(emp, ano, mesIdx) {
  if (!emp.ferias || !emp.data_ferias_inicio || !emp.data_ferias_fim) return false;
  const ini = new Date(emp.data_ferias_inicio + 'T00:00:00');
  const fim = new Date(emp.data_ferias_fim    + 'T00:00:00');
  const mStart = new Date(ano, mesIdx, 1);
  const mEnd   = new Date(ano, mesIdx + 1, 0);
  return ini <= mEnd && fim >= mStart;
}
function calcAssid(emp, monthIdx) {
  if (emp.afastado || emp.maternidade) return 100;
  const abs = (emp.absences||[])[monthIdx] ?? 0;
  const maxAbs = Math.max(1, Math.round((_store?.config?.maxAbs||36) / 12));
  return Math.max(0, 100 - (abs / maxAbs) * 100);
}
function calcBonus(emp, ano, mesStr) {
  const BONUS_POR_DIA = 0.5;
  const BONUS_MAX     = 5;
  try {
    const allPonto = _allPonto;
    const feriadosCustom = _store?.config?.feriadosCustom || [];
    const ferNac = [
      {d:1,m:0},{d:21,m:3},{d:1,m:4},{d:7,m:8},
      {d:12,m:9},{d:2,m:10},{d:15,m:10},{d:25,m:11}
    ];
    let diasBonus = 0;
    const key  = `${emp.id}_${ano}_${mesStr}`;
    const dias = allPonto[key] || {};
    Object.entries(dias).forEach(([dStr, status]) => {
      if (status !== 'presente') return;
      const d   = parseInt(dStr);
      const dt  = new Date(parseInt(ano), parseInt(mesStr)-1, d);
      const dow = dt.getDay();
      if (dow === 0) { diasBonus++; return; }
      if (ferNac.some(f => f.d===d && f.m===(parseInt(mesStr)-1))) { diasBonus++; return; }
      if (feriadosCustom.some(f => f.chave===`${mesStr}-${dStr}`)) { diasBonus++; }
    });
    return Math.min(BONUS_MAX, diasBonus * BONUS_POR_DIA);
    } catch(e) { console.error('[calcBonus]', e); return 0; }
}
function calcScore(emp, monthKey, monthIdx, ano, mesStr) {
  if (emp.afastado || emp.maternidade || monthOverlapVacation(emp, ano, monthIdx)) return null;
  const w     = getWeights();
  const perfVal = emp.perf_history?.[monthKey] ?? emp.perf ?? 0;
  const base  = perfVal*(w.perf/100) + calcAptMedia(emp, monthKey)*10*(w.apt/100) + calcAssid(emp, monthIdx)*(w.abs/100);
  const bonus = calcBonus(emp, ano, mesStr);
  return Math.min(100, Math.round(base + bonus));
}
function getStatus(score) {
  if (score>=85) return { tag:'promo', label:'🏆 Promoção', cls:'tag-promo' };
  if (score>=70) return { tag:'ok',    label:'✅ Regular',  cls:'tag-ok'    };
  if (score>=55) return { tag:'watch', label:'⚠️ Atenção',  cls:'tag-watch' };
  return               { tag:'risk',  label:'🔴 Risco',    cls:'tag-risk'  };
}

function getMyEmployees() {
  return getSupervisedEmployees(currentUser);
}

// ════════════════════════════════════════════════════════
// SELECTS
// ════════════════════════════════════════════════════════
function buildSelects() {
  const emps  = getMyEmployees();
  const depts = [...new Set(emps.map(e=>e.dept))].filter(Boolean).sort();
  const w     = getWeights();

  buildPilarTips(w);
  document.getElementById('rank-subtitle').innerHTML = `
    <span style="color:var(--muted);font-size:11px;font-weight:600;margin-right:4px">Score Tri-Pilar:</span>

    <span class="pilar-pill" style="background:rgba(79,142,247,.15);color:var(--accent);border:1px solid rgba(79,142,247,.25)"
      data-tip="desemp">
      🎯 Desempenho ${w.perf}%
    </span>

    <span class="pilar-sep">+</span>

    <span class="pilar-pill" style="background:rgba(167,139,250,.15);color:var(--accent2);border:1px solid rgba(167,139,250,.25)"
      data-tip="apt">
      ⭐ Aptidões ${w.apt}%
    </span>

    <span class="pilar-sep">+</span>

    <span class="pilar-pill" style="background:rgba(52,211,153,.15);color:var(--green);border:1px solid rgba(52,211,153,.25)"
      data-tip="assid">
      📅 Assiduidade ${w.abs}%
    </span>

    <span class="pilar-sep">+</span>

    <span class="pilar-pill" style="background:rgba(251,191,36,.15);color:var(--yellow);border:1px solid rgba(251,191,36,.25)"
      data-tip="bonus">
      🌟 Bônus Dom./Feriado
    </span>
  `;

  const fSel    = document.getElementById('filter-filial');
  const curFil  = fSel.value;
  const filiais = [...new Set(getMyEmployees().map(e=>e.filial))].filter(Boolean).sort();
  fSel.innerHTML = '<option value="">Todas as filiais</option>' +
         filiais.map(f=>`<option value="${escHtml(f)}" ${f===curFil?'selected':''}>${escHtml(f)}</option>`).join('');

  const dSel = document.getElementById('filter-dept');
  const curDept = dSel.value;
  dSel.innerHTML = '<option value="">Todos os departamentos</option>' +
    depts.map(d =>
      `<option value="${escHtml(d)}" ${d === curDept ? 'selected' : ''}>${escHtml(d)}</option>`
    ).join('');

  const tSel    = document.getElementById('filter-turno');
  const curTurno = tSel.value;
  const turnos  = [...new Set(emps.map(e=>e.turno))].filter(Boolean).sort();
  tSel.innerHTML = '<option value="">Todos os turnos</option>' +
    turnos.map(t=>`<option value="${escHtml(t)}" ${t===curTurno?'selected':''}>${escHtml(t)}</option>`).join('');

  const aSel = document.getElementById('filter-ano');
  const now  = new Date();
  const anos = [];
  for (let y = now.getFullYear(); y >= 2022; y--) anos.push(y);
  aSel.innerHTML = anos.map(y=>
    `<option value="${y}" ${y===now.getFullYear()?'selected':''}>${y}</option>`
  ).join('');

  const mSel = document.getElementById('filter-mes');
  mSel.innerHTML = MONTHS_FULL.map((m,i)=>
    `<option value="${i}" ${i===now.getMonth()?'selected':''}>${m}</option>`
  ).join('');
}

// ════════════════════════════════════════════════════════
// SORT
// ════════════════════════════════════════════════════════
function setSort(el, key) {
  sortKey = key;
  sortAsc = false;
  document.querySelectorAll('.sort-chip').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
  renderRanking();
}

function toggleSort(key) {
  if (sortKey === key) sortAsc = !sortAsc;
  else { sortKey = key; sortAsc = false; }
  updateSortIcons();
  renderRanking();
}

function updateSortIcons() {
  ['name','score','perf','apt','assid'].forEach(k => {
    const el = document.getElementById(`si-${k}`);
    if (!el) return;
    el.textContent = sortKey===k ? (sortAsc?'↑':'↓') : '↕';
    el.style.opacity = sortKey===k ? '1' : '.5';
    el.style.color   = sortKey===k ? 'var(--accent)' : '';
  });
}

// ════════════════════════════════════════════════════════
// RENDER RANKING
// ════════════════════════════════════════════════════════
function motivoFora(emp, ano, mesIdx) {
  if (emp.afastado) return '🚫 Afastado';
  if (emp.maternidade) return '🤰 Lic. Maternidade';
  if (monthOverlapVacation(emp, ano, mesIdx)) return '🏖️ Férias';
  return null;
}

async function renderRanking() {
  _store    = await getStore();

  const agora = Date.now();
  if (!_pontoCache || agora - _pontoCacheT > PONTO_TTL) {
    _allPonto = await LS.get('rh_ponto', {});
    _pontoCache = _allPonto;
    _pontoCacheT = agora;
  } else {
    _allPonto = _pontoCache;
  }

  document.getElementById('rank-tbody').innerHTML =
    `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--muted)">🔄 Carregando…</td></tr>`;

  const filial = document.getElementById('filter-filial').value;
  const dept   = document.getElementById('filter-dept').value;
  const turno  = document.getElementById('filter-turno').value;
  let mesIdx = parseInt(document.getElementById('filter-mes').value);
  if (isNaN(mesIdx)) mesIdx = new Date().getMonth();
  const ano    = parseInt(document.getElementById('filter-ano').value) || new Date().getFullYear();
  const mesStr = String(mesIdx + 1).padStart(2, '0');
  const monthKey = `${ano}-${mesStr}`;
  let   list   = getMyEmployees();
  if (filial) list = list.filter(e=>e.filial===filial);
  if (dept)   list = list.filter(e=>e.dept===dept);
  if (turno)  list = list.filter(e=>e.turno===turno);
  if (!list.length) {
    document.getElementById('podium-row').innerHTML = '';
    document.getElementById('rank-tbody').innerHTML =
      `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--muted)">Nenhum funcionário encontrado.</td></tr>`;
    document.getElementById('ranking-badge').textContent = '0 funcionários';
    return;
  }

  const ativos    = [];
  const inativos  = [];
  list.forEach(e => {
    const score = calcScore(e, monthKey, mesIdx, ano, mesStr);
    const _perf = e.perf_history?.[monthKey] ?? e.perf ?? 0;
    const enriched = {
      ...e,
      _perf, _score: score,
      _apt:   +calcAptMedia(e, monthKey).toFixed(1),
      _assid: score !== null ? Math.round(calcAssid(e, mesIdx)) : 0,
      _bonus: score !== null ? calcBonus(e, ano, mesStr) : 0,
    };
    const motivo = motivoFora(e, ano, mesIdx);
    if (motivo) inativos.push({ ...enriched, _motivo: motivo });
    else        ativos.push(enriched);
  });

  const sortFn = (a,b) => {
    let va, vb;
    switch(sortKey) {
      case 'perf':  va=a._perf;  vb=b._perf;  break;
      case 'apt':   va=a._apt;   vb=b._apt;   break;
      case 'assid': va=a._assid; vb=b._assid; break;
      default:      va=a._score; vb=b._score; break;
    }
    return sortAsc ? va-vb : vb-va;
  };
  ativos.sort(sortFn);

  document.getElementById('ranking-badge').textContent =
    `${ativos.length} ativos${inativos.length ? ` · ${inativos.length} fora` : ''}`;
  updateSortIcons();

  renderPodium(ativos.slice(0,3));
  renderTable(ativos, inativos);
}

// ════════════════════════════════════════════════════════
// PÓDIO TOP 3
// ════════════════════════════════════════════════════════
function renderPodium(top3) {
  const display = top3.length >= 3
    ? [top3[1], top3[0], top3[2]]
    : top3.length === 2
      ? [top3[1], top3[0]]
      : top3;

  const medals  = ['🥈','🥇','🥉'];
  const realPos = top3.length >= 3
    ? [1, 0, 2]
    : top3.length === 2 ? [1,0] : [0];

  const GRAD_COLORS = [
    ['#4f8ef7','#a78bfa'],
    ['#fbbf24','#fb923c'],
    ['#c2855a','#a78bfa'],
  ];

  document.getElementById('podium-row').innerHTML = display.map((emp, idx) => {
    if (!emp) return '';
    const origIdx = realPos[idx];
    const medal   = medals[idx];
    const isFirst = origIdx === 0;
    const st      = getStatus(emp._score);
    const ini     = emp.name.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();
    const [c1,c2] = GRAD_COLORS[idx] || GRAD_COLORS[0];
    const w       = getWeights();

    return `
    <div class="podium-card ${isFirst?'first':''}">
      <span class="podium-medal">${medal}</span>
      <div class="podium-avatar" style="${emp.foto ? '' : `background:linear-gradient(135deg,${c1},${c2})`}">${emp.foto ? `<img src="${emp.foto}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : ini}</div>
      <div class="podium-name">${emp.name}</div>
      <div class="podium-dept">${emp.dept||''}</div>
      <div class="podium-score">${emp._score}</div>
      <div class="podium-breakdown">
        Des: <strong>${emp._perf}%</strong>
        &nbsp;Apt: <strong>${emp._apt}</strong>
        &nbsp;Ass: <strong>${emp._assid}%</strong>
        ${emp._bonus > 0 ? `&nbsp;⭐ Bônus: <strong style="color:var(--yellow)">+${emp._bonus}</strong>` : ''}
      </div>
      <span class="podium-tag ${st.cls}">${st.label}</span>
    </div>`;
  }).join('');
}

// ════════════════════════════════════════════════════════
// TABELA
// ════════════════════════════════════════════════════════
function renderTable(ativos, inativos = []) {
  const tbody = document.getElementById('rank-tbody');
  if (!ativos.length && !inativos.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--muted)">Sem dados</td></tr>`;
    return;
  }

  const posClasses = ['gold','silver','bronze'];

  function buildRow(emp, pos, isInativo) {
    const posCls   = isInativo ? '' : (posClasses[pos-1] || '');
    const st       = getStatus(emp._score);
    const ini      = emp.name.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();
    const barColor = isInativo ? 'var(--muted)'
      : emp._score>=85?'#34d399':emp._score>=70?'#4f8ef7':emp._score>=55?'#fbbf24':'#f87171';
    const posLabel = isInativo
      ? `<span style="font-size:11px;color:var(--muted)">—</span>`
      : pos<=3 ? ['🥇','🥈','🥉'][pos-1] : pos;

    const w   = getWeights();
    const bd  = {
      perf:  isInativo ? 0 : +(emp._perf*(w.perf/100)).toFixed(1),
      apt:   isInativo ? 0 : +(emp._apt*10*(w.apt/100)).toFixed(1),
      abs:   isInativo ? 0 : +(emp._assid*(w.abs/100)).toFixed(1),
      bonus: isInativo ? 0 : (emp._bonus||0),
    };

    const tooltip = isInativo ? '' :
      `Desempenho: ${emp._perf}% × ${w.perf}% = ${bd.perf}pt` +
      ` | Aptidões: ${emp._apt}/10 × 10 × ${w.apt}% = ${bd.apt}pt` +
      ` | Assiduidade: ${emp._assid}% × ${w.abs}% = ${bd.abs}pt` +
      (bd.bonus > 0 ? ` | Bônus: +${bd.bonus}pt` : '');

    return `
    <tr style="${isInativo ? 'opacity:0.55' : ''}">
      <td><div class="pos-num ${posCls}">${posLabel}</div></td>
      <td>
        <div class="name-cell">
          <div class="mini-avatar" style="${isInativo?'opacity:.5':''}">
            ${ini}
          </div>
          <div>
            <div class="emp-name-text">${emp.name}</div>
            ${emp.matricula?`<div style="font-size:10px;color:var(--muted)">Mat. ${emp.matricula}</div>`:''}
          </div>
        </div>
      </td>
      <td title="${tooltip}">
        <div class="score-cell">
          <div class="score-bar-bg">
            <div class="score-bar-fill" style="width:${isInativo?0:emp._score}%;background:${barColor}"></div>
          </div>
          <div class="score-num" style="color:${barColor}">${isInativo?'—':emp._score}</div>
        </div>
        ${!isInativo ? `
        <div class="score-breakdown" style="margin-top:3px">
          <div class="score-seg" style="flex:${bd.perf+.01};background:#4f8ef7" title="Desempenho"></div>
          <div class="score-seg" style="flex:${bd.apt+.01};background:#a78bfa"  title="Aptidões"></div>
          <div class="score-seg" style="flex:${bd.abs+.01};background:#34d399"  title="Assiduidade"></div>
          ${bd.bonus>0?`<div class="score-seg" style="flex:${bd.bonus+.01};background:#fbbf24" title="Bônus"></div>`:''}
        </div>` : ''}
        ${!isInativo && emp._bonus > 0 ? `<div style="font-size:9px;color:var(--yellow);font-weight:700;text-align:center">⭐+${emp._bonus}</div>` : ''}
      </td>
      <td>
        <div class="pilar-bar-wrap">
          <div style="display:flex;align-items:center;gap:6px">
            <span class="pilar-val" style="color:#4f8ef7">${isInativo?'—':emp._perf+'%'}</span>
            ${!isInativo?`<span class="pilar-pt">+${bd.perf}pt</span>`:''}
          </div>
          <div class="pilar-bar-bg"><div class="pilar-bar-fill" style="width:${isInativo?0:emp._perf}%;background:#4f8ef7"></div></div>
        </div>
      </td>
      <td>
        <div class="pilar-bar-wrap">
          <div style="display:flex;align-items:center;gap:6px">
            <span class="pilar-val" style="color:#a78bfa">${isInativo?'—':emp._apt+'/10'}</span>
            ${!isInativo?`<span class="pilar-pt">+${bd.apt}pt</span>`:''}
          </div>
          <div class="pilar-bar-bg"><div class="pilar-bar-fill" style="width:${isInativo?0:emp._apt*10}%;background:#a78bfa"></div></div>
        </div>
      </td>
      <td>
        <div class="pilar-bar-wrap">
          <div style="display:flex;align-items:center;gap:6px">
            <span class="pilar-val" style="color:${isInativo?'var(--muted)':(emp._assid>=70?'#34d399':'#f87171')}">${isInativo?'—':emp._assid+'%'}</span>
            ${!isInativo?`<span class="pilar-pt">+${bd.abs}pt</span>`:''}
          </div>
          <div class="pilar-bar-bg"><div class="pilar-bar-fill" style="width:${isInativo?0:emp._assid}%;background:${isInativo?'var(--muted)':(emp._assid>=70?'#34d399':'#f87171')}"></div></div>
        </div>
      </td>
      <td>
        ${isInativo
          ? `<span class="tag" style="background:rgba(148,163,184,.12);color:var(--muted);border:1px solid rgba(148,163,184,.2)">${emp._motivo}</span>`
          : `<span class="tag ${st.cls}">${st.label}</span>`}
      </td>
    </tr>`;
  }

  let html = ativos.slice(3).map((emp, i) => buildRow(emp, i+4, false)).join('');

  if (inativos.length) {
    html += `
    <tr>
      <td colspan="7" style="padding:10px 20px 6px;background:var(--surface2)">
        <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted)">
          ⏸ Fora do ranking ativo — ${inativos.length} ${inativos.length===1?'funcionário':'funcionários'}
        </span>
      </td>
    </tr>`;
    html += inativos.map(emp => buildRow(emp, null, true)).join('');
  }

  tbody.innerHTML = html;
}
