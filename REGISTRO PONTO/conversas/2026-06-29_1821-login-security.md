# Login — segurança e melhorias

## O que foi feito

### `login.html`
- Campo de login alterado para **e-mail apenas** (removeu celular), com `type="email"` e `maxlength="50"`
- Senhas: migradas de `-webkit-text-security:disc` para `type="password"` nativo com `togglePass()` alternando ícone olho/olho-riscado
- `autocomplete` correto: `email` / `current-password` / `new-password`
- Mensagens de erro genéricas: "❌ Credenciais inválidas" (não vaza se é usuário ou senha)
- **Bloqueio de 30s** após 3 tentativas falhas, persistido no `localStorage` (`rh_login_blocked`) — sobrevive a refresh
- **Expiração de sessão**: sessões com mais de 24h são limpas no `init()`
- **CSP**: `upgrade-insecure-requests` no `<head>`

### `pages/config.js`
- **Export limpo**: `exportarJSON()` stripa o campo `pass` dos usuários antes de gerar o `.json`
- **Upgrade forçado**: `upgradePasswords()` chamado ao carregar a página de Config — converte senhas legadas (plaintext) para SHA-256

### Pendência anotada
- `arrumar depois/password-salt-bcrypt.md` — SHA-256 sem salt é vulnerável a rainbow tables; migrar para bcrypt na versão Electron

## Arquivos alterados
- `login.html`
- `pages/config.js`
- `arrumar depois/password-salt-bcrypt.md` (criado)
