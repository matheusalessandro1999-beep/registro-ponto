# Pendência — Salt nas senhas / bcrypt

**Identificado em:** 29/jun/2026 — revisão de segurança na página `login.html`

## Problema

Atualmente as senhas são hashadas com **SHA-256 sem salt** (`shared.js:28`). Isso significa:

- Dois usuários com a mesma senha produzem o **mesmo hash** → vulnerável a rainbow tables
- O backup `.json` exporta `rh_store.users` com o campo `pass` (hash exposto)
- Embora tenhamos removido o `pass` do export, o hash sem sal continua armazenado no `localStorage`

## O que fazer na migração Electron + SQLite

1. **Substituir SHA-256 por bcrypt** (disponível nativamente no Node.js via `bcrypt` package)
2. **Armazenar `$2b$...` hashes** que já incluem salt embutido
3. **Re-hash todas as senhas** no momento da migração do banco
4. Opcional: implementar **PBKDF2** ou **Argon2** se o nível de segurança exigir

## Impacto

- `hashPassword()` e `checkPass()` em `shared.js` precisarão ser reescritas
- A migração precisa de um script que percorra os usuários atuais e re-hash cada senha
- Durante a migração, todos os usuários precisarão resetar a senha (já que não podemos recuperar a senha original do hash SHA-256)
