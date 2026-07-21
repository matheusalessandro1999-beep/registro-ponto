# Pendências — página de Ponto

Itens identificados durante revisão em 24/jun/2026, postergados por serem inerentes ao `localStorage` (substituído na migração Electron + SQLite) ou cosméticos.

## 🔶 Race conditions `_pontoCache` / `setMergeSync`

**Onde:** `pages/ponto.js` — variável global `_pontoCache` lida/escrita por múltiplas funções async sem coordenação:
- `renderGrade()` (linha ~504) — lê e sobrescreve
- `setStatus()` (linha ~247) — sobrescreve
- `setStatusCtx()` (linha ~835) — lê
- `lancamentoRapido()` (linha ~994) — sobrescreve
- `page-refresh` handler (linha ~1015) — reseta

**Problema:** Duas chamadas async concorrentes podem causar perda de escrita (clássico TOCTOU). O `setMergeSync` em `db-local.js` faz read-modify-write síncrono sem lock.

**Quando resolver:** Na migração para Electron + SQLite — transações atômicas eliminam o problema.

---

## 🔶 `_scheduleRender()` — flicker na grade

**Onde:** `pages/ponto.js:361-364`

```js
function _scheduleRender() {
  clearTimeout(_renderTimer);
  _renderTimer = setTimeout(() => renderGrade(), 1200);
}
```

**Problema:** Após cada clique em status-dot, o otimismo DOM é feito imediatamente, mas 1.2s depois `renderGrade()` substitui o `innerHTML` inteiro da tabela, causando flicker visível.

**Possível solução:** Em vez de `innerHTML`, fazer diff/patch apenas das células alteradas, ou eliminar o `_scheduleRender` e confiar no update otimista.

**Prioridade:** Baixa (cosmético).

---

## 🔶 Dead code: `getPontoEmp` / `setPontoEmp`

**Onde:** `pages/ponto.js:219-230`

Duas funções definidas mas nunca chamadas em lugar nenhum do código. Inofensivas, apenas poluição.

**Quando resolver:** Na migração Electron, simplesmente não portar.

---

## 🔶 CSS opacity inconsistente para `.status-dot.bloqueado`

**Onde:** 
- `pages/ponto.css:192` — `.status-dot.bloqueado { opacity: .5 }`
- `pages/ponto.js:640` — inline `"opacity:.7"` para dias bloqueado históricos

**Problema:** Dias bloqueado atuais usam `opacity: .5` (CSS), históricos usam `opacity: .7` (inline). Pode ser intencional (histórico mais visível) mas não está documentado.

**Prioridade:** Baixa (cosmético).
