# Pendência — `emp.perf` não possui tracking mensal

Identificado durante revisão em 24/jun/2026 ao corrigir vazamento mensal das aptidões.

## 🔶 `emp.perf` vaza entre meses no cálculo do score

**Onde é definido:** `pages/employees.html:1608` — campo `#f-perf` no formulário de cadastro/edição do funcionário.

**Onde é lido para score (6 páginas):**
- `pages/aptidoes.js:185` — `calcScore()`
- `pages/aptidoes.js:202` — `calcScoreAnterior()` — **contamina mês passado com perf atual**
- `pages/employees.html:1011`
- `pages/leaders.html:819`
- `pages/ranking.html:518`
- `pages/report.js:95`
- `index.html:571`

**Problema:** `emp.perf` é um valor único, sem histórico por mês. Todas as páginas que calculam score usam o mesmo valor independente do mês. `calcScoreAnterior()` calcula a nota do mês passado usando o `perf` de hoje.

**Cenário de bug:**
1. Janeiro: perf = 70 → score de Janeiro calculado com 70 ✅
2. Fevereiro: gestor altera perf para 85
3. Na tela de aptidões, score de Janeiro **aparece recalculado com 85** ❌

**Impacto:** Baixo. O perf raramente é alterado depois do cadastro. Só vaza quando alguém edita o campo `#f-perf` depois de meses já fechados.

**Solução proposta:** Criar `perf_history[monthKey]` análogo a `competencies_history`:
1. Adicionar campo de perf mensal na interface de aptidões (ou no card do funcionário por mês)
2. `selectScore`/`saveAvaliacao` salvariam também `perf_history[currentMonthKey()]`
3. Atualizar leituras em todas as 6 páginas para usar `perf_history[monthKey]`

**Prioridade:** Baixa — resolver durante migração Electron + SQLite se for relevante.
