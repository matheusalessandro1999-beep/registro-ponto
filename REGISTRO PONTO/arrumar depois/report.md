# report.html — Pendências Futuras

> Issues identificadas em 23/06/2026 que dependem de refatoração em outras páginas ou da migração Electron.

## 🔴 Prioridade alta

### 1. Alinhar fórmula de score com ranking

**Onde:** `pages/report.js` — `calcScore()`
**Depende de:** ranking.html ser refatorado primeiro

**Problema:** ranking.html tem `calcBonus()` (+0,5pt por domingo/feriado trabalhado, até +5pt). Report.js não tem. Mesmo funcionário pode ter scores diferentes.

**O que fazer quando for arrumar:**
- Importar `_allPonto` de volta (ou acessar via store)
- Implementar `calcBonus()` igual ao ranking
- Adicionar bônus na fórmula: `perf*P + apt*10*A + assid*Abs + bonus`
- Exibir "Bônus" no rodapé do documento

### 2. Adicionar fallback para `rh_ponto` em calcAssid()

**Onde:** `pages/report.js` — `calcAssid()`
**Depende de:** Decisão de arquitetura (manter fallback ou confiar no sync)

**Problema:** Report.js depende exclusivamente de `emp.absences[]`. Se `syncAbsencesToStore()` nunca rodou (ex: usuário nunca abriu ponto), faltas aparecem zeradas. Ranking e Absenteísmo têm fallback para o `rh_ponto` bruto.

**O que fazer quando for arrumar:**
- Recarregar `_allPonto = await LS.get('rh_ponto', {})`
- Em `calcAssid()`, se `emp.absences` estiver vazio, ler do `rh_ponto`

## 🟡 Prioridade média

### 3. Centralizar funções duplicadas em shared.js

**Onde:** Vários arquivos
**Depende de:** Planejamento de refatoração geral

**Funções duplicadas em 3-5 páginas:**
- `getMyEmployees()` — em report.js, ranking.html, aptidoes.html, absenteeism.html, ponto.html
- `getWeights()`, `calcAptMedia()`, `calcAssid()`, `calcScore()` — em report.js, ranking.html, aptidoes.html

**Risco:** Qualquer alteração na fórmula de score precisa ser replicada manualmente em N lugares.

### 4. Remover `:root` duplicado de report.css

**Onde:** `pages/report.css` linhas 6-13
**Depende de:** Criar um CSS de tema global (fora do escopo atual)

**Problema:** `:root` redefinindo variáveis que já existem no tema escuro padrão. Funciona, mas é ruído.

## 🟢 Prioridade baixa

### 5. Expandir competências no relatório para 10 (mostra só 5)

**Onde:** `pages/report.js` — template do documento
**Depende de:** Nada urgente

**Atual:** `APT_KEYS.slice(0,5)` — mostra só as primeiras 5 competências no grid. Poderia mostrar todas ou em 2 linhas de 5.

### 6. Adicionar gráfico Chart.js no resumo executivo

**Onde:** `pages/report.js`
**Depende de:** Nada urgente

**Sugestão:** Barra horizontal comparando as 10 competências, similar ao aptidoes.html.
