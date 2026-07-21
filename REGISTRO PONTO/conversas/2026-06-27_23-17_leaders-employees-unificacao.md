# Sessão: Unificação líderes + store.employees

## O que foi feito

### 1. Shared.js — `checkPass` agora aceita store.employees
- `checkPass()` busca em `store.users` e cai em `store.employees` se não achar
- Promovido consegue logar

### 2. Leaders.js — runtime agora mescla store.users + store.employees
- `_findLeader(store, id)` — busca líder em `store.users` ou `store.employees`
- `_getAllLeaders(store)` — retorna lista mesclada e deduplicada de líderes (ambas fontes)
- `renderLeaders` → usa `_getAllLeaders` (líderes de `store.users` aparecem)
- `renderTreeBody` → usa `_findLeader` + `_getAllLeaders`
- `getTeamTotal` → usa `_getAllLeaders`
- `editLeader` → usa `_findLeader`
- `saveLeader` → se líder era de `store.users`, cria entrada em `store.employees` ao salvar
- `deleteLeader` → remove também de `store.users` se existir
- `openOcorrencia` → usa `_findLeader`

### 3. Botão de excluir removido, substituído por fluxo de demissão
- **Botão ✕ removido** do card de líder
- **Modal de edição** agora tem seção "🔴 Demissão" (checkbox + data + motivo)
- **Bloqueio**: se líder tiver subordinados (`getTeamTotal > 0`), não permite demitir — mostra toast "Transfira os subordinados antes"
- **Sumiço gradual**: líder demitido só some da lista quando `getTeamTotal === 0`
- **Botão "Ex-líderes"** no topo para ver demitidos

### 4. Botão Ocorrência — CSS corrigido
- Adicionado `.btn-oc` com `background:var(--surface2)` e borda

### 5. Tooltip do card removido
- `title` do `.lcard` removido (já existe `.lcard-org-hint` dentro do card)

## Pendente / Próximos passos
- Migrate script existe (`migrate-users.js`) mas precisa ser colado no console F12 para copiar `store.users` → `store.employees` (opcional, runtime já mescla)
- Se for refinar: melhorar o visual do card de líder demitido (mostrar badge "desligado")
- Possível: permitir reativar líder demitido pelo modal

## Arquivos alterados
- `shared.js` — checkPass
- `pages/leaders.js` — _findLeader, _getAllLeaders, renderLeaders, renderTreeBody, getTeamTotal, openModal, saveLeader, deleteLeader, openOcorrencia, buildCard, eventos
- `pages/leaders.html` — demissao-section no modal, toggle-demitidos no filter-bar
- `pages/leaders.css` — .btn-oc, .form-divider
