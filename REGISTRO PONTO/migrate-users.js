(async function migrateUsers() {
  'use strict';
  try {
    const storeStr = localStorage.getItem('rh_store');
    if (!storeStr) { console.log('[Migrate] Nada a migrar — rh_store vazio.'); return; }
    const store = JSON.parse(storeStr);
    const users = store.users || {};
    if (!store.employees) store.employees = [];
    const keys = Object.keys(users).filter(k => k !== 'admin');
    if (!keys.length) { console.log('[Migrate] Nenhum usuário (exceto admin) para migrar.'); return; }
    let migrados = 0, ignorados = 0;
    keys.forEach(k => {
      const u = users[k];
      const existente = store.employees.findIndex(e =>
        e.login_id === k || String(e.id) === String(k)
      );
      const empRecord = {
        login_id: k,
        pass: u.pass,
        nivel: u.nivel,
        setor: u.setor || '',
        perfil: u.perfil || { filial:'', turno:'', depts:[] },
        avatar: u.avatar || null,
        pass_reset_token: u.pass_reset_token || null,
      };
      if (u.foto && !u.avatar) empRecord.foto = u.foto;
      if (u.avatar && !u.foto) empRecord.foto = u.avatar;
      if (existente >= 0) {
        const old = store.employees[existente];
        store.employees[existente] = { ...old, ...empRecord,
          name: old.name || u.name,
          id: old.id,
          login_id: k,
        };
        ignorados++;
      } else {
        store.employees.push({
          id: k,
          name: u.name,
          dept: u.perfil?.depts?.[0] || u.setor || '',
          role: u.perfil?.funcao || '',
          filial: u.perfil?.filial || u.perfil?.filiais?.[0] || '',
          turno: u.perfil?.turno || u.perfil?.turnos?.[0] || '',
          matricula: '',
          supervisor_id: null,
          perf: 0,
          data_admissao: null,
          ...empRecord,
        });
        migrados++;
      }
    });
    store.migration_v1_done = true;
    localStorage.setItem('rh_store', JSON.stringify(store));
    console.log(`[Migrate] OK — ${migrados} novos, ${ignorados} mesclados. store.employees agora tem ${store.employees.length} registros.`);
  } catch(e) {
    console.error('[Migrate] Erro:', e);
  }
})();
