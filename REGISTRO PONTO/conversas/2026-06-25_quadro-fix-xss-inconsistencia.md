# Correções no Quadro Operacional (quadro.js)

## O que foi feito

### 🔴 XSS
- `escHtml()` e `escJs()` adicionados no topo do `quadro.js`.
- Nome da filial escapado no `onclick` (`escJs`) e no texto do botão (`escHtml`) em `buildFilialRow()`.
- Nome, cargo e departamento dos funcionários escapados com `escHtml()` nas 3 seções (afastados, férias, maternidade).
- Nome da filial no `registrarLog()` agora passa por `escHtml()`.

### 🐞 Bugs
- `selecionarFilial()` usava `.includes()` para toggle da classe `active` → mudado para extrair o label (remove `🏭 `) e comparar com `===`. Prevenia falso-positivo quando um nome de filial era substring de outro.
- Filtro de maternidade em `renderQuadroContent()` não verificava `data_maternidade_fim` → agora funcionárias com licença já encerrada não aparecem mais na seção informativa.

### 🟡 Inconsistências entre abas
- `renderVagasContent()` filtravas funcionários apenas por `e.filial === filialAtiva` → agora também por `e.filial_id === filial.id` (igual ao `renderQuadroContent()`).
- `atualizarResumo()` usava filtro diferente de afastados e ignorava `filial_id` → alinhado com as demais funções.

### ✅ Contagem correta
- Licença maternidade agora conta como ativo (tem data de retorno). Removido `&& !emMaternidade.includes(e)` do filtro de `empsAtivos`.
- `totalAfast` agora só conta `afastados.length` (sem somar maternidade).

### 🔵 Código morto
- `autoSalvarTotal()` removida (nunca era chamada).

### 🔵 Tratamento de erros
- `renderVagasContent()` chamado com `await` dentro de `salvarQuadro()` (antes sem `await`, podia gerar unhandled rejection).

## Arquivos modificados
- `pages/quadro.js` — todas as correções acima

## Pendências
- Nenhuma. Página consistente com `ponto.js` e `aptidoes.js` em termos de segurança e filtros.
