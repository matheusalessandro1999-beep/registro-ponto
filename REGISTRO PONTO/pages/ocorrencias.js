// ════════════════════════════════════════════════════════
// ocorrencias.js — Lógica da página de Ocorrências
// ════════════════════════════════════════════════════════
const OC_KEY = 'rh_ocorrencias';

const TIPO_META = {
  justificativa: { emoji:'📄', label:'Justificativa', cls:'tipo-justificativa' },
  ajuste:        { emoji:'✏️', label:'Ajuste',        cls:'tipo-ajuste'        },
  atestado:      { emoji:'🏥', label:'Atestado Médico', cls:'tipo-atestado'    },
  ocorrencia:    { emoji:'⚠️', label:'Ocorrência',    cls:'tipo-ocorrencia'    },
  entrada:       { emoji:'→',  label:'Entrada',       cls:'tipo-entrada'       },
  saida:         { emoji:'←',  label:'Saída',         cls:'tipo-saida'         },
  advertencia:   { emoji:'🚨', label:'Advertência',   cls:'tipo-advertencia'   },
  elogio:        { emoji:'⭐', label:'Elogio',        cls:'tipo-elogio'        },
};

const STATUS_META = {
  aprovado:  { emoji:'✅', cls:'sd-aprovado' },
  pendente:  { emoji:'⏳', cls:'sd-pendente' },
  rejeitado: { emoji:'❌', cls:'sd-rejeitado'},
};

const USER_COLORS = [
  ['#4f8ef7','#a78bfa'],['#34d399','#22d3ee'],['#f87171','#fb923c'],
  ['#fbbf24','#34d399'],['#a78bfa','#f472b6'],['#22d3ee','#4f8ef7'],
];
function userColor(name) {
  let h=0; for(let i=0;i<name.length;i++) h=(h*31+name.charCodeAt(i))&0xffffffff;
  return USER_COLORS[Math.abs(h)%USER_COLORS.length];
}

let currentUser   = null;
let statusFiltro  = '';
let podeAprovar   = false;
let podeCriar     = false;
let podeEditar    = false;
let podeExcluir   = false;
let _reopenAfterSave = null;

document.addEventListener('DOMContentLoaded', async () => {
  currentUser = await requireSession();
  if (!currentUser) return;
  if (typeof canSee === 'function' && !canSee(currentUser, 'ocorrencias')) {
    showToast && showToast('❌ Acesso negado.','error');
    setTimeout(() => window.location.href = '../index.html', 2000); return;
  }

  initTheme();
  initSidebar('ocorrencias', currentUser);

  podeCriar   = (typeof can==='function') ? can(currentUser,'ocorrencias','create')  : true;
  podeEditar  = (typeof can==='function') ? can(currentUser,'ocorrencias','edit')    : false;
  podeExcluir = (typeof can==='function') ? can(currentUser,'ocorrencias','delete')  : false;
  podeAprovar = (typeof can==='function') ? can(currentUser,'ocorrencias','approve') : false;

  document.getElementById('btn-novo').style.display = podeCriar ? '' : 'none';

  renderTabela();

  const urlParams = new URLSearchParams(window.location.search);
  const openId = urlParams.get('openOcorrenciaId');
  if (openId) {
    setTimeout(() => verDetalhe(openId), 300);
  }
  hideLoading();
});

async function getOcorrencias() {
  try {
    return await LS.get(OC_KEY, []);
  } catch(e) {
    console.error('[getOcorrencias] Falha ao ler:', e);
    showToast('📡 Falha de conexão ao carregar ocorrências.', 'err');
    return [];
  }
}
async function saveOcorrencias(list) {
  try {
    await LS.set(OC_KEY, list);
  } catch(e) {
    console.error('[saveOcorrencias] Falha ao salvar:', e);
    showToast('❌ Falha ao salvar ocorrência! Verifique sua conexão.', 'err');
    throw e;
  }
}

function toggleCidField() {
  const tipo = document.getElementById('f-tipo').value;
  const wrap = document.getElementById('f-cid-wrap');
  wrap.style.display = tipo === 'atestado' ? 'block' : 'none';
  if (tipo !== 'atestado') {
    document.getElementById('f-cid').value = '';
  }
}

function setStatus(el, val) {
  statusFiltro = val;
  document.querySelectorAll('.filter-chip').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
  renderTabela();
}

async function renderTabela() {
  const search  = document.getElementById('search-input').value.toLowerCase();
  const tipo    = document.getElementById('filter-tipo').value;
  const periodo = parseInt(document.getElementById('filter-periodo').value);

  let list = await getOcorrencias();

  if (periodo > 0) {
    const corte = new Date(); corte.setDate(corte.getDate()-periodo);
    list = list.filter(o=>new Date(o.ts)>=corte);
  }

  const scope = (typeof dataScope==='function') ? dataScope(currentUser) : { all:true };
  if (scope.own) list = list.filter(o=>o.respId===currentUser.id||o.empId===currentUser.id);
  else if (scope.sector) {
    const depts = currentUser?.perfil?.depts||[];
    const setor = currentUser?.setor||'';
    list = list.filter(o=>depts.includes(o.empDept)||o.empDept===setor);
  }

  if (tipo)         list = list.filter(o=>o.tipo?.toLowerCase()===tipo);
  if (statusFiltro) list = list.filter(o=>o.status===statusFiltro);
  else              list = list.filter(o=>o.status==='pendente');
  if (search)       list = list.filter(o=>
    o.empName?.toLowerCase().includes(search)||
    o.desc?.toLowerCase().includes(search)||
    o.respName?.toLowerCase().includes(search)
  );

  list.sort((a,b)=>new Date(b.ts)-new Date(a.ts));

  document.getElementById('log-count').textContent = `${list.length} registro${list.length!==1?'s':''}`;

  const tbody = document.getElementById('log-tbody');
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:50px;color:var(--muted)">
      Nenhuma ocorrência encontrada com esses filtros.
    </td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(o=>buildRow(o)).join('');
}

function buildRow(o) {
  const sm    = STATUS_META[o.status] || STATUS_META.pendente;
  const tm    = TIPO_META[o.tipo]     || { emoji:'📝', label:o.tipo, cls:'tipo-ajuste' };
  const dt    = o.ts ? new Date(o.ts) : new Date();
  const data  = dt.toLocaleDateString('pt-BR');
  const hora  = isNaN(dt) ? '--:--' : dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  const ini   = (o.empName||'?').split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();
  const [c1,c2] = userColor(o.empName||'?');

  return `
  <tr class="log-row">
    <td>
      <div class="status-dot-icon ${sm.cls}" title="${o.status}">${sm.emoji}</div>
    </td>
    <td class="log-datetime">${data}<br>${hora}${o.status === 'pendente' ? `<br><span style="font-size:9px;color:var(--muted)">⏳ ${Math.floor((Date.now()-new Date(o.createdAt||o.ts))/86400000)}d</span>` : ''}</td>
    <td>
      <div class="user-cell">
        <div class="user-avatar" style="background:linear-gradient(135deg,${c1},${c2})">${ini}</div>
        <div>
          <div class="user-name">${o.empName||'—'}</div>
          <div style="font-size:10px;color:var(--muted)">${o.empDept||''}</div>
        </div>
      </div>
    </td>
    <td><span class="tipo-badge ${tm.cls}">${tm.emoji} ${tm.label}</span></td>
    <td class="log-cid" title="${o.cid||''}">${o.tipo?.toLowerCase() === 'atestado' ? (o.cid ? '🆔 '+o.cid : '<span class="cid-missing">🆔 —</span>') : '—'}</td>
    <td class="log-desc" title="${o.desc||''}">${o.desc||'—'}</td>
    <td class="log-resp">${o.respName||'—'}</td>
    <td>
      <button class="btn btn-ghost btn-sm" onclick="verDetalhe('${o.id}')">👁 Ver</button>
    </td>
  </tr>`;
}

async function openFormModal(oc) {
  const store = await getStore();
  _store = store;
  const emps  = store.employees || [];

  const lista = getSupervisedEmployees(currentUser);

  document.getElementById('f-emp').innerHTML =
    '<option value="">— Selecione —</option>' +
    lista
      .sort((a,b)=>a.name?.localeCompare(b.name))
      .map(e=>`<option value="${e.id}" ${oc&&oc.empId===e.id?'selected':''}>${e.name} · ${e.dept||''}</option>`).join('');

  document.getElementById('modal-form-title').textContent = oc ? 'Editar Ocorrência' : 'Nova Ocorrência';
  document.getElementById('f-edit-id').value = oc?.id || '';
  document.getElementById('f-tipo').value    = oc?.tipo  || 'justificativa';
  document.getElementById('f-desc').value    = oc?.desc  || '';
  document.getElementById('f-obs').value     = oc?.obs   || '';

  const agora = new Date();
  agora.setMinutes(agora.getMinutes()-agora.getTimezoneOffset());
  function toLocalDt(isoStr) {
    const d = new Date(isoStr);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0,16);
  }
  document.getElementById('f-dt').value = oc?.ts
    ? toLocalDt(oc.ts)
    : agora.toISOString().slice(0,16);

  document.getElementById('f-cid').value = oc?.cid || '';
  toggleCidField();

  document.getElementById('f-emp').disabled = !!oc;
  document.getElementById('modal-form').classList.add('open');
}

async function editarOcorrencia(id) {
  const oc = (await getOcorrencias()).find(o=>o.id===id);
  if (!oc) return;
  openFormModal(oc);
}

async function salvarOcorrencia() {
  const empEl  = document.getElementById('f-emp');
  const empId  = empEl.value;
  const editId = document.getElementById('f-edit-id').value;
  const tipo   = document.getElementById('f-tipo').value;
  const desc   = document.getElementById('f-desc').value.trim();
  const obs    = document.getElementById('f-obs').value.trim();
  const cid    = document.getElementById('f-cid').value.trim();
  const dtVal  = document.getElementById('f-dt').value;

  if (!empId && !editId) { showToast('⚠️ Selecione um funcionário.','warn'); return; }
  if (!desc)             { showToast('⚠️ Descrição é obrigatória.','warn'); return; }
  if (tipo === 'atestado' && cid && !/^[A-Za-z0-9.]{1,10}$/.test(cid)) {
    showToast('⚠️ CID inválido. Use apenas letras, números e ponto (máx. 10 caracteres).', 'warn'); return;
  }

  const store = await getStore();
  const emps  = store.employees||[];
  const list = await getOcorrencias();
  const emp   = editId
    ? (() => { const oc = list.find(o=>o.id===editId); return oc ? { id: oc.empId, name:'', dept:'' } : { id:'', name:'', dept:'' }; })()
    : emps.find(e=>String(e.id)===String(empId));

  if (editId) {
    const idx = list.findIndex(o=>o.id===editId);
    if (idx<0) { showToast('❌ Ocorrência não encontrada.','error'); return; }
    list[idx] = { ...list[idx], tipo, desc, obs, cid: tipo === 'atestado' ? cid : '', ts: (() => {
      if (!dtVal) return list[idx].ts;
      const d = new Date(dtVal);
      return isNaN(d) ? list[idx].ts : d.toISOString();
    })() };
    await registrarLog('editou', 'Ocorrências', `Editou ocorrência <strong>${tipo}</strong> de <strong>${list[idx].empName||'—'}</strong>`);
    showToast('✅ Ocorrência atualizada!');
  } else {
    const empData = emps.find(e=>String(e.id)===String(empId));
    const nowDataAdmissao = empData?.data_admissao || null;
    list.unshift({
      id:        uid(),
      ts:        (() => {
        if (!dtVal) return new Date().toISOString();
        const d = new Date(dtVal);
        return isNaN(d) ? new Date().toISOString() : d.toISOString();
      })(),
      empId:     empData?.id,
      empName:   empData?.name || '—',
      empDept:   empData?.dept || '—',
      empFilial: empData?.filial || '—',
      tipo, desc, obs, cid,
      originalDataAdmissao: nowDataAdmissao,
      status:    'pendente',
      respName:  currentUser.name,
      respId:    currentUser.id,
      createdAt: new Date().toISOString(),
    });
    await registrarLog('criou', 'Ocorrências', `Nova ocorrência <strong>${tipo}</strong> para <strong>${empData?.name||'—'}</strong>`);
    showToast('✅ Ocorrência registrada com status Pendente!');
  }

  await saveOcorrencias(list);
  closeModal('modal-form');
  renderTabela();
  if (_reopenAfterSave) {
    const id = _reopenAfterSave;
    _reopenAfterSave = null;
    setTimeout(() => verDetalhe(id), 300);
  }
}

async function verDetalhe(id) {
  const o = (await getOcorrencias()).find(x=>x.id===id);
  if (!o) return;
  const sm = STATUS_META[o.status]||STATUS_META.pendente;
  const tm = TIPO_META[o.tipo]||{ emoji:'📝', label:o.tipo };
  const dt = new Date(o.ts).toLocaleString('pt-BR');

  document.getElementById('d-emp').textContent    = `${o.empName||'—'} · ${o.empDept||''}`;
  document.getElementById('d-dt').textContent     = dt;
  document.getElementById('d-tipo').innerHTML     = `<span class="tipo-badge ${TIPO_META[o.tipo]?.cls||''}">${tm.emoji} ${tm.label}</span>`;
  document.getElementById('d-status').textContent = `${sm.emoji} ${o.status.charAt(0).toUpperCase()+o.status.slice(1)}`;
  document.getElementById('d-desc').textContent   = o.desc||'—';
  document.getElementById('d-resp').textContent   = o.respName||'—';

  const admissaoWrap = document.getElementById('d-admissao-wrap');
  if (o.tipo?.toLowerCase() === 'ajuste') {
    if ('originalDataAdmissao' in o) {
      const atual = (await getStore()).employees?.find(e=>String(e.id)===String(o.empId))?.data_admissao;
      const mudou = atual !== o.originalDataAdmissao;
      document.getElementById('d-admissao').innerHTML =
        `Original: <strong>${o.originalDataAdmissao||'vazio'}</strong>` +
        (mudou ? ` → Atual: <strong style="color:var(--green)">${atual||'vazio'}</strong> ✅` :
                 ` → Atual: <strong style="color:var(--muted)">${atual||'vazio'}</strong> ⏳ Aguardando correção`);
    } else {
      const atual = (await getStore()).employees?.find(e=>String(e.id)===String(o.empId))?.data_admissao;
      const fmt = atual ? new Date(atual+'T12:00:00').toLocaleDateString('pt-BR') : '—';
      document.getElementById('d-admissao').innerHTML = `Data de admissão: <strong>${fmt}</strong>`;
    }
    admissaoWrap.style.display = 'block';
  } else {
    admissaoWrap.style.display = 'none';
  }

  const cidWrap = document.getElementById('d-cid-wrap');
  if (o.tipo?.toLowerCase() === 'atestado') {
    document.getElementById('d-cid').textContent = o.cid || '—';
    cidWrap.style.display = 'block';
  } else {
    cidWrap.style.display = 'none';
  }

  const obsWrap = document.getElementById('d-obs-wrap');
  if (o.obs) {
    document.getElementById('d-obs').textContent = o.obs;
    obsWrap.style.display = 'block';
  } else {
    obsWrap.style.display = 'none';
  }

  const footer = document.getElementById('detail-footer');
  let btns = `<button class="btn btn-ghost" onclick="closeModal('modal-detail')">Fechar</button>`;

  if (podeEditar && o.status==='pendente') {
    btns += `<button class="btn btn-ghost" onclick="closeModal('modal-detail');editarOcorrencia('${id}')">✏️ Editar</button>`;
  }
  if (podeExcluir) {
    btns += `<button class="btn btn-red" onclick="closeModal('modal-detail');excluirOcorrencia('${id}')">✕ Excluir</button>`;
  }
  if (podeAprovar && o.status==='pendente') {
    btns += `
      <button class="btn btn-green" onclick="mudarStatus('${id}','aprovado')">✅ Aprovar</button>
      <button class="btn btn-red"   onclick="mudarStatus('${id}','rejeitado')">❌ Rejeitar</button>`;
  }
  footer.innerHTML = btns;

  document.getElementById('modal-detail').classList.add('open');
}

async function mudarStatus(id, novoStatus) {
  const list = await getOcorrencias();
  const idx  = list.findIndex(o=>o.id===id);
  if (idx<0) return;
  const o = list[idx];
  const origEl = document.getElementById('d-admissao');

  if (novoStatus === 'aprovado' && o.tipo?.toLowerCase() === 'atestado') {
    if (!o.cid || !o.cid.trim()) {
      const footer = document.getElementById('detail-footer');
      if (footer) footer.innerHTML = `
        <button class="btn btn-primary" onclick="closeModal('modal-detail');_reopenAfterSave='${id}';editarOcorrencia('${id}')">✏️ Adicionar CID</button>
        <button class="btn btn-ghost" onclick="closeModal('modal-detail')">Fechar</button>`;
      showToast('⛔ Informe o CID do atestado antes de aprovar.', 'warn');
      return;
    }
  }

  if (novoStatus === 'aprovado' && o.tipo?.toLowerCase() === 'ajuste') {
    const store = await getStore();
    const emp = (store.employees||[]).find(e=>String(e.id)===String(o.empId));
    const currentAdmissao = emp?.data_admissao || null;
    const original = 'originalDataAdmissao' in o ? o.originalDataAdmissao : null;
    const naoMudou = 'originalDataAdmissao' in o
      ? currentAdmissao === original
      : !currentAdmissao;
    if (naoMudou) {
      if (origEl) {
        origEl.innerHTML =
          `⛔ <strong>Data não alterada</strong><br>` +
          `<span style="color:var(--muted);font-size:12px">Original: ${original||'vazio'} · Atual: ${currentAdmissao||'vazio'}</span><br>` +
          `<span style="color:var(--yellow);font-size:12px">Clique no botão "Editar card do funcionário", edite o card e corrija a data de admissão.</span>`;
      }
      const footer = document.getElementById('detail-footer');
      if (footer) footer.innerHTML = `
        <button class="btn btn-primary" onclick="window.location.href='employees.html?editEmpId=${o.empId}'">✏️ Editar card do funcionário</button>
        <button class="btn btn-ghost" onclick="closeModal('modal-detail')">Fechar</button>`;
      showToast('⛔ Data de admissão ainda não foi alterada no card do funcionário.', 'warn');
      return;
    }
  }

  list[idx].status = novoStatus;
  await saveOcorrencias(list);
  closeModal('modal-detail');
  renderTabela();
  const msgs = { aprovado:'✅ Ocorrência aprovada!', rejeitado:'❌ Ocorrência rejeitada.', pendente:'↩️ Revertida para pendente.' };
  const logMsg = { aprovado:'Aprovou', rejeitado:'Rejeitou', pendente:'Reverteu para pendente' };
  await registrarLog('editou', 'Ocorrências', `${logMsg[novoStatus]||'Atualizou'} ocorrência <strong>${o.tipo}</strong> de <strong>${o.empName||'—'}</strong>`);
  showToast(msgs[novoStatus]||'✅ Status atualizado!');
}

async function excluirOcorrencia(id) {
  const o = (await getOcorrencias()).find(x=>x.id===id);
  if (!confirm('Excluir esta ocorrência? Esta ação não pode ser desfeita.')) return;
  await saveOcorrencias((await getOcorrencias()).filter(x=>x.id!==id));
  renderTabela();
  await registrarLog('excluiu', 'Ocorrências', `Excluiu ocorrência <strong>${o?.tipo||'—'}</strong> de <strong>${o?.empName||'—'}</strong>`);
  showToast('✅ Ocorrência excluída.');
}

function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.overlay').forEach(el => {
  el.addEventListener('click', e => { if (e.target===e.currentTarget) el.classList.remove('open'); });
});
document.addEventListener('keydown', e => {
  if (e.key==='Escape') document.querySelectorAll('.overlay.open').forEach(el=>el.classList.remove('open'));
});
