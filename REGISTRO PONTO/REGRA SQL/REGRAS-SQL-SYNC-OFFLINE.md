# Regras Técnicas para Geração de SQL e Sincronização
**Contexto:** Aplicação Electron (.exe), banco local SQLite (`better-sqlite3`) por PC, Firebase como camada de transporte/sincronização entre PCs, com suporte a escrita offline.

**Versão:** 1.0
**Última revisão:** 2026-06-28

---

## Parte 1 — Regras de geração de SQL

```
1. CHAVE DE AGRUPAMENTO
   Nunca agrupe por coluna de texto (nome, titulo, descricao) isolada.
   Agrupe pela chave primária local.
   Atenção: SQLite NÃO lança erro quando há coluna fora do agregado e
   fora do GROUP BY — retorna um valor arbitrário por grupo,
   silenciosamente. Isso é mais perigoso aqui do que em MySQL/Postgres
   em modo estrito.
   Errado:  GROUP BY p.nome
   Correto: GROUP BY p.id_produto

2. DIVISÃO E MÉTRICAS DE RAZÃO
   Todo denominador de divisão usa proteção contra zero.
   Correto: SUM(cliques) * 1.0 / NULLIF(SUM(impressoes), 0)
   Atenção: divisão entre dois INTEGER em SQLite trunca (divisão
   inteira). Force float multiplicando por 1.0 ou usando CAST(...AS REAL).

3. JOIN SEMPRE COM CHAVE EXPLÍCITA, NUNCA CAMPO TEXTUAL
   Toda condição de JOIN usa PK/FK declarada no schema. Se houver
   ambiguidade sobre qual coluna é a chave, pergunte antes de gerar.

4. RISCO DE DUPLICAÇÃO EM JOIN 1:N
   Avalie se o JOIN pode multiplicar linhas (ex: pedido com múltiplos
   itens). Se sim, agregue em subquery antes do JOIN principal — não
   use SUM/COUNT direto sobre o resultado de um JOIN 1:N sem isso.

5. SEM SELECT * EM CÓDIGO DE SINCRONIZAÇÃO OU PRODUÇÃO
   Liste colunas explicitamente. O payload de sincronização entre
   SQLite e Firebase precisa de contrato de campo estável — SELECT *
   quebra silenciosamente se uma coluna for adicionada/removida num
   PC e não no outro.

6. CONSISTÊNCIA DE NOMENCLATURA DE SCHEMA
   Confirme o nome exato das tabelas/colunas a partir do schema real
   (CREATE TABLE, migration) antes de gerar qualquer SQL. Nunca
   assuma convenção por padrão de mercado. Se o schema não foi
   fornecido, pergunte — não adivinhe.

7. ÍNDICES EM COLUNAS DE SYNC E JOIN
   Sinalize necessidade de índice em device_id, version, sync_status
   e toda FK usada em JOIN — colunas consultadas em alta frequência
   pela rotina de sincronização.

8. TRANSPARÊNCIA DE PREMISSA
   Se faltar definição de regra de negócio (tipo de campo, prioridade
   de conflito não resolvido automaticamente, etc.), declare a
   premissa assumida no comentário da query — nunca silencie a
   ambiguidade.
```

---

## Parte 2 — Regras de schema e sincronização (offline-first)

```
9. TODA TABELA SINCRONIZÁVEL PRECISA TER, DESDE O CREATE TABLE:
   - device_id (TEXT)       — qual PC originou o registro/alteração
   - version (INTEGER)      — incrementado a cada escrita local
   - server_timestamp (DATETIME, nullable) — preenchido só quando o
     Firebase confirma recebimento, nunca pelo relógio do PC local
   - sync_status (TEXT: 'pending' | 'synced' | 'conflict')
   - deleted_at (DATETIME, nullable) — ver regra 16 (soft delete)
   Tabelas puramente locais e não sincronizáveis (log de debug, cache
   temporário) ficam isentas — declare explicitamente quais são.

10. NUNCA confie em CURRENT_TIMESTAMP, datetime('now') ou relógio do
    sistema local como critério de ordem entre PCs diferentes. Use
    esse timestamp local apenas como referência interna do próprio
    PC. Decisão de "quem venceu" usa version (regra 9) ou
    server_timestamp do Firebase, nunca o relógio do SQLite local.
    Relevância: timers de exposição térmica (Art. 253 CLT) dependem
    de ordem de evento correta — relógio de PC desalinhado quebra a
    integridade legal do registro, não só a sincronização.

11. TODA ESCRITA LOCAL DEVE SER IDEMPOTENTE.
    Use upsert (INSERT ... ON CONFLICT DO UPDATE) com chave que
    sobreviva a reenvio de sync (id + version), nunca INSERT puro que
    duplicaria a linha se a sincronização falhar e for reexecutada.

12. POLÍTICA DE CONFLITO EXPLÍCITA E OBRIGATÓRIA.
    Ao receber via Firebase uma versão remota de um registro também
    alterado localmente e ainda não sincronizado:
    - version remota > version local conhecida, sem alteração local
      pendente → aplica a remota (sync_status = 'synced').
    - alteração local pendente E version remota também avançou →
      NÃO sobrescreve automaticamente. Marca sync_status = 'conflict',
      preserva ambas as versões e registra o evento em log auditável.
    Nunca implemente "last-write-wins" silencioso sem essa marcação —
    inaceitável quando o dado tem peso trabalhista/legal ou financeiro.

13. GATILHO DE SINCRONIZAÇÃO É ÚNICO E NÃO CONDICIONAL POR ESTADO DE REDE.
    O processo de sync roda sempre da mesma forma: tenta enviar fila
    'pending', recebe sucesso ou falha, e se falhar, agenda retry com
    backoff exponencial (ex: 5s, 15s, 1min, 5min, 15min, máx 30min).
    Não existe código separado para "se tem internet" vs "se não tem"
    — existe um único loop de tentativa que se comporta diferente
    dependendo do resultado da chamada de rede.

14. CONSISTÊNCIA DE SCHEMA ENTRE PCs
    Confirme a versão de schema (migração aplicada) no .db de cada PC.
    PCs em versões de schema diferentes (app desatualizado) podem
    existir simultaneamente — toda query de sincronização precisa
    tolerar ausência de coluna nova sem quebrar, ou bloquear sync até
    migração obrigatória.

15. TODA QUERY QUE LÊ DADOS POTENCIALMENTE NÃO SINCRONIZADOS
    deve filtrar ou sinalizar isso. Dashboards que agregam dados de
    múltiplos PCs via Firebase decidem explicitamente se incluem
    registros com sync_status = 'pending' ou 'conflict' — incluir sem
    aviso mostra números que ainda vão mudar quando o sync completar.

16. EXCLUSÃO É SEMPRE SOFT DELETE EM REGISTRO SINCRONIZÁVEL.
    Nunca use DELETE físico em tabela sincronizável. Marque
    deleted_at + version incrementada e sincronize essa marcação como
    qualquer outra alteração. DELETE físico em PC A não tem como ser
    propagado corretamente para PC B se PC B tiver uma edição pendente
    do mesmo registro — sem soft delete, a exclusão se perde ou
    colide de forma não rastreável.

17. BOOTSTRAP DE PC NOVO (PRIMEIRA INSTALAÇÃO)
    Defina explicitamente a estratégia de carga inicial: download
    completo do Firebase no primeiro start, ou banco "seed" já
    embutido no instalador + sync incremental a partir daí. Sem essa
    definição, um PC novo entra na rede de sincronização sem saber
    seu próprio estado inicial, o que pode gerar conflitos
    artificiais logo na primeira sincronização.

18. CONTROLE DE VOLUME DE SYNC (QUOTA FIREBASE)
    Cada sincronização gera leitura/escrita no Firebase, que tem custo
    e limite de quota no tier gratuito. Sincronize em lote (batch
    write) sempre que possível, em vez de uma operação por registro
    pendente. Evite polling agressivo de listeners — prefira listeners
    nativos do Firestore (onSnapshot) a polling manual.

19. POLÍTICA DE RESOLUÇÃO DE CONFLITO (NÃO SÓ DETECÇÃO)
    Marcar sync_status = 'conflict' (regra 12) não resolve nada por si
    só — só impede perda silenciosa de dado. Defina uma das duas
    estratégias abaixo por entidade (pode variar entre tabelas):

    a) Resolução automática por hierarquia de origem: declare uma
       ordem de prioridade fixa entre device_id (ex: PC do RH/escritório
       > PC de chão de fábrica) para campos não-críticos. Aplicável
       quando o custo de errar é baixo (ex: campo de observação livre).

    b) Resolução manual obrigatória: registros em 'conflict' aparecem
       em uma fila de revisão visível na UI (não escondida em log).
       Nenhum dado em conflito é incluído em relatório oficial,
       cálculo de indicador, ou folha de ponto/conformidade legal até
       ser resolvido por um humano com permissão. Obrigatório para
       qualquer tabela ligada a: registros de exposição térmica
       (Art. 253 CLT), folha de ponto, e qualquer campo que alimente
       cálculo de remuneração ou conformidade trabalhista.

    Nunca decida automaticamente um conflito em dado de categoria (b)
    sem essa fila de revisão — resolução automática silenciosa nesses
    casos troca um problema técnico por um problema jurídico.

20. TRILHA DE AUDITORIA DEDICADA (SEPARADA DO HISTÓRICO DE VERSÃO)
    Para tabelas de categoria legal/RH (regra 19-b), mantenha uma
    tabela de log append-only (nunca UPDATE, nunca DELETE) registrando:
    id_registro_afetado, device_id, campo_alterado, valor_anterior,
    valor_novo, server_timestamp, e se a alteração resultou de
    resolução de conflito (e por quem/qual regra). Essa tabela
    sobrevive mesmo que o registro original seja sobrescrito por sync
    posterior — é evidência, não é estado atual.

21. VALIDAÇÃO FINAL ANTES DE ENTREGAR
    Releia a query contra: agrupamento por PK (1), proteção de divisão
    e tipo float (2), uso de version/server_timestamp em vez de
    relógio local (10), e — se a query participa de fluxo de sync —
    contra as regras 9, 11, 12, 15, 16, 19 e 20. Corrija antes de
    responder.
```

---

## Parte 3 — Matriz de cenários cobertos

| Cenário | Cobertura | Regras |
|---|---|---|
| Escrita com internet disponível | ✅ Coberto | 9, 11, 13 |
| Escrita sem internet (fila local) | ✅ Coberto | 9, 11, 13 |
| Reconexão após período offline longo | ✅ Coberto | 13, 15 |
| Conflito: 2 PCs editam o mesmo registro | ✅ Coberto | 12 |
| Relógio de PC desalinhado | ✅ Coberto | 10 |
| Falha de rede intermitente (retry) | ✅ Coberto | 13 |
| Schema divergente entre PCs (app desatualizado) | ✅ Coberto | 14 |
| Exclusão de registro com edição pendente em outro PC | ✅ Coberto | 16 |
| Leitura de dashboard com dados parcialmente sincronizados | ✅ Coberto | 15 |
| PC novo entrando na rede (bootstrap) | ✅ Coberto | 17 |
| Custo/quota de sincronização no Firebase | ✅ Coberto | 18 |
| **Conflito de 3+ PCs editando o mesmo registro antes de qualquer sync** | ⚠️ Mitigado, não eliminado — ver nota | — |
| Quem resolve o conflito marcado | ✅ Coberto | 19 |
| Trilha de auditoria legal/RH | ✅ Coberto | 20 |
| Corrupção do .db local com dados pendentes não sincronizados | ⚠️ Risco residual aceito — ver nota | — |
| Conflito por campo (merge parcial) vs. conflito por registro inteiro | ❌ Não coberto — melhoria futura, não bloqueador | — |
| Fuso horário (UTC vs. horário local) na exibição/comparação | ❌ Não coberto — ver nota | — |

**Notas sobre os itens não totalmente resolvidos:**

- **3+ PCs em conflito simultâneo**: a regra 19 garante que nenhum conflito passa sem ser notado ou resolvido, mas a *detecção* via `version` simples ainda pode classificar incorretamente alguns casos de conflito múltiplo como não-conflito. Mitigação aceitável para o volume de PCs do CD Nagumo (não é escala que normalmente justifica vetor de versão completo); reavaliar se o número de PCs crescer substancialmente.
- **Corrupção de `.db` local**: nenhuma regra de SQL resolve isso — é responsabilidade de infraestrutura (backup local periódico do arquivo `.db`, fora do escopo de regras de query). Recomenda-se rotina de cópia do arquivo `.db` para pasta secundária a cada N minutos, fora do Firebase.
- **Fuso horário**: defina desde já que todo `server_timestamp` é armazenado em UTC e toda exibição na UI converte para horário de Brasília (`America/Sao_Paulo`) no momento de renderizar — nunca armazene timestamp já convertido para horário local.
