# employees — Correção de Inconsistências e Bugs (Final)

## Data: 2026-06-27

## O que foi feito

### Fase 1 — 6 itens do `INCONSISTENCIAS EM EMPLOYEES.md`

Aplicados todos os `[x]` marcados como pendentes.

| Item | Descrição | Arquivos |
|------|-----------|----------|
| **2** | `calcScore`/`calcAssid` duplicadas → refatoradas em `shared.js` com parâmetros opcionais (`totalOverride`, `bonus`); removidas de `employees.js`; mantido `calcBonus` local | `shared.js:544-556`, `employees.js` |
| **3** | Rollback em `deleteEmployee` (backup deep clone, restaura se `saveStore` falhar) e `saveTransfer` | `employees.js` |
| **4** | Acessibilidade nos filtros: `role="button"`, `tabindex="0"`, `onkeydown` Enter/Space | `employees.html` |
| **8a** | Select de ordenação: Nome A-Z/Z-A, Score maior/menor, Departamento, Filial | `employees.html` + `employees.js:371-390` |
| **8b** | Escape key nos modais `modal-transfer` e `modal-ocorrencia-emp` | `employees.js` |
| **8c** | Validação on blur: `showFieldError`, `clearFieldError`, `validateFieldRequired`, `validateMatriculaOnBlur` | `employees.js:741-778` |

### Fase 1.5 — Fix #1 (bug crítico page-refresh)

Adicionado `_store = null` e `_metricsCache = {}` no listener `page-refresh` para evitar TypeError ao re-renderizar após `saveStore()` de outra página.

---

### Fase 2 — Correções de Bugs Reais

| # | Severidade | Problema | Correção |
|---|-----------|---------|----------|
| 1 | **High** | Race condition em `renderCards`: chamadas concorrentes sobrescreviam `_store` | Mutex `_renderingMutex` com flag `abort` + abort checks após cada `await` |
| 2 | **High** | `emp.name.split(' ')` crashava se `emp.name` fosse `undefined` | `(emp.name\|\|'?').split(...).filter(Boolean)` em `buildCard`, `buildCardDemitido`, `_pdfAvatarBg` |
| 3 | **Medium** | 3 `catch(e) { return ... }` sem log | `console.error` adicionado em `computeMetricsCache`, `calcBonus`, `getTotalFaltasEmp` |
| 4 | **Low** | Dead code: `scoreRing` (nunca chamado), `_pdfPageBg`, `_pdfFotoPlaceholder`, `_pdfPageHeader` | Removidos (~30 linhas) |
| 5 | **Low** | `var` → `let`/`const` em todo `employees.js` | Zero `var` restantes no arquivo |

### Fase 3 — Permissões

| # | Descrição | Arquivo |
|---|-----------|---------|
| **5** | Ação `promover: 'gerencia'` adicionada em `PERMISSIONS.employees` + label `ACTION_LABELS` | `permissions.js` |

### Fase 4 — Cleanup extra

- `var` → `const` em `deleteEmployee` (ponto, ocorrencias)
- `window.DB.get/set('rh_aptidoes')` removido (dead code)
- `matricula:` lê variável já capturada, não DOM de novo
- Comentário enganoso removido do `setFilter`
- `.catch(function(){})` → `try/catch` com `console.warn`

---

## Decisões de Arquitetura

1. **XSS não corrigido intencionalmente** — dados vêm do localStorage que só admin altera; migração SQLite vai substituir a camada de renderização. Não vale over-engineer.
2. **`getTotalFaltasEmp` duplicada** entre `employees.js` e `leaders.js` — refatorar para `shared.js` exigiria mudar dependência de `_allPonto` (variável local de cada página). Deixado como está pela iminente migração Electron+SQLite.
3. **`window.DB.setMerge` mantido** — `setMerge` só existe em `window.DB` (db-local.js), `LS` não expõe esse método. Uso correto.

## Arquivos Modificados

- `pages/employees.js` — ~2130 → ~2108 linhas
- `pages/employees.html` — filtros + sort-select + modal listeners
- `shared.js` — `calcAssid`/`calcScore` com parâmetros opcionais
- `permissions.js` — ação `promover` + label

## Pendente para Futuro

- Item C (INCONSISTENCIAS): funcionário com `nivel` acidental some dos cards — validação já impede salvar sem `loginId`, risco só de dados corrompidos de migrações antigas
- Unificar `getTotalFaltasEmp` após migração SQLite
