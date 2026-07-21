# Ranking — 6 melhorias implementadas

## O que foi feito

### 1. Cache do ponto (TTL 5s)
- `_pontoCache` / `_pontoCacheT` em `ranking.js`.
- Na abertura ou filtro, reusa cache se < 5s desde último fetch.

### 2. Inativos com "—"
- Colunas Desemp., Apt., Assid. exibem `—` quando `isInativo`.
- Barras zeradas, cor muda para `var(--muted)`.

### 3. Clique no `<th>` para ordenar
- `onclick="toggleSort('name')"` movido do `<span>` interno para o `<th>` (igual aos demais cabeçalhos).

### 4. `perf_history[monthKey]` — tracking mensal de desempenho
- `employees.html`: `currentMonthKey()` adicionado. Save persiste `perf_history[monthKey]` com merge de meses anteriores. `openModal` lê `perf_history[monthKey]` com fallback para `emp.perf`.
- `ranking.js`: `calcScore` e enriched data usam `perf_history[monthKey]`.
- `aptidoes.js`: `calcScore` e `calcScoreAnterior` usam `perf_history[monthKey]`.

### 5. Loading state
- Antes do fetch, `rank-tbody.innerHTML` recebe spinner "🔄 Carregando…".
- Substituído automaticamente quando `renderTable()` popula os dados.

### 6. Tooltip do score
- `<td>` do score recebe `title` com breakdown: `Desempenho: X% × Y% = Zpt | Aptidões: ...`

## Arquivos modificados
- `pages/ranking.js` — cache, loading, perf_history, _perf, tooltip, inativos, sort
- `pages/ranking.html` — onclick movido do span para th
- `pages/employees.html` — currentMonthKey, perf_history no save + openModal
- `pages/aptidoes.js` — perf_history em calcScore e calcScoreAnterior

## Pendências
- Nenhuma. Todas as 6 sugestões implementadas e verificadas.
