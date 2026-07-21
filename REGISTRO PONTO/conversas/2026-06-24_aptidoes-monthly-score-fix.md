# Correção de Vazamento Mensal no Score + Fixes Aptidões

## O que foi feito

### Vazamento mensal no score (principal)
- `calcAptMedia()` em `aptidoes.js:159` — removido fallback para `emp.competencies` (objeto único). Agora retorna 5 quando não há `competencies_history[monthKey]`.
- `buildRow()` em `aptidoes.js:311-313` — `temHist = !!histMes` (sem `isMesAtual ||`). `c = histMes || {}` (sem fallback `emp.competencies`).
- `startEdit()` em `aptidoes.js:518` — picker lê `competencies_history[currentMonthKey()][key] ?? 5` em vez de `emp.competencies[key]`.
- `_buildModalGrid()` em `aptidoes.js:631-632` — `snap` vira fonte primária, `c = snap || {}`.
- `selectScore()` em `aptidoes.js:563-565` — comparação `anterior === v` agora usa `history[key]` em vez de `emp.competencies[key]`.

### Fixes de bugs
- `page-refresh` nunca era disparado — `saveStore()` em `shared.js:72` agora dispara o evento.
- 7 `===` → `String()===String()` em `aptidoes.js` (IDs mistos número/string).
- `selectScore()` — `await saveStore()` antes de `showToast` (antes mostrava toast antes de salvar).
- Funções fantasmas `verificarDeadlineBanner()`/`fecharBanner()` implementadas.

### XSS
- `escHtml()` upgraded em `aptidoes.js` e `ponto.js` — agora escapa `&`, `<`, `>`, `"`.
- `escJs()` criada em `ponto.js:32` — escapa `\` e `'` para onclick JS string.
- Três onclick handlers em `ponto.js` mudados de `escHtml` para `escJs`.
- `nomeAbrev()` em `aptidoes.js:416` agora passa por `escHtml()`.

### Performance
- Search com debounce de 150ms em vez de render a cada tecla.
- `_selectsBuilt` flag — selects só reconstroem no first render e `page-refresh`.

### Banner de deadline
- Implementado: aparece nos últimos 5 dias do mês, some ao clicar ✕ ou quando todas competências do mês estiverem fechadas.
- `verificarDeadlineBanner()` reavalia após cada `updateRow()`.

## Arquivos modificados
- `pages/aptidoes.js` — todas as correções acima
- `pages/ponto.js` — `escHtml`/`escJs`
- `shared.js` — `saveStore` dispara `page-refresh`

## Pendências
- `emp.perf` não tem tracking mensal. Definido em `employees.html:1608` (`perf: parseInt(document.getElementById('f-perf').value)||70`). Lido em `aptidoes.js:185`, `calcScoreAnterior():202`, `ranking.html`, `report.js`, `index.html`, `employees.html`, `leaders.html`. Para tornar mensal, seria necessário criar `perf_history[monthKey]` análogo a `competencies_history`, com UI de edição e leitura em todas as páginas que calculam score.
