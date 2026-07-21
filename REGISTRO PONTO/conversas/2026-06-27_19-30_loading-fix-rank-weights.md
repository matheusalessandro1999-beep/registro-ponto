# Ranking + Loading — Correções

## Data: 2026-06-27

## O que foi feito

### 1. Ranking — 3 bugs corrigidos

| # | Arquivo | O que mudou |
|---|---------|-------------|
| 1 | `ranking.js:122-128` | `getWeights()` agora normaliza pesos quando `perf+apt > 100` (igual `aptidoes.js`) — antes `abs` podia ir a 0% |
| 2 | `ranking.js:172` | `catch(e)` agora loga `console.error('[calcBonus]', e)` antes de retornar 0 |
| 3 | `ranking.js:238-243` | Select de departamento agora tem `<option value="">Todos os departamentos</option>` igual aos outros filtros (antes defaultava no primeiro departamento) |

### 2. Loading screen — blink ao trocar de página

**Problema:** A loading screen tinha `transition:opacity .4s` (400ms de fade) e sumia automaticamente 200ms após `DOMContentLoaded`, **antes** dos dados async estarem prontos. Isso causava um "blink" perceptível ao navegar entre páginas.

**Solução em 3 partes:**

| # | O que mudou | Arquivos |
|---|-------------|----------|
| 1 | `hideLoading()` agora esconde **instantaneamente** (`display:none` em vez de `opacity:0` com transição de 400ms). Removido auto-hide no `DOMContentLoaded`. Adicionado fallback de 5s por segurança. | `shared.js` |
| 2 | Removido inline script redundante (`setTimeout(200ms)`) que auto-escondia o loading. | Todos os 12 HTMLs |
| 3 | Cada página chama `hideLoading()` **ao final** do seu init assíncrono, depois de carregar dados + renderizar. | `index.html` + 11 páginas JS |

**Novo fluxo:**
```
DOMContentLoaded → async init → carrega dados → renderiza → hideLoading()
                                                        ↑ loading só some AQUI
```

## Arquivos Modificados

- `shared.js` — `hideLoading()` sem delay, fallback 5s, removido auto-DOMContentLoaded
- `pages/ranking.js` — `getWeights()` normalizado, `calcBonus` catch com log, filtro dept com "Todos"
- Todos os 12 HTMLs — removido inline script de loading, CSS do loading sem transição
- `pages/leaders.js`, `absenteeism.js`, `aptidoes.js`, `audit.js`, `config.js`, `employees.js`, `ocorrencias.js`, `ponto.js`, `quadro.js`, `ranking.js`, `report.js`, `index.html` — adicionado `hideLoading()` ao final do init
- `login.html` — adicionado `DOMContentLoaded` listener com `hideLoading()`
