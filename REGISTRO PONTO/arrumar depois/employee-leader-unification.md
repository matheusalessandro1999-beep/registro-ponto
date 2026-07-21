# Unificação Employee → Leader (antes do Electron)

## Motivação
Hoje employee e user/leader são entidades separadas (`store.employees` vs `store.users`). Promover um funcionário exige:
1. Alterar `nivel` no card em `employees.html`
2. Ir em `leaders.html` criar um login + senha novo

Isso duplica dados e permite inconsistências.

## O que fazer

### 1. Adicionar campos de login no card do funcionário (`employees.html`)
- **ID de acesso** (input text, ex: `joao.silva`)
- **Senha** (input password, com botão "Redefinir")
- **Nível de acesso** (select, exibindo apenas níveis abaixo do seu)

Campos só aparecem para quem tem permissão de promover.

### 2. Regra de governança
Você só pode promover alguém a um nível **imediatamente abaixo do seu**:

| Seu nível | Pode promover até |
|---|---|
| Admin Master | qualquer nível |
| Diretoria | Gerência |
| Gerência | Coordenação |
| Coordenação | Encarregado |
| Encarregado | Líder |
| Líder | ❌ não promove ninguém |

- O select de `nivel` no card só mostra opções até o nível abaixo do seu
- Líder não vê o campo `nivel` — não pode autopromover

### 3. Login passa a buscar em `store.employees`
- `getSession()` em `shared.js` consulta `store.employees` em vez de `store.users`
- Campo `id` do employee vira o ID de login

### 4. `leaders.html` vira view-only (organograma)
- Leitura apenas dos employees, exibindo árvore hierárquica
- Botão "Redefinir senha" abre o card do funcionário em `employees.html`
- Botão "Editar nível" abre o card do funcionário
- CRUD de usuários removido (criação/edição/deleção)

### 5. Migração única de dados
Script que percorre `store.users` e para cada user:
- Localiza employee correspondente (por nome ou ID)
- Copia `user.nivel`, `user.password_hash` e gera um `user.login_id`
- Se não encontrar employee correspondente, criar um registro mínimo

## Arquivos a modificar
- `pages/employees.html` — campos ID/senha/nivel no card + lógica de governança
- `shared.js` — `getSession()` busca em `store.employees`, `login()` valida contra employee
- `login.html` / `login.js` — adaptar para nova estrutura
- `pages/leaders.html` — remover CRUD, manter apenas visualização + atalhos
- Script de migração (`migrate-users-to-employees.js`)
