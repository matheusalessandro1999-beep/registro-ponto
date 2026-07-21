# Sessão: Schema SQLite — Correção de bugs no código JS

## O que foi feito

### Schema SQLite (SCHEMA-SQLITE.sql)
- **Corrigido**: nome da coluna de `licenca_maternidade` para `maternidade` (código JS usa `emp.maternidade`)
- **Corrigido**: nome da coluna de `data_maternidade_inicio` para `data_maternidade` (código JS usa `emp.data_maternidade`)
- **Corrigido**: view `vw_score_mensal` — `p.licenca_maternidade = 1` → `p.maternidade = 1`
- **Corrigido**: migration note 14.7 para refletir os nomes reais (`maternidade`, `data_maternidade`)

### Código JS — Correções de XSS em employees.js
- **Adicionada** função `escHtml` no escopo de `employees.js` (estava faltando)
- **buildCard**: `emp.name`, `emp.role`, `emp.dept`, `emp.foto` sanitizados
- **buildCardDemitido**: `emp.name`, `emp.role`, `emp.dept`, `emp.foto` sanitizados
- **verificarNomeDuplicado**: todos os campos de `dup-item` sanitizados
- **opt()**: display text sanitizado (tanto o `opt` do modal de cadastro quanto o do modal de transferência)
- **supEl.innerHTML**: `u.name`, `u.nivel` sanitizados
- **tr-lider**: `leaderAtual?.name`, `u.name`, `u.nivel` sanitizados
- **historico-item**: `h.cargo`, `info`, `h.motivo` sanitizados
- **foto-preview-modal**: `fotoVal` sanitizado (permitindo apenas `data:` URLs)

### Código JS — Race condition no Quadro
- **quadro.js/salvarQuadro**: alterado para ler dados atuais do LS antes de salvar (merge), evitando que alterações feitas em outra aba sejam sobrescritas com dados obsoletos

## Bugs ativos ainda não corrigidos

1. **db-local.js:64 `setMergeSync`** — Race condition em ponto.js. Três chamadas em `ponto.js` usam `setMergeSync` com `PONTO_KEY`. Requer refatoração com versionamento. Postergado para migração Electron/SQLite.

## UltraReview — Correções pós-revisão

### Schema SQLite
- **CRÍTICO**: `SELECT * EXCLUDE (...)` — sintaxe DuckDB, inválida no SQLite. Substituído por colunas explícitas
- **CRÍTICO**: JOIN desempenho_historico usava `d.ano = c.ano` — quando `c.ano` era NULL (sem competencias_historico), o match falhava mesmo com desempenho válido. Corrigido com `COALESCE(c.ano, ...)`
- **MÉDIO**: `NULLIF(1.0 * 10, 0)` — código morto, simplificado para `10.0`
- **MÉDIO**: Índices ausentes em FKs de `avaliado_por`, `responsavel_id`, `aprovado_por`, `sessoes_dispositivo.pessoa_id` — adicionados
- **BAIXO**: Migration note 14.1 mencionava `empId` sem mapeamento — clarificado para `empId → pessoa_id`

### Não corrigido (por decisão arquitetural)
- Bônus considera apenas domingos, não feriados — delegado à camada de aplicação (comentário no schema)
- `c.deleted_at IS NULL` redundante no WHERE (já está no ON do LEFT JOIN) — mantido como safety net

## Pendente
- Migração para Electron + SQLite usando o schema como alvo

---

## Segunda parte — Ultrareview + Comparação JS vs SQL + Triggers

### Ultrareview (achados adicionais)

Além dos itens acima, correções críticas:
- **CRÍTICO**: `SELECT * EXCLUDE (...)` removido (DuckDB)
- **CRÍTICO**: JOIN `d.ano = c.ano` com NULL propagation — corrigido c/ COALESCE
- **MÉDIO**: Índices ausentes em FKs adicionados (5 índices)

### Bônus na view SQL

- Adicionados feriados nacionais fixos (8) e LEFT JOIN `feriados` na view `vw_ranking`
- Bônus = (domingos_trab + feriados_trab) × 0.5, máx +5

### 6 divergências JS vs SQL encontradas e corrigidas

| # | Divergência | Onde | Decisão | Afetou |
|---|---|---|---|---|
| 1 | Assiduidade YTD (SQL) vs mensal (JS) | `vw_ranking` | **Mensal** (maxAbs÷12) — fiel ao período avaliado | SQL view |
| 2 | Bônus ignorava feriados (SQL) | `vw_ranking` | **Incluir feriados** nacionais + tabela | SQL view |
| 3 | Normalização de pesos ausente (SQL) | `vw_ranking` + `getWeights` em 5 JS | **Normalizar** com piso 10, soma 100 | SQL + shared.js, aptidoes.js, ranking.js, report.js, employees.js |
| 4 | Fallback aptidões = 0 (SQL) vs 5 (JS) | `vw_ranking` + `getCompetencyAverage` | **Fallback 5** (neutro) | SQL view |
| 5 | Fallback desempenho = 0 (SQL) vs null (JS) | `vw_ranking` | **Fallback `pessoas.perf`** (coluna adicionada) | Schema + SQL view |
| 6 | Domingo contava como falta (JS leaders.js) | `getTotalFaltasEmp` | **Domingo não é falta** (descanso semanal) | leaders.js |

### PDF report

- Pesos hardcoded `0.4/0.35/0.25` substituídos por `getWeights(store)` (report.js:71)

### Triggers de version (schema)

- 15 triggers `AFTER UPDATE ... WHEN NEW.version = OLD.version` para auto-incremento de version
- Todas as tabelas sincronizáveis cobertas

### Sync rules revisadas

- `REGRAS-SQL-SYNC-OFFLINE.md` revisado e consistente com o schema
- Nenhuma alteração necessária

### REGRAS-DE-NEGOCIO.md atualizado

- **v2.0 → v2.1**: seções 9.1, 9.2, 9.5, 8.1, 17.2 refletem decisões da sessão
- Faixas de peso: mínimo 10, normalização automática
- Assiduidade: mensal, domingo não conta como falta

## Bugs ativos (não corrigidos)

1. **db-local.js:64 `setMergeSync`** — Race condition em ponto.js. Postergado para Electron/SQLite.
2. **`currentMonthKey()`** — duplicado em 3 arquivos (funcional mas frágil)
3. **`db-local.js` versioning system** — `setVersioned` é dead code

## Próximos passos

1. Camada Electron + SQLite (`better-sqlite3`)
2. Script de migração localStorage → SQLite (popular tabelas)
3. Teste de fidelidade: JS `calcScore` vs `vw_ranking` com mesmos dados
