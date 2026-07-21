# Ocorrências Page — Finalização

## O que foi feito

### ocorrencias.js
- **"Pendente há X dias"** na listagem — `buildRow()` mostra `⏳ 3d` ao lado da data para pendentes
- **Link direto no modal bloqueado** — `mudarStatus()` substitui footer por botão "Editar card do funcionário" → `employees.html?editEmpId=X`
- **Texto da mensagem** atualizado para "Clique no botão..."
- **Auto-abrir modal** via URL param `openOcorrenciaId` no `DOMContentLoaded`

### ocorrencias.css
- **3 breakpoints**: 1024px (novo), 768px, 480px
- **Colunas escondidas**: Responsável some em 768px, Descrição some em 480px
- **Modal responsivo**: `#modal-detail .modal` com `width:90vw/95vw`
- **Bug corrigido**: CSS usava `.modal-detail` (classe inexistente) → corrigido para `#modal-detail .modal`

### employees.html
- **Auto-editar ao chegar**: `employees.html?editEmpId=X` → `editEmployee()` após 400ms
- **Redirect após salvar**: quando vem de ocorrências, `saveEmployee()` redireciona de volta com `?openOcorrenciaId=Y`
- **Badge ⏳ Ajuste pendente** no card (`buildCard`), com filtro extra: oculta se `data_admissao` já preenchida
- **Cache**: `_pendentesAjuste` recarregado a cada `renderCards()` (fora do bloco `if (!_store)`)

### db-local.js (sessão anterior)
- `window.DB.setMerge` e `setMergeSync` adicionados (estavam faltando)

## Fluxo completo
1. Aprovar bloqueado → "✏️ Editar card"
2. employees.html?editEmpId=X → modal abre sozinho
3. Corrige data, salva → redirect para ocorrencias.html?openOcorrenciaId=Y
4. Modal de detalhe abre → ✅ Aprovar passa livre

## Arquivos modificados
- `pages/ocorrencias.js` — buildRow, mudarStatus, DOMContentLoaded
- `pages/ocorrencias.css` — breakpoints, colunas escondidas, modal fix
- `pages/employees.html` — renderCards, buildCard, saveEmployee, DOMContentLoaded
