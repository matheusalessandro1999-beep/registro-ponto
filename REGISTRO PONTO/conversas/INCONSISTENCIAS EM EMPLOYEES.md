# Todos
[•] 1. Inconsistencia faltas: corrigir getTotalFaltasEmp
[ ] 2. Remover calcScore/calcAptMedia duplicados de employees.js
[ ] 3. Rollback/error recovery em saveStore
[ ] 4. Acessibilidade nos filtros (role button, tabindex, keydown)
[ ] 5. Substituir confirm() por showConfirmModal
[ ] 7. Limite de tamanho na foto
[ ] 8a. Ordenacao por score/dept/etc
[ ] 8b. Escape key nos modais transfer/ocorrencia
[ ] 8c. Validacao on blur
+ Thought: 939ms
Let me ler a seção do card que exibe "Faltas" e o buildCard:
→Read pages\employees.js [offset=442, limit=140]
+ Thought: 13.0s
Agora que tenho contexto completo, vou implementar todas as correções em paralelo. Primeiro, mudo showConfirmModal para shared.js e faço as alterações principais:
← Edit shared.js
  return               { tag:'risk',  label:'🔴 Risco',    cls:'tag-risk'  };
}

// ════════════════════════════════════════════════════════
// CONFIRM MODAL — modal de confirmação assíncrono
// ════════════════════════════════════════════════════════
function showConfirmModal(msg) {
  return new Promise(function (resolve) {
    const existing = document.getElementById('_confirm-modal');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = '_confirm-modal';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;';
    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:var(--surface,#12151f);border:1px solid var(--border,#2a2f45);border-radius:16px;padding:28px;width:380px;max-width:90vw;box-shadow:0 24px 64px rgba(0,0,0,.5);text-align:center;';
    dialog.innerHTML =
      '<div style="font-size:15px;color:var(--text,#fff);margin-bottom:20px;line-height:1.5">' + msg.replace(/\n/g,'<br>') + '</div>' +
      '<div style="display:flex;gap:8px;justify-content:center">' +
      '<button id="_confirm-cancel" style="padding:8px 20px;background:var(--surface3,#222638);border:1px solid var(--border,#2a2f45);border-radius:10px;color:var(--muted,#94a3b8);font-size:13px;cursor:pointer">Cancelar</button>' +
      '<button id="_confirm-ok" style="padding:8px 20px;background:var(--red,#f87171);border:none;border-radius:10px;color:#fff;font-size:13px;font-weight:600;cursor:pointer">Confirmar</button></div>';
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    function close(val) { overlay.remove(); resolve(val); }
    document.getElementById('_confirm-cancel').onclick = function () { close(false); };
    document.getElementById('_confirm-ok').onclick = function () { close(true); };
    overlay.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(false); });
    document.getElementById('_confirm-ok').focus();
  });
}

// ════════════════════════════════════════════════════════
// UTILITÁRIOS
// ════════════════════════════════════════════════════════
function toTitleCase(str) {
  return str.replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
← Edit pages\config.js

// ════════════════════════════════════════════════════════
// CONFIRM MODAL — substitui confirm() nativo
// ════════════════════════════════════════════════════════
function showConfirmModal(msg) {
  return new Promise(function (resolve) {
    const existing = document.getElementById('_confirm-modal');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = '_confirm-modal';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;';
    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:var(--surface,#12151f);border:1px solid var(--border,#2a2f45);border-radius:16px;padding:28px;width:380px;max-width:90vw;box-shadow:0 24px 64px rgba(0,0,0,.5);text-align:center;';
    dialog.innerHTML =
      '<div style="font-size:15px;color:var(--text,#fff);margin-bottom:20px;line-height:1.5">' + msg.replace(/\n/g,'<br>') + '</div>' +
      '<div style="display:flex;gap:8px;justify-content:center">' +
      '<button id="_confirm-cancel" style="padding:8px 20px;background:var(--surface3,#222638);border:1px solid var(--border,#2a2f45);border-radius:10px;color:var(--muted,#94a3b8);font-size:13px;cursor:pointer">Cancelar</button>' +
      '<button id="_confirm-ok" style="padding:8px 20px;background:var(--red,#f87171);border:none;border-radius:10px;color:#fff;font-size:13px;font-weight:600;cursor:pointer">Confirmar</button></div>';
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    function close(val) { overlay.remove(); resolve(val); }
    document.getElementById('_confirm-cancel').onclick = function () { close(false); };
    document.getElementById('_confirm-ok').onclick = function () { close(true); };
    overlay.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(false); });
    document.getElementById('_confirm-ok').focus();
  });
}

// ════════════════════════════════════════════════════════
// LOADING STATE HELPER
// ════════════════════════════════════════════════════════
function withLoading(btnId, fn) {
+ Thought: 19.7s
Agora vou fazer todas as alterações no employees.js:
← Edit pages\employees.js

// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
// SCORE HELPERS (getWeights/getStatus em shared.js)
// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
function calcAptMedia(emp) {
  const snap = (emp.competencies_history||{})[currentMonthKey()];
  if (snap) return APT_KEYS.reduce((s,k) => s+(snap[k]||0), 0) / APT_KEYS.length;
  const c = emp.competencies || {};
  return APT_KEYS.reduce((s,k) => s+(c[k]||0), 0) / APT_KEYS.length;
}
function calcAssid(emp) {
  if (emp.afastado || emp.maternidade) return 100;
  const total  = getTotalFaltasEmp(emp);
  const maxAbs = _store?.config?.maxAbs || 36;
← Edit pages\employees.js

  return null;
}

//  Lê faltas reais do rh_ponto (mais atualizado que emp.absences) 
function getTotalFaltasEmp(emp) {
  try {
    const allPonto = _allPonto;
    const agora = new Date();
    const ano = agora.getFullYear();
    const mes = String(agora.getMonth() + 1).padStart(2, '0');
    const key = `${emp.id}_${ano}_${mes}`;
    const dias = allPonto[key] || {};
    const ano = emp.year || new Date().getFullYear();
    let total = 0;
    Object.entries(dias).forEach(([diaStr, s]) => {
      if (new Date(ano, parseInt(mes)-1, parseInt(diaStr)).getDay() === 0) return;
      if (s === 'falta') total += 1;
    });
    return total;
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
    return 0;
    return (emp.absences||[]).reduce((a,b)=>a+b, 0);
  }
}

// """"""""""""""""""""""""""""""""""""""""""""""""""""""""
← Edit pages\employees.js
}

// Persiste no Firebase PRIMEIRO, depois mostra feedback
try {
  await saveStore(store);
  _store = null;
  _allPonto = null;
  await saveStore(store);
  closeModal();

  if (!editId) {
    await registrarLog('criou', 'Funcionários', `Novo registro: <strong>${name}</strong> · ${newDept||''}`);
← Edit pages\employees.js
const store = await getStore();
const emp = (store.employees||[]).find(e=>e.id===id);
if (!emp) return;
if (!canDeleteEmp(emp)) { showToast('⚠️ Sem permissão para excluir este funcionário.','warn'); return; }
if (!confirm(`Excluir "${emp.name}"?\nEsta ação não pode ser desfeita.`)) return;
const confirmed = await showConfirmModal(`Excluir "<strong>${emp.name}</strong>"?\n\nEsta ação não pode ser desfeita.`);
if (!confirmed) return;

// Remove do store
_store = null;
_allPonto = null;
← Edit pages\employees.js
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