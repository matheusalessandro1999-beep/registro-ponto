# Hierarquia de Supervisão + Fixes Ponto

## O que foi feito

### Hierarquia de supervisão (supervisor_id)
- Função centralizada `getSupervisedEmployees(user, includeDemitidos)` em `shared.js:387`
- `supervisor_id` em cada employee com fallback para `owner_id`/`ownerId` em registros antigos
- `canEdit()`/`canDelete()` em `permissions.js` usando `supervisor_id || owner_id || ownerId`
- `isEmpBloqueado()` checa `supervisor_id` antes de `sem_dono`
- Substituído 8 implementações locais de `getMyEmployees()` por `getSupervisedEmployees()` em: `ponto.js`, `report.js`, `index.html`, `absenteeism.html`, `aptidoes.html`, `ranking.html`, `employees.html`, `ocorrencias.js`
- Campo `<select id="f-supervisor">` no formulário de employees (`employees.html:660`)
- `saveEmployee()` e `saveTransfer()` agora persistem `supervisor_id`
- `getLiderDoFuncionario()` prioriza `supervisor_id` primeiro

### Fixes de bugs
- `ocorrencias.js:179-183` — `_store` nunca declarado → adicionado `_store = store`
- `leaders.html` (5 funções) e `permissions.js:213,232` — type mismatch `supervisor_id` vs `leader.id` → `String()`
- `ponto.js:260` — `syncAbsencesToStore()` usava `new Date().getFullYear()` em vez de `anoAtivo`
- `employees.html:1665-1667` — supervisor vazio seta `null` em vez de deletar
- `ponto.js:354` — `getStatusDiaBloqueado()` com `emp.afastado` sem `data_afastamento` bloqueava desde 1970 → exige `data_afastamento`
- `employees.html:1764` — licença maternidade `+119` → `+120` dias

### XSS
- Função global `escHtml()` criada em `ponto.js:30`
- `buildFilialChips`, `buildDeptChips`, `buildTurnoChips` — nomes escapados em `onclick` e texto
- `emp.name` e `emp.role` escapados no DOM da grade (linhas 581-582)

### Responsividade
- Breakpoints 600px, 480px, 380px em `ponto.css`
- Modal de funcionários aumentado de 580px → 640px

### Remoções
- Botão "🗑️ Limpar Mês" + modal de reset de ponto removido

### UX
- Input do dia no lançamento rápido: `type="number"` → `type="text" inputmode="numeric"`
- Loading state "⏳ Carregando..." durante `renderGrade()`
- Auto-select primeiro departamento só na carga inicial (`_initialLoad`)

### Performance
- `setStatus()` não chama mais `syncAbsencesToStore()` por clique individual
- `_debouncedSyncAbsences()` — coleta empIds e executa em batch após 2s de inatividade
- `syncAbsencesEmBatch()` aceita parâmetro `ano` (não mais fixo em `anoAtivo`)

### Error handling
- `setStatusCtx()` — `getStore()` e `LS.get()` agora com try/catch + toast
- `lancamentoRapido()` — `syncAbsencesEmBatch` com `.catch()`

### Fix `gravarHistoricoAfastamento`
- Flag `mudouEmp` por funcionário em vez de `houveMudanca` global (contaminação entre blocos afastado/férias/maternidade)
- `allPonto[key] = mPonto` só reatribuído se o bloco respectivo mudou

### Discussão: unificar Employee + Leader
- Hoje `store.employees` (funcionários) e `store.users` (líderes) são separados
- Promover um funcionário exige 2 passos manuais: alterar `nivel` no card + criar login em `leaders.html`
- Sugestão: adicionar ID/senha/nível no card do funcionário, login buscar em `store.employees`, e `leaders.html` virar view-only (organograma)
- Regra de governança: você só promove alguém até o nível imediatamente abaixo do seu
- Documentado em `arrumar depois/employee-leader-unification.md` para implementar antes do Electron

## Arquivos modificados
- `pages/ponto.js` — escHtml, XSS fixes, debounced sync, error handling, loading state, _initialLoad, gravarHistoricoAfastamento
- `pages/ponto.css` — breakpoints responsivos
- `pages/ponto.html` — input lancamento-dia type=text
- `shared.js` — getSupervisedEmployees, isEmpBloqueado
- `permissions.js` — canEdit/canDelete, ROLE_HIERARCHY
- `pages/employees.html` — supervisor select, save, transfer, getLiderDoFuncionario, licença 120d
- `pages/leaders.html` — String() nas comparações supervisor_id
- `pages/ocorrencias.js` — _store = store
- `arrumar depois/ponto-pendencies.md` — itens postergados (race condition, flicker, dead code, CSS)
- `arrumar depois/employee-leader-unification.md` — plano de unificação employee+leader
