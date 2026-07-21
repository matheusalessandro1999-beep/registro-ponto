#!/bin/bash
# gera_mapa.sh — Regenera o projeto.md com base no estado atual do projeto
# Uso: bash gera_mapa.sh
# Execute sempre que adicionar arquivos ou mudar a estrutura do projeto

PROJECT_NAME="RH Nagumo"
OUTPUT="projeto.md"
DATE=$(date '+%d/%m/%Y %H:%M')

echo "Gerando mapa do projeto: $PROJECT_NAME..."

cat > "$OUTPUT" << HEADER
# $PROJECT_NAME — Mapa do Projeto
> Gerado automaticamente por gera_mapa.sh
> Atualizado em: $DATE

---

## Estrutura de arquivos

HEADER

# Árvore de arquivos (exclui pastas desnecessárias)
if command -v tree &> /dev/null; then
  tree -I "node_modules|.git|dist|build|.cache|*.log" --noreport >> "$OUTPUT"
else
  find . \
    -not -path "*/node_modules/*" \
    -not -path "*/.git/*" \
    -not -path "*/dist/*" \
    -not -path "*/build/*" \
    -not -name "*.log" \
    | sort >> "$OUTPUT"
fi

echo "" >> "$OUTPUT"
echo "---" >> "$OUTPUT"
echo "" >> "$OUTPUT"
echo "## Dependências entre arquivos (imports/requires)" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# Mapeia imports em arquivos JS
echo "### JavaScript / Node.js" >> "$OUTPUT"
grep -r --include="*.js" \
  -E "(import .+ from|require\()" \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  -l . 2>/dev/null | sort | while read file; do
    echo "" >> "$OUTPUT"
    echo "**$file** importa:" >> "$OUTPUT"
    grep -E "(import .+ from|require\()" "$file" \
      | grep -v "node_modules" \
      | sed 's/^/  - /' >> "$OUTPUT"
done

# Mapeia script src em arquivos HTML
echo "" >> "$OUTPUT"
echo "### HTML (script src)" >> "$OUTPUT"
grep -r --include="*.html" \
  -E 'src="[^"]*\.js"' \
  --exclude-dir=node_modules \
  -l . 2>/dev/null | sort | while read file; do
    echo "" >> "$OUTPUT"
    echo "**$file** carrega:" >> "$OUTPUT"
    grep -oE 'src="[^"]*\.js"' "$file" \
      | sed 's/src=//;s/"//g' \
      | sed 's/^/  - /' >> "$OUTPUT"
done

cat >> "$OUTPUT" << FOOTER

---

## Arquivos críticos (NÃO modificar sem aviso)

[Atualize esta seção manualmente conforme o projeto evoluir]

---

## Observações

Mapa gerado automaticamente. Para adicionar regras específicas,
edite o projeto.md diretamente após rodar este script.
FOOTER

echo "✅ projeto.md gerado com sucesso em: $OUTPUT"
