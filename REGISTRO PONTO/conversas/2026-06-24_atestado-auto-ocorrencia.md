# Atestado auto-cria ocorrência + badge pendente universal

## O que foi feito

### 1. Auto-criação de ocorrência ao marcar "Atestado" no Ponto
- **`pages/ponto.js`**:
  - Adicionado `OC_KEY = 'rh_ocorrencias'` (linha 20)
  - Função `_criarOcAtestado(emp, dia)` — cria ocorrência tipo `atestado` com `pontoRef` vinculando ao dia/ano/mês
  - Função `_removerOcAtestado(emp, dia)` — remove a ocorrência vinculada ao dia
  - Modificado `setStatusCtx()` (linha 882):
    - Se marca "Atestado" → cria ocorrência automática + toast avisando
    - Se tira "Atestado" (muda pra outro status) → `confirm()` perguntando se remove a ocorrência
  - Lançamento rápido em lote **não** cria ocorrências (evita spam)

### 2. Badge "⏳ Ajuste pendente" universal
- **`pages/employees.html`**:
  - Antes: só aparecia pra ocorrências tipo `'ajuste'` + sem `data_admissao`
  - Agora: **qualquer** ocorrência com status `pendente` (de qualquer tipo: atestado, justificativa, advertência, etc) exibe o badge no card do funcionário

## Arquivos modificados
- `pages/ponto.js` — OC_KEY, _criarOcAtestado, _removerOcAtestado, hook em setStatusCtx
- `pages/employees.html` — filtro _pendentesAjuste universal
