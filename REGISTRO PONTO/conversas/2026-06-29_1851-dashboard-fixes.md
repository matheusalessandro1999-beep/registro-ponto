# Dashboard — Correções de Bugs + Filtros Mês/Setor

## O que foi feito

### 1. Alinhamento score helpers com shared.js
- `calcScore`, `calcAptMedia`, `calcAssid` passaram a usar `perf_history[currentMonth]` e `competencies_history[currentMonth]` em vez de `e.perf` / `e.apt*` direto
- `calcAssid` mudou de soma anual (12 meses) para apenas o mês atual; `maxAbs` = `Math.round(config.maxAbs / 12)`
- `currentMonthKey()` helper adicionado

### 2. Filtro de Mês/Ano
- Estado `selectedMonthKey` (formato `YYYY-M`)
- Dropdown com últimos 24 meses
- `changeMonth(selectedMonthKey)` recalcula toda a cadeia (metrics cache, KPIs, charts, top5)
- `chart-monthly` mostra 12 meses terminando no mês selecionado
- KPIs (`avgPerf`, `totalAbs`, afastados) usam mês selecionado

### 3. Filtro de Setor
- `selectedDept` extraído de `emp.dept`
- Dropdown independente dos filtros filial/turno
- Aplicado primeiro na cadeia de filtragem (`deptFiltro` antes de `filialFiltro`/`turnoFiltro`)

### 4. Três correções de bugs (solicitadas pelo usuário)
- **KPI Afastados**: agora filtra por `fimMes` (último dia do mês selecionado) em vez de `new Date()`
- **getPendentesCount**: cache em `_ocorrenciasCache` (evita ler localStorage a cada render); invalidado em `page-refresh`
- **Render race**: lock `_rendering` previne execuções concorrentes da `renderDashboard()` — se já estiver rodando, o novo chamado é dropado

### 5. Card-title do gráfico
- Alterado de "Faltas por Departamento · Mês atual" para "Assiduidade Mensal · Linha"

## Pendências (não críticas)
- Indicador visual do mês selecionado no título da dashboard
- Botão "resetar filtros"

## Próximo passo sugerido (contexto da conversa)
- Usuário encerrou o terminal; sessão pode ser retomada para polimento UX ou migração Electron.
