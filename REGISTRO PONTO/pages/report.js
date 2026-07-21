// ════════════════════════════════════════════════════════
// report.js — Lógica da página de Relatório
// ════════════════════════════════════════════════════════

let currentUser = null;
let _store      = null;
let _allPonto   = {};

const MESES_FULL  = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                     'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const APT_LABELS  = { qual:'Qualidade',prio:'Proatividade',know:'Conhecimento',
                      comm:'Comunicação',prod:'Produtividade',assid:'Assiduidade',
                      org:'Organização',equip:'Equipe',cria:'Criatividade',motv:'Motivação' };
const APT_EMOJIS  = { qual:'✨',prio:'⚡',know:'📚',comm:'💬',prod:'📈',
                      assid:'📅',org:'🗂️',equip:'🤝',cria:'💡',motv:'🔥' };

// ════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  currentUser = await requireSession();
  if (!currentUser) return;
  if (typeof canSee === 'function' && !canSee(currentUser, 'report')) {
    showToast && showToast('❌ Acesso negado.','error');
    setTimeout(() => window.location.href = '../index.html', 2000); return;
  }

  initTheme();
  initSidebar('report', currentUser);
  await buildSelects();
  hideLoading();
});

// ════════════════════════════════════════════════════════
// SELECTS
// ════════════════════════════════════════════════════════
async function buildSelects() {
  _store = await getStore();
  const store = _store;
  const now   = new Date();
  const ano   = now.getFullYear();

  const mesOpts = MESES_FULL.map((m,i) =>
    `<option value="${i}" ${i===now.getMonth()?'selected':''}>${m} ${ano}</option>`
  ).join('');
  document.getElementById('cfg-mes-de').innerHTML  = mesOpts;
  document.getElementById('cfg-mes-ate').innerHTML = mesOpts;
  document.getElementById('cfg-mes-de').value = '0';

  const emps  = getMyEmployees();
  const depts = [...new Set(emps.map(e=>e.dept))].filter(Boolean).sort();
  document.getElementById('cfg-dept').innerHTML =
    '<option value="">Todos (geral)</option>' +
    depts.map(d=>`<option value="${d}">${d}</option>`).join('');

  document.getElementById('cfg-filial').innerHTML =
    '<option value="">Todas</option>' +
    (store.filiais||[]).map(f=>`<option value="${f.nome}">${f.nome}</option>`).join('');

  document.getElementById('cfg-employee').innerHTML =
    '<option value="">Todos (geral)</option>' +
    emps.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
}

// ════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════
function getMyEmployees() {
  return getSupervisedEmployees(currentUser);
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
function getCompetenciesForRange(emp, mesDe, mesAte) {
  const ano = new Date().getFullYear();
  for (let m = mesAte; m >= mesDe; m--) {
    const mk = `${ano}-${String(m + 1).padStart(2, '0')}`;
    const snap = (emp.competencies_history || {})[mk];
    if (snap) return snap;
  }
  return {};
}
function calcAptMedia(emp, mesDe, mesAte) {
  const c = getCompetenciesForRange(emp, mesDe, mesAte);
  return APT_KEYS.reduce((s,k)=>s+(c[k]||0),0)/APT_KEYS.length;
}
function getTotalFaltasEmp(emp, mesDe, mesAte) {
  try {
    const ano = new Date().getFullYear();
    const de  = mesDe ?? 0;
    const ate = mesAte ?? 11;
    let total = 0;
    let temDados = false;
    for (let m = de; m <= ate; m++) {
      const key  = `${emp.id}_${ano}_${String(m+1).padStart(2,'0')}`;
      const dias = _allPonto[key] || {};
      if (Object.keys(dias).length > 0) temDados = true;
      Object.entries(dias).forEach(([diaStr, s]) => {
        if (new Date(ano, m, parseInt(diaStr)).getDay() === 0) return;
        if (s === 'falta') total += 1;
      });
    }
    return temDados ? total : (emp.absences||[]).slice(de, ate+1).reduce((a,b)=>a+b, 0);
  } catch(e) {
    const de  = mesDe ?? 0;
    const ate = mesAte ?? 11;
    return (emp.absences||[]).slice(de, ate+1).reduce((a,b)=>a+b, 0);
  }
}
function calcAssid(emp, mesDe, mesAte) {
  if (emp.afastado || emp.maternidade) return 100;
  const total  = getTotalFaltasEmp(emp, mesDe, mesAte);
  const de     = mesDe ?? 0;
  const ate    = mesAte ?? 11;
  const meses  = ate - de + 1;
  let maxAbs   = ((_store?.config?.maxAbs||36) / 12) * meses;
  if (maxAbs <= 0) maxAbs = 1;
  return Math.max(0, 100 - (total / maxAbs) * 100);
}
function calcBonus(emp, mesDe, mesAte) {
  const BONUS_POR_DIA = 0.5;
  const BONUS_MAX     = 5;
  try {
    const ano = new Date().getFullYear();
    const feriadosCustom = _store?.config?.feriadosCustom || [];
    const ferNac = [
      {d:1,m:0},{d:21,m:3},{d:1,m:4},{d:7,m:8},
      {d:12,m:9},{d:2,m:10},{d:15,m:10},{d:25,m:11}
    ];
    let diasBonus = 0;
    for (let m = mesDe; m <= mesAte; m++) {
      const mesStr = String(m + 1).padStart(2, '0');
      const key    = `${emp.id}_${ano}_${mesStr}`;
      const dias   = _allPonto[key] || {};
      Object.entries(dias).forEach(([dStr, status]) => {
        if (status !== 'presente') return;
        const d   = parseInt(dStr);
        const dow = new Date(ano, m, d).getDay();
        if (dow === 0) { diasBonus++; return; }
        if (ferNac.some(f => f.d===d && f.m===m)) { diasBonus++; return; }
        const diaStr = String(d).padStart(2, '0');
        if (feriadosCustom.some(f => f.chave===`${mesStr}-${diaStr}`)) { diasBonus++; }
      });
    }
    return Math.min(BONUS_MAX, diasBonus * BONUS_POR_DIA);
  } catch(e) { console.error('[calcBonus report]', e); return 0; }
}
function calcScore(emp, mesDe, mesAte) {
  const w     = getWeights();
  const mk    = `${new Date().getFullYear()}-${String(mesAte+1).padStart(2,'0')}`;
  const perf  = emp.perf_history?.[mk] ?? emp.perf ?? 0;
  const bonus = calcBonus(emp, mesDe, mesAte);
  return Math.min(100, Math.round(
    perf*(w.perf/100)+calcAptMedia(emp, mesDe, mesAte)*10*(w.apt/100)+calcAssid(emp, mesDe, mesAte)*(w.abs/100)+bonus
  ));
}
function getStatus(score) {
  if (score>=85) return { cls:'ds-promo', label:'🏆 Promoção' };
  if (score>=70) return { cls:'ds-ok',    label:'✅ Regular'  };
  if (score>=55) return { cls:'ds-watch', label:'⚠️ Atenção'  };
  return               { cls:'ds-risk',  label:'🔴 Risco'    };
}
function barColor(score) {
  if (score>=85) return '#059669';
  if (score>=70) return '#2563eb';
  if (score>=55) return '#d97706';
  return '#dc2626';
}

// ════════════════════════════════════════════════════════
// GERAR RELATÓRIO
// ════════════════════════════════════════════════════════
async function gerarRelatorio() {
  const btn = document.getElementById('btn-gerar');
  const txtOriginal = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '⏳ Gerando...';
  try {
  _store = await getStore();
  _allPonto = await LS.get('rh_ponto', {});
  const mesDe   = parseInt(document.getElementById('cfg-mes-de').value);
  const mesAte  = parseInt(document.getElementById('cfg-mes-ate').value);
  const deptFlt = document.getElementById('cfg-dept').value;
  const filFlt  = document.getElementById('cfg-filial').value;
  const empFlt  = document.getElementById('cfg-employee').value;
  const sortKey = document.getElementById('cfg-sort').value;
  const limite  = parseInt(document.getElementById('cfg-limite').value);
  const w       = getWeights();
  const now     = new Date();
  const ano     = now.getFullYear();

  let emps = getMyEmployees();
  if (deptFlt) emps = emps.filter(e=>e.dept===deptFlt);
  if (filFlt)  emps = emps.filter(e=>e.filial===filFlt);
  if (empFlt)  emps = emps.filter(e=>e.id===empFlt);

  if (mesDe > mesAte) {
    showToast('⚠️ O período "De" deve ser anterior ao "Até".','warn');
    return;
  }
  if (!emps.length) {
    showToast('⚠️ Nenhum funcionário encontrado com esses filtros.','warn');
    return;
  }

  const enriched = emps.map(e => ({
    ...e,
    _score: calcScore(e, mesDe, mesAte),
    _apt:   +calcAptMedia(e, mesDe, mesAte).toFixed(1),
    _assid: Math.round(calcAssid(e, mesDe, mesAte)),
    _bonus: calcBonus(e, mesDe, mesAte),
    _totalAbs: (e.absences||[]).slice(mesDe, mesAte+1).reduce((a,b)=>a+b,0),
  }));

  enriched.sort((a,b) => {
    const mk = `${ano}-${String(mesAte+1).padStart(2,'0')}`;
    switch(sortKey) {
      case 'perf':  return (b.perf_history?.[mk]??b.perf??0) - (a.perf_history?.[mk]??a.perf??0);
      case 'apt':   return b._apt   - a._apt;
      case 'assid': return b._assid - a._assid;
      default:      return b._score - a._score;
    }
  });

  const lista = limite > 0 ? enriched.slice(0, limite) : enriched;

  const total    = enriched.length;
  const avgScore = Math.round(enriched.reduce((s,e)=>s+e._score,0)/total);
  const avgPerf  = Math.round(enriched.reduce((s,e)=>{
    const mk = `${ano}-${String(mesAte+1).padStart(2,'0')}`;
    return s+(e.perf_history?.[mk]??e.perf??0);
  },0)/total);
  const avgAssid = Math.round(enriched.reduce((s,e)=>s+e._assid,0)/total);
  const totalAbs = enriched.reduce((s,e)=>s+e._totalAbs,0);
  const avgApt   = (enriched.reduce((s,e)=>s+e._apt,0)/total).toFixed(1);
  const avgBonus = (enriched.reduce((s,e)=>s+e._bonus,0)/total).toFixed(1);
  const promos   = enriched.filter(e=>e._score>=85);
  const riscos   = enriched.filter(e=>e._score<55);

  const aptMedias = {};
  APT_KEYS.forEach(k => {
    aptMedias[k] = +(enriched.reduce((s,e)=>{
      const c = getCompetenciesForRange(e, mesDe, mesAte);
      return s+(c[k]||0);
    },0)/total).toFixed(1);
  });

  const periodoLabel = mesDe===mesAte
    ? `${MESES_FULL[mesDe]} ${ano}`
    : `${MESES_FULL[mesDe].slice(0,3)} – ${MESES_FULL[mesAte].slice(0,3)} ${ano}`;

  const empSelecionado = empFlt ? enriched.find(e=>e.id===empFlt) : null;
  const empLabel   = empSelecionado ? empSelecionado.name : '';
  const isIndivid  = !!empFlt;
  const deptLabel  = deptFlt  || 'Todos (geral)';
  const filialLabel= filFlt   || 'Todas';
  const emitido    = now.toLocaleDateString('pt-BR');

  const html = `
  <div class="doc-header">
    <div>
      <div class="doc-logo-name">CD Nagumo</div>
      <div class="doc-logo-sub">${isIndivid ? 'Relatório de Desempenho Individual' : 'Relatório de Desempenho da Equipe'}</div>
      <div class="doc-logo-tags">
        ${isIndivid ? `<span class="doc-tag">👤 ${empLabel}</span>` : `<span class="doc-tag">🏢 ${filialLabel}</span>`}
        <span class="doc-tag">👥 Gestão de Pessoas</span>
      </div>
    </div>
    <div class="doc-meta">
      <div>📅 <strong>Período:</strong> ${periodoLabel}</div>
      <div>📋 <strong>Emitido em:</strong> ${emitido}</div>
      <div>🏢 <strong>Departamento:</strong> ${deptLabel}</div>
      <div style="margin-top:4px;font-size:6.5pt;color:#94a3b8">
        Fórmula: (Desempenho × ${w.perf}%) + (Aptidões × ${w.apt}%) + (Assiduidade × ${w.abs}%) + Bônus Dom/Feriado
      </div>
    </div>
  </div>

  <div class="doc-section">
    <div class="doc-section-title">📊 Resumo Executivo</div>
    <div class="resumo-grid">
      <div class="resumo-box">
        <div class="resumo-label">Funcionários</div>
        <div class="resumo-val blue">${total}</div>
      </div>
      <div class="resumo-box">
        <div class="resumo-label">Score Médio</div>
        <div class="resumo-val">${avgScore}</div>
      </div>
      <div class="resumo-box">
        <div class="resumo-label">Desemp. Médio</div>
        <div class="resumo-val green">${avgPerf}%</div>
      </div>
      <div class="resumo-box">
        <div class="resumo-label">Assid. Média</div>
        <div class="resumo-val green">${avgAssid}%</div>
      </div>
      <div class="resumo-box">
        <div class="resumo-label">Total Faltas</div>
        <div class="resumo-val red">${totalAbs}</div>
      </div>
      <div class="resumo-box">
        <div class="resumo-label">Aptidões Médias</div>
        <div class="resumo-val purple">${avgApt}/10</div>
      </div>
      <div class="resumo-box">
        <div class="resumo-label">⭐ Promoção</div>
        <div class="resumo-val green">${promos.length}</div>
      </div>
      <div class="resumo-box">
        <div class="resumo-label">🌟 Bônus Médio</div>
        <div class="resumo-val" style="color:#fbbf24">+${avgBonus}</div>
      </div>
    </div>
    ${riscos.length ? `
    <div class="resumo-box" style="max-width:100px;margin-top:6px">
      <div class="resumo-label">🔴 Risco Imediato</div>
      <div class="resumo-val red">${riscos.length}</div>
    </div>` : ''}
  </div>

  ${promos.length ? `
  <div class="doc-section">
    <div class="alert-box alert-promo">
      <span class="alert-icon">🏆</span>
      <span><strong>Candidatos à Promoção (Score ≥ 85):</strong>
      ${promos.slice(0,5).map(e=>`<strong>${e.name}</strong>`).join(', ')}${promos.length>5?` e mais ${promos.length-5}`:''} — colaboradores com excelente performance.</span>
    </div>
  </div>` : ''}
  ${riscos.length ? `
  <div class="doc-section">
    <div class="alert-box alert-risco">
      <span class="alert-icon">⚠️</span>
      <span><strong>Funcionários em Risco (Score &lt; 55):</strong>
      ${riscos.map(e=>`<strong>${e.name}</strong>`).join(', ')} — recomenda-se ação imediata de desenvolvimento.</span>
    </div>
  </div>` : ''}

  <div class="doc-section">
    <div class="doc-section-title">⭐ Competências Médias (0–10)</div>
    <div class="comp-grid">
      ${APT_KEYS.slice(0,5).map(k=>`
      <div class="comp-box">
        <span class="comp-icon">${APT_EMOJIS[k]}</span>
        <span class="comp-label">${APT_LABELS[k]}</span>
        <span class="comp-val">${aptMedias[k]}</span>
      </div>`).join('')}
    </div>
  </div>

  <div class="doc-section">
    <div class="doc-section-title">🏆 Ranking Geral de Desempenho</div>
    <div class="rank-table-wrap">
    <table class="rank-table">
      <thead>
        <tr>
          <th style="width:24px">#</th>
          <th>Funcionário</th>
          <th>Cargo / Depto</th>
          <th style="width:110px">📈 Desemp.</th>
          <th style="width:100px">⭐ Aptidões</th>
          <th style="width:100px">📅 Assiduidade</th>
          <th style="width:38px">Score</th>
          <th style="width:50px">Bônus</th>
          <th style="width:64px">Status</th>
        </tr>
      </thead>
      <tbody>
        ${lista.map((emp, i) => {
          const pos  = i+1;
          const st   = getStatus(emp._score);
          const bc   = barColor(emp._score);
          const medal= pos===1?'🥇':pos===2?'🥈':pos===3?'🥉':pos;
          return `
          <tr>
            <td class="pos-cell">${medal}</td>
            <td style="font-weight:600;font-size:8.5pt">${emp.name}</td>
            <td style="color:#64748b;font-size:7.5pt">${emp.role||''}${emp.dept?'<br>'+emp.dept:''}</td>
            <td>
              <div class="mini-bar-wrap">
                <div class="mini-bar-bg"><div class="mini-bar-fill" style="width:${emp.perf_history?.[`${ano}-${String(mesAte+1).padStart(2,'0')}`]??emp.perf??0}%;background:#2563eb"></div></div>
                <span style="font-size:8pt;font-weight:700;color:#2563eb;min-width:28px;text-align:right">${emp.perf_history?.[`${ano}-${String(mesAte+1).padStart(2,'0')}`]??emp.perf??0}%</span>
              </div>
            </td>
            <td>
              <div class="mini-bar-wrap">
                <div class="mini-bar-bg"><div class="mini-bar-fill" style="width:${emp._apt*10}%;background:#7c3aed"></div></div>
                <span style="font-size:8pt;font-weight:700;color:#7c3aed;min-width:32px;text-align:right">${emp._apt}/10</span>
              </div>
            </td>
            <td>
              <div class="mini-bar-wrap">
                <div class="mini-bar-bg"><div class="mini-bar-fill" style="width:${emp._assid}%;background:${emp._assid>=70?'#059669':'#dc2626'}"></div></div>
                <span style="font-size:8pt;font-weight:700;color:${emp._assid>=70?'#059669':'#dc2626'};min-width:28px;text-align:right">${emp._assid}%</span>
              </div>
            </td>
            <td class="mini-score" style="color:${bc}">${emp._score}</td>
            <td style="font-size:8pt;font-weight:700;color:${emp._bonus>0?'#fbbf24':'#64748b'};text-align:center">${emp._bonus>0?'+'+emp._bonus:'—'}</td>
            <td><span class="doc-tag-status ${st.cls}">${st.label}</span></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    </div>
  </div>

  <div class="doc-footer">
    <span>CD Nagumo · RH Performance</span>
    <span>Relatório gerado automaticamente · Sistema Integrado de Gestão</span>
  </div>`;

  document.getElementById('doc-a4').innerHTML = html;
  showToast('✅ Relatório gerado! Use o botão Imprimir para salvar em PDF.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = txtOriginal;
  }
}

// ════════════════════════════════════════════════════════
// IMPRIMIR
// ════════════════════════════════════════════════════════
function imprimirRelatorio() {
  const doc = document.getElementById('doc-a4');
  if (doc.children.length <= 1 && !doc.querySelector('.doc-header')) {
    showToast('⚠️ Gere o relatório primeiro.','warn'); return;
  }
  window.print();
}

window.addEventListener('page-refresh', async function () {
  console.log('[Relatório] Dados atualizados via sync, recarregando...');
  window.location.reload();
});
