# Sessão: Matrícula e Data de Admissão no Card dos Líderes

## Resumo
Adicionamos campos `matricula` e `data_admissao` no card dos líderes (visual + modal de edição + validação), replicando o comportamento da página de funcionários.

## O que foi feito

### Card do líder (`pages/leaders.js` — `buildCard`)
- Adicionado `lcard-matricula`: mostra 🪪 Matrícula se existir
- Adicionado `lcard-admissao`: mostra 📅 Desde (data formatada) se existir
- Adicionado aviso `⚠️ Matrícula pendente` se não-demitido e sem `matricula`
- Adicionado aviso `⚠️ Data de admissão pendente` se não-demitido e sem `data_admissao`

### Modal de edição (`pages/leaders.html`)
- Campo `🪪 Matrícula` (texto, max 6 dígitos, apenas números)
- Campo `📅 Data de Admissão` (date)
- Inseridos antes do campo Cargo/Função

### Validação (`pages/leaders.js` — `saveLeader`)
- Matrícula obrigatória, apenas números, máx 6 dígitos
- Verifica duplicata (ignora próprio líder em edição)
- `matricula` e `data_admissao` salvos no objeto do líder (tanto em criação quanto edição)
- `openModal` populado com `leader.matricula` e `leader.data_admissao`

### CSS (`pages/leaders.css`)
- `.lcard-matricula`, `.lcard-admissao`, `.lcard-admissao-pendente`

## Contexto Anterior (mantido)
- `store.employees` com `nivel` é source of truth; `_getAllLeaders` mescla `store.users` em runtime
- Demissão de líder bloqueada se `getTeamTotal > 0`
- Botão de deletar removido; demissão substitui
- Botão de ocorrência mantido (registra ocorrência para o próprio líder)
- Escopo hierárquico respeita `supervisor_id`

## Pendente / Próximos Passos
- Nenhum pendente identificado
- Próxima sessão: continuar a partir daqui conforme necessidade do usuário
