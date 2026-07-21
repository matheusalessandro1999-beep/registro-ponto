// ════════════════════════════════════════════════════════
// quadro.js — Quadro Operacional
// ════════════════════════════════════════════════════════

// ── ESTADO ──
let currentUser    = null;
let filialAtiva    = null;
let podeEditar     = false;
let quadroData     = {};
let tabAtiva       = 'quadro';

const escHtml = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const escJs = s => String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");

const TURNO_CORES = [
  { border:'#4f8ef7', title:'#4f8ef7', total:'#34d399' },
  { border:'#34d399', title:'#34d399', total:'#22d3ee' },
  { border:'#f472b6', title:'#f472b6', total:'#fbbf24' },
  { border:'#fb923c', title:'#fb923c', total:'#a78bfa' },
  { border:'#a78bfa', title:'#a78bfa', total:'#22d3ee' },
  { border:'#22d3ee', title:'#22d3ee', total:'#34d399' },
];

// ════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  currentUser = await requireSession();
  if (!currentUser) return;
  if (typeof canSee === 'function' && !canSee(currentUser, 'quadro')) {
    showToast && showToast('❌ Acesso negado.','error');
    setTimeout(() => window.location.href = '../index.html', 2000); return;
  }

  initTheme();
  initSidebar('quadro', currentUser);

  podeEditar = (typeof can === 'function')
    ? can(currentUser, 'quadro', 'edit_vagas')
    : currentUser.nivel === 'admin_master';

  const tabVagasBtn = document.getElementById('tab-btn-vagas');
  if (tabVagasBtn) tabVagasBtn.style.display = podeEditar ? 'inline-flex' : 'none';

  const btnSalvar = document.getElementById('btn-salvar');
  if (btnSalvar) {
    btnSalvar.style.display = podeEditar ? 'inline-flex' : 'none';
    btnSalvar.disabled = !podeEditar;
  }

  await carregarQuadroData();
  await buildFilialRow();
  hideLoading();
});

// ════════════════════════════════════════════════════════
// TABS
// ════════════════════════════════════════════════════════
function setTab(tab) {
  tabAtiva = tab;

  document.getElementById('tab-btn-quadro').classList.toggle('active', tab === 'quadro');
  const tbv = document.getElementById('tab-btn-vagas');
  if (tbv) tbv.classList.toggle('active', tab === 'vagas');

  document.getElementById('quadro-content').style.display = tab === 'quadro' ? '' : 'none';
  document.getElementById('vagas-content').style.display  = tab === 'vagas'  ? '' : 'none';

  const btnSalvar = document.getElementById('btn-salvar');
  if (btnSalvar) btnSalvar.style.display = (podeEditar && tab === 'vagas') ? 'inline-flex' : 'none';

  if (tab === 'vagas' && filialAtiva) renderVagasContent();
}

// ════════════════════════════════════════════════════════
// PERSISTÊNCIA
// ════════════════════════════════════════════════════════
async function carregarQuadroData() {
  quadroData = await LS.get('rh_quadro', {});
}

async function salvarQuadro() {
  if (!podeEditar) { showToast('⚠️ Sem permissão para editar o quadro.', 'warn'); return; }
  if (!filialAtiva) { showToast('⚠️ Selecione uma filial primeiro.', 'warn'); return; }

  const store  = await getStore();
  const filial = store.filiais.find(f => f.nome === filialAtiva);
  if (!filial) return;

  // Merge: recarrega dados atuais do LS para não sobrescrever
  // alterações de outras abas (race condition)
  const dadosAtuais = await LS.get('rh_quadro', {});
  const dadosFilial = { totalQuadro:0, vagas:{} };

  const totalInput = document.getElementById('input-total-quadro');
  if (totalInput) dadosFilial.totalQuadro = parseInt(totalInput.value) || 0;

  document.querySelectorAll('.vaga-input').forEach(inp => {
    const key = inp.dataset.key;
    if (key) dadosFilial.vagas[key] = parseInt(inp.value) || 0;
  });

  dadosAtuais[filialAtiva] = dadosFilial;
  quadroData = dadosAtuais;
  await LS.set('rh_quadro', dadosAtuais);

  const total = quadroData[filialAtiva]?.totalQuadro || 0;
  const vagas = Object.entries(quadroData[filialAtiva]?.vagas || {})
    .filter(([,v]) => v > 0)
    .map(([k,v]) => `${k.replace('__',' / ')}:${v}`)
    .join(', ');
  await registrarLog('editou', 'Quadro Operacional',
    `<strong>${escHtml(filialAtiva)}</strong> — Total: <strong>${total}</strong>${vagas ? ` · Vagas: ${vagas}` : ''}`
  );

  showToast('✅ Vagas salvas com sucesso!');
  await renderQuadroContent();
  if (tabAtiva === 'vagas') {
    await renderVagasContent();
    const btnSalvar = document.getElementById('btn-salvar');
    if (btnSalvar && podeEditar) btnSalvar.style.display = 'inline-flex';
  }
}

// ════════════════════════════════════════════════════════
// SELETOR DE FILIAIS
// ════════════════════════════════════════════════════════
async function buildFilialRow() {
  const store   = await getStore();
  const filiais = store.filiais || [];
  const row     = document.getElementById('filial-row');

  if (!filiais.length) {
    row.innerHTML = `<div style="color:var(--muted);font-size:13px">Nenhuma filial cadastrada. Acesse Configurações para adicionar.</div>`;
    return;
  }

  row.innerHTML = filiais.map((f) => `
    <button class="filial-btn ${filialAtiva===f.nome?'active':''}"
      onclick="selecionarFilial('${escJs(f.nome)}')">
      🏭 ${escHtml(f.nome)}
    </button>`).join('');

  if (!filialAtiva && filiais.length) {
    selecionarFilial(filiais[0].nome);
  }
}

function selecionarFilial(nome) {
  filialAtiva = nome;

  document.querySelectorAll('.filial-btn').forEach(b => {
    const label = b.textContent.trim().replace(/^🏭\s*/,'');
    b.classList.toggle('active', label === nome);
  });

  document.getElementById('quadro-sub').textContent = `Filial: ${nome}`;

  const tabBar = document.getElementById('tab-bar');
  if (tabBar) tabBar.style.display = 'flex';

  if (tabAtiva === 'quadro') renderQuadroContent();
  else renderVagasContent();
}

// ════════════════════════════════════════════════════════
// ABA 1 — QUADRO OPERACIONAL
// ════════════════════════════════════════════════════════
async function renderQuadroContent() {
  if (!filialAtiva) return;

  const store   = await getStore();
  const filial  = store.filiais.find(f => f.nome === filialAtiva);
  if (!filial) return;

  const allEmps    = (store.employees || []).filter(e => !e.demitido);
  const empsFilial = allEmps.filter(e => e.filial === filialAtiva || e.filial_id === filial.id);
  const turnos     = store.turnos  || [];
  const funcoes    = store.funcoes || [];
  const dadosF     = quadroData[filialAtiva] || { totalQuadro:0, vagas:{} };

  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const afastados = empsFilial.filter(e => {
    if (e.afastado) {
      if (e.data_afastamento) return new Date(e.data_afastamento+'T00:00:00') <= hoje;
      return true;
    }
    return false;
  });
  const emMaternidade = empsFilial.filter(e => {
    if (!e.maternidade) return false;
    if (!e.data_maternidade) return true;
    if (new Date(e.data_maternidade+'T00:00:00') > hoje) return false;
    if (e.data_maternidade_fim && new Date(e.data_maternidade_fim+'T00:00:00') < hoje) return false;
    return true;
  });
  const empsAtivos = empsFilial.filter(e => !afastados.includes(e));

  const totalQuadro = dadosF.totalQuadro || 0;
  const totalCad    = empsAtivos.length;
  const totalAfast  = afastados.length;
  const vagas       = Math.max(0, totalQuadro - totalCad);

  const turnosMostrar = turnos.filter(t => {
    const temFunc = empsAtivos.some(e => e.turno === t.nome);
    const temVaga = funcoes.some(f => (dadosF.vagas?.[`${f.nome}__${t.nome}`] || 0) > 0);
    return temFunc || temVaga;
  });

  let html = '';

  // Summary row
  html += `
  <div class="summary-row">
    <div class="summary-card">
      <div class="summary-label">Total Quadro</div>
      <div class="summary-value blue" id="quadro-total-display">${totalQuadro}</div>
      ${totalQuadro === 0 && podeEditar ? `<div style="font-size:10px;color:var(--muted);margin-top:4px">Configure em ⚙️ Gestão de Vagas</div>` : ''}
    </div>
    <div class="summary-card">
      <div class="summary-label">Funcionários Cadastrados</div>
      <div class="summary-value green">${totalCad}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Afastados</div>
      <div class="summary-value red">${totalAfast}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Vagas a Contratar</div>
      <div class="summary-value yellow">${vagas}</div>
    </div>
  </div>`;

  // Grade de turnos
  if (turnosMostrar.length) {
    html += `<div class="turnos-grid">`;
    turnosMostrar.forEach((turno, idx) => {
      const cor    = TURNO_CORES[idx % TURNO_CORES.length];
      const empsT  = empsAtivos.filter(e => e.turno === turno.nome);
      const totalT = empsT.length;

      const funcoesVisiveis = funcoes.filter(f => {
        const atualCnt = empsT.filter(e => e.role === f.nome).length;
        const vagasDef = dadosF.vagas?.[`${f.nome}__${turno.nome}`] || 0;
        return atualCnt > 0 || vagasDef > 0;
      });

      html += `
      <div class="turno-card" style="border-top:3px solid ${cor.border}">
        <div class="turno-header">
          <div>
            <div class="turno-title" style="color:${cor.title}">🕐 ${turno.nome}</div>
            <div class="turno-sub">${totalT} colaborador(es)</div>
          </div>
          <div class="turno-total" style="color:${cor.total}">${totalT} total</div>
        </div>
        <table class="turno-table">
          <thead>
            <tr>
              <th>Função / Cargo</th>
              <th>Atual</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>`;

      if (!funcoesVisiveis.length) {
        html += `<tr><td colspan="3" style="color:var(--muted);font-size:12px;text-align:center;padding:16px">
          Nenhuma função com dados.
          ${podeEditar ? '<br>Configure as vagas na aba ⚙️ Gestão de Vagas.' : ''}
        </td></tr>`;
      } else {
        funcoesVisiveis.forEach(func => {
          const key       = `${func.nome}__${turno.nome}`;
          const vagasDef  = dadosF.vagas?.[key] || 0;
          const atualCnt  = empsT.filter(e => e.role === func.nome).length;
          const diff      = vagasDef - atualCnt;

          let sitHtml;
          if (vagasDef === 0 && atualCnt > 0) {
            sitHtml = `<span style="color:var(--muted);font-size:12px" title="Configure as vagas na aba Gestão de Vagas">— sem meta</span>`;
          } else if (vagasDef === 0 && atualCnt === 0) {
            sitHtml = `<span style="color:var(--muted);font-size:12px">—</span>`;
          } else if (diff <= 0 && atualCnt >= vagasDef && vagasDef > 0) {
            sitHtml = `<span class="sit-badge sit-ok">✅ Completo</span>`;
          } else if (atualCnt > vagasDef && vagasDef > 0) {
            sitHtml = `<span class="sit-badge sit-excess">↑ ${atualCnt - vagasDef} excesso</span>`;
          } else if (diff <= 3 && diff > 0) {
            sitHtml = `<span class="sit-badge sit-warn">⚠️ ${diff} vaga(s)</span>`;
          } else if (diff > 3) {
            sitHtml = `<span class="sit-badge sit-risk">🔴 ${diff} vagas</span>`;
          } else {
            sitHtml = `<span class="sit-badge sit-ok">✅ Completo</span>`;
          }

          html += `
              <tr>
                <td>${func.nome}</td>
                <td>
                  <span class="atual-val" style="color:${atualCnt>0?'var(--accent2)':'var(--muted)'}">
                    ${atualCnt}
                  </span>
                </td>
                <td>${sitHtml}</td>
              </tr>`;
        });
      }

      html += `
          </tbody>
        </table>
      </div>`;
    });
    html += `</div>`;
  } else {
    html += `
    <div class="empty-state">
      <div class="empty-icon">🏭</div>
      <p style="font-size:14px">Nenhum turno com dados para esta filial</p>
      <p style="font-size:12px;margin-top:6px;color:var(--muted)">Cadastre funcionários nesta filial${podeEditar ? ' ou configure as vagas na aba ⚙️ Gestão de Vagas' : ''}.</p>
    </div>`;
  }

  // Afastados
  html += `
  <div class="afastado-card">
    <div class="afastado-header">
      <div class="afastado-title">🚫 Afastados</div>
      <div class="afastado-badge">${afastados.length} funcionário(s)</div>
    </div>`;

  if (!afastados.length) {
    html += `<div style="color:var(--muted);font-size:13px;padding:8px 0">Nenhum funcionário afastado nesta filial.</div>`;
  } else {
    html += afastados.map(e => {
      const ini = e.name.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();
      let diasBadge = '';
      if (e.data_afastamento) {
        const inicio = new Date(e.data_afastamento+'T00:00:00');
        const dias   = Math.floor((hoje - inicio) / (1000*60*60*24)) + 1;
        diasBadge    = `<span class="dias-badge">⏱ ${dias} dia${dias!==1?'s':''}</span>`;
      }
      return `
      <div class="afastado-item">
        <div class="af-avatar">${ini}</div>
        <div class="af-info">
          <div class="afastado-name">${escHtml(e.name)}</div>
          <div class="afastado-role">${escHtml(e.role||'')}${e.dept?' · '+escHtml(e.dept):''}</div>
        </div>
        <div class="af-right">
          ${diasBadge}
          <span style="padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;
            background:rgba(239,68,68,.15);color:#ef4444;border:1px solid rgba(239,68,68,.3)">
            🚫 Afastado
          </span>
        </div>
      </div>`;
    }).join('');
  }
  html += `</div>`;

  // Férias ativas
  const emFerias = empsFilial.filter(e => {
    if (!e.ferias || !e.data_ferias_inicio || !e.data_ferias_fim) return false;
    const ini = new Date(e.data_ferias_inicio+'T00:00:00');
    const fim = new Date(e.data_ferias_fim+'T00:00:00');
    return ini <= hoje && fim >= hoje;
  });

  if (emFerias.length) {
    html += `
    <div class="afastado-card" style="border-top:3px solid #22d3ee;margin-top:16px">
      <div class="afastado-header">
        <div class="afastado-title">🏖️ Em Férias</div>
        <div class="afastado-badge" style="background:rgba(34,211,238,.12);color:#22d3ee;border-color:rgba(34,211,238,.3)">${emFerias.length} funcionário(s)</div>
      </div>
      ${emFerias.map(e => {
        const ini  = e.name.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();
        const fimD = new Date(e.data_ferias_fim+'T00:00:00');
        const dias = Math.floor((fimD - hoje) / (1000*60*60*24)) + 1;
        return `
        <div class="afastado-item">
          <div class="af-avatar" style="background:linear-gradient(135deg,#22d3ee,#4f8ef7)">${ini}</div>
          <div class="af-info">
            <div class="afastado-name">${escHtml(e.name)}</div>
            <div class="afastado-role">${escHtml(e.role||'')}${e.dept?' · '+escHtml(e.dept):''}</div>
          </div>
          <div class="af-right">
            <span class="dias-badge" style="color:#22d3ee;border-color:rgba(34,211,238,.3);background:rgba(34,211,238,.1)">
              ⏱ ${dias} dia${dias!==1?'s':''} restante${dias!==1?'s':''}
            </span>
            <span style="padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;
              background:rgba(34,211,238,.1);color:#22d3ee;border:1px solid rgba(34,211,238,.3)">
              🏖️ até ${fimD.toLocaleDateString('pt-BR')}
            </span>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  }

  // Licença Maternidade ativas
  if (emMaternidade.length) {
    html += `
    <div class="afastado-card" style="border-top:3px solid #f59e0b;margin-top:16px">
      <div class="afastado-header">
        <div class="afastado-title">🤰 Licença Maternidade</div>
        <div class="afastado-badge" style="background:rgba(251,191,36,.12);color:#f59e0b;border-color:rgba(251,191,36,.4)">${emMaternidade.length} funcionária(s)</div>
      </div>
      ${emMaternidade.map(e => {
        const ini = e.name.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();
        let diasBadge = '';
        if (e.data_maternidade) {
          const inicio = new Date(e.data_maternidade+'T00:00:00');
          const dias   = Math.floor((hoje - inicio) / (1000*60*60*24)) + 1;
          diasBadge    = `<span class="dias-badge" style="color:#f59e0b;border-color:rgba(251,191,36,.4);background:rgba(251,191,36,.1)">⏱ ${dias} dia${dias!==1?'s':''}</span>`;
        }
        const retornoTag = e.data_maternidade_fim
          ? `<span style="padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;
              background:rgba(251,191,36,.1);color:#f59e0b;border:1px solid rgba(251,191,36,.35)">
              🤰 retorno ${new Date(e.data_maternidade_fim+'T00:00:00').toLocaleDateString('pt-BR')}
             </span>`
          : `<span style="padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;
              background:rgba(251,191,36,.1);color:#f59e0b;border:1px solid rgba(251,191,36,.35)">
              🤰 Lic. Maternidade
             </span>`;
        return `
        <div class="afastado-item">
          <div class="af-avatar" style="background:linear-gradient(135deg,#f59e0b,#fbbf24)">${ini}</div>
          <div class="af-info">
          <div class="afastado-name">${escHtml(e.name)}</div>
          <div class="afastado-role">${escHtml(e.role||'')}${e.dept?' · '+escHtml(e.dept):''}</div>
        </div>
        <div class="af-right">
          ${diasBadge}
          ${retornoTag}
        </div>
      </div>`;
    }).join('')}
    </div>`;
  }

  document.getElementById('quadro-content').innerHTML = html;
}

// ════════════════════════════════════════════════════════
// ABA 2 — GESTÃO DE VAGAS
// ════════════════════════════════════════════════════════
async function renderVagasContent() {
  if (!filialAtiva || !podeEditar) return;

  const store   = await getStore();
  const filial  = store.filiais.find(f => f.nome === filialAtiva);
  if (!filial) return;

  const allEmps    = (store.employees || []).filter(e => !e.demitido);
  const empsFilial = allEmps.filter(e => e.filial === filialAtiva || e.filial_id === filial.id);
  const turnos     = store.turnos  || [];
  const funcoes    = store.funcoes || [];
  const dadosF     = quadroData[filialAtiva] || { totalQuadro:0, vagas:{} };
  const totalQuadro = dadosF.totalQuadro || 0;

  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const afastados  = empsFilial.filter(e => {
    if (!e.afastado) return false;
    if (e.data_afastamento) return new Date(e.data_afastamento+'T00:00:00') <= hoje;
    return true;
  });
  const empsAtivos = empsFilial.filter(e => !afastados.includes(e));
  const vagas      = Math.max(0, totalQuadro - empsAtivos.length);

  let html = `
  <div class="vagas-info-box">
    <span style="font-size:18px;flex-shrink:0">⚙️</span>
    <div>
      Defina aqui o número de <strong>vagas planejadas</strong> para cada função e turno desta filial.
      O Quadro Operacional calcula automaticamente a situação comparando as vagas definidas com os funcionários cadastrados.
      <br>Líderes e demais usuários verão apenas o resultado — não têm acesso a esta aba.
    </div>
  </div>`;

  html += `
  <div class="vagas-section" style="margin-bottom:20px">
    <div class="vagas-section-header">
      <div class="vagas-section-title">📊 Total Geral do Quadro — ${filialAtiva}</div>
      <div class="vagas-section-sub">Cadastrados: ${empsAtivos.length} · Afastados: ${afastados.length} · Vagas: ${vagas}</div>
    </div>
    <div style="padding:16px 20px;display:flex;align-items:center;gap:20px;flex-wrap:wrap">
      <div style="display:flex;flex-direction:column;gap:6px">
        <label style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px">Total de vagas na filial</label>
        <div style="display:flex;align-items:center;gap:10px">
          <input class="num-input" type="number" min="0" id="input-total-quadro"
            value="${totalQuadro}" style="width:80px;font-size:18px"
            oninput="atualizarResumo()">
          <span style="font-size:12px;color:var(--muted)">vagas totais previstas</span>
        </div>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <div style="text-align:center;padding:10px 16px;background:var(--surface2);border-radius:10px;border:1px solid var(--border)">
          <div style="font-family:var(--font-head);font-size:22px;font-weight:800;color:#93C5FD">${empsAtivos.length}</div>
          <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">cadastrados</div>
        </div>
        <div style="text-align:center;padding:10px 16px;background:var(--surface2);border-radius:10px;border:1px solid var(--border)">
          <div style="font-family:var(--font-head);font-size:22px;font-weight:800;color:#FDE68A" id="vagas-contratar">${vagas}</div>
          <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">a contratar</div>
        </div>
        <div style="text-align:center;padding:10px 16px;background:var(--surface2);border-radius:10px;border:1px solid var(--border)">
          <div style="font-family:var(--font-head);font-size:22px;font-weight:800;color:#FCA5A5">${afastados.length}</div>
          <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">afastados</div>
        </div>
      </div>
    </div>
  </div>`;

  if (turnos.length && funcoes.length) {
    turnos.forEach((turno, idx) => {
      const cor    = TURNO_CORES[idx % TURNO_CORES.length];
      const empsT  = empsAtivos.filter(e => e.turno === turno.nome);
      const totalT = empsT.length;

      const totalVagasTurno = funcoes.reduce((s, f) => s + (dadosF.vagas?.[`${f.nome}__${turno.nome}`] || 0), 0);

      html += `
      <div class="vagas-section" style="margin-bottom:16px">
        <div class="vagas-section-header" style="border-top:3px solid ${cor.border}">
          <div class="vagas-section-title" style="color:${cor.title}">🕐 ${turno.nome}</div>
          <div style="display:flex;align-items:center;gap:12px;margin-left:auto">
            <span style="font-size:12px;color:var(--muted)">
              ${totalT} atual · ${totalVagasTurno} vagas configuradas
            </span>
          </div>
        </div>
        <table class="vagas-table">
          <thead>
            <tr>
              <th>Função / Cargo</th>
              <th>Vagas Previstas</th>
              <th>Cadastrados Agora</th>
              <th>Diferença</th>
            </tr>
          </thead>
          <tbody>`;

      funcoes.forEach(func => {
        const key      = `${func.nome}__${turno.nome}`;
        const vagasDef = dadosF.vagas?.[key] || 0;
        const atualCnt = empsT.filter(e => e.role === func.nome).length;
        const diff     = vagasDef - atualCnt;

        let diffHtml;
        if (vagasDef === 0 && atualCnt === 0) {
          diffHtml = `<span style="color:var(--muted)">—</span>`;
        } else if (diff === 0 && vagasDef > 0) {
          diffHtml = `<span style="color:#34d399;font-weight:700">✅ Completo</span>`;
        } else if (diff < 0) {
          diffHtml = `<span style="color:#22d3ee;font-weight:700">+${Math.abs(diff)} excesso</span>`;
        } else if (diff > 0) {
          diffHtml = `<span style="color:${diff>3?'#f87171':'#fbbf24'};font-weight:700">${diff > 3 ? '🔴' : '⚠️'} −${diff} faltando</span>`;
        } else {
          diffHtml = `<span style="color:var(--muted)">—</span>`;
        }

        html += `
            <tr>
              <td style="font-weight:600">${func.nome}</td>
              <td>
                <input class="num-input vaga-input" type="number" min="0"
                  data-key="${key}" value="${vagasDef}"
                  style="width:70px">
              </td>
              <td>
                <span style="font-family:var(--font-head);font-size:16px;font-weight:800;
                  color:${atualCnt>0?'var(--accent2)':'var(--muted)'}">
                  ${atualCnt}
                </span>
              </td>
              <td>${diffHtml}</td>
            </tr>`;
      });

      html += `</tbody></table></div>`;
    });
  } else {
    html += `
    <div class="empty-state">
      <div class="empty-icon">⚙️</div>
      <p style="font-size:14px">Configure turnos e funções primeiro</p>
      <p style="font-size:12px;margin-top:6px;color:var(--muted)">Acesse <strong>Configurações</strong> para cadastrar turnos e funções antes de definir as vagas.</p>
    </div>`;
  }

  document.getElementById('vagas-content').innerHTML = html;
}

// ── Atualiza vagas a contratar em tempo real ──
async function atualizarResumo() {
  const store      = await getStore();
  const filial     = store.filiais.find(f => f.nome === filialAtiva);
  const hoje       = new Date(); hoje.setHours(0,0,0,0);
  const empsFilial = (store.employees||[]).filter(e =>
    !e.demitido && (e.filial === filialAtiva || e.filial_id === filial?.id)
  );
  const afastados = empsFilial.filter(e => {
    if (!e.afastado) return false;
    if (e.data_afastamento) return new Date(e.data_afastamento+'T00:00:00') <= hoje;
    return true;
  });
  const empsAtivos = empsFilial.filter(e => !afastados.includes(e));
  const totalInput = document.getElementById('input-total-quadro');
  const total      = parseInt(totalInput?.value) || 0;
  const vagas      = Math.max(0, total - empsAtivos.length);
  const vagasEl    = document.getElementById('vagas-contratar');
  if (vagasEl) vagasEl.textContent = vagas;
}
