# employees — encoding + form layout

## O que foi feito

### 1. Encoding corruption — resolvido
- **6715 instâncias** de `U+FFFD` (�) removidas de `employees.js`
- Emojis e acentos restaurados: status labels, banners, botões, toasts, placeholders, logs, seções PDF

### 2. Double loading do script
- `<script src="employees.js">` duplicado no `<head>` (linha 17) removido

### 3. `getSync`/`setSync` → `await DB.get/set`
- `deleteEmployee()` corrigido

### 4. CSS do modal "+novo funcionário"
- **Double spacing**: `.form-grid .form-group { margin-bottom:0 }` no base.css
- **Modal width** (responsive.css): corrigido breakpoints (520px/480px/98vw)
- **Date inputs**: width fixa removida
- **Checkbox gap**: 8px → 12px
- **Mobile breakpoint** (768px): modal 98vw com form-grid 1 coluna
- **Text-transform**: `.check-row`, `.form-label` com `text-transform:none`

### 5. Form labels — ajuste
- `.form-label` estava `8px` (reduzido erroneamente), voltou para `10px` (padrão do sistema)
- `.form-label { font-size:10px; font-weight:600; text-transform:none; }`

### 6. Form inputs — compactação
- `.form-input { padding:6px 10px; font-size:12px }` (era `9px 11px; 13px`)
- Aprovado pelo usuário

### 7. Conversa salva
- `conversas/2026-06-26_employees-encoding-form-layout.md`

## Pendentes / Próximos passos
- (nenhum — sessão concluída, usuário pode continuar depois)
