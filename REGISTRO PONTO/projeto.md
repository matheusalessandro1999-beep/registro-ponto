# RH Nagumo — Mapa do Projeto
> Gerado automaticamente pelo PROJECT_MAPPER_SPEC
> Atualizado em: 16/06/2026

---

## Identidade do projeto

- **Nome:** Sistema Inteligente de Gestão de Ponto Nagumo (RH Nagumo)
- **Descrição:** Sistema web de gestão de ponto, aptidões, ocorrências, absenteísmo e desempenho de funcionários para RH corporativo
- **Contexto:** Aplicação SPA rodando 100% no navegador com Firebase Firestore + SQLite local (via sql-wasm)
- **Stack:** HTML5 + CSS3 + Vanilla JS + Firebase (Firestore) + SQLite (sql-wasm) + Chart.js

---

## Estrutura de arquivos

```
├── index.html                → Dashboard principal (KPIs, gráficos Chart.js, Top 5)
├── login.html                → Tela de login/cadastro (não usa sidebar)
├── shared.js                 → ⚠️ ARQUIVO CRÍTICO — store, sessão, sidebar, toast, tema, audit log
├── permissions.js             → ⚠️ ARQUIVO CRÍTICO — tabela central de permissões RBAC
├── sidebar.css               → Estilos da sidebar global (colapsada por padrão)
├── light-theme.css           → Tema claro institucional (vermelho + azul marinho)
├── responsive.css            → Regras responsivas (breakpoints 480px–1400px)
├── PROJECT_MAPPER_SPEC.md    → Spec de geração de mapa
├── pages/
│   ├── employees.html        → Gestão de funcionários (CRUD, demissão)
│   ├── leaders.html          → Gestão de líderes
│   ├── absenteeism.html      → Absenteísmo (heatmap + gráficos)
│   ├── ranking.html          → Ranking de desempenho (pódio)
│   ├── quadro.html           → Quadro operacional (vagas por função/turno)
│   ├── aptidoes.html         → Avaliação de aptidões (10 competências)
│   ├── ponto.html            → Ponto diário (grade mensal)
│   ├── ocorrencias.html      → Gestão de ocorrências
│   ├── report.html           → Relatórios consolidados
│   ├── audit.html            → Registros de auditoria
│   └── config.html           → Configurações (estruturas, pesos, permissões)
```

---

## Dependências entre arquivos

### HTML (script src)

- `index.html` carrega: Chart.js (CDN), firebase-app-compat.js, firebase-firestore-compat.js, firebase.js, sql-wasm.js, db-local.js, sync-bridge.js, permissions.js, shared.js
- `login.html` carrega: firebase-app-compat.js, firebase-firestore-compat.js, firebase.js, sql-wasm.js, db-local.js, sync-bridge.js, permissions.js, shared.js
- `pages/*.html` (todas) carregam: firebase-app-compat.js, firebase-firestore-compat.js, firebase.js, sql-wasm.js, db-local.js, permissions.js, shared.js
- `employees.html` carrega adicionalmente: jsPDF (CDN)
- `absenteeism.html` e `aptidoes.html` carregam adicionalmente: Chart.js (CDN)

### HTML (link rel stylesheet)

- `index.html` importa: sidebar.css, light-theme.css, responsive.css
- `login.html` importa: responsive.css, light-theme.css (sem sidebar.css)
- `pages/*.html` importam: sidebar.css, light-theme.css, responsive.css

### JavaScript

- `shared.js` depende de: `window.DB` (definido em firebase.js), `can()`/`canSee()`/`dataScope()` (definidos em permissions.js)
- `permissions.js` é independente (sem dependências internas)

---

## Arquivos críticos (NÃO modificar sem aviso)

- `shared.js` — qualquer alteração afeta TODAS as 12 páginas simultaneamente (store, sessão, sidebar, toast, tema, audit log)
- `permissions.js` — tabela central de permissões RBAC; alterar afeta o controle de acesso de todo o sistema
- `light-theme.css` — tema claro institucional importado em todas as páginas

---

## Variáveis de ambiente

N/A — sistema 100% client-side (Firebase config está no firebase.js)

---

## Scripts disponíveis

N/A — sistema sem Node.js. Basta servir via HTTP:

- `npx serve .` → servidor local para desenvolvimento
- Qualquer servidor HTTP estático (Apache, Nginx, etc.)

---

## Regras deste projeto

- Toda alteração em `shared.js` requer confirmação prévia do usuário (arquivo crítico)
- Toda alteração em `permissions.js` requer confirmação prévia do usuário
- Nunca expor valores reais do Firebase config
- Não instalar dependências sem permissão
- sidebar.css nunca deve ser duplicado inline nos HTMLs

---

## Portas e endpoints principais

N/A — sistema client-side com Firebase (sem servidor próprio)

---

## Observações

- `sync-bridge.js` só é carregado em `index.html` e `login.html`
- `login.html` não carrega `sidebar.css` (intencional — tela de autenticação sem sidebar)
- Várias páginas em `pages/` carregam `sql-wasm.js` duas vezes (possível bug/oversight)
- Sistema funciona offline parcialmente via SQLite local (sql-wasm) + IndexedDB
- Admin padrão: `admin` / `admin123`
