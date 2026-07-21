# Conversa 2026-07-16 — Correção do Login + Auditoria

## Contexto
Sistema RH Nagumo — Registro de Ponto. Sistema rodado via `file://` no Windows (sem servidor local).

## Problema
Login com `admin@nagumo` / `admin123` sempre retornava "Credenciais inválidas".

## Bugs encontrados e corrigidos

### 1. `LS_LOCAL.del` não existia (corrigido em sessão anterior)
- `LS_LOCAL` só expõe `get`, `set`, `remove` — chamadas `.del()` causavam ReferenceError
- Todas as 6 ocorrências em `login.html` foram trocadas para `.remove`

### 2. 🔴 CRITICAL: Temporal Dead Zone em `loginBlockedUntil` (causa raiz)
- `loginBlockedUntil` era acessado na linha 245 do `init()` mas declarado com `let` na linha 316
- Isso causava `ReferenceError: Cannot access 'loginBlockedUntil' before initialization`
- O `init()` crashava silenciosamente → admin nunca era criado → login sempre falhava
- **Fix:** Mover `let loginAttempts = 0; let loginBlockedUntil = 0;` para antes do IIFE

### 3. 🔴 CRITICAL: Hash mismatch entre criação e verificação
- O admin antigo no localStorage tinha hash SHA-256 (64 chars) de quando `crypto.subtle` funcionava
- O código atual usa hash fallback (32 chars)
- `ensureAdmin()` só criava admin se NÃO existisse — se já existia com hash antigo, não atualizava
- **Fix:** Adicionar `else if (store.users[ADMIN_ID].pass !== correctHash)` no `ensureAdmin` para sempre forçar o hash correto

### 4. `hashPassword` removido `crypto.subtle` completamente
- Antes tentava SHA-256 via SubtleCrypto, que não funciona em `file://`
- Agora usa sempre o fallback determinístico (DJB2 + salt)
- Isso garante consistência entre page loads

### 5. `verificarPrimeiroBoot` removido do login.html
- Causava race condition: rodava em paralelo com `init()`, lia localStorage antes do admin ser salvo, e redirecionava para `import.html` em 1.5s

### 6. `upgradePasswords` — bug de re-hash
- Checava `u.pass.length < 40` mas o hash tem 32 chars → re-hasheava senhas já hasheadas
- **Fix:** Trocado para `u.pass.length !== 32`

### 7. Redirect sem delay em `doLogin`
- `window.location.href` executava antes do `registrarLog` terminar (async)
- **Fix:** Adicionado `setTimeout(() => { window.location.href = 'index.html'; }, 50)`

### 8. Botão "Limpar dados locais" adicionado no login
- Útil quando localStorage está corrompido

## Estado atual do código
- `ADMIN_ID = 'admin@nagumo'` (shared.js:7)
- `hashPassword` usa sempre fallback determinístico (shared.js:28-39)
- `ensureAdmin` força hash correto mesmo se admin já existe (shared.js:133-165)
- `verificarPrimeiroBoot` removido do login.html
- Cache busting `?v=5` nos scripts
- Indicador visual no topo da página mostra status do admin

## Pendente / Próximos passos
- `import.html` não existe (link quebrado no login.html)
- `getWeights` em shared.js:559-560 tem bug de variável mutada (pode corromper scores)
- `migrate-users.js` é código morto (nenhuma página o carrega)
- `import.html` link no login aponta para arquivo inexistente
- Migrar localStorage para Electron + SQLite conforme CLAUDE.md
- `checkPass` tem check `length !== 32` que funciona mas é redundante para o caso normal
