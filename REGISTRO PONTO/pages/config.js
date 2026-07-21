// ════════════════════════════════════════════════════════
// config.js — Lógica da página de Configurações
// ════════════════════════════════════════════════════════

const LIST_CONFIG = {
  filiais: { listId:'list-filiais', badgeId:'badge-filiais', inputId:'input-filial' },
  turnos:  { listId:'list-turnos',  badgeId:'badge-turnos',  inputId:'input-turno'  },
  depts:   { listId:'list-depts',   badgeId:'badge-depts',   inputId:'input-dept'   },
  funcoes: { listId:'list-funcoes', badgeId:'badge-funcoes', inputId:'input-funcao' },
};

const MESES_PT = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

let currentUser = null;
var _liderAvatar, _gestorAvatar;

// ════════════════════════════════════════════════════════
// ESCAPE HTML
// ════════════════════════════════════════════════════════
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ════════════════════════════════════════════════════════
// CARD COMPONENT — reusado por gestor e líder
// ════════════════════════════════════════════════════════
function renderCardHtml(user, prefix) {
  const EM = { lider:'👷', encarregado:'🔰', coordenacao:'📋', gerencia:'📊', diretoria:'🏢', admin_master:'🛡️' };
  const meta = NIVEL_LABELS[user.nivel] || { cor:'#94a3b8', label:user.nivel };
  const uploadFn = prefix + 'UploadAvatar()';
  const removeFn = prefix + 'RemoverAvatar()';
  return (
    '<div class="card-title" style="margin-bottom:12px">🖼️ Meu Card</div>' +
    '<div class="config-card-avatar-row" style="display:flex;align-items:center;gap:14px;margin-bottom:14px">' +
      '<div id="_' + prefix + '-avatar">' + avatarCircle(user.avatar, 64) + '</div>' +
      '<div>' +
        '<div style="font-size:14px;font-weight:600;color:var(--text,#fff)">' + esc(user.name) + '</div>' +
        '<div style="font-size:12px;color:' + meta.cor + ';margin-top:2px">' + (EM[user.nivel]||'') + ' ' + meta.label + '</div>' +
        '<button class="btn btn-ghost btn-sm" onclick="' + uploadFn + '" style="font-size:11px;margin-top:6px">📷 Trocar Foto</button>' +
        (user.avatar ? '<button class="btn btn-ghost btn-sm" aria-label="Remover foto" onclick="' + removeFn + '" style="font-size:11px;color:var(--red,#f87171)">✕</button>' : '') +
      '</div>' +
    '</div>' +
    '<div class="form-group"><label>Nome completo</label><input id="' + prefix + '-nome" value="' + esc(user.name) + '" style="width:100%;padding:10px 14px;background:var(--surface2,#1a1e2e);border:1px solid var(--border,#2a2f45);border-radius:10px;color:var(--text,#fff);font-size:14px;outline:none;box-sizing:border-box"></div>' +
    '<div class="section-sep"></div>'
  );
}

// ════════════════════════════════════════════════════════
// AVATAR UTILITY
// ════════════════════════════════════════════════════════
function uploadAvatar() {
  return new Promise(function(resolve) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = function(e) {
      const file = e.target.files[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = function(ev) {
        const img = new Image();
        img.onload = function() {
          const canvas = document.createElement('canvas');
          const max = 256;
          let w = img.width, h = img.height;
          if (w > max || h > max) {
            if (w > h) { h = Math.round(h * max / w); w = max; }
            else { w = Math.round(w * max / h); h = max; }
          }
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  });
}

function avatarCircle(src, size) {
  size = size || 60;
  if (src) {
    return '<img src="' + src + '" style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;object-fit:cover;border:2px solid var(--accent,#4f8ef7);flex-shrink:0">';
  }
  return '<div style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:var(--accent,#4f8ef7);display:flex;align-items:center;justify-content:center;font-size:' + Math.round(size * 0.45) + 'px;font-weight:700;color:#fff;flex-shrink:0">?</div>';
}

// ════════════════════════════════════════════════════════
// MODAL PROMPT
// ════════════════════════════════════════════════════════
function showPromptModal(label, opts) {
  opts = opts || {};
  return new Promise(function (resolve) {
    const existing = document.getElementById('_prompt-modal');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = '_prompt-modal';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;';
    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:var(--surface,#12151f);border:1px solid var(--border,#2a2f45);border-radius:16px;padding:28px;width:380px;max-width:90vw;box-shadow:0 24px 64px rgba(0,0,0,.5);';
    dialog.innerHTML =
      '<div style="font-size:15px;font-weight:600;color:var(--text,#fff);margin-bottom:16px">' + (opts.title || '') + '</div>' +
      '<label style="display:block;font-size:13px;color:var(--muted,#94a3b8);margin-bottom:6px">' + label + '</label>' +
      '<input id="_prompt-input" type="' + (opts.type || 'text') + '" style="width:100%;padding:10px 14px;background:var(--surface2,#1a1e2e);border:1px solid var(--border,#2a2f45);border-radius:10px;color:var(--text,#fff);font-size:14px;outline:none;box-sizing:border-box" placeholder="' + (opts.placeholder || '') + '" minlength="' + (opts.min || 0) + '" autofocus>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px">' +
      '<button id="_prompt-cancel" style="padding:8px 20px;background:var(--surface3,#222638);border:1px solid var(--border,#2a2f45);border-radius:10px;color:var(--muted,#94a3b8);font-size:13px;cursor:pointer">Cancelar</button>' +
      '<button id="_prompt-ok" style="padding:8px 20px;background:var(--accent,#4f8ef7);border:none;border-radius:10px;color:#fff;font-size:13px;font-weight:600;cursor:pointer">OK</button></div>';
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    const input = document.getElementById('_prompt-input');
    const cancel = document.getElementById('_prompt-cancel');
    const ok = document.getElementById('_prompt-ok');
    function close(val) { overlay.remove(); resolve(val); }
    cancel.onclick = function () { close(null); };
    ok.onclick = function () {
      const v = input.value.trim();
      if (opts.min && v.length < opts.min) { input.style.borderColor = '#f87171'; input.focus(); return; }
      close(v);
    };
    input.onkeydown = function (e) { if (e.key === 'Enter') ok.click(); else if (e.key === 'Escape') cancel.click(); };
    setTimeout(function () { input.focus(); }, 100);
  });
}

// ════════════════════════════════════════════════════════
// CONFIRM MODAL — substitui confirm() nativo
// ════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════
// LOADING STATE HELPER
// ════════════════════════════════════════════════════════
function withLoading(btnId, fn) {
  const btn = document.getElementById(btnId);
  if (!btn) return fn();
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '⏳ Salvando…';
  btn.style.opacity = '0.7';
  btn.style.cursor = 'not-allowed';
  return fn().then(function (r) {
    btn.disabled = false;
    btn.innerHTML = orig;
    btn.style.opacity = '';
    btn.style.cursor = '';
    return r;
  }).catch(function (e) {
    btn.disabled = false;
    btn.innerHTML = orig;
    btn.style.opacity = '';
    btn.style.cursor = '';
    throw e;
  });
}

// ════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  currentUser = await requireSession();
  if (!currentUser) return;
  if (typeof canSee === 'function' && !canSee(currentUser, 'config')) {
    showToast && showToast('❌ Acesso negado.','error');
    setTimeout(() => window.location.href = '../index.html', 2000); return;
  }

  initTheme();
  initSidebar('config', currentUser);

  // Badge de perfil — usa o nivel real do usuário
  const perfil    = getUserPerfil(currentUser);
  const nivelReal = currentUser.nivel || 'lider';
  const meta      = NIVEL_LABELS[nivelReal] || NIVEL_LABELS['lider'];

  const avatarHtml = currentUser.avatar
    ? '<img src="' + currentUser.avatar + '" style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:2px solid var(--accent,#4f8ef7);vertical-align:middle;margin-right:8px">'
    : '';
  document.getElementById('config-perfil-badge').innerHTML = avatarHtml + `
    <span class="perfil-badge"
      style="background:${meta.cor}18;color:${meta.cor};border:1px solid ${meta.cor}33">
      ${meta.emoji} ${meta.label}
    </span>`;

  // Subtítulo
  document.getElementById('config-subtitle').textContent =
    `Logado como ${currentUser.name}` +
    (NIVEL_NAMES[currentUser.nivel] ? ` · ${NIVEL_NAMES[currentUser.nivel]}` : '');

  // Mostra painel correto
  document.getElementById('panel-admin-master').style.display = perfil==='admin_master' ? 'block':'none';
  document.getElementById('panel-admin-gestor').style.display = perfil==='admin_gestor' ? 'block':'none';
  document.getElementById('panel-lider').style.display        = perfil==='lider'        ? 'block':'none';

  if (perfil === 'admin_master') renderAdminMaster();
  if (perfil === 'admin_gestor') renderAdminGestor();
  if (perfil === 'lider')        renderLider();

  // ── Upgrade de senhas legadas (plaintext → hash) ─────────────────
  try {
    const store = await getStore();
    await upgradePasswords(store);
  } catch(e) { console.warn('[Config] upgradePasswords falhou:', e); }

  // ── Auto-backup local (somente admin_master) ──────────────────────────────
  if (perfil === 'admin_master') {
    try {
      const storeSnap = await getStore();
      if ((storeSnap.employees || []).length > 0) {
        const snap = {
          rh_store:       storeSnap,
          rh_ponto:       await LS.get('rh_ponto', {}),
          rh_ocorrencias: await LS.get('rh_ocorrencias', []),
          exported_at:    new Date().toISOString(),
          version:        '2.0',
          auto:           true,
        };
        localStorage.setItem('rh_autobackup', JSON.stringify(snap));
        localStorage.setItem('rh_autobackup_ts', new Date().toLocaleString('pt-BR'));
      }
    } catch(e) {
      console.warn('[AutoBackup] Falha ao salvar snapshot local:', e);
    }
  }
  hideLoading();
});

// ── Antídoto contra BFCache / autofill ──────────────────────────────────────
// O navegador pode restaurar valores de formulário ao voltar via "back",
// mesmo depois de o JS já ter limpado os campos. O evento 'pageshow'
// dispara inclusive em restauração de BFCache (event.persisted === true).
window.addEventListener('pageshow', function () {
  ['feriado-dia', 'feriado-mes', 'feriado-nome'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
});

// ════════════════════════════════════════════════════════
// ADMIN MASTER
// ════════════════════════════════════════════════════════
async function renderAdminMaster() {
  const store = await getStore();
  if (!store.config) store.config = {};
  renderLista('filiais', store.filiais);
  renderLista('turnos',  store.turnos);
  renderLista('depts',   store.depts);
  renderLista('funcoes', store.funcoes);
  document.getElementById('cfg-perf').value  = store.config.perfWeight || 40;
  document.getElementById('cfg-apt').value   = store.config.aptWeight  || 35;
  document.getElementById('cfg-maxabs').value = store.config.maxAbs    || 36;
  refreshPesos();
  document.getElementById('auth-code-display').value = store.authCode || AUTH_CODE_DEFAULT;
  renderFeriados();
  renderUsers();
  renderTabelaPermissoes();
}

// ── Listas estruturais ──
function renderLista(tipo, lista) {
  const cfg   = LIST_CONFIG[tipo];
  const badge = document.getElementById(cfg.badgeId);
  const el    = document.getElementById(cfg.listId);
  if (badge) badge.textContent = lista.length;
  if (!el) return;

  const listaSorted = lista.slice().sort((a,b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity:'base' }));
  el.innerHTML = listaSorted.map(item =>
    `<div class="dept-item">
      <span class="dept-item-name" id="item-${tipo}-${item.id}">${esc(item.nome)}</span>
      <div style="display:flex;gap:4px">
        <button class="btn btn-ghost btn-sm" aria-label="Editar"
          onclick="startEdit('${tipo}','${item.id}','${item.nome.replace(/'/g,"\\'").replace(/"/g,"&quot;")}')">✏️</button>
        <button class="btn btn-danger btn-sm" aria-label="Excluir"
          onclick="removeItem('${tipo}','${item.id}')">✕</button>
      </div>
    </div>`
  ).join('') || `<div style="color:var(--muted);font-size:13px;padding:6px 0">Nenhum cadastrado.</div>`;
}

async function addItem(tipo) {
  const cfg   = LIST_CONFIG[tipo];
  const input = document.getElementById(cfg.inputId);
  const nome  = input.value.trim();
  if (!nome) { input.focus(); return; }

  const store = await getStore();
  if (store[tipo].some(x => x.nome.toLowerCase() === nome.toLowerCase())) {
    showToast('⚠️ Já existe um item com este nome.','warn'); return;
  }
  store[tipo].push({ id: uid(), nome });
  await saveStore(store);
  input.value = '';
  renderLista(tipo, store[tipo]);
  const tipoLabel = { filiais:'Filial', turnos:'Turno', depts:'Departamento', funcoes:'Função' };
  await registrarLog('criou', 'Configurações', `${tipoLabel[tipo]||tipo} adicionado: <strong>${nome}</strong>`);
  showToast('✅ Adicionado!');
}

async function removeItem(tipo, id) {
  const store = await getStore();
  const item  = store[tipo].find(x => x.id === id);
  if (!(await showConfirmModal(`Excluir "${esc(item?.nome)}"?`))) return;
  store[tipo] = store[tipo].filter(x => x.id !== id);
  await saveStore(store);
  renderLista(tipo, store[tipo]);
  const tipoLabel2 = { filiais:'Filial', turnos:'Turno', depts:'Departamento', funcoes:'Função' };
  await registrarLog('excluiu', 'Configurações', `${tipoLabel2[tipo]||tipo} removido: <strong>${item?.nome||id}</strong>`);
  showToast('✅ Excluído.');
}

async function startEdit(tipo, id, oldNome) {
  const span = document.getElementById(`item-${tipo}-${id}`);
  if (!span) return;
  const inp = document.createElement('input');
  inp.className = 'inline-edit';
  inp.value = oldNome;
  inp.addEventListener('keydown', async ev => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      const nw = inp.value.trim();
      if (nw && nw !== oldNome) {
        const store = await getStore();
        const item  = store[tipo].find(x => x.id === id);
        const tipoLabel3 = { filiais:'Filial', turnos:'Turno', depts:'Departamento', funcoes:'Função' };
        if (item) {
          item.nome = nw;
          await saveStore(store);
          await registrarLog('editou', 'Configurações', `${tipoLabel3[tipo]||tipo} renomeado: <span class="de">${oldNome}</span><span class="seta">→</span><span class="para">${nw}</span>`);
          showToast('✅ Atualizado!');
        }
      }
      renderLista(tipo, (await getStore())[tipo]);
    }
    if (ev.key === 'Escape') renderLista(tipo, (await getStore())[tipo]);
  });
  span.innerHTML = '';
  span.appendChild(inp);
  inp.focus(); inp.select();
}

// ── Pesos ──
function refreshPesos() {
  const pw = Math.min(100, Math.max(0, parseInt(document.getElementById('cfg-perf')?.value)||40));
  const aw = Math.min(100, Math.max(0, parseInt(document.getElementById('cfg-apt')?.value)||35));
  const bw = Math.max(0, 100 - pw - aw);
  const ad = document.getElementById('cfg-abs'); if(ad) ad.value = bw;
  const vis = document.getElementById('weight-visual');
  if (vis) {
    const s = vis.querySelectorAll('.weight-seg');
    if(s[0]){s[0].style.flex=pw;s[0].style.display=pw===0?'none':'';}
    if(s[1]){s[1].style.flex=aw;s[1].style.display=aw===0?'none':'';}
    if(s[2]){s[2].style.flex=bw;s[2].style.display=bw===0?'none':'';}
  }
  const wP=document.getElementById('wl-p'); if(wP) wP.textContent=`Desempenho ${pw}%`;
  const wA=document.getElementById('wl-a'); if(wA) wA.textContent=`Aptidões ${aw}%`;
  const wB=document.getElementById('wl-b'); if(wB) wB.textContent=`Assiduidade ${bw}%`;
}

async function saveCfg() {
  await withLoading('btn-save-cfg', async () => {
    const pw = Math.min(100, Math.max(0, parseInt(document.getElementById('cfg-perf').value)||40));
    const aw = Math.min(100, Math.max(0, parseInt(document.getElementById('cfg-apt').value)||35));
    if (pw + aw > 100) { showToast('⚠️ Desempenho + Aptidões não pode ultrapassar 100%.','warn'); return; }
    const store = await getStore();
    if (!store.config) store.config = {};
    store.config.perfWeight = pw;
    store.config.aptWeight  = aw;
    store.config.maxAbs     = parseInt(document.getElementById('cfg-maxabs').value)||36;
    await saveStore(store);
    await registrarLog('editou', 'Configurações', `Pesos do score atualizados: Desempenho <strong>${pw}%</strong> · Aptidões <strong>${aw}%</strong> · Assiduidade <strong>${Math.max(0,100-pw-aw)}%</strong> · Máx. faltas <strong>${store.config.maxAbs}</strong>`);
    showToast('✅ Configurações salvas!');
    refreshPesos();
  });
}

// ── Código de autorização ──
async function gerarNovoCodigo() {
  if (!(await showConfirmModal('Gerar um novo código? O atual ficará inválido para novos cadastros.'))) return;
  const novo  = 'NAGUMO-' + Math.random().toString(36).toUpperCase().slice(2,8);
  const store = await getStore();
  store.authCode = novo;
  await saveStore(store);
  document.getElementById('auth-code-display').value = novo;
  await registrarLog('editou', 'Configurações', `Código de autorização regenerado: <strong>${novo}</strong>`);
  showToast('✅ Novo código gerado! Compartilhe com novos usuários.');
}

// ── Feriados ──
async function renderFeriados() {
  document.getElementById('feriado-dia').value  = '';
  document.getElementById('feriado-mes').value  = '';
  document.getElementById('feriado-nome').value = '';
  const store = await getStore();
  const lista = (store.config || {}).feriadosCustom || [];
  const badge = document.getElementById('badge-feriados');
  const box   = document.getElementById('list-feriados');
  if (badge) badge.textContent = lista.length;
  if (!box) return;
  box.innerHTML = !lista.length
    ? '<div style="color:var(--muted);font-size:13px;padding:4px 0">Nenhum feriado regional cadastrado.</div>'
    : lista.sort((a,b)=>a.chave.localeCompare(b.chave)).map((f,i) => {
        const p = (f.chave||'').split('-');
        return `<div class="dept-item">
          <span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;
            background:rgba(251,191,36,.15);color:#fbbf24;border:1px solid rgba(251,191,36,.3);white-space:nowrap">
            📅 ${String(parseInt(p[1])).padStart(2,'0')} de ${MESES_PT[parseInt(p[0])]||'?'}
          </span>
          <span class="dept-item-name">${esc(f.nome)||'—'}</span>
          <button class="btn btn-danger btn-sm" aria-label="Excluir" onclick="removeFeriado(${i})">✕</button>
        </div>`;
      }).join('');
}

async function addFeriado() {
  const dia  = String(parseInt(document.getElementById('feriado-dia').value)||0).padStart(2,'0');
  const mes  = document.getElementById('feriado-mes').value;
  const nome = document.getElementById('feriado-nome').value.trim();
  if (!mes || parseInt(dia)<1 || parseInt(dia)>31) { showToast('⚠️ Informe dia e mês válidos.','warn'); return; }
  if (!nome) { document.getElementById('feriado-nome').focus(); return; }
  const chave = `${mes}-${dia}`;
  const store = await getStore();
  if (!store.config) store.config = {};
  if (!store.config.feriadosCustom) store.config.feriadosCustom = [];
  if (store.config.feriadosCustom.some(f=>f.chave===chave)) { showToast('⚠️ Já existe feriado nesta data.','warn'); return; }
  store.config.feriadosCustom.push({ chave, nome });
  await saveStore(store);
  document.getElementById('feriado-dia').value  = '';
  document.getElementById('feriado-mes').value  = '';
  document.getElementById('feriado-nome').value = '';
  renderFeriados();
  await registrarLog('criou', 'Configurações', `Feriado regional adicionado: <strong>${esc(nome)}</strong> — ${String(parseInt(dia)).padStart(2,'0')}/${mes}`);
  showToast('✅ Feriado adicionado!');
}

async function removeFeriado(i) {
  if (!(await showConfirmModal('Remover este feriado?'))) return;
  const store = await getStore();
  if (!store.config) store.config = {};
  const feriado = (store.config.feriadosCustom || [])[i];
  store.config.feriadosCustom.splice(i, 1);
  await saveStore(store);
  renderFeriados();
  await registrarLog('excluiu', 'Configurações', `Feriado regional removido: <strong>${esc(feriado?.nome)||'—'}</strong> — ${esc(feriado?.chave)||''}`);
  showToast('✅ Feriado removido.');
}

// ── Usuários ──
async function renderUsers() {
  const store = await getStore();
  const box   = document.getElementById('users-list');
  if (!box) return;
  const users = Object.values(store.users).filter(u => u.id !== ADMIN_ID)
    .sort((a,b) => (a.name||'').localeCompare(b.name||'', 'pt-BR', { sensitivity:'base' }));
  if (!users.length) {
    box.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:4px 0">Nenhum usuário cadastrado além do admin.</div>';
    return;
  }
  const EM = { lider:'👷', encarregado:'🔰', coordenacao:'📋', gerencia:'📊', diretoria:'🏢' };
  box.innerHTML = users.map(u =>
    `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
      ${u.avatar ? '<img src="' + u.avatar + '" style="width:34px;height:34px;border-radius:50%;object-fit:cover;border:1px solid var(--border,#2a2f45);flex-shrink:0">' : '<div style="width:34px;height:34px;border-radius:50%;background:var(--surface3,#222638);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">' + (EM[u.nivel]||'👤') + '</div>'}
      <div style="flex:1;min-width:0">
      <div style="font-size:13px;font-weight:600;color:var(--text)">${esc(u.name)}</div>
         <div style="font-size:11px;color:var(--muted)">${esc(u.id)}${u.setor?' · '+esc(u.setor):''}</div>
      </div>
      <button class="btn btn-ghost btn-sm" aria-label="Editar" onclick="adminEditCard('${u.id}')">✏️</button>
      <button class="btn btn-ghost btn-sm" aria-label="Redefinir Senha" onclick="adminResetPass('${u.id}')">🔑</button>
      <button class="btn btn-danger btn-sm" aria-label="Excluir" onclick="adminDeleteUser('${u.id}')">✕</button>
    </div>`
  ).join('');
}

async function adminResetPass(userId) {
  const nova = await showPromptModal('Nova senha', {
    title: '🔑 Redefinir senha — ' + userId,
    placeholder: 'Mínimo 6 caracteres',
    type: 'password',
    min: 6,
  });
  if (!nova) return;
  if (nova.length < 6) { showToast('❌ Senha muito curta.','error'); return; }
  const store = await getStore();
  if (!store.users[userId]) { showToast('❌ Usuário não encontrado.','error'); return; }
  store.users[userId].pass = await hashPassword(nova);
  await saveStore(store);
  await registrarLog('editou', 'Configurações', `Senha redefinida pelo admin para usuário: <strong>${store.users[userId]?.name||userId}</strong> (login: ${userId})`);
  showToast('✅ Senha redefinida!');
}

async function adminDeleteUser(userId) {
  const store = await getStore();
  const u     = store.users[userId];
  if (!(await showConfirmModal(`Excluir "${esc(u?.name)}"? Esta ação não pode ser desfeita.`))) return;
  delete store.users[userId];
  await saveStore(store);
  renderUsers();
  await registrarLog('excluiu', 'Configurações', `Usuário excluído pelo admin: <strong>${u?.name||userId}</strong> — Nível: ${u?.nivel||'—'} — Login: ${userId}`);
  showToast('✅ Usuário removido.');
}

// ═══ Admin edita card de qualquer usuário ═══
async function adminEditCard(userId) {
  const store = await getStore();
  const u = store.users[userId];
  if (!u) { showToast('❌ Usuário não encontrado.','error'); return; }
  const EM = { lider:'👷', encarregado:'🔰', coordenacao:'📋', gerencia:'📊', diretoria:'🏢', admin_master:'🛡️' };
  let currentAvatar = u.avatar || null;
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;';
  const box = document.createElement('div');
  box.style.cssText = 'background:var(--surface,#12151f);border:1px solid var(--border,#2a2f45);border-radius:16px;padding:28px;width:420px;max-width:92vw;box-shadow:0 24px 64px rgba(0,0,0,.5);';
  box.innerHTML =
    '<div style="font-size:16px;font-weight:700;margin-bottom:20px;color:var(--text,#fff)">✏️ Editar Card — ' + userId + '</div>' +
    '<div style="display:flex;align-items:center;gap:16px;margin-bottom:20px">' +
      '<div id="_ec-avatar-area">' + avatarCircle(currentAvatar, 64) + '</div>' +
      '<div style="flex:1">' +
        '<div id="_ec-nivel-badge" style="font-size:12px;color:' + (NIVEL_LABELS[u.nivel]?.cor||'#94a3b8') + ';margin-bottom:4px">' + (EM[u.nivel]||'👤') + ' ' + (NIVEL_LABELS[u.nivel]?.label||u.nivel) + '</div>' +
        '<button class="btn btn-ghost btn-sm" id="_ec-upload-btn" style="font-size:11px">📷 Trocar Foto</button>' +
        (currentAvatar ? ' <button class="btn btn-ghost btn-sm" id="_ec-remove-avatar" aria-label="Remover foto" style="font-size:11px;color:var(--red,#f87171)">✕</button>' : '') +
      '</div>' +
    '</div>' +
    '<div class="form-group"><label>Nome completo</label><input id="_ec-name" value="' + esc(u.name) + '" style="width:100%;padding:10px 14px;background:var(--surface2,#1a1e2e);border:1px solid var(--border,#2a2f45);border-radius:10px;color:var(--text,#fff);font-size:14px;outline:none;box-sizing:border-box"></div>' +
    '<div class="form-group" style="margin-top:12px"><label>Setor / Departamento</label><input id="_ec-setor" value="' + esc(u.setor) + '" style="width:100%;padding:10px 14px;background:var(--surface2,#1a1e2e);border:1px solid var(--border,#2a2f45);border-radius:10px;color:var(--text,#fff);font-size:14px;outline:none;box-sizing:border-box"></div>' +
    '<div style="margin-top:12px;font-size:12px;color:var(--muted,#94a3b8)">ID: <strong>' + userId + '</strong></div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px">' +
      '<button id="_ec-cancel" style="padding:8px 20px;background:var(--surface3,#222638);border:1px solid var(--border,#2a2f45);border-radius:10px;color:var(--muted,#94a3b8);font-size:13px;cursor:pointer">Cancelar</button>' +
      '<button id="_ec-save" style="padding:8px 20px;background:var(--accent,#4f8ef7);border:none;border-radius:10px;color:#fff;font-size:13px;font-weight:600;cursor:pointer">💾 Salvar</button></div>';
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  let removed = false;
  document.getElementById('_ec-cancel').onclick = function() { overlay.remove(); };
  document.getElementById('_ec-upload-btn').onclick = async function() {
    const b64 = await uploadAvatar();
    if (b64) { currentAvatar = b64; removed = false; const a = document.getElementById('_ec-avatar-area'); if (a) a.innerHTML = avatarCircle(b64, 64); }
  };
  const rmBtn = document.getElementById('_ec-remove-avatar');
  if (rmBtn) rmBtn.onclick = function() { currentAvatar = null; removed = true; const a = document.getElementById('_ec-avatar-area'); if (a) a.innerHTML = avatarCircle(null, 64); };
  document.getElementById('_ec-save').onclick = async function() {
    const name = document.getElementById('_ec-name').value.trim();
    const setor = document.getElementById('_ec-setor').value.trim();
    if (!name) { showToast('❌ Nome não pode ficar vazio.','error'); return; }
    const s = await getStore();
    if (!s.users[userId]) { showToast('❌ Usuário não existe mais.','error'); overlay.remove(); return; }
    s.users[userId].name = name;
    s.users[userId].setor = setor;
    s.users[userId].avatar = removed ? null : (currentAvatar || s.users[userId].avatar || null);
    await saveStore(s);
    await registrarLog('editou', 'Configurações', 'Card de usuário editado: <strong>' + userId + '</strong> — Nome: ' + name + (setor ? ' · Setor: ' + setor : ''));
    overlay.remove();
    renderUsers();
    showToast('✅ Card de <strong>' + name + '</strong> salvo!');
  };
}

// ════════════════════════════════════════════════════════
// ADMIN GESTOR
// ════════════════════════════════════════════════════════
async function renderAdminGestor() {
  const store  = await getStore();
  const nivel  = currentUser.nivel;
  const NOMES  = { encarregado:'Encarregado', coordenacao:'Coordenação', gerencia:'Gerência', diretoria:'Diretoria' };

  const cardArea = document.getElementById('gestor-card-area');
  if (cardArea) {
    cardArea.innerHTML = renderCardHtml(currentUser, 'gestor');
  }

  document.getElementById('gestor-info-box').innerHTML =
    `📊 Você está logado como <strong>${NOMES[nivel]||nivel}</strong>. Gerencie abaixo suas filiais, turnos e departamentos de responsabilidade.`;

  const p          = currentUser.perfil || {};
  const selFiliais = p.filiais || (p.filial ? [p.filial] : []);
  const selTurnos  = p.turnos  || (p.turno  ? [p.turno]  : []);
  const selDepts   = p.depts   || [];

  const checks = (listId, items, selectedArr, emoji) => {
    const el = document.getElementById(listId);
    if (!items.length) { el.innerHTML = `<span style="color:var(--muted);font-size:12px">Nenhum cadastrado pelo Admin.</span>`; return; }
    el.innerHTML = items.map(x => `
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;padding:5px 8px;
        border-radius:6px;background:var(--surface2);border:1px solid var(--border);color:var(--text)">
        <input type="checkbox" value="${x.nome}" ${selectedArr.includes(x.nome)?'checked':''}
          style="accent-color:var(--accent);width:15px;height:15px">
        ${emoji} ${x.nome}
      </label>`).join('');
  };

  checks('gestor-filiais', store.filiais||[], selFiliais, '🏭');
  checks('gestor-turnos',  store.turnos||[],  selTurnos,  '🕐');
  checks('gestor-depts',   store.depts||[],   selDepts,   '🏢');

  const opt = (list, val) =>
    `<option value="">— Selecione —</option>` +
    list.map(x => `<option value="${x.nome}" ${x.nome===val?'selected':''}>${x.nome}</option>`).join('');
  document.getElementById('gestor-funcao').innerHTML = opt(store.funcoes||[], p.funcao||'');
}

async function savePerfilGestor() {
  await withLoading('btn-save-perfil-gestor', async () => {
    const store   = await getStore();
    const filiais = [...document.querySelectorAll('#gestor-filiais input:checked')].map(c=>c.value);
    const turnos  = [...document.querySelectorAll('#gestor-turnos input:checked')].map(c=>c.value);
    const depts   = [...document.querySelectorAll('#gestor-depts input:checked')].map(c=>c.value);
    const funcao  = document.getElementById('gestor-funcao').value;

    const nomeInput = document.getElementById('gestor-nome');
    if (nomeInput) {
      const nome = nomeInput.value.trim();
      if (nome) { store.users[currentUser.id].name = nome; currentUser.name = nome; }
    }
    if (_gestorAvatar !== undefined) { store.users[currentUser.id].avatar = _gestorAvatar; currentUser.avatar = _gestorAvatar; }

    const perfil = {
      filiais,  filial:  filiais[0] || '',
      turnos,   turno:   turnos[0]  || '',
      depts,    funcao,
    };

    store.users[currentUser.id].perfil = perfil;
    store.users[currentUser.id].setor  = depts[0] || '';
    currentUser.perfil = perfil;
    await saveStore(store);
    const partes = [];
    if (nomeInput && nomeInput.value.trim()) partes.push(`Nome: <strong>${nomeInput.value.trim()}</strong>`);
    if (filiais.length) partes.push(`Filiais: <strong>${filiais.join(', ')}</strong>`);
    if (turnos.length)  partes.push(`Turnos: <strong>${turnos.join(', ')}</strong>`);
    if (depts.length)   partes.push(`Departamentos: <strong>${depts.join(', ')}</strong>`);
    if (funcao)         partes.push(`Função: <strong>${funcao}</strong>`);
    await registrarLog('editou', 'Configurações', `Perfil próprio atualizado — ${partes.join(' · ')||'sem alterações'}`);
    _gestorAvatar = undefined;
    showToast('✅ Perfil salvo!');
  });
}

// ════════════════════════════════════════════════════════
// LÍDER OPERACIONAL
// ════════════════════════════════════════════════════════
async function renderLider() {
  const store = await getStore();
  const p     = currentUser.perfil || {};
  const opt   = (list, val) =>
    `<option value="">— Selecione —</option>` +
    list.map(x => `<option value="${x.nome}" ${x.nome===val?'selected':''}>${x.nome}</option>`).join('');

  const cardArea = document.getElementById('lider-card-area');
  if (cardArea) {
    cardArea.innerHTML = renderCardHtml(currentUser, 'lider');
  }

  document.getElementById('lider-filial').innerHTML = opt(store.filiais, p.filial||'');
  document.getElementById('lider-turno').innerHTML  = opt(store.turnos,  p.turno||'');

  const selected = p.depts || [];
  document.getElementById('lider-depts-list').innerHTML = store.depts.map(d =>
    `<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;
      color:var(--text);padding:6px 10px;border-radius:6px;
      background:var(--surface2);border:1px solid var(--border)">
      <input type="checkbox" value="${d.nome}" ${selected.includes(d.nome)?'checked':''}
        style="accent-color:var(--accent);width:16px;height:16px">
      🏢 ${d.nome}
    </label>`
  ).join('') || '<div style="color:var(--muted);font-size:12px;padding:4px 0">Nenhum departamento cadastrado.</div>';
}

// ═══ Helpers de avatar (líder/gestor) ═══
async function liderUploadAvatar() { const b64 = await uploadAvatar(); if (b64) { _liderAvatar = b64; const a = document.getElementById('_lider-avatar'); if (a) a.innerHTML = avatarCircle(b64, 64); } }
function liderRemoverAvatar() { _liderAvatar = null; const a = document.getElementById('_lider-avatar'); if (a) a.innerHTML = avatarCircle(null, 64); }
async function gestorUploadAvatar() { const b64 = await uploadAvatar(); if (b64) { _gestorAvatar = b64; const a = document.getElementById('_gestor-avatar'); if (a) a.innerHTML = avatarCircle(b64, 64); } }
function gestorRemoverAvatar() { _gestorAvatar = null; const a = document.getElementById('_gestor-avatar'); if (a) a.innerHTML = avatarCircle(null, 64); }

async function savePerfilLider() {
  await withLoading('btn-save-perfil-lider', async () => {
    const store = await getStore();
    const depts = [...document.querySelectorAll('#lider-depts-list input[type=checkbox]:checked')]
                  .map(c => c.value);
    const nomeInput = document.getElementById('lider-nome');
    if (nomeInput) {
      const nome = nomeInput.value.trim();
      if (nome) { store.users[currentUser.id].name = nome; currentUser.name = nome; }
    }
    if (_liderAvatar !== undefined) { store.users[currentUser.id].avatar = _liderAvatar; currentUser.avatar = _liderAvatar; }
    const perfil = {
      filial: document.getElementById('lider-filial').value,
      turno:  document.getElementById('lider-turno').value,
      depts,
    };
    store.users[currentUser.id].perfil = perfil;
    currentUser.perfil = perfil;
    await saveStore(store);
    const partesLider = [];
    if (perfil.filial) partesLider.push(`Filial: <strong>${perfil.filial}</strong>`);
    if (perfil.turno)  partesLider.push(`Turno: <strong>${perfil.turno}</strong>`);
    if (depts.length)  partesLider.push(`Departamentos: <strong>${depts.join(', ')}</strong>`);
    if (nomeInput && nomeInput.value.trim()) partesLider.unshift(`Nome: <strong>${nomeInput.value.trim()}</strong>`);
    await registrarLog('editou', 'Configurações', `Perfil próprio atualizado — ${partesLider.join(' · ')||'sem alterações'}`);
    _liderAvatar = undefined;
    showToast('✅ Perfil salvo!');
  });
}

// ════════════════════════════════════════════════════════
// IMPORTAR / EXPORTAR JSON
// ════════════════════════════════════════════════════════
async function exportarJSON() {
  const rh_store = await LS.get('rh_store');
  // Stripa senhas dos usuários no export
  if (rh_store?.users) {
    rh_store.users = Object.fromEntries(
      Object.entries(rh_store.users).map(([id, u]) => {
        const { pass, ...rest } = u;
        return [id, rest];
      })
    );
  }
  const payload = {
    rh_store,
    rh_theme:          LS_LOCAL.get('rh_theme') || 'dark',
    rh_quadro:         await LS.get('rh_quadro') || {},
    rh_ponto:          await LS.get('rh_ponto') || {},
    rh_ocorrencias:    await LS.get('rh_ocorrencias') || [],
    rh_aptidoes:       await LS.get('rh_aptidoes') || [],
    rh_audit_log:      await LS.get('rh_audit_log') || [],
    exported_at:       new Date().toISOString(),
    version:           '2.0',
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const date = new Date().toISOString().slice(0,10);
  a.href     = url;
  a.download = `rh-nagumo-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('✅ Backup exportado com sucesso!');
}

async function importarJSON(input) {
  if (currentUser?.nivel !== 'admin_master') {
    showToast('⚠️ Apenas o Admin Master pode importar backups.','warn');
    input.value = '';
    return;
  }

  const file = input.files[0];
  if (!file) return;

  const status = document.getElementById('import-status');
  status.textContent = '⏳ Lendo arquivo...';

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);

      if (!data.rh_store || !data.rh_store.users) {
        status.textContent = '❌ Arquivo inválido ou corrompido.';
        showToast('❌ Arquivo inválido.','error');
        return;
      }
      if (!data.version) {
        status.textContent = '❌ Formato de backup não reconhecido.';
        showToast('❌ Formato de backup não reconhecido.','error');
        return;
      }
      if (!Array.isArray(data.rh_store.employees)) {
        status.textContent = '❌ Arquivo corrompido: employees deve ser um array.';
        showToast('❌ Arquivo inválido.','error');
        return;
      }
      if (data.rh_store.filiais != null && !Array.isArray(data.rh_store.filiais)) {
        status.textContent = '❌ Arquivo corrompido: filiais deve ser um array.';
        showToast('❌ Arquivo inválido.','error');
        return;
      }
      if (data.rh_ocorrencias != null && !Array.isArray(data.rh_ocorrencias)) {
        status.textContent = '❌ Arquivo corrompido: ocorrências inválidas.';
        showToast('❌ Arquivo inválido.','error');
        return;
      }
      if (data.rh_aptidoes != null && !Array.isArray(data.rh_aptidoes)) {
        status.textContent = '❌ Arquivo corrompido: aptidões inválidas.';
        showToast('❌ Arquivo inválido.','error');
        return;
      }
      if (data.rh_audit_log != null && !Array.isArray(data.rh_audit_log)) {
        status.textContent = '❌ Arquivo corrompido: auditoria inválida.';
        showToast('❌ Arquivo inválido.','error');
        return;
      }
      if (data.rh_ponto != null && (typeof data.rh_ponto !== 'object' || Array.isArray(data.rh_ponto))) {
        status.textContent = '❌ Arquivo corrompido: ponto inválido.';
        showToast('❌ Arquivo inválido.','error');
        return;
      }
      if (data.rh_quadro != null && (typeof data.rh_quadro !== 'object' || Array.isArray(data.rh_quadro))) {
        status.textContent = '❌ Arquivo corrompido: quadro inválido.';
        showToast('❌ Arquivo inválido.','error');
        return;
      }

      const totalUsers        = Object.keys(data.rh_store.users).length;
      const totalFiliais      = (data.rh_store.filiais || []).length;
      const totalFuncionarios = (data.rh_store.employees || []).length;
      const exportedAt        = data.exported_at
        ? new Date(data.exported_at).toLocaleString('pt-BR')
        : 'data desconhecida';

      if (totalFuncionarios === 0) {
        const prosseguir = await showConfirmModal(
          '⚠️ ATENÇÃO: este arquivo não contém funcionários!<br><br>' +
          'Importar vai apagar todos os funcionários cadastrados atualmente.<br><br>' +
          'Tem certeza que quer continuar?'
        );
        if (!prosseguir) { status.textContent = ''; input.value = ''; return; }
      }

      const ok = await showConfirmModal(
        '📦 Importar backup?<br><br>' +
        'Exportado em: ' + exportedAt + '<br>' +
        'Funcionários: ' + totalFuncionarios + '<br>' +
        'Usuários/Líderes: ' + totalUsers + '<br>' +
        'Filiais: ' + totalFiliais + '<br><br>' +
        '⚠️ ATENÇÃO: isso vai substituir TODOS os dados atuais.<br>' +
        'Esta ação não pode ser desfeita.'
      );
      if (!ok) { status.textContent = ''; input.value = ''; return; }

      try {
        localStorage.setItem('rh_pre_import_backup', JSON.stringify({
          rh_store:       await LS.get('rh_store'),
          rh_ponto:       await LS.get('rh_ponto'),
          rh_ocorrencias: await LS.get('rh_ocorrencias'),
          rh_aptidoes:    await LS.get('rh_aptidoes'),
          rh_audit_log:   await LS.get('rh_audit_log'),
          rh_quadro:      await LS.get('rh_quadro'),
          rh_theme:       LS_LOCAL.get('rh_theme'),
          saved_at:       new Date().toISOString(),
        }));
        showToast('💾 Backup pré-importação salvo em rh_pre_import_backup','warn');
      } catch(e) { console.warn('[Import] Não foi possível salvar pré-backup:', e); }

      if (data.rh_perm_overrides && !data.rh_store.permOverrides) {
        data.rh_store.permOverrides = data.rh_perm_overrides;
      }
      await LS.set('rh_store', data.rh_store);
      LS_LOCAL.set('rh_theme', data.rh_theme || 'dark');
      if (data.rh_quadro)         await LS.set('rh_quadro', data.rh_quadro);
      if (data.rh_ponto)          await LS.set('rh_ponto', data.rh_ponto);
      if (data.rh_ocorrencias)    await LS.set('rh_ocorrencias', data.rh_ocorrencias);
      if (data.rh_aptidoes)       await LS.set('rh_aptidoes', data.rh_aptidoes);
      if (data.rh_audit_log)      await LS.set('rh_audit_log', data.rh_audit_log);

      status.textContent = '';
      input.value = '';
      await registrarLog('editou', 'Configurações', `Backup importado: <strong>${totalUsers}</strong> usuários · <strong>${totalFiliais}</strong> filiais · Exportado em: ${exportedAt}`);
      showToast(`✅ Dados importados! ${totalUsers} usuários carregados.`);

      setTimeout(() => window.location.reload(), 1200);

    } catch(err) {
      status.textContent = '❌ Erro ao ler o arquivo.';
      showToast('❌ Erro ao importar: ' + err.message,'error');
    }
  };
  reader.readAsText(file);
}

// ════════════════════════════════════════════════════════
// TABELA DE PERMISSÕES
// ════════════════════════════════════════════════════════
function renderTabelaPermissoes() {
  const tabela   = document.getElementById('perm-table');
  if (!tabela) return;

  const ativas   = getActivePermissions();
  const defaults = PERMISSIONS;
  const overrides= _getPermissionOverrides() || {};
  const temOverride = Object.keys(overrides).length > 0;
  const badge    = document.getElementById('perm-changed-badge');
  if (badge) badge.style.display = temOverride ? 'inline-flex' : 'none';

  const roles = ROLE_HIERARCHY.filter(r => r !== 'admin_master');
  let html = `<thead><tr>
    <th style="min-width:160px">Página / Ação</th>
    ${roles.map(r => `<th class="role-col">${ROLE_LABELS[r]}</th>`).join('')}
  </tr></thead><tbody>`;

  Object.entries(PAGE_LABELS).forEach(([page, meta]) => {
    html += `<tr class="perm-page-header"><td colspan="${roles.length + 1}">${meta.label}</td></tr>`;

    meta.actions.forEach(action => {
      const currentRole = ativas[page]?.[action] || 'admin_master';
      const defaultRole = defaults[page]?.[action] || 'admin_master';
      const changed     = overrides[page]?.[action] && overrides[page][action] !== defaultRole;

      html += `<tr>
        <td class="perm-action-label">${ACTION_LABELS[action] || action}</td>
        ${roles.map(role => {
          const isMin     = role === currentRole;
          const isAllowed = roleLevel(role) >= roleLevel(currentRole);
          const dot = isMin
            ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;
                background:var(--accent);box-shadow:0 0 6px var(--accent);
                margin:0 auto"></span>`
            : isAllowed
              ? `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;
                  background:rgba(79,142,247,.3);margin:0 auto"></span>`
              : `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;
                  background:var(--surface3);margin:0 auto"></span>`;
          return `<td style="text-align:center">${dot}</td>`;
        }).join('')}
        <td style="min-width:130px">
          <select class="perm-select ${changed?'perm-changed':''}"
            data-page="${page}" data-action="${action}"
            onchange="onPermChange(this)">
            ${ROLE_HIERARCHY.map(r =>
              `<option value="${r}" ${r===currentRole?'selected':''}>${ROLE_LABELS[r]}</option>`
            ).join('')}
          </select>
        </td>
      </tr>`;
    });
  });

  html += '</tbody>';
  tabela.innerHTML = html;
}

function onPermChange(select) {
  select.classList.add('perm-changed');
  const badge = document.getElementById('perm-changed-badge');
  if (badge) badge.style.display = 'inline-flex';

  const row = select.closest('tr');
  if (!row) return;
  const cells = row.querySelectorAll('td');
  if (cells.length < 7) return;
  const newRole = select.value;
  const newLevel = roleLevel(newRole);
  const roles = ROLE_HIERARCHY.filter(function(r) { return r !== 'admin_master'; });
  for (let i = 0; i < roles.length; i++) {
    const cell = cells[i + 1];
    const role = roles[i];
    const roleLvl = roleLevel(role);
    if (role === newRole) {
      cell.innerHTML = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--accent);box-shadow:0 0 6px var(--accent);margin:0 auto"></span>';
    } else if (roleLvl >= newLevel) {
      cell.innerHTML = '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:rgba(79,142,247,.3);margin:0 auto"></span>';
    } else {
      cell.innerHTML = '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--surface3);margin:0 auto"></span>';
    }
  }
}

async function salvarPermissoes() {
  await withLoading('btn-salvar-permissoes', async () => {
    const selects   = document.querySelectorAll('.perm-select');
    const overrides = {};

    selects.forEach(sel => {
      const page   = sel.dataset.page;
      const action = sel.dataset.action;
      const val    = sel.value;
      const def    = PERMISSIONS[page]?.[action];
      if (val !== def) {
        if (!overrides[page]) overrides[page] = {};
        overrides[page][action] = val;
      }
    });

    await savePermissionOverrides(overrides);
    const qtd = Object.values(overrides).reduce((s,p)=>s+Object.keys(p).length, 0);
    registrarLog('editou', 'Configurações', `Permissões salvas: <strong>${qtd}</strong> regra${qtd!==1?'s':''} customizada${qtd!==1?'s':''}`);
    showToast('✅ Permissões salvas!');
    renderTabelaPermissoes();
  });
}

async function resetarPermissoes() {
  if (!(await showConfirmModal('Restaurar todas as permissões para os valores padrão?<br>Isso remove todos os ajustes personalizados.'))) return;
  await resetPermissionsToDefault();
  registrarLog('editou', 'Configurações', `Permissões restauradas para os valores padrão do sistema`);
  showToast('✅ Permissões restauradas para o padrão.');
  renderTabelaPermissoes();
}

async function changePassword(pre) {
  const cur  = document.getElementById(`${pre}-current`).value;
  const nw   = document.getElementById(`${pre}-new`).value;
  const nw2  = document.getElementById(`${pre}-new2`).value;
  const msgEl = document.getElementById(`${pre}-msg`);

  const showMsgLocal = (txt, type) => {
    msgEl.textContent = txt;
    msgEl.style.display   = 'block';
    msgEl.style.background = type==='error' ? 'rgba(248,113,113,.15)' : 'rgba(52,211,153,.15)';
    msgEl.style.color      = type==='error' ? 'var(--red)' : 'var(--green)';
    msgEl.style.border     = type==='error' ? '1px solid rgba(248,113,113,.3)' : '1px solid rgba(52,211,153,.3)';
  };

  if (!cur||!nw||!nw2)  { showMsgLocal('⚠️ Preencha todos os campos.','error'); return; }
  if (nw !== nw2)        { showMsgLocal('❌ As senhas não coincidem.','error');   return; }
  if (nw.length < 6)     { showMsgLocal('❌ Mínimo 6 caracteres.','error');       return; }

  const store = await getStore();
  const curOk = await checkPass(store, currentUser.id, cur);
  if (!curOk) {
    if (store.users[currentUser.id].pass === cur) {
      store.users[currentUser.id].pass = await hashPassword(cur);
      await saveStore(store);
    } else {
      showMsgLocal('❌ Senha atual incorreta.','error'); return;
    }
  }
  store.users[currentUser.id].pass = await hashPassword(nw);
  currentUser.pass = await hashPassword(nw);
  await saveStore(store);
  await registrarLog('editou', 'Configurações', `Senha própria alterada com sucesso`);
  showMsgLocal('✅ Senha alterada com sucesso!','success');
  [`${pre}-current`,`${pre}-new`,`${pre}-new2`].forEach(id => {
    const el = document.getElementById(id); if(el) el.value='';
  });
}

var _refreshDebounce = null;
window.addEventListener('page-refresh', async function () {
  if (_refreshDebounce) return;
  _refreshDebounce = setTimeout(function () { _refreshDebounce = null; }, 3000);
  if (typeof window._syncPermOverrides === 'function') {
    try {
      const s = await getStore();
      window._syncPermOverrides(s);
      renderTabelaPermissoes();
    } catch(e) { console.warn('[Config] page-refresh: getStore falhou', e); }
  }
});
