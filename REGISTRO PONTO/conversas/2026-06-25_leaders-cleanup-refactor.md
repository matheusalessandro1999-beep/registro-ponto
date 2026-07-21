# Cleanup Leaders + Preparação Unificação Employee-Leader

## O que foi feito

### 1. Separação CSS/JS do `leaders.html`
- Criado `leaders.css` com estilos específicos (cards, árvore, modais, light theme)
- Criado `leaders.js` com toda a lógica extraída
- Removido ~515 linhas de CSS inline e ~900 linhas de JS inline
- HTML reduziu de 1609 → 157 linhas

### 2. Responsividade (`leaders.css`)
- Adicionado breakpoint **900px** (`.modal-tree` → 94vw)
- Adicionado breakpoint **768px** compactado (header, avatar, métricas, padding)
- Adicionado breakpoint **480px** (crítico — antes não existia)
  - `.leader-select` sem `min-width` fixo (não vazava)
  - Cards, árvore hierárquica, toast, empty-state tudo ajustado

### 3. Remoções no `leaders.html`
- ❌ Botão **"+ Novo Líder"** — desnecessário (líder é criado no cadastro)
- ❌ Botão **"Transferir"** — redundante (Editar já faz a mesma coisa)
- ❌ Botão **"Redefinir Senha"** — já existe na página Config
- ❌ Modal `ov-transfer` inteiro removido
- ❌ Funções `openTransfer`, `saveTransfer`, `closeTransfer`, `resetLeaderPass`
- ❌ `podTransfer` na permissão dos cards
- ❌ Event listener `ov-transfer` + referência no Escape

### 4. Pendente (próxima sessão)
- Unificação Employee → Leader conforme `arrumar depois/employee-leader-unification.md`
- Próximo passo: `employees.html` — adicionar campos `nivel`, `login_id`, `senha`, `foto` no formulário
- Depois: `shared.js` → `getSession()` buscar em `store.employees`
- Migração `store.users` → `store.employees`
- `leaders.html` virar view-only lendo de `store.employees`

## Arquivos modificados
- `pages/leaders.html` — CSS/JS externalizados, botões removidos
- `pages/leaders.css` — criado com estilos específicos + responsivo completo
- `pages/leaders.js` — criado, funções de transfer/senha removidas
