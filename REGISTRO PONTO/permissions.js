// ════════════════════════════════════════════════════════
// permissions.js — Tabela central de permissões
// Carregue ANTES do shared.js em todas as páginas:
//   <script src="../permissions.js"></script>
//   <script src="../shared.js"></script>
//
// Como usar nas páginas:
//   can(user, 'employees', 'create')   → true/false
//   canSee(user, 'employees')          → true/false
//   dataScope(user)                    → { own, sector, all }
// ════════════════════════════════════════════════════════

// ── Hierarquia de roles (ordem crescente de poder) ──────
const ROLE_HIERARCHY = [
  'lider',        // 0 — base
  'encarregado',  // 1
  'coordenacao',  // 2
  'gerencia',     // 3
  'diretoria',    // 4
  'admin_master', // 5 — tudo
];

// ── Mapa role → nível numérico ───────────────────────────
function roleLevel(nivel) {
  const idx = ROLE_HIERARCHY.indexOf(nivel);
  return idx === -1 ? 0 : idx;
}

// ════════════════════════════════════════════════════════
// TABELA DE PERMISSÕES
// Estrutura: PERMISSIONS[page][action] = role mínimo necessário
// Se a action não existir para a página → negado por padrão
//
// Pages:   dashboard, employees, absenteeism, ranking,
//          quadro, aptidoes, ponto, report, audit, config
// Actions: view, create, edit, delete,
//          transfer (mover funcionário de setor/filial/turno)
//          edit_own_profile (alterar próprio perfil e senha)
//          manage_structures (filiais, turnos, depts, funções)
//          manage_weights (pesos do score)
//          manage_auth (código de autorização)
//          manage_permissions (editar esta tabela)
//          manage_feriados (feriados regionais)
//          manage_users (reset senha, excluir usuários)
//          import_export (importar/exportar JSON)
// ════════════════════════════════════════════════════════
const PERMISSIONS = {

  // ── Dashboard ─────────────────────────────────────────
  dashboard: {
    view: 'lider',
  },

  // ── Funcionários ──────────────────────────────────────
  employees: {
    view:            'lider',
    create:          'lider',        // líder cria funcionários do seu setor
    edit:            'lider',        // líder edita apenas os que cadastrou
    delete:          'lider',        // idem
    transfer:        'encarregado',  // mover de setor/filial/turno/função
    ocorrencia:      'lider',        // registrar ocorrências do funcionário
    demitir:         'encarregado',  // registrar demissão de funcionário
    promover:        'gerencia',     // promover funcionário a cargo de liderança
    view_demitidos:  'coordenacao',  // ver seção de funcionários desligados
  },

  // ── Líderes ───────────────────────────────────────────
  leaders: {
    view:       'lider',        // todos podem ver
    create:     'admin_master', // só admin master cadastra
    edit:       'admin_master',
    delete:     'admin_master',
    transfer:   'admin_master', // transferir líder de filial/turno/dept
    ocorrencia: 'encarregado',  // registrar ocorrências do líder
  },

  // ── Absenteísmo ───────────────────────────────────────
  absenteeism: {
    view: 'lider',
  },

  // ── Ranking ───────────────────────────────────────────
  ranking: {
    view: 'lider',
  },

  // ── Quadro Operacional ────────────────────────────────
  quadro: {
    view:          'lider',        // todos veem
    edit_vagas:    'admin_master', // editar vagas por função/turno
    edit_total:    'admin_master', // editar total quadro da filial
  },

  // ── Aptidões ──────────────────────────────────────────
  aptidoes: {
    view:   'lider',
    edit:   'lider',          // líder edita aptidões dos seus funcionários
  },

  // ── Ponto Diário ──────────────────────────────────────
  ponto: {
    view:   'lider',
    edit:   'lider',
  },

  // ── Ocorrências ───────────────────────────────────────
  ocorrencias: {
    view:    'lider',        // todos veem
    create:  'lider',        // líder cria ocorrências dos seus funcionários
    edit:    'encarregado',  // encarregado+ edita
    delete:  'encarregado',  // encarregado+ exclui
    approve: 'encarregado',  // encarregado+ aprova/rejeita
  },

  // ── Relatório ─────────────────────────────────────────
  report: {
    view: 'lider',
  },

  // ── Registros / Auditoria ─────────────────────────────
  audit: {
    view: 'lider',
  },

  // ── Configurações — ações globais ─────────────────────
  config: {
    view:                'lider',
    edit_own_profile:    'lider',         // todos podem editar o próprio perfil
    manage_structures:   'admin_master',  // filiais, turnos, depts, funções
    manage_weights:      'admin_master',  // pesos do score tri-pilar
    manage_auth:         'admin_master',  // código de autorização
    manage_permissions:  'admin_master',  // esta tabela
    manage_feriados:     'admin_master',  // feriados regionais
    manage_users:        'admin_master',  // reset senha, excluir usuários
    import_export:       'admin_master',  // importar/exportar JSON
  },
};

// ════════════════════════════════════════════════════════
// ESCOPO DE DADOS — o que o usuário consegue ver/editar
//
// Retorna objeto com flags:
//   scope.all      → vê todos os funcionários de todas as filiais
//   scope.sector   → vê todos, mas edita/exclui apenas do próprio setor
//   scope.own      → vê e edita apenas os que ele mesmo cadastrou
// ════════════════════════════════════════════════════════
function dataScope(user) {
  if (!user) return { own: true,  sector: false, all: false };
  const nivel = user.nivel || 'lider';

  // Admin Master — acesso total
  if (nivel === 'admin_master') return { own: false, sector: false, all: true };

  // Gerente e Diretoria — veem tudo, editam tudo (sem restrição de setor)
  if (nivel === 'gerencia' || nivel === 'diretoria')
    return { own: false, sector: false, all: true };

  // Encarregado e Coordenação — veem tudo, editam apenas o próprio setor
  if (nivel === 'encarregado' || nivel === 'coordenacao')
    return { own: false, sector: true, all: false };

  // Líder — vê tudo, edita apenas os que cadastrou
  return { own: true, sector: false, all: false };
}

// ════════════════════════════════════════════════════════
// can(user, page, action) → boolean
// Verifica se o usuário tem permissão para a ação na página.
// Respeita overrides salvos no localStorage pelo Admin Master.
// ════════════════════════════════════════════════════════
function can(user, page, action) {
  if (!user) return false;
  const nivel = user.nivel || 'lider';

  // Admin Master — sempre pode tudo
  if (nivel === 'admin_master') return true;

  // Busca overrides salvos pelo admin (se existirem)
  const overrides = _getPermissionOverrides();
  const required  = overrides?.[page]?.[action] ?? PERMISSIONS[page]?.[action];

  // Se a ação não está definida para a página → nega por padrão
  if (!required) return false;

  return roleLevel(nivel) >= roleLevel(required);
}

// ════════════════════════════════════════════════════════
// canSee(user, page) → boolean
// Atalho para can(user, page, 'view')
// ════════════════════════════════════════════════════════
function canSee(user, page) {
  return can(user, page, 'view');
}

// ════════════════════════════════════════════════════════
// canEdit(user, page, employee) → boolean
// Para páginas de funcionários, verifica também o escopo
// (se o usuário só pode editar os próprios ou do setor)
// ════════════════════════════════════════════════════════
function canEdit(user, page, employee) {
  if (!can(user, page, 'edit')) return false;
  const scope = dataScope(user);
  if (scope.all) return true;

  // Escopo por setor: funcionário precisa ser do mesmo setor
  if (scope.sector) {
    const userSetor = (user.perfil?.depts || []);
    return userSetor.includes(employee?.dept) || user.setor === employee?.dept;
  }

  // Escopo próprio: funcionário precisa ter este usuário como supervisor
  if (scope.own) {
    return String(employee?.supervisor_id) === String(user.id);
  }

  return false;
}

// ════════════════════════════════════════════════════════
// canDelete(user, page, employee) → boolean
// Mesma lógica de canEdit, aplicada ao delete
// ════════════════════════════════════════════════════════
function canDelete(user, page, employee) {
  if (!can(user, page, 'delete')) return false;
  const scope = dataScope(user);
  if (scope.all) return true;
  if (scope.sector) {
    const userSetor = (user.perfil?.depts || []);
    return userSetor.includes(employee?.dept) || user.setor === employee?.dept;
  }
  if (scope.own) {
    return String(employee?.supervisor_id) === String(user.id);
  }
  return false;
}

// ════════════════════════════════════════════════════════
// OVERRIDES — Admin Master pode ajustar a tabela via UI
// Salvos no rh_store (compartilhado via SQLite/Firebase)
// Cache síncrono em _permCache para can() não virar async
// Fallback localStorage para compatibilidade com backups antigos
// ════════════════════════════════════════════════════════
const PERM_OVERRIDE_KEY = 'rh_perm_overrides';
let _permCache = null;

function _getPermissionOverrides() {
  // Cache síncrono alimentado pelo store
  if (_permCache) return _permCache;
  // Fallback: localStorage (backups antigos / migração)
  try {
    const v = localStorage.getItem(PERM_OVERRIDE_KEY);
    if (v) { _permCache = JSON.parse(v); return _permCache; }
  } catch(e) {}
  return null;
}

async function savePermissionOverrides(overrides) {
  try {
    const store = await getStore();
    store.permOverrides = Object.keys(overrides).length > 0 ? overrides : null;
    await saveStore(store);
    _permCache = store.permOverrides;
  } catch(e) {
    console.error('[Perm] Erro ao salvar overrides no store:', e);
    // Fallback: localStorage
    try { localStorage.setItem(PERM_OVERRIDE_KEY, JSON.stringify(overrides)); } catch(e2) {}
  }
}

async function resetPermissionsToDefault() {
  try {
    const store = await getStore();
    store.permOverrides = null;
    await saveStore(store);
  } catch(e) {
    console.error('[Perm] Erro ao resetar overrides no store:', e);
  }
  _permCache = null;
  try { localStorage.removeItem(PERM_OVERRIDE_KEY); } catch(e) {}
}

// Chamado pelo shared.js sempre que o store carrega ou cache-invalida
window._syncPermOverrides = function (store) {
  _permCache = (store && store.permOverrides) || null;
  // Se não tem no store mas tem localStorage, migra pro store
  if (!_permCache) {
    try {
      const v = localStorage.getItem(PERM_OVERRIDE_KEY);
      if (v) {
        _permCache = JSON.parse(v);
        // Migra pro store em background
        setTimeout(async () => {
          try {
            const s = await getStore();
            if (!s.permOverrides && _permCache) {
              s.permOverrides = _permCache;
              await saveStore(s);
              try { localStorage.removeItem(PERM_OVERRIDE_KEY); } catch(e3) {}
            }
          } catch(e4) {}
        }, 100);
      }
    } catch(e) {}
  }
};

// Retorna a tabela ativa (overrides + defaults mesclados)
function getActivePermissions() {
  const overrides = _getPermissionOverrides() || {};
  const result    = {};
  Object.keys(PERMISSIONS).forEach(page => {
    result[page] = { ...PERMISSIONS[page], ...(overrides[page] || {}) };
  });
  return result;
}

// ════════════════════════════════════════════════════════
// METADADOS PARA A UI DE PERMISSÕES
// ════════════════════════════════════════════════════════
const PAGE_LABELS = {
  dashboard:    { label:'📊 Dashboard',            actions:['view'] },
  employees:    { label:'👥 Funcionários',          actions:['view','create','edit','delete','transfer','ocorrencia','demitir','promover','view_demitidos'] },
  leaders:      { label:'🧑‍💼 Líderes',               actions:['view','create','edit','delete','transfer','ocorrencia'] },
  absenteeism:  { label:'📅 Absenteísmo',           actions:['view'] },
  ranking:      { label:'🏆 Ranking',               actions:['view'] },
  quadro:       { label:'📋 Quadro Operacional',    actions:['view','edit_vagas','edit_total'] },
  aptidoes:     { label:'🎯 Aptidões',              actions:['view','edit'] },
  ponto:        { label:'🗓️ Ponto Diário',          actions:['view','edit'] },
  ocorrencias:  { label:'📝 Ocorrências',           actions:['view','create','edit','delete','approve'] },
  report:       { label:'📄 Relatório',             actions:['view'] },
  audit:        { label:'🔍 Registros',             actions:['view'] },
  config:       { label:'⚙️ Configurações',         actions:[
    'view','edit_own_profile','manage_structures','manage_weights',
    'manage_auth','manage_permissions','manage_feriados',
    'manage_users','import_export'
  ]},
};

const ACTION_LABELS = {
  view:               'Visualizar',
  create:             'Criar',
  edit:               'Editar',
  delete:             'Excluir',
  transfer:           'Transferir',
  ocorrencia:         'Registrar Ocorrência',
  demitir:            'Registrar Desligamento',
  promover:           'Promover para Liderança',
  view_demitidos:     'Ver Funcionários Desligados',
  edit_vagas:         'Editar vagas por função/turno',
  edit_total:         'Editar total quadro da filial',
  approve:            'Aprovar / Rejeitar ocorrências',
  edit_own_profile:   'Editar próprio perfil',
  manage_structures:  'Gerenciar estruturas',
  manage_weights:     'Gerenciar pesos do score',
  manage_auth:        'Gerenciar código de auth',
  manage_permissions: 'Gerenciar permissões',
  manage_feriados:    'Gerenciar feriados',
  manage_users:       'Gerenciar usuários',
  import_export:      'Importar / Exportar',
};

const ROLE_LABELS = {
  lider:        '👷 Líder',
  encarregado:  '🔰 Encarregado',
  coordenacao:  '📋 Coordenação',
  gerencia:     '📊 Gerência',
  diretoria:    '🏢 Diretoria',
  admin_master: '🛡️ Admin Master',
};
