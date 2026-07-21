# REGRAS DE NEGÓCIO — Sistema Inteligente de Gestão de Ponto Nagumo

**Versão:** 2.2
**Última revisão:** 2026-07-20
**Contexto técnico:** Aplicação atualmente em web (HTML+CSS+JS puro + localStorage), com migração futura para Electron + SQLite (local) + Firebase (nuvem/sincronização entre PCs). Este documento descreve as regras de negócio que permanecem válidas independentemente da camada de dados.

---

## Índice

1. [Propósito e Escopo](#1-propósito-e-escopo)
2. [Glossário](#2-glossário)
3. [Hierarquia de Níveis (RBAC)](#3-hierarquia-de-níveis-rbac)
4. [Tabela de Permissões](#4-tabela-de-permissões)
5. [Escopo de Dados por Nível](#5-escopo-de-dados-por-nível)
6. [Autenticação e Sessão](#6-autenticação-e-sessão)
7. [Gestão de Funcionários](#7-gestão-de-funcionários)
8. [Registro de Ponto Diário](#8-registro-de-ponto-diário)
9. [Sistema de Score (3 Pilares + Bônus)](#9-sistema-de-score-3-pilares--bônus)
10. [Avaliação de Aptidões (10 Competências)](#10-avaliação-de-aptidões-10-competências)
11. [Ocorrências](#11-ocorrências)
12. [Quadro Operacional](#12-quadro-operacional)
13. [Dashboard](#13-dashboard)
14. [Absenteísmo](#14-absenteísmo)
15. [Relatório](#15-relatório)
16. [Auditoria](#16-auditoria)
17. [Configurações do Sistema](#17-configurações-do-sistema)
18. [Bloqueios e Restrições](#18-bloqueios-e-restrições)
19. [Regras de Exibição e UI](#19-regras-de-exibição-e-ui)
20. [Regras de Sincronização (Offline-First)](#20-regras-de-sincronização-offline-first)

---

## 1. Propósito e Escopo

O **Sistema Inteligente de Gestão de Ponto Nagumo (RH Nagumo)** é uma plataforma corporativa para:

- Registrar e acompanhar a **frequência diária** (ponto) dos colaboradores
- Avaliar **desempenho, aptidões e assiduidade** por meio de um sistema de score tri-pilar
- Gerenciar a **hierarquia de liderança** (líderes, encarregados, coordenação, gerência, diretoria)
- Gerenciar ocorrências: **justificativas, ajustes de ponto, atestados médicos, advertências, elogios**
- Visualizar **ranking**, **absenteísmo**, **quadro operacional** e **relatórios gerenciais**
- Manter trilha de **auditoria** de todas as ações relevantes

**Público-alvo:** Recursos Humanos, lideranças operacionais, gerência e diretoria do CD Nagumo.

---

## 2. Glossário

| Termo | Definição |
|---|---|
| **Admin Master** | Nível máximo de acesso; controla configurações, permissões, cadastro de líderes |
| **Líder Operacional** | Base da hierarquia; cadastra e acompanha funcionários do próprio setor |
| **Encarregado** | Supervisiona líderes; aprova ocorrências; transfere funcionários |
| **Coordenação** | Gerencia encarregados; vê desligados; mesmo escopo de encarregado |
| **Gerência** | Acesso irrestrito a dados; promove para liderança |
| **Diretoria** | Acesso irrestrito a dados |
| **Pilares do Score** | Desempenho (perf), Aptidões (apt), Assiduidade (abs) — pesos configuráveis |
| **Aptidões** | 10 competências (0-10 cada) avaliadas mensalmente pelo líder |
| **Assiduidade** | % calculado com base em faltas versus máximo tolerado |
| **Ocorrência** | Registro associado a um funcionário (justificativa, ajuste, atestado, advertência, elogio, etc.) |
| **Soft Delete** | Exclusão lógica (flag `deleted_at`) em vez de exclusão física |
| **Ponto** | Status diário do funcionário (presente, falta, feriado, atestado, férias, folga, afastado, licença) |
| **Quadro Operacional** | Planejamento de vagas por função/turno por filial |

---

## 3. Hierarquia de Níveis (RBAC)

### 3.1. Níveis e Ordem Hierárquica

A hierarquia de roles define o poder de acesso de forma crescente:

| Índice | Nível | Label na UI |
|---|---|---|
| 0 | `lider` | 👷 Líder Operacional |
| 1 | `encarregado` | 🔰 Encarregado |
| 2 | `coordenacao` | 📋 Coordenação |
| 3 | `gerencia` | 📊 Gerência |
| 4 | `diretoria` | 🏢 Diretoria |
| 5 | `admin_master` | 🛡️ Admin Master |

### 3.2.  Onde os líderes vivem

Existem **duas fontes** de líderes no sistema:

1. **`store.users`** — usuários do sistema com credenciais de login (senha). São criados manualmente pelo Admin Master em Configurações ou pelo cadastro de líderes.
2. **`store.employees` com `nivel` preenchido** — funcionários que também têm cargo de liderança, mas não necessariamente login próprio (ex: um funcionário que é líder de outros). Podem ou não ter `login_id`/`pass`.

Ambos os grupos são considerados líderes elegíveis como supervisores de funcionários.

### 3.3. Admin Master especial

- ID fixo: `admin`
- Criado automaticamente na primeira execução (`ensureAdmin()`) se não existir
- Senha padrão: `admin123` (deve ser alterada)
- `user.id === ADMIN_ID || user.nivel === 'admin_master'` → sempre acesso total
- Não aparece em seletores de supervisor
- Pula na contagem de funcionários supervisionados

### 3.4. Estrutura de Supervisão

- **Líderes** supervisionam diretamente funcionários (`supervisor_id` = id do líder)
- **Encarregados** supervisionam líderes
- **Coordenação** supervisiona encarregados
- **Gerência** supervisiona coordenação
- **Diretoria** supervisiona gerência
- **Admin Master** supervisiona todos, mas não aparece em árvore

### 3.5. Hierarquia de Departamento

- Líder tem um **setor** principal (`setor`) e pode ter **departamentos** adicionais (`perfil.depts`)
- A supervisão considera: departamentos do líder + seu setor
- A filial do líder é obtida de: `perfil.filiais` (array) ou `filial` (string única)

---

## 4. Tabela de Permissões

### 4.1. Estrutura da tabela

Cada permissão define o **nível mínimo** necessário para realizar a ação. Se a ação não estiver definida para a página → **negada por padrão**.

### 4.2. Páginas e Ações

| Página | Ação | Nível Mínimo | Descrição |
|---|---|---|---|
| **Dashboard** | `view` | líder | Visualizar dashboard |
| **Funcionários** | `view` | líder | Visualizar funcionários |
| | `create` | líder | Criar funcionário |
| | `edit` | líder | Editar dados do funcionário |
| | `delete` | coordenacao | Excluir funcionário demitido (só aparece na seção de desligados, que exige coordenacao) |
| | `transfer` | encarregado | Transferir de setor/filial/turno/função |
| | `demitir` | encarregado | Registrar desligamento |
| | `promover` | gerencia | Promover para cargo de liderança |
| | `view_demitidos` | coordenacao | Ver seção de funcionários desligados |
| | `ocorrencia` | líder | Registrar ocorrência do funcionário |
| **Líderes** | `view` | líder | Visualizar líderes |
| | `create` | admin_master | Cadastrar líder |
| | `edit` | admin_master | Editar líder |
| | `delete` | admin_master | Excluir líder |
| | `transfer` | admin_master | Transferir líder de filial/turno/dept |
| | `ocorrencia` | encarregado | Registrar ocorrência de líder |
| **Absenteísmo** | `view` | líder | Visualizar absenteísmo |
| **Ranking** | `view` | líder | Visualizar ranking |
| **Quadro Op.** | `view` | líder | Visualizar quadro |
| | `edit_vagas` | admin_master | Editar vagas |
| | `edit_total` | admin_master | Editar total quadro |
| **Aptidões** | `view` | líder | Visualizar aptidões |
| | `edit` | líder | Editar notas de aptidão |
| **Ponto Diário** | `view` | líder | Visualizar ponto |
| | `edit` | líder | Marcar/alterar ponto |
| **Ocorrências** | `view` | líder | Visualizar ocorrências |
| | `create` | líder | Criar ocorrência |
| | `edit` | encarregado | Editar ocorrência |
| | `delete` | encarregado | Excluir ocorrência |
| | `approve` | encarregado | Aprovar/rejeitar ocorrência |
| **Relatório** | `view` | líder | Visualizar relatório |
| **Auditoria** | `view` | líder | Visualizar registros de auditoria |
| **Config** | `view` | líder | Acessar configurações |
| | `edit_own_profile` | líder | Editar próprio perfil e senha |
| | `manage_structures` | admin_master | Gerenciar filiais, turnos, depts, funções |
| | `manage_weights` | admin_master | Gerenciar pesos do score |
| | `manage_auth` | admin_master | Gerenciar código de autorização |
| | `manage_permissions` | admin_master | Editar tabela de permissões |
| | `manage_feriados` | admin_master | Gerenciar feriados regionais |
| | `manage_users` | admin_master | Reset de senha, excluir usuários |
| | `import_export` | admin_master | Importar/exportar JSON |

### 4.3. Overrides (substituições)

O Admin Master pode ajustar qualquer permissão via UI de Configurações. Os overrides são salvos em `store.permOverrides` e mesclados com a tabela padrão em tempo de execução.

---

## 5. Escopo de Dados por Nível

O escopo define **quem** o usuário pode ver e editar, independentemente da permissão de ação:

| Nível | Escopo | Regra |
|---|---|---|
| **admin_master** | `all` | Acesso total a todos os dados de todas as filiais |
| **gerencia / diretoria** | `all` | Acesso total a todos os dados de todas as filiais |
| **encarregado / coordenacao** | `sector` | Vê todos os funcionários, mas edita/exclui/aprova apenas do seu departamento/setor |
| **lider** | `own` | Vê todos os funcionários, mas edita/exclui apenas os que ele cadastrou (onde `supervisor_id` = seu id) |

### 5.1. Filtro por Filial

- Se o líder tem `perfil.filiais` preenchido, ele só vê funcionários dessas filiais
- Se o líder tem `filial` (string), ele vê apenas funcionários dessa filial
- Para admin_master / gerencia / diretoria: nenhum filtro de filial

### 5.2. Filtro por Departamento (scope.sector)

Quando `scope.sector`, o usuário pode editar funcionários cujo `dept` está em:
- `user.perfil.depts[]` (array de departamentos)
- `user.setor` (departamento principal)

---

## 6. Autenticação e Sessão

### 6.1. Login

- Tela de login no arquivo `login.html`
- Autenticação via **senha com hash SHA-256** (SubtleCrypto)
- Upgrade automático de senhas antigas (comprimento < 40 caracteres) para SHA-256
- Código de autorização (`authCode`) padrão: `NAGUMO2025`, configurável pelo Admin Master
- Funcionários podem ter `login_id` e `pass` para acessar o sistema (se tiverem `nivel`)

### 6.2. Sessão

- Sessão salva em **localStorage por dispositivo** (`rh_session`)
- `requireSession()` → verifica sessão atual → redireciona para login se ausente
- Logout: remove sessão do localStorage e redireciona

### 6.3. Criação de Admin

- Admin padrão (`admin` / `admin123`) é criado automaticamente na primeira execução
- Se o sistema já tiver dados (funcionários ou outros usuários), o admin **não** é sobrescrito

---

## 7. Gestão de Funcionários

### 7.1. Cadastro de Funcionário

Campos do funcionário:

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `id` | string | auto | ID único gerado |
| `name` | string | sim | Nome completo |
| `matricula` | string | não | Matrícula do funcionário |
| `filial` | string | sim | Unidade/filial |
| `dept` | string | sim | Departamento |
| `turno` | string | sim | Turno de trabalho |
| `role` | string | sim | Função/cargo |
| `admissao` | date | sim | Data de admissão |
| `supervisor_id` | string | sim | ID do líder responsável |
| `nivel` | string | não | Se preenchido, é líder (não aparece como funcionário comum) |
| `afastado` | bool | não | Flag de afastamento |
| `data_afastamento` | date | condicional | Obrigatório se `afastado = true` |
| `maternidade` | bool | não | Flag de licença maternidade |
| `data_ferias_inicio` | date | condicional | Início das férias |
| `data_ferias_fim` | date | condicional | Fim das férias |
| `demitido` | bool | não | Flag de desligamento |
| `data_demissao` | date | condicional | Obrigatório se `demitido = true` |
| `avatar` | base64 | não | Foto do funcionário (max 256px, JPEG 0.8) |
| `historico_cargos` | array | não | Histórico de cargos ocupados |
| `absences` | array[num] | não | Faltas por mês (12 posições, legacy) |
| `perf_history` | object | não | Nota de desempenho por mês (chave: `YYYY-MM`) |
| `competencies_history` | object | não | Notas de aptidão por mês (chave: `YYYY-MM`) |
| `competencies` | object | não | Notas de aptidão atuais (legacy) |
| `perf` | number | não | Nota de desempenho atual (legacy) |

### 7.2. Regras de Criação

- O líder cria funcionários apenas do seu departamento/filial
- O campo `supervisor_id` é preenchido automaticamente com o ID do líder logado, mas pode ser alterado
- `historico_cargos` é populado automaticamente na criação com o cargo inicial

### 7.3. Edição de Funcionário

- O líder edita apenas funcionários que supervisiona (próprio escopo)
- Encarregado+ edita funcionários do seu departamento
- Admin Master edita qualquer funcionário
- **Auto-edição:** qualquer líder pode editar o próprio card (se tiver ficha como funcionário)

### 7.4. Transferência de Funcionário

- Ação `transfer` disponível para encarregado+ (e admin_master)
- Permite alterar: filial, departamento, turno, função
- **Não permite** alterar supervisor_id ou nível
- Registrado em auditoria

### 7.5. Desligamento (Demissão)

- Ação `demitir` disponível para encarregado+
- Marca `demitido = true` e preenche `data_demissao`
- Funcionário desligado some da listagem padrão
- Botão de excluir físico removido para funcionários não-demitidos (desligamento é o fluxo correto)

### 7.6. Promoção para Liderança

- Ação `promover` disponível para gerência+
- Converte um funcionário comum em líder (preenche `nivel`)
- Funcionários promovidos deixam de aparecer na listagem de funcionários comuns
- Funcionários com nível são gerenciados na página de Líderes

### 7.7. Exclusão de Funcionário

- Ação `delete` disponível para líder+
- **Regras:**
  - Só é possível excluir funcionários já **demitidos**
  - Botão de excluir fica oculto para funcionários ativos

### 7.8. Histórico de Cargos

- Cada alteração de cargo gera um registro em `historico_cargos`
- Campos: `cargo`, `tipo` (admissão/promoção/transferência), `data`
- Na inicialização, ocorre **deduplicação** automática (remove entradas com mesmo cargo + tipo + data)
- Exibido no modal de edição do funcionário

### 7.9. Deduplicação Geral

- Na inicialização, o sistema remove:
  - Funcionários com `id` duplicado (mantém a primeira ocorrência)
  - Entradas de `historico_cargos` duplicadas

### 7.10. Funcionários sem Supervisor (sem_dono)

- Se `supervisor_id` e `owner_id` e `ownerId` estão vazios → funcionário fica **bloqueado** para marcação de ponto
- Motivo: `sem_dono` — exibe aviso na grade de ponto

---

## 8. Registro de Ponto Diário

### 8.1. Status de Ponto

Cada dia de cada funcionário recebe um status:

| Status | Emoji | Significado |
|---|---|---|
| `presente` | ✅ | Funcionário trabalhou |
| `falta` | ✕ | Funcionário faltou |
| `feriado` | 🎉 | Feriado (nacional ou regional) |
| `atestado` | 🏥 | Atestado médico (vale meia falta) |
| `ferias` | 🏖️ | Em férias |
| `folga` | 🌙 | Folga (escala) |
| `afastado` | 🚫 | Afastado |
| `maternidade` | 🤰 | Licença maternidade |
| `domingo` | ☀️ | Domingo trabalhado (não conta como falta) |
| `sabado` | (vazio) | Sábado |

### 8.2. Marcação de Ponto

- Líderes marcam ponto dos funcionários que supervisionam
- Admin Master marca ponto de qualquer funcionário
- A marcação é feita por **mês**, selecionando filial → departamento → turno
- O sistema mostra uma grade com todos os dias do mês para cada funcionário

### 8.3. Bloqueios (não permite marcação)

Um funcionário **não pode** receber marcação de ponto quando:

| Situação | Condição |
|---|---|
| **Afastado** | `emp.afastado = true` E `data_afastamento <= hoje` |
| **Licença Maternidade** | `emp.maternidade = true` |
| **Férias** | `emp.ferias = true` E `data_ferias_inicio <= hoje <= data_ferias_fim` |
| **Sem dono** | `supervisor_id`, `owner_id` e `ownerId` todos vazios |

### 8.4. Feriados

- **Nacionais fixos:** 01/01, 21/04, 01/05, 07/09, 12/10, 02/11, 15/11, 25/12
- **Regionais:** configurados pelo Admin Master em Configurações (`feriadosCustom`)
- Feriados são pré-marcados automaticamente na grade

### 8.5. Edição Retroativa

- É possível editar ponto de meses anteriores
- A edição retroativa de faltas impacta o score do mês correspondente
- Não há restrição de prazo para edição retroativa (a ser definido na migração)

---

## 9. Sistema de Score (3 Pilares + Bônus)

### 9.1. Visão Geral

O score é composto por **3 pilares** com pesos configuráveis que **devem somar 100%**:

| Pilar | Nota máxima | Peso padrão | Faixa permitida |
|---|---|---|---|
| **Desempenho** | 100 | 40% | 10-80 |
| **Aptidões** | 100 (média × 10) | 35% | 10-80 |
| **Assiduidade** | 100 | 25% (100 - perf - apt) | 10-80 |

**Regra de validação:** cada peso tem mínimo **10** e máximo **80**. Se `perfWeight + aptWeight > 90`, os dois são normalizados proporcionalmente dentro de 90 para garantir `absWeight ≥ 10`. Exemplo: `perf=70, apt=60` → normaliza para `perf=48, apt=42, abs=10`. O clamp individual (10-80) em cada pilar também protege o caso inverso: se `perf=10, apt=5`, o apt é elevado para 10 e o abs fica em 80.

### 9.2. Fórmula do Score

```
Score = (Desempenho × perf%) + (MédiaAptidões × 10 × apt%) + (Assiduidade × abs%)

Onde:
- abs% = 100 - perf% - apt% (calculado automaticamente)
- Cada peso tem mínimo 10. Se perf + apt > 90, normaliza: perf = perf × 90/(perf+apt), apt = apt × 90/(perf+apt)
- Score final = Math.min(100, Math.round(Score + Bônus))
```

### 9.3. Pilar 1 — Desempenho

- Nota de **0 a 100** inserida manualmente pelo líder
- Representa rendimento geral: metas, qualidade, volume de trabalho
- **Totalmente subjetivo** — cada líder define seus critérios
- Armazenado por mês em `perf_history[YYYY-MM]`

### 9.4. Pilar 2 — Aptidões

- Média de **10 competências**, cada uma nota de **0 a 10**
- A média é multiplicada por 10 para virar percentual
- Exemplo: média 7,5 → 75 pontos brutos
- Armazenado por mês em `competencies_history[YYYY-MM]`

### 9.5. Pilar 3 — Assiduidade

**Período: mensal** (não YTD). Cada mês é calculado isoladamente.

```
Assiduidade(mês) = 100 - (FaltasNoMês ÷ MaxAbsMensal) × 100
```

- `MaxAbs` anual: configurável (padrão: 36 faltas/ano)
- `MaxAbsMensal` = `MaxAbs ÷ 12` (padrão: 3 faltas/mês)
- **Atestado médico conta como meia falta** no absenteísmo (0,5 falta)
- **Domingo não conta como falta** (é descanso semanal remunerado, não falta)
- **Base de cálculo**: total de pontos "falta" + "atestado"/2 no mês

### 9.6. Bônus por Domingo/Feriado Trabalhado

```
Bônus = min(5, (DomingosTrabalhados + FeriadosTrabalhados) × 0,5)
```

- +0,5 ponto por **domingo** ou **feriado** (nacional ou regional) com presença marcada
- **Não conta** dias úteis — apenas domingos e feriados trabalhados
- **Bônus máximo: +5 pontos** (10 domingos/feriados)
- O bônus é additivo ao score bruto

### 9.7. Classificação por Faixa de Score

| Score | Status | Indicador |
|---|---|---|
| ≥ 85 | 🏆 Promoção | tag-promo (verde) |
| ≥ 70 | ✅ Regular | tag-ok (azul) |
| ≥ 55 | ⚠️ Atenção | tag-watch (amarelo) |
| < 55 | 🔴 Risco | tag-risk (vermelho) |

### 9.8. Comportamento por Situação Especial

| Situação | Assiduidade |
|---|---|
| Afastado | 100 (não penaliza) |
| Licença Maternidade | 100 (não penaliza) |
| Score congelado | Segue regra de bloqueio do funcionário |

---

## 10. Avaliação de Aptidões (10 Competências)

### 10.1. As 10 Competências

| Chave | Emoji | Nome |
|---|---|---|
| `qual` | ✨ | Qualidade |
| `prio` | ⚡ | Proatividade |
| `know` | 📚 | Conhecimento |
| `comm` | 💬 | Comunicação |
| `prod` | 📈 | Produtividade |
| `assid` | 📅 | Assiduidade |
| `org` | 🗂️ | Organização |
| `equip` | 🤝 | Equipe |
| `cria` | 💡 | Criatividade |
| `motv` | 🔥 | Motivação |

### 10.2. Ciclo de Avaliação

- Cada competência recebe nota de **0 a 10**
- A avaliação é **mensal** — cada mês tem seu snapshot independente
- O snapshot do mês atual fica em `competencies_history[YYYY-MM]`
- Uma vez avaliada no mês, a competência fica **travada** (locked) para aquele mês
- O líder pode avaliar a qualquer momento dentro do mês

### 10.3. Alerta de Avaliação Pendente

- Se faltam funcionários sem avaliação no mês corrente, um **modal de alerta** é exibido no dashboard
- O alerta lista os funcionários pendentes e oferece botão "Avaliar Agora"
- O alerta pode ser dispensado ("Depois")

### 10.4. Deadlines

- Há um banner de deadline configurável (dia do mês para fechar avaliações)
- Após o deadline, as notas do mês corrente podem ser bloqueadas (dependendo da configuração)

### 10.5. Visualização

- Gráfico **radar** mostra as 10 competências do funcionário
- Gráfico de **linha** mostra histórico mensal
- Tooltip com nome abreviado (primeiro nome + último sobrenome)
- Se houver homônimos, adiciona matrícula para desambiguação

---

## 11. Ocorrências

### 11.1. Tipos de Ocorrência

| Tipo | Emoji | Descrição |
|---|---|---|
| `justificativa` | 📄 | Justificativa do funcionário |
| `ajuste` | ✏️ | Ajuste de ponto |
| `atestado` | 🏥 | Atestado médico (com campo CID) |
| `ocorrencia` | ⚠️ | Ocorrência geral |
| `entrada` | → | Registro de entrada |
| `saida` | ← | Registro de saída |
| `advertencia` | 🚨 | Advertência |
| `elogio` | ⭐ | Elogio |

### 11.2. Status da Ocorrência

| Status | Emoji | Significado |
|---|---|---|
| `pendente` | ⏳ | Aguardando aprovação |
| `aprovado` | ✅ | Aprovado |
| `rejeitado` | ❌ | Rejeitado |

### 11.3. Fluxo de Aprovação

1. Líder cria ocorrência → status `pendente`
2. Encarregado+ (ou Admin Master) pode **aprovar** ou **rejeitar**
3. Ocorrências aprovadas/rejeitadas não podem ser alteradas
4. Ações de aprovação/rejeição são registradas em auditoria

### 11.4. Separação de Dados

- **Escopo `own`:** funcionário vê apenas ocorrências onde `empId` ou `respId` = seu id
- **Escopo `sector`:** funcionários do mesmo departamento
- **Escopo `all`:** todas as ocorrências

### 11.5. Filtros

Os filtros disponíveis são:

- **Status:** pendente (padrão), aprovado, rejeitado, todos
- **Tipo:** qualquer tipo de ocorrência
- **Período:** últimos 7, 15, 30, 60, 90 dias ou todos
- **Pesquisa textual:** por nome do funcionário, descrição ou nome do responsável

### 11.6. Atestado Médico

- Quando o tipo é `atestado`, o campo CID é exibido
- CID é armazenado junto com a ocorrência
- O atestado impacta a assiduidade como **meia falta** no cálculo do score

---

## 12. Quadro Operacional

### 12.1. Estrutura

- Organizado por **filial** (selecionável por abas)
- Cada filial tem:
  - **Quadro atual** — lista de funções por turno com número de funcionários atuais
  - **Vagas** — lista de vagas abertas por função/turno

### 12.2. Permissões

- `view`: qualquer líder+ pode visualizar
- `edit_vagas`: admin_master pode editar vagas
- `edit_total`: admin_master pode editar total do quadro

### 12.3. Cores dos Turnos

Cada turno tem uma cor definida (border, título, total). Até 6 turnos mapeados em `TURNO_CORES`.

---

## 13. Dashboard

### 13.1. Indicadores (KPIs)

O dashboard exibe:

| KPI | Descrição |
|---|---|
| **Média Score** | Média do score de todos os funcionários no mês selecionado |
| **Total Faltas** | Soma de faltas no mês selecionado |
| **Afastados** | Funcionários com `afastado = true` e data de afastamento <= fim do mês |
| **Pendentes** | Ocorrências com status `pendente` |
| **Total Score** | Score geral |
| **Assiduidade** | % de assiduidade |

### 13.2. Filtros

- **Mês:** dropdown com últimos 24 meses
- **Setor:** filtro por departamento
- A seleção de mês recalcula todos os KPIs, métricas e gráficos

### 13.3. Gráficos

- **Assiduidade Mensal (linha):** faltas por departamento ao longo de 12 meses
- **Top 5:** funcionários com maior score no período

### 13.4. Alertas

- Modal de aptidões pendentes (funcionários não avaliados no mês)
- Atualização automática via evento `page-refresh`

---

## 14. Absenteísmo

### 14.1. Indicadores

- Total de faltas no mês selecionado
- Média de faltas por funcionário
- Taxa de absenteísmo (percentual)
- Comparação com meses anteriores

### 14.2. Filtros

- **Ano e mês** selecionáveis
- **Filial, departamento, turno:** para funcionários supervisionados

### 14.3. Alerta de Funcionário

Se um funcionário tem:
- Média de aptidões ≥ 7 (boa)
- Assiduidade < 70%

→ Exibe **alerta** (bolinha vermelha) indicando funcionário com boa aptidão mas faltas excessivas (potencial perda de talento).

---

## 15. Relatório

### 15.1. Parâmetros

- **Período:** mês de início e mês de fim (no ano corrente)
- **Departamento:** todos ou específico
- **Filial:** todas ou específica
- **Funcionário:** todos ou específico

### 15.2. Cálculo no Relatório

- Score calculado com base no período selecionado
- `calcAptMedia` busca o snapshot de competências mais recente dentro do período
- `calcAssid` soma faltas do período e ajusta `maxAbs` proporcionalmente
- `calcScore` combina os 3 pilares com pesos do período

### 15.3. Exportação

O relatório pode ser impresso ou exportado (via navegador).

---

## 16. Auditoria

### 16.1. O que é registrado

Todas as ações relevantes geram um log de auditoria:

| Campo | Descrição |
|---|---|
| `id` | ID único do log |
| `ts` | Timestamp ISO |
| `userId` | ID do usuário |
| `userName` | Nome do usuário |
| `acao` | Ação executada (ex: criar, editar, excluir, transferir) |
| `modulo` | Módulo afetado (ex: employees, ponto, ocorrencias) |
| `detalhes` | Detalhes JSON da ação |
| `device` | Navegador · SO |

### 16.2. Retenção

- Logs com mais de **7 dias** são descartados
- Máximo de **500 registros** armazenados
- A página de auditoria atualiza automaticamente a cada **30 segundos**

### 16.3. Visualização

- Filtro por tipo de ação
- Modal de detalhes com informações completas
- Cores por usuário (hash consistente do ID)

---

## 17. Configurações do Sistema

### 17.1. Estruturas Gerenciáveis

| Estrutura | Descrição | Gerenciado por |
|---|---|---|
| **Filiais** | Lista de unidades | admin_master |
| **Turnos** | Lista de turnos | admin_master |
| **Departamentos** | Lista de departamentos | admin_master |
| **Funções** | Lista de cargos/funções | admin_master |

### 17.2. Pesos do Score

| Parâmetro | Padrão | Faixa | Gerenciado por |
|---|---|---|---|
| `perfWeight` | 40 | 10-80 | admin_master |
| `aptWeight` | 35 | 10-80 | admin_master |
| `maxAbs` | 36 | 1-N | admin_master |
| `absWeight` | calculado | 10-80 (100 - perf - apt após normalização) | automático |

- **Regra:** perf + apt + abs = 100
- **Mínimo individual:** 10 por pilar
- **Normalização automática:** se perf + apt > 90, ambos são reduzidos proporcionalmente para somar 90 (garantindo abs ≥ 10)
- **Exemplo de cálculo interno (getWeights):**
  1. Recebe `perf = 70, apt = 60, maxAbs = 36`
  2. `perf + apt = 130` → > 90, normaliza
  3. `perf = 70 × 90/130 = 48, apt = 60 × 90/130 = 42`
  4. `abs = 100 - 48 - 42 = 10`

### 17.3. Feriados Regionais

- Admin Master pode cadastrar feriados regionais (data: `MM-DD`)
- Feriados nacionais são fixos no código
- Feriados impactam a marcação de ponto e o bônus

### 17.4. Código de Autorização

- Código padrão: `NAGUMO2025`
- Utilizado para controle de acesso ao cadastro inicial
- Alterável pelo Admin Master

### 17.5. Tema

- Alternável entre **claro** e **escuro**
- Preferência salva por dispositivo (`rh_theme` em LS_LOCAL)
- Anti-flash: script no `<head>` aplica o tema antes da renderização

### 17.6. Perfil do Usuário

- Qualquer líder+ pode editar **próprio perfil**: nome, avatar
- Avatar: upload de imagem, redimensionada para max 256px, salva como base64 JPEG 0.8

### 17.7. Importação/Exportação

- Admin Master pode importar/exportar dados completos em JSON
- A exportação serializa todo o `rh_store`

---

## 18. Bloqueios e Restrições

### 18.1. Funcionário sem Supervisor (sem_dono)

- Condição: `!emp.supervisor_id && !emp.owner_id && !emp.ownerId`
- Efeito: não pode receber marcação de ponto, não aparece na grade
- Solução: ajustar o perfil do funcionário (designar supervisor)

### 18.2. Funcionário Afastado

- Condição: `emp.afastado = true` E `data_afastamento <= hoje` (se data preenchida)
- Efeito: não pode receber marcação de ponto; assiduidade = 100
- Não impede edição de dados cadastrais

### 18.3. Funcionário em Licença Maternidade

- Condição: `emp.maternidade = true`
- Efeito: não pode receber marcação de ponto; assiduidade = 100

### 18.4. Funcionário em Férias

- Condição: `emp.ferias = true` E `data_ferias_inicio <= hoje <= data_ferias_fim`
- Efeito: não pode receber marcação de ponto (período bloqueado)

### 18.5. Edição de Mês Fechado (Aptidões)

- Condição: `competencies_history[YYYY-MM][key] != null`
- Efeito: competência travada para o mês — não pode ser reeditada

### 18.6. Suspensão de Score

Se o funcionário está bloqueado para ponto (afastado/férias/maternidade):
- O score é considerado **congelado** (não é atualizado no período)

---

## 19. Regras de Exibição e UI

### 19.1. Nomes Abreviados

- Padrão: primeiro nome + último sobrenome
- Se houver homônimos com a mesma abreviação: adiciona `· matrícula`
- Usado em grid de ponto, aptidões, cards

### 19.2. Sidebar

- Colapsada por padrão
- Itens filtrados por permissão (`canSee`)
- Navegação entre páginas com indicador de item ativo
- Cache sidebar em `localStorage` para carregamento instantâneo

### 19.3. Cores por Status

- Presente: verde (#34d399)
- Falta: vermelho (#f87171)
- Atestado: branco com borda
- Score ≥ 85: verde-escuro (#059669)
- Score ≥ 70: azul (#2563eb)
- Score ≥ 55: amarelo (#d97706)
- Score < 55: vermelho (#dc2626)

### 19.4. Calor de Faltas

| Faltas | Cor |
|---|---|
| 0 | verde |
| ≤ 1 | azul |
| ≤ 2 | amarelo |
| ≤ 3 | laranja |
| > 3 | vermelho |

### 19.5. Tooltips

- Na grade de ponto: tooltip com nome completo do funcionário
- No ranking: tooltip explicativo de cada pilar (fórmula, exemplo)
- Na sidebar: tooltip com nome do item quando colapsada

### 19.6. Loading Screen

- Exibido em todas as páginas enquanto dados são carregados
- Fallback automático: esconde após 5 segundos
- Dispensado manualmente via `hideLoading()` após dados prontos

---

## 20. Regras de Sincronização (Offline-First)

Estas regras se aplicam **à futura migração Electron + SQLite + Firebase** e devem ser implementadas na nova camada de dados. Estão documentadas aqui para garantir que o negócio seja respeitado independentemente da tecnologia.

### 20.1. Toda Tabela Sincronizável Precisa

| Coluna | Tipo | Finalidade |
|---|---|---|
| `device_id` | TEXT | PC de origem do registro |
| `version` | INTEGER | Incrementado a cada escrita local |
| `server_timestamp` | DATETIME | Confirmação do Firebase (não relógio local) |
| `sync_status` | TEXT | `pending` / `synced` / `conflict` |
| `deleted_at` | DATETIME | Soft delete |

### 20.2. Relógio Local vs. Servidor

- **NUNCA** usar `CURRENT_TIMESTAMP`, `datetime('now')` ou relógio do PC como critério de ordem entre PCs
- Decisão de "quem venceu" usa `version` ou `server_timestamp` do Firebase
- Relevante para conformidade com Art. 253 CLT (ordem de eventos)

### 20.3. Upsert (Idempotência)

- Toda escrita local usa `INSERT ... ON CONFLICT DO UPDATE`
- Chave: `id + version`
- Evita duplicação por reenvio de sync

### 20.4. Política de Conflito

- Se `version` remota > local e sem alteração local pendente → aplica remota (`synced`)
- Se alteração local pendente E remota também avançou → **marca `conflict`**, preserva ambas versões
- **Nunca** last-write-wins silencioso para dados trabalhistas/legais

### 20.5. Resolução de Conflito

Para dados de categoria legal/RH (ponto, score, ocorrências):
- Conflitos aparecem em fila de revisão visível na UI
- Nenhum dado em conflito entra em relatório oficial até resolução humana
- Trilha de auditoria **append-only** (nunca UPDATE ou DELETE) para todos os dados legais

### 20.6. Gatilho de Sincronização Único

- Único loop de tentativa com backoff exponencial: 5s → 15s → 1min → 5min → 15min → máx 30min
- Não existe código separado para "online" vs "offline" — apenas resultado diferente da chamada de rede

### 20.7. Bootstrap de PC Novo

- Primeira instalação: download completo do Firebase OU banco seed embutido no instalador
- Sincronização incremental a partir daí

### 20.8. Quota Firebase

- Sincronização em lote (batch write)
- Preferir `onSnapshot` (listeners nativos) a polling manual

### 20.9. Fuso Horário

- `server_timestamp` armazenado em **UTC**
- Toda exibição na UI converte para **America/Sao_Paulo**

---

## Apêndice A — Mapa de Arquivos do Sistema (referência)

| Arquivo | Função |
|---|---|
| `login.html` | Tela de login |
| `index.html` | Dashboard (visão geral) |
| `shared.js` | Funções compartilhadas (auth, store, score, audit) |
| `permissions.js` | Tabela de permissões RBAC |
| `db-local.js` | Camada de dados (abstração localStorage) |
| `pages/employees.js` | Gestão de funcionários |
| `pages/leaders.js` | Gestão de líderes e hierarquia |
| `pages/ponto.js` | Registro de ponto diário |
| `pages/aptidoes.js` | Avaliação de aptidões |
| `pages/ranking.js` | Ranking geral |
| `pages/absenteeism.js` | Absenteísmo |
| `pages/ocorrencias.js` | Ocorrências |
| `pages/quadro.js` | Quadro operacional |
| `pages/report.js` | Relatório |
| `pages/audit.js` | Auditoria |
| `pages/config.js` | Configurações |

---

## Apêndice B — Histórico de Revisões

| Data | Versão | Autor | Descrição |
|---|---|---|---|
| 2026-07-01 | 2.0 | IA | Documento completo de regras de negócio consolidado a partir do código-fonte e conversas de sessão |
| 2026-07-20 | 2.2 | Big | Correções baseadas em revisão: delete efetivo exige coordenacao, clamp 10-80 documentado, bônus especifica domingos+feriados |
