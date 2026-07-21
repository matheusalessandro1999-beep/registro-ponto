# Schema SQLite — Criação e Revisão Final

## Data: 2026-07-01

## Resumo
Sessão focada na criação e revisão completa do schema SQLite (`SCHEMA-SQLITE.sql`) para a migração futura do sistema para Electron + SQLite + Firebase.

## O que foi feito

### 1. Criação do schema (v1.0)
- 12 tabelas sincronizáveis (todas com `device_id`, `version`, `server_timestamp`, `sync_status`, `deleted_at`)
- 2 tabelas locais (`sessoes_dispositivo`, `faltas_mes`)
- 2 views (`vw_score_mensal`, `vw_ranking`)
- 28 índices
- 14 notas detalhadas de migração
- Proteção contra divisão por zero com `NULLIF`
- FK constraints, CHECK constraints, UNIQUE compostos

### 2. Revisão sistemática contra código fonte
Cada tabela do schema foi confrontada com os arquivos `.js`:
- `shared.js` — score helpers, store, funções globais
- `pages/employees.js` — CRUD de funcionários
- `pages/ponto.js` — STATUS_META, rh_ponto key format
- `pages/aptidoes.js` — 10 competencies, APT_KEYS, currentMonthKey
- `pages/ranking.js` — calcBonus, calcAssid mensal, getWeights normalizado
- `pages/ocorrencias.js` — tipos, status, campos
- `pages/quadro.js` — estrutura rh_quadro (nested vs relacional)
- `pages/config.js` — configurações, authCode
- `pages/audit.js` — log de auditoria
- `pages/leaders.js` — score helpers, hierarquia
- `permissions.js` — RBAC, níveis de acesso

### 3. Problemas encontrados e corrigidos no schema

| # | Severidade | O que foi corrigido |
|---|---|---|
| 1 | CRÍTICO | `vw_score_mensal`: assiduidade dividia faltas do mês por `max_abs` anual (36) em vez de mensal (3) |
| 2 | CRÍTICO | `vw_ranking`: score sem bônus de domingo trabalhado — até 5pts de diferença |
| 3 | ALTA | `vw_ranking`: `perf_weight + apt_weight > 100` gerava peso `abs` negativo |
| 4 | ALTA | `competencias_historico`: colunas em português mas código usa chaves inglesas (`qual`, `prio`...) |
| 5 | MÉDIA | `pessoas`: faltava `demitido`, `data_maternidade_inicio/fim` |
| 6 | MÉDIA | `ponto_diario`: sem `marcacoes_json` para batidas futuras |
| 7 | MÉDIA | Migração 14.7: `owner_id`/`ownerId` e `filial_id` sem nota de normalização |

### 4. Schema final
- **15 tabelas**: filiais, turnos, departamentos, funcoes, feriados, pessoas, historico_cargos, ponto_diario, competencias_historico, desempenho_historico, ocorrencias, quadro_filial, quadro_vagas, configuracoes, permissoes_override, audit_log, sessoes_dispositivo, faltas_mes
- **2 views**: vw_score_mensal, vw_ranking
- **28 índices**
- **698 linhas**
- Decisão arquitetural: tabela única `pessoas` (unifica `store.users` + `store.employees`)

## Arquivos relevantes
- `REGRA SQL/SCHEMA-SQLITE.sql` — Schema finalizado
- `REGRA SQL/REGRAS-DE-NEGOCIO.md` — Regras de negócio
- `REGRA SQL/REGRAS-SQL-SYNC-OFFLINE.md` — Regras técnicas de sync

## Pendências
- Firebase existente será zerado (schema começa do zero)
- Schema está pronto para implementação da camada Electron + SQLite
- Bônus de feriado (não só domingo) deve ser implementado na camada de aplicação
