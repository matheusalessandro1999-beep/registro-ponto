// ════════════════════════════════════════════════════════
// absenteeism.js — Absenteísmo
// ════════════════════════════════════════════════════════

// ── ESTADO ──
let currentUser  = null;
let chartBarras  = null;
let _store       = null;
let _allPonto    = {};

const MONTHS_FULL  = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                      'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  currentUser = await requireSession();
  if (!currentUser) return;
  if (typeof canSee === 'function' && !canSee(currentUser, 'absenteeism')) {
    showToast && showToast('❌ Acesso negado.', 'error');
    setTimeout(() => window.location.href = '../index.html', 2000); return;
  }

  initTheme();
  initSidebar('absenteeism', currentUser);

  const now = new Date();
  document.getElementById('abs-date').textContent =
    now.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  buildAnoSelect();
  buildMesSelect();
  await renderAll();
  buildFilialSelect();
  buildDeptSelect();
  buildTurnoSelect();

  window.addEventListener('page-refresh', () => {
    buildAnoSelect();
    buildMesSelect();
    renderAll();
  });
  hideLoading();
});

// ════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════
function getMyEmployees() {
  return getSupervisedEmployees(currentUser);
}

function getFilteredEmps() {
  const filial = document.getElementById('filter-filial').value;
  const dept   = document.getElementById('filter-dept').value;
  const turno  = document.getElementById('filter-turno').value;
  let list     = getMyEmployees();
  if (filial) list = list.filter(e => e.filial === filial);
  if (dept)   list = list.filter(e => e.dept   === dept);
  if (turno)  list = list.filter(e => e.turno  === turno);
  return list;
}

function getMesIndex() {
  const val = document.getElementById('filter-mes')?.value;
  const idx = parseInt(val);
  return isNaN(idx) ? new Date().getMonth() : idx;
}

function getAnoIndex() {
  const val = document.getElementById('filter-ano')?.value;
  const idx = parseInt(val);
  return isNaN(idx) ? new Date().getFullYear() : idx;
}

// ════════════════════════════════════════════════════════
// LEITURA DO rh_ponto
// ════════════════════════════════════════════════════════
const PONTO_KEY = 'rh_ponto';

function getFaltasMes(emp, mesIdx, ano) {
  try {
    const allPonto = _allPonto || {};
    const key  = `${emp.id}_${ano}_${String(mesIdx + 1).padStart(2, '0')}`;
    const dias = allPonto[key] || {};

    if (Object.keys(dias).length === 0) {
      return (emp.absences || [])[mesIdx] || 0;
    }

    let f = 0;
    Object.entries(dias).forEach(([diaStr, s]) => {
      const diaN = parseInt(diaStr);
      const dow  = new Date(ano, mesIdx, diaN).getDay();
      if (dow === 0) return;
      if (s === 'falta') f += 1;
    });
    return f;
  } catch (e) {
    console.error('getFaltasMes error', e, { emp: emp?.id, mesIdx, ano });
    return (emp.absences || [])[mesIdx] || 0;
  }
}

function getFaltasAnual(emp, ano) {
  let total = 0;
  for (let m = 0; m < 12; m++) total += getFaltasMes(emp, m, ano);
  return total;
}

function getPeriodoAnterior(mes, ano) {
  if (mes > 0) return { mes: mes - 1, ano };
  return { mes: 11, ano: ano - 1 };
}

function getDiasUteis(mes, ano) {
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  let count = 0;
  for (let d = 1; d <= diasNoMes; d++) {
    if (new Date(ano, mes, d).getDay() !== 0) count++;
  }
  return count;
}

// ════════════════════════════════════════════════════════
// SELECTS
// ════════════════════════════════════════════════════════
function buildAnoSelect() {
  const now  = new Date();
  const sel  = document.getElementById('filter-ano');
  const cur  = sel.value;
  const anos = [];
  for (let y = now.getFullYear(); y >= 2024; y--) anos.push(y);
  sel.innerHTML = anos.map(y =>
    `<option value="${y}">${y}</option>`
  ).join('');
  sel.value = String(cur || now.getFullYear());
}

function buildMesSelect() {
  const now = new Date();
  const sel = document.getElementById('filter-mes');
  const cur = sel.value;
  sel.innerHTML = MONTHS_FULL.map((m, i) =>
    `<option value="${i}">${m}</option>`
  ).join('');
  sel.value = String(cur || now.getMonth());
}

function buildFilialSelect() {
  const emps    = getMyEmployees();
  const filiais = [...new Set(emps.map(e => e.filial))].filter(Boolean).sort();
  const sel     = document.getElementById('filter-filial');
  const cur     = sel.value;
  sel.innerHTML = '<option value="">Todas as filiais</option>' +
    filiais.map(f => `<option value="${f}" ${f === cur ? 'selected' : ''}>${f}</option>`).join('');
}

function buildDeptSelect() {
  const emps  = getMyEmployees();
  const depts = [...new Set(emps.map(e => e.dept))].filter(Boolean).sort();
  const sel   = document.getElementById('filter-dept');
  const cur   = sel.value;
  sel.innerHTML = '<option value="">Todos os departamentos</option>' +
    depts.map(d => `<option value="${d}" ${d === cur ? 'selected' : ''}>${d}</option>`).join('');
}

function buildTurnoSelect() {
  const emps   = getMyEmployees();
  const turnos = [...new Set(emps.map(e => e.turno))].filter(Boolean).sort();
  const sel    = document.getElementById('filter-turno');
  const cur    = sel.value;
  sel.innerHTML = '<option value="">Todos os turnos</option>' +
    turnos.map(t => `<option value="${t}" ${t === cur ? 'selected' : ''}>${t}</option>`).join('');
}

// ════════════════════════════════════════════════════════
// RENDER ALL
// ════════════════════════════════════════════════════════
async function renderAll() {
  const kpiRow = document.getElementById('kpi-row');
  if (kpiRow) kpiRow.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);grid-column:1/-1">Carregando...</div>';

  _store    = await getStore();
  _allPonto = await LS.get(PONTO_KEY, {});

  const emps = getFilteredEmps();
  const mes  = getMesIndex();
  const ano  = getAnoIndex();

  const badgeMes = document.getElementById('badge-mes-atual');
  if (badgeMes) badgeMes.textContent = MONTHS_FULL[mes] + ' ' + ano;

  renderKPIs(emps, mes, ano);
  renderBarras(emps, mes, ano);
  renderHeatmap(emps, mes, ano);
  renderTabela(emps, mes, ano);
}

// ════════════════════════════════════════════════════════
// KPIs
// ════════════════════════════════════════════════════════
function renderKPIs(emps, mes, ano) {
  const total       = emps.length;
  const faltasMes   = emps.reduce((s, e) => s + getFaltasMes(e, mes, ano), 0);
  const { mes: mesAnt, ano: anoAnt } = getPeriodoAnterior(mes, ano);
  const faltasMesAnt = emps.reduce((s, e) => s + getFaltasMes(e, mesAnt, anoAnt), 0);

  const diasUteis = getDiasUteis(mes, ano);
  const taxaAbs     = total ? ((faltasMes / (total * diasUteis)) * 100).toFixed(1) : '0.0';
  const afetados    = emps.filter(e => getFaltasMes(e, mes, ano) > 0).length;
  const pctAfetados = total ? Math.round((afetados / total) * 100) : 0;
  const totalAnual  = emps.reduce((s, e) => s + getFaltasAnual(e, ano), 0);
  const mediaPessoa = total ? (totalAnual / total).toFixed(1) : '0.0';

  const varPct = faltasMesAnt > 0
    ? ((faltasMes - faltasMesAnt) / faltasMesAnt * 100).toFixed(0)
    : null;
  const varStr = varPct !== null
    ? (varPct > 0 ? `↑ ${varPct}% vs mês anterior` : `↓ ${Math.abs(varPct)}% vs mês anterior`)
    : 'sem dados anteriores';

  document.getElementById('kpi-row').innerHTML = `
    <div class="kpi-card red">
      <div class="kpi-label">Faltas no Mês</div>
      <div class="kpi-value">${faltasMes}</div>
      <div class="kpi-sub">${varStr}</div>
    </div>
    <div class="kpi-card orange">
      <div class="kpi-label">Taxa Absenteísmo</div>
      <div class="kpi-value">${taxaAbs}%</div>
      <div class="kpi-sub">meta: &lt; 6%</div>
    </div>
    <div class="kpi-card yellow">
      <div class="kpi-label">Funcionários Afetados</div>
      <div class="kpi-value">${afetados}</div>
      <div class="kpi-sub">${pctAfetados}% do total</div>
    </div>
    <div class="kpi-card cyan">
      <div class="kpi-label">Média por Pessoa</div>
      <div class="kpi-value">${mediaPessoa} <small style="font-size:16px;letter-spacing:0">dias</small></div>
      <div class="kpi-sub">no período</div>
    </div>`;
}

// ════════════════════════════════════════════════════════
// GRÁFICO BARRAS
// ════════════════════════════════════════════════════════
function renderBarras(emps, mes, ano) {
  const labels = [];
  const data   = [];

  for (let i = 11; i >= 0; i--) {
    const d   = new Date(ano, mes - i, 1);
    const m   = d.getMonth();
    const y   = d.getFullYear();
    const lbl = MONTHS_SHORT[m] + (y !== ano ? `'${String(y).slice(2)}` : '');
    labels.push(lbl);
    const total = emps.reduce((s, e) => s + getFaltasMes(e, m, y), 0);
    data.push(total);
  }

  const bgColors = data.map(v => {
    const max = Math.max(...data, 1);
    const t   = v / max;
    return t > .7 ? 'rgba(248,113,113,.8)' : t > .4 ? 'rgba(251,146,60,.7)' : 'rgba(248,113,113,.45)';
  });
  const bdColors = data.map(v => {
    const max = Math.max(...data, 1);
    return (v / max) > .7 ? '#f87171' : '#fb923c';
  });

  if (chartBarras) {
    chartBarras.data.labels = labels;
    chartBarras.data.datasets[0].data = data;
    chartBarras.data.datasets[0].backgroundColor = bgColors;
    chartBarras.data.datasets[0].borderColor = bdColors;
    chartBarras.update();
    return;
  }

  chartBarras = new Chart(document.getElementById('chart-barras'), {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: bgColors, borderColor: bdColors, borderWidth: 2, borderRadius: 5 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1a1e2e', borderColor: '#2a2f45', borderWidth: 1,
          titleColor: '#e2e8f0', bodyColor: '#94a3b8',
          callbacks: { label: ctx => ` ${ctx.parsed.y} faltas` },
        },
      },
      scales: {
        x: { grid: { color: 'rgba(42,47,69,.5)' }, ticks: { color: '#64748b', font: { size: 10 } } },
        y: { grid: { color: 'rgba(42,47,69,.5)' }, ticks: { color: '#64748b', font: { size: 10 } } },
      },
    },
  });
}

// ════════════════════════════════════════════════════════
// HEATMAP SEMANAL
// ════════════════════════════════════════════════════════
function renderHeatmap(emps, mes, ano) {
  document.getElementById('heatmap-title').textContent = `Heatmap Mensal — ${MONTHS_FULL[mes]} ${ano}`;

  const vals = [0, 0, 0, 0, 0, 0, 0];
  emps.forEach(emp => {
    const key  = `${emp.id}_${ano}_${String(mes + 1).padStart(2, '0')}`;
    const dias = (_allPonto || {})[key] || {};
    Object.entries(dias).forEach(([diaStr, s]) => {
      if (s !== 'falta') return;
      const diaN = parseInt(diaStr);
      const dow  = new Date(ano, mes, diaN).getDay();
      if (dow === 0) return;
      vals[dow] += 1;
    });
  });
  const valsRnd = vals.map(v => Math.round(v));

  const maxVal = Math.max(...valsRnd, 1);

  function heatColor(v) {
    if (v === 0) return { bg: 'rgba(42,47,69,.4)', color: 'var(--muted)' };
    const t = v / maxVal;
    if (t > .6) return { bg: 'rgba(248,113,113,.35)', color: '#f87171' };
    if (t > .3) return { bg: 'rgba(251,191,36,.28)', color: '#fbbf24' };
    return { bg: 'rgba(52,211,153,.22)', color: '#34d399' };
  }

  document.getElementById('heatmap-days').innerHTML = valsRnd.map((v, i) => {
    const { bg, color } = heatColor(v);
    const domStyle = i === 0 ? 'opacity:0.5;' : '';
    return `<div class="heat-cell" style="background:${bg};color:${color};${domStyle}">${v}</div>`;
  }).join('');
}

// ════════════════════════════════════════════════════════
// TABELA TOP FALTOSOS
// ════════════════════════════════════════════════════════
function renderTabela(emps, mes, ano) {
  const diasUteis = getDiasUteis(mes, ano);

  const { mes: mesAnt, ano: anoAnt } = getPeriodoAnterior(mes, ano);
  const sorted = [...emps]
    .map(e => ({
      ...e,
      faltasMes: getFaltasMes(e, mes, ano),
      faltasAnt: getFaltasMes(e, mesAnt, anoAnt),
    }))
    .filter(e => e.faltasMes > 0)
    .sort((a, b) => b.faltasMes - a.faltasMes)
    .slice(0, 10);

  const tbody = document.getElementById('abs-table-body');

  if (!sorted.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--muted)">
      Nenhuma falta registrada neste período.
    </td></tr>`;
    return;
  }

  tbody.innerHTML = sorted.map(e => {
    const pct  = ((e.faltasMes / diasUteis) * 100).toFixed(1);
    const ini  = e.name.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase();

    const faltasAnt = e.faltasAnt;
    let tendencia, trendCls;
    if (e.faltasMes > faltasAnt + 1) {
      tendencia = '↑ Alto'; trendCls = 'trend-alto';
    } else if (e.faltasMes >= faltasAnt - 1) {
      tendencia = '→ Médio'; trendCls = 'trend-medio';
    } else {
      tendencia = '↓ Baixo'; trendCls = 'trend-baixo';
    }

    let statusHtml;
    if (e.faltasMes >= 6) {
      statusHtml = `<span class="status-badge status-critico">🔴 Crítico</span>`;
    } else if (e.faltasMes >= 3) {
      statusHtml = `<span class="status-badge status-atencao">⚠️ Atenção</span>`;
    } else {
      statusHtml = `<span class="status-badge status-regular">✅ Regular</span>`;
    }

    return `
    <tr>
      <td>
        <div class="emp-cell">
          <div class="emp-mini-avatar">${ini}</div>
          <span>${escHtml(e.name)}</span>
        </div>
      </td>
      <td style="color:var(--muted)">${e.dept || '—'}</td>
      <td><span class="faltas-val" style="color:${e.faltasMes >= 6 ? '#f87171' : e.faltasMes >= 3 ? '#fbbf24' : '#34d399'}">${e.faltasMes}</span></td>
      <td><span class="pct-val">${pct}%</span></td>
      <td><span class="trend-badge ${trendCls}">${tendencia}</span></td>
      <td>${statusHtml}</td>
    </tr>`;
  }).join('');
}

// ════════════════════════════════════════════════════════
// EXPORTAR
// ════════════════════════════════════════════════════════
function exportarRelatorio() {
  showToast('📋 Abrindo relatório para impressão...', 'ok');
  setTimeout(() => window.print(), 600);
}
