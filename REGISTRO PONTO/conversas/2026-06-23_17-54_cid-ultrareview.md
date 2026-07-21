# CID Atestado + Ultrareview + Finalização

## O que foi feito

### CID field para Atestado Médico

- **Campo CID no formulário** (`ocorrencias.html:45`) — aparece via `toggleCidField()` só quando tipo="Atestado Médico"
- **Campo CID no modal de detalhe** (`ocorrencias.html:100`) — exibe CID quando tipo=atestado, "—" se vazio
- **Validação ao aprovar** (`ocorrencias.js:356`) — bloqueia aprovação se CID vazio, troca footer pra "Adicionar CID" → `editarOcorrencia(id)`
- **Persistência** (`ocorrencias.js:265`) — `cid` salvo junto com demais campos

### Melhorias pós-ultrareview

- **Validação de formato** — regex `/^[A-Za-z]\d{2}(\.\d{1,2})?$/` em `salvarOcorrencia()` rejeita CID inválido
- **CSS input CID** — `text-transform:uppercase; font-family:monospace; letter-spacing:1px`
- **Input hygiene** — `oninput` remove chars inválidos, `.toUpperCase()`, `autocorrect/autocomplete/spellcheck` off
- **Auto-reabrir detalhe** — `_reopenAfterSave` flag: ao clicar "Adicionar CID", após salvar o modal de detalhe reabre sozinho
- **Coluna CID na tabela** — `🆔 J00.0` (monospace, centralizado) ou `🆔 —` em vermelho se faltando; some em 480px
- **Ordenação alfabética** — dropdown de funcionários no form agora sorted por nome

### Fixes do ultrareview (3 agentes paralelos)

- **Bug**: `toggleCidField()` não limpava `f-cid.value` ao mudar tipo → CID vazava pra registros não-atestado
- **Bug**: `cid || list[idx].cid || ''` impedia limpar CID na edição (string vazia é falsy) → `cid: tipo === 'atestado' ? cid : ''`
- **Bug**: Duas chamadas `getOcorrencias()` no edit mode → consolidado
- **Estilo**: `toggleCidField` usava `''` pra mostrar → `'block'`

## Arquivos modificados

- `pages/ocorrencias.html` — campo CID form + detail, th CID na tabela, oninput/autocorrect no input
- `pages/ocorrencias.js` — toggleCidField, salvarOcorrencia (CID + validação), verDetalhe (CID + tabela), mudarStatus (validação + reopen), buildRow (coluna CID), openFormModal (sort), fix getOcorrencias duplicada
- `pages/ocorrencias.css` — .log-cid, .cid-missing, #f-cid, nth-child atualizados para nova coluna
