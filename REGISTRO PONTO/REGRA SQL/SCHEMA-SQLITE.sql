═══════════════════════════════════════════════════════════
│ SCHEMA SQLITE — Sistema Inteligente Gestão de Ponto Nagumo
│ Versão: 1.0
│ Estratégia: offline-first, sync via Firebase
│ Todas as tabelas sincronizáveis têm colunas de sync:
│   device_id, version, server_timestamp, sync_status, deleted_at
│ ═══════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════
-- ATENÇÃO: regras de geração (REGRAS-SQL-SYNC-OFFLINE.md)
-- ═══════════════════════════════════════════════════════
-- 1. Todo GROUP BY usa PK, nunca coluna textual isolada
-- 2. Divisão sempre com proteção contra zero (NULLIF)
-- 3. Divisão entre INTEGER em SQLite trunca — usar CAST ou *1.0
-- 4. JOIN sempre com PK/FK explícita
-- 5. JOIN 1:N avaliado para duplicação — agregar em subquery antes
-- 6. Colunas explícitas em código de sync (nunca SELECT *)
-- 7. Índices em device_id, version, sync_status, FKs
-- 8. Toda query de sync lida com sync_status = 'conflict'
-- ═══════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- PARTE 1 — TABELAS DE REFERÊNCIA (estruturas organizacionais)
-- ═══════════════════════════════════════════════════════════════

-- 1.1 FILIAIS (unidades/lojas)
CREATE TABLE IF NOT EXISTS filiais (
    id            TEXT PRIMARY KEY,
    nome          TEXT NOT NULL UNIQUE,
    -- Sync
    device_id         TEXT NOT NULL DEFAULT '',
    version           INTEGER NOT NULL DEFAULT 1,
    server_timestamp  TEXT,
    sync_status       TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','conflict')),
    deleted_at        TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 1.2 TURNOS (ex: Manhã, Tarde, Noite)
CREATE TABLE IF NOT EXISTS turnos (
    id            TEXT PRIMARY KEY,
    nome          TEXT NOT NULL UNIQUE,
    -- Sync
    device_id         TEXT NOT NULL DEFAULT '',
    version           INTEGER NOT NULL DEFAULT 1,
    server_timestamp  TEXT,
    sync_status       TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','conflict')),
    deleted_at        TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 1.3 DEPARTAMENTOS (ex: Expedição, Separação, Admin)
CREATE TABLE IF NOT EXISTS departamentos (
    id            TEXT PRIMARY KEY,
    nome          TEXT NOT NULL UNIQUE,
    -- Sync
    device_id         TEXT NOT NULL DEFAULT '',
    version           INTEGER NOT NULL DEFAULT 1,
    server_timestamp  TEXT,
    sync_status       TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','conflict')),
    deleted_at        TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 1.4 FUNÇÕES (cargos: Conferente, Separador, Líder, etc.)
CREATE TABLE IF NOT EXISTS funcoes (
    id            TEXT PRIMARY KEY,
    nome          TEXT NOT NULL UNIQUE,
    -- Sync
    device_id         TEXT NOT NULL DEFAULT '',
    version           INTEGER NOT NULL DEFAULT 1,
    server_timestamp  TEXT,
    sync_status       TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','conflict')),
    deleted_at        TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 1.5 FERIADOS (regionais/personalizados — nacionais são fixos no código)
CREATE TABLE IF NOT EXISTS feriados (
    id            TEXT PRIMARY KEY,
    dia           INTEGER NOT NULL CHECK(dia >= 1 AND dia <= 31),
    mes           INTEGER NOT NULL CHECK(mes >= 1 AND mes <= 12),
    nome          TEXT NOT NULL,
    tipo          TEXT NOT NULL DEFAULT 'regional' CHECK(tipo IN ('nacional','regional','municipal')),
    -- Sync
    device_id         TEXT NOT NULL DEFAULT '',
    version           INTEGER NOT NULL DEFAULT 1,
    server_timestamp  TEXT,
    sync_status       TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','conflict')),
    deleted_at        TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(dia, mes)
);


-- ═══════════════════════════════════════════════════════════════
-- PARTE 2 — PESSOAS (unifica store.users + store.employees)
-- ═══════════════════════════════════════════════════════════════
-- Regra de negócio: no sistema atual, líderes vêm de store.users
-- (com senha) e de store.employees (com nivel). Esta tabela unifica
-- ambos: se login_id + senha_hash preenchidos → pode logar.
-- Se nivel preenchido → é líder (aparece na página Líderes).
-- Se nivel vazio → funcionário comum.

CREATE TABLE IF NOT EXISTS pessoas (
    id                TEXT PRIMARY KEY,
    -- Dados básicos
    nome              TEXT NOT NULL,
    matricula         TEXT,
    email             TEXT,
    -- Autenticação (nullable — funcionários comuns não logam)
    login_id          TEXT UNIQUE,
    senha_hash        TEXT,     -- SHA-256 via SubtleCrypto
    -- Hierarquia e supervisão
    nivel             TEXT CHECK(nivel IN ('lider','encarregado','coordenacao','gerencia','diretoria','admin_master')),
    supervisor_id     TEXT REFERENCES pessoas(id),
    -- Organizacional (referências textuais às tabelas de referência)
    filial            TEXT,
    departamento      TEXT,
    turno             TEXT,
    funcao            TEXT,
    -- Perfil estendido: JSON com filiais[], depts[], filial, turno
    -- Usado por líderes/encarregados para escopo de dados
    perfil_json       TEXT,
    -- Datas funcionais
    data_admissao     TEXT,     -- YYYY-MM-DD
    data_demissao     TEXT,
    -- Status (booleano: 0/1)
    ativo             INTEGER NOT NULL DEFAULT 1,
    demitido          INTEGER NOT NULL DEFAULT 0,
    afastado          INTEGER NOT NULL DEFAULT 0,
    data_afastamento  TEXT,
    maternidade       INTEGER NOT NULL DEFAULT 0,
    data_maternidade  TEXT,   -- YYYY-MM-DD (código JS usa este nome)
    data_maternidade_fim    TEXT,   -- YYYY-MM-DD
    -- Férias
    ferias            INTEGER NOT NULL DEFAULT 0,
    data_ferias_inicio TEXT,
    data_ferias_fim    TEXT,
    -- Performance atual (fallback quando não há histórico no mês)
    perf              REAL DEFAULT 0,
    -- Avatar (base64 JPEG, max 256px)
    avatar            TEXT,
    -- Sync
    device_id         TEXT NOT NULL DEFAULT '',
    version           INTEGER NOT NULL DEFAULT 1,
    server_timestamp  TEXT,
    sync_status       TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','conflict')),
    deleted_at        TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);


-- ═══════════════════════════════════════════════════════════════
-- PARTE 3 — HISTÓRICO DE CARGOS (job position timeline)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS historico_cargos (
    id              TEXT PRIMARY KEY,
    pessoa_id       TEXT NOT NULL REFERENCES pessoas(id),
    cargo           TEXT NOT NULL,
    tipo            TEXT NOT NULL CHECK(tipo IN ('admissao','promocao','transferencia','rebaixamento')),
    data            TEXT NOT NULL,   -- YYYY-MM-DD
    -- Sync
    device_id         TEXT NOT NULL DEFAULT '',
    version           INTEGER NOT NULL DEFAULT 1,
    server_timestamp  TEXT,
    sync_status       TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','conflict')),
    deleted_at        TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(pessoa_id, cargo, tipo, data)
);


-- ═══════════════════════════════════════════════════════════════
-- PARTE 4 — PONTO DIÁRIO (registro de frequência)
-- ═══════════════════════════════════════════════════════════════
-- Cada linha = 1 funcionário + 1 data + 1 status.
-- A chave atual (rh_ponto) usava emp_id_ano_mes → { dia: status }.
-- Na migração, cada par (dia, status) vira uma linha.

CREATE TABLE IF NOT EXISTS ponto_diario (
    id              TEXT PRIMARY KEY,
    pessoa_id       TEXT NOT NULL REFERENCES pessoas(id),
    data            TEXT NOT NULL,   -- YYYY-MM-DD
    status          TEXT NOT NULL CHECK(status IN (
                        'presente','falta','feriado','atestado',
                        'ferias','folga','afastado','maternidade',
                        'domingo','sabado'
                    )),
    -- Batidas do dia (JSON array): ["07:30","12:00","13:00","17:30"]
    -- Disponível para futuro uso com leitor biométrico
    marcacoes_json  TEXT,
    -- Sync
    device_id         TEXT NOT NULL DEFAULT '',
    version           INTEGER NOT NULL DEFAULT 1,
    server_timestamp  TEXT,
    sync_status       TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','conflict')),
    deleted_at        TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(pessoa_id, data)
);


-- ═══════════════════════════════════════════════════════════════
-- PARTE 5 — AVALIAÇÕES
-- ═══════════════════════════════════════════════════════════════

-- 5.1 COMPETÊNCIAS (10 aptidões, nota 0-10 cada, snapshot mensal)
-- ATENÇÃO: o código JS atual (APT_KEYS) usa CHAVES CURTAS em inglês:
--   qual, prio, know, comm, prod, assid, org, equip, cria, motv
-- As colunas abaixo usam nomes longos em português para legibilidade.
-- O script de migração deve mapear: { qual → qualidade, prio → proatividade, ... }
-- Vide migração 14.4 para a tabela de mapeamento completa.
CREATE TABLE IF NOT EXISTS competencias_historico (
    id                  TEXT PRIMARY KEY,
    pessoa_id           TEXT NOT NULL REFERENCES pessoas(id),
    ano                 INTEGER NOT NULL,
    mes                 INTEGER NOT NULL CHECK(mes >= 1 AND mes <= 12),
    -- As 10 competências (0-10 cada)
    -- Mapeamento APT_KEYS: qual → qualidade
    qualidade           REAL CHECK(qualidade   >= 0 AND qualidade   <= 10),
    -- Mapeamento APT_KEYS: prio → proatividade
    proatividade        REAL CHECK(proatividade>= 0 AND proatividade<= 10),
    -- Mapeamento APT_KEYS: know → conhecimento
    conhecimento        REAL CHECK(conhecimento >= 0 AND conhecimento <= 10),
    -- Mapeamento APT_KEYS: comm → comunicacao
    comunicacao         REAL CHECK(comunicacao  >= 0 AND comunicacao  <= 10),
    -- Mapeamento APT_KEYS: prod → produtividade
    produtividade       REAL CHECK(produtividade>= 0 AND produtividade<= 10),
    -- Mapeamento APT_KEYS: assid → assiduidade_comp
    assiduidade_comp    REAL CHECK(assiduidade_comp >= 0 AND assiduidade_comp <= 10),
    -- Mapeamento APT_KEYS: org → organizacao
    organizacao         REAL CHECK(organizacao  >= 0 AND organizacao  <= 10),
    -- Mapeamento APT_KEYS: equip → equipe
    equipe              REAL CHECK(equipe       >= 0 AND equipe       <= 10),
    -- Mapeamento APT_KEYS: cria → criatividade
    criatividade        REAL CHECK(criatividade >= 0 AND criatividade <= 10),
    -- Mapeamento APT_KEYS: motv → motivacao
    motivacao           REAL CHECK(motivacao    >= 0 AND motivacao    <= 10),
    -- JSON auxiliar: snapshot completo do objeto JS competencies_history[monthKey]
    -- Útil para migração e debug. Formato: {"qual":7,"prio":8,...}
    valores_json        TEXT,
    -- Metadados da avaliação
    avaliado_por        TEXT REFERENCES pessoas(id),
    data_avaliacao      TEXT NOT NULL DEFAULT (datetime('now')),
    -- Sync
    device_id           TEXT NOT NULL DEFAULT '',
    version             INTEGER NOT NULL DEFAULT 1,
    server_timestamp    TEXT,
    sync_status         TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','conflict')),
    deleted_at          TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(pessoa_id, ano, mes)
);

-- 5.2 DESEMPENHO (nota 0-100, mensal)
CREATE TABLE IF NOT EXISTS desempenho_historico (
    id              TEXT PRIMARY KEY,
    pessoa_id       TEXT NOT NULL REFERENCES pessoas(id),
    ano             INTEGER NOT NULL,
    mes             INTEGER NOT NULL CHECK(mes >= 1 AND mes <= 12),
    nota            REAL NOT NULL CHECK(nota >= 0 AND nota <= 100),
    avaliado_por    TEXT REFERENCES pessoas(id),
    data_avaliacao  TEXT NOT NULL DEFAULT (datetime('now')),
    -- Sync
    device_id         TEXT NOT NULL DEFAULT '',
    version           INTEGER NOT NULL DEFAULT 1,
    server_timestamp  TEXT,
    sync_status       TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','conflict')),
    deleted_at        TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(pessoa_id, ano, mes)
);


-- ═══════════════════════════════════════════════════════════════
-- PARTE 6 — OCORRÊNCIAS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ocorrencias (
    id              TEXT PRIMARY KEY,
    pessoa_id       TEXT NOT NULL REFERENCES pessoas(id),
    tipo            TEXT NOT NULL CHECK(tipo IN (
                        'justificativa','ajuste','atestado','ocorrencia',
                        'entrada','saida','advertencia','elogio'
                    )),
    status          TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente','aprovado','rejeitado')),
    descricao       TEXT NOT NULL,
    cid             TEXT,       -- Só para atestado médico
    responsavel_id  TEXT REFERENCES pessoas(id),  -- quem criou
    aprovado_por    TEXT REFERENCES pessoas(id),  -- quem aprovou/rejeitou
    data_aprovacao  TEXT,       -- YYYY-MM-DDTHH:MM:SS
    -- Sync
    device_id         TEXT NOT NULL DEFAULT '',
    version           INTEGER NOT NULL DEFAULT 1,
    server_timestamp  TEXT,
    sync_status       TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','conflict')),
    deleted_at        TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);


-- ═══════════════════════════════════════════════════════════════
-- PARTE 7 — QUADRO OPERACIONAL
-- ═══════════════════════════════════════════════════════════════

-- 7.1 QUADRO POR FILIAL (total quadro + total por função/turno)
CREATE TABLE IF NOT EXISTS quadro_filial (
    id              TEXT PRIMARY KEY,
    filial_nome     TEXT NOT NULL,
    funcao_nome     TEXT NOT NULL,
    turno_nome      TEXT NOT NULL,
    -- Metas
    total_previsto  INTEGER NOT NULL DEFAULT 0,  -- quantas pessoas deveriam ter
    total_atual     INTEGER NOT NULL DEFAULT 0,   -- quantas pessoas têm
    -- Sync
    device_id         TEXT NOT NULL DEFAULT '',
    version           INTEGER NOT NULL DEFAULT 1,
    server_timestamp  TEXT,
    sync_status       TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','conflict')),
    deleted_at        TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(filial_nome, funcao_nome, turno_nome)
);

-- 7.2 VAGAS (abertas por filial/função/turno)
CREATE TABLE IF NOT EXISTS quadro_vagas (
    id              TEXT PRIMARY KEY,
    filial_nome     TEXT NOT NULL,
    funcao_nome     TEXT NOT NULL,
    turno_nome      TEXT NOT NULL,
    quantidade      INTEGER NOT NULL DEFAULT 1 CHECK(quantidade > 0),
    status          TEXT NOT NULL DEFAULT 'aberta' CHECK(status IN ('aberta','preenchida','cancelada')),
    -- Sync
    device_id         TEXT NOT NULL DEFAULT '',
    version           INTEGER NOT NULL DEFAULT 1,
    server_timestamp  TEXT,
    sync_status       TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','conflict')),
    deleted_at        TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);


-- ═══════════════════════════════════════════════════════════════
-- PARTE 8 — CONFIGURAÇÕES DO SISTEMA
-- ═══════════════════════════════════════════════════════════════
-- Tabela chave-valor para configurações diversas.
-- Apenas uma linha (id = 'global') por dispositivo.

CREATE TABLE IF NOT EXISTS configuracoes (
    id              TEXT PRIMARY KEY DEFAULT 'global',
    -- Pesos do score (obrigam somar ≤ 100; absWeight = 100 - perf - apt)
    perf_weight     INTEGER NOT NULL DEFAULT 40 CHECK(perf_weight >= 0 AND perf_weight <= 100),
    apt_weight      INTEGER NOT NULL DEFAULT 35 CHECK(apt_weight  >= 0 AND apt_weight  <= 100),
    -- Máximo de faltas tolerado no ano (base do cálculo de assiduidade)
    max_abs         INTEGER NOT NULL DEFAULT 36 CHECK(max_abs > 0),
    -- Código de autorização para cadastro inicial
    auth_code       TEXT NOT NULL DEFAULT 'NAGUMO2025',
    -- Sync
    device_id         TEXT NOT NULL DEFAULT '',
    version           INTEGER NOT NULL DEFAULT 1,
    server_timestamp  TEXT,
    sync_status       TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','conflict')),
    deleted_at        TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);


-- ═══════════════════════════════════════════════════════════════
-- PARTE 9 — PERMISSÕES (overrides da tabela RBAC)
-- ═══════════════════════════════════════════════════════════════
-- Admin Master pode sobrescrever qualquer permissão via UI.
-- Cada linha = 1 permissão customizada para uma (página, ação).
-- Se não existir linha, usa o padrão do permissions.js.

CREATE TABLE IF NOT EXISTS permissoes_override (
    id              TEXT PRIMARY KEY,
    pagina          TEXT NOT NULL,
    acao            TEXT NOT NULL,
    nivel_minimo    TEXT NOT NULL CHECK(nivel_minimo IN (
                        'lider','encarregado','coordenacao','gerencia','diretoria','admin_master'
                    )),
    -- Sync
    device_id         TEXT NOT NULL DEFAULT '',
    version           INTEGER NOT NULL DEFAULT 1,
    server_timestamp  TEXT,
    sync_status       TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','conflict')),
    deleted_at        TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(pagina, acao)
);


-- ═══════════════════════════════════════════════════════════════
-- PARTE 10 — AUDITORIA (append-only, nunca UPDATE ou DELETE)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS audit_log (
    id              TEXT PRIMARY KEY,
    usuario_id      TEXT NOT NULL REFERENCES pessoas(id),
    usuario_nome    TEXT NOT NULL,
    acao            TEXT NOT NULL,
    modulo          TEXT NOT NULL,
    detalhes        TEXT,           -- JSON com informações da ação
    dispositivo     TEXT,           -- ex: "Chrome · Windows"
    ts              TEXT NOT NULL DEFAULT (datetime('now')),
    -- Sync
    device_id         TEXT NOT NULL DEFAULT '',
    version           INTEGER NOT NULL DEFAULT 1,
    server_timestamp  TEXT,
    sync_status       TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','conflict')),
    deleted_at        TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Regra de negócio: logs com mais de 7 dias são descartados.
-- Máximo de 500 registros armazenados.


-- ═══════════════════════════════════════════════════════════════
-- PARTE 11 — TABELAS LOCAIS (NÃO sincronizadas com Firebase)
-- ═══════════════════════════════════════════════════════════════
-- Estas tabelas são exclusivas do dispositivo e NÃO têm colunas de sync.

-- 11.1 SESSÕES DO DISPOSITIVO
CREATE TABLE IF NOT EXISTS sessoes_dispositivo (
    id              TEXT PRIMARY KEY,
    pessoa_id       TEXT NOT NULL REFERENCES pessoas(id),
    data_login      TEXT NOT NULL DEFAULT (datetime('now')),
    data_expiracao  TEXT,
    ativo           INTEGER NOT NULL DEFAULT 1
);

-- 11.2 FALTAS_MES (cache/materializado para cálculos — NÃO sincronizado)
-- Tabela auxiliar populada a partir de ponto_diario para acelerar queries
-- de score e ranking. Pode ser recalculada a qualquer momento.
-- Regra: atestado = meia falta nos cálculos de assiduidade.
CREATE TABLE IF NOT EXISTS faltas_mes (
    id              TEXT PRIMARY KEY,
    pessoa_id       TEXT NOT NULL REFERENCES pessoas(id),
    ano             INTEGER NOT NULL,
    mes             INTEGER NOT NULL CHECK(mes >= 1 AND mes <= 12),
    total_faltas    REAL NOT NULL DEFAULT 0,    -- atestado conta como 0.5
    total_presencas INTEGER NOT NULL DEFAULT 0,
    UNIQUE(pessoa_id, ano, mes)
);


-- ═══════════════════════════════════════════════════════════════
-- PARTE 11.5 — TRIGGERS DE VERSION
-- ═══════════════════════════════════════════════════════════════
-- Incrementa version automaticamente em todo UPDATE (regra 9).
-- Necessário para detecção de conflito na sincronização.
-- NOTA: SQLite não permite CREATE TRIGGER dinâmico para N tabelas,
-- então cada tabela sincronizável precisa de seu próprio trigger.
-- Abaixo, um trigger por tabela.

CREATE TRIGGER IF NOT EXISTS trg_pessoas_version
    AFTER UPDATE ON pessoas
    FOR EACH ROW WHEN NEW.version = OLD.version
BEGIN
    UPDATE pessoas SET version = version + 1 WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_hist_cargos_version
    AFTER UPDATE ON historico_cargos
    FOR EACH ROW WHEN NEW.version = OLD.version
BEGIN
    UPDATE historico_cargos SET version = version + 1 WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_ponto_diario_version
    AFTER UPDATE ON ponto_diario
    FOR EACH ROW WHEN NEW.version = OLD.version
BEGIN
    UPDATE ponto_diario SET version = version + 1 WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_competencias_version
    AFTER UPDATE ON competencias_historico
    FOR EACH ROW WHEN NEW.version = OLD.version
BEGIN
    UPDATE competencias_historico SET version = version + 1 WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_desempenho_version
    AFTER UPDATE ON desempenho_historico
    FOR EACH ROW WHEN NEW.version = OLD.version
BEGIN
    UPDATE desempenho_historico SET version = version + 1 WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_ocorrencias_version
    AFTER UPDATE ON ocorrencias
    FOR EACH ROW WHEN NEW.version = OLD.version
BEGIN
    UPDATE ocorrencias SET version = version + 1 WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_quadro_filial_version
    AFTER UPDATE ON quadro_filial
    FOR EACH ROW WHEN NEW.version = OLD.version
BEGIN
    UPDATE quadro_filial SET version = version + 1 WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_quadro_vagas_version
    AFTER UPDATE ON quadro_vagas
    FOR EACH ROW WHEN NEW.version = OLD.version
BEGIN
    UPDATE quadro_vagas SET version = version + 1 WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_filiais_version
    AFTER UPDATE ON filiais
    FOR EACH ROW WHEN NEW.version = OLD.version
BEGIN
    UPDATE filiais SET version = version + 1 WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_turnos_version
    AFTER UPDATE ON turnos
    FOR EACH ROW WHEN NEW.version = OLD.version
BEGIN
    UPDATE turnos SET version = version + 1 WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_departamentos_version
    AFTER UPDATE ON departamentos
    FOR EACH ROW WHEN NEW.version = OLD.version
BEGIN
    UPDATE departamentos SET version = version + 1 WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_funcoes_version
    AFTER UPDATE ON funcoes
    FOR EACH ROW WHEN NEW.version = OLD.version
BEGIN
    UPDATE funcoes SET version = version + 1 WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_feriados_version
    AFTER UPDATE ON feriados
    FOR EACH ROW WHEN NEW.version = OLD.version
BEGIN
    UPDATE feriados SET version = version + 1 WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_configuracoes_version
    AFTER UPDATE ON configuracoes
    FOR EACH ROW WHEN NEW.version = OLD.version
BEGIN
    UPDATE configuracoes SET version = version + 1 WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_permissoes_version
    AFTER UPDATE ON permissoes_override
    FOR EACH ROW WHEN NEW.version = OLD.version
BEGIN
    UPDATE permissoes_override SET version = version + 1 WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_faltas_mes_version
    AFTER UPDATE ON faltas_mes
    FOR EACH ROW WHEN NEW.version = OLD.version
BEGIN
    UPDATE faltas_mes SET version = version + 1 WHERE id = NEW.id;
END;

-- Nota: sessoes_dispositivo e audit_log NÃO são sincronizáveis
-- (dados locais), portanto não precisam de version trigger.

-- ═══════════════════════════════════════════════════════════════
-- PARTE 12 — ÍNDICES
-- ═══════════════════════════════════════════════════════════════
-- Índices obrigatórios por regra 7 (sync) e por performance.

-- 12.1 PESSOAS
CREATE INDEX IF NOT EXISTS idx_pessoas_supervisor ON pessoas(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_filial     ON pessoas(filial);
CREATE INDEX IF NOT EXISTS idx_pessoas_depto      ON pessoas(departamento);
CREATE INDEX IF NOT EXISTS idx_pessoas_turno      ON pessoas(turno);
CREATE INDEX IF NOT EXISTS idx_pessoas_nivel      ON pessoas(nivel);
CREATE INDEX IF NOT EXISTS idx_pessoas_ativo      ON pessoas(ativo);
CREATE INDEX IF NOT EXISTS idx_pessoas_sync       ON pessoas(sync_status, device_id);

-- 12.2 PONTO DIÁRIO
CREATE INDEX IF NOT EXISTS idx_ponto_pessoa_data  ON ponto_diario(pessoa_id, data);
CREATE INDEX IF NOT EXISTS idx_ponto_pessoa_status ON ponto_diario(pessoa_id, status, data);
CREATE INDEX IF NOT EXISTS idx_ponto_data         ON ponto_diario(data);
CREATE INDEX IF NOT EXISTS idx_ponto_status       ON ponto_diario(status);
CREATE INDEX IF NOT EXISTS idx_ponto_sync         ON ponto_diario(sync_status, device_id);

-- 12.3 COMPETÊNCIAS
CREATE INDEX IF NOT EXISTS idx_comp_pessoa_mes    ON competencias_historico(pessoa_id, ano, mes);
CREATE INDEX IF NOT EXISTS idx_comp_sync          ON competencias_historico(sync_status, device_id);

-- 12.4 DESEMPENHO
CREATE INDEX IF NOT EXISTS idx_desempenho_pessoa_mes ON desempenho_historico(pessoa_id, ano, mes);
CREATE INDEX IF NOT EXISTS idx_desempenho_sync       ON desempenho_historico(sync_status, device_id);

-- 12.5 OCORRÊNCIAS
CREATE INDEX IF NOT EXISTS idx_ocorrencias_pessoa   ON ocorrencias(pessoa_id);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_status   ON ocorrencias(status);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_tipo     ON ocorrencias(tipo);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_sync     ON ocorrencias(sync_status, device_id);

-- 12.6 AUDITORIA
CREATE INDEX IF NOT EXISTS idx_audit_ts             ON audit_log(ts);
CREATE INDEX IF NOT EXISTS idx_audit_usuario        ON audit_log(usuario_id);
CREATE INDEX IF NOT EXISTS idx_audit_modulo         ON audit_log(modulo);
CREATE INDEX IF NOT EXISTS idx_audit_sync           ON audit_log(sync_status, device_id);

-- 12.7 QUADRO
CREATE INDEX IF NOT EXISTS idx_quadro_filial        ON quadro_filial(filial_nome);
CREATE INDEX IF NOT EXISTS idx_quadro_sync          ON quadro_filial(sync_status, device_id);
CREATE INDEX IF NOT EXISTS idx_vagas_filial         ON quadro_vagas(filial_nome);
CREATE INDEX IF NOT EXISTS idx_vagas_sync           ON quadro_vagas(sync_status, device_id);

-- 12.8 REFERÊNCIAS
CREATE INDEX IF NOT EXISTS idx_filiais_sync         ON filiais(sync_status, device_id);
CREATE INDEX IF NOT EXISTS idx_turnos_sync          ON turnos(sync_status, device_id);
CREATE INDEX IF NOT EXISTS idx_deptos_sync          ON departamentos(sync_status, device_id);
CREATE INDEX IF NOT EXISTS idx_funcoes_sync         ON funcoes(sync_status, device_id);
CREATE INDEX IF NOT EXISTS idx_feriados_sync        ON feriados(sync_status, device_id);

-- 12.9 CONFIGURAÇÕES E PERMISSÕES
CREATE INDEX IF NOT EXISTS idx_config_sync          ON configuracoes(sync_status, device_id);
CREATE INDEX IF NOT EXISTS idx_permissoes_sync      ON permissoes_override(sync_status, device_id);

-- 12.10 HISTÓRICO DE CARGOS
CREATE INDEX IF NOT EXISTS idx_hist_cargos_pessoa   ON historico_cargos(pessoa_id);
CREATE INDEX IF NOT EXISTS idx_hist_cargos_sync     ON historico_cargos(sync_status, device_id);

-- 12.11 FALTAS MÊS (local)
CREATE INDEX IF NOT EXISTS idx_faltas_mes_pessoa    ON faltas_mes(pessoa_id, ano, mes);

-- Índices em FKs auxiliares
CREATE INDEX IF NOT EXISTS idx_comp_avaliador       ON competencias_historico(avaliado_por);
CREATE INDEX IF NOT EXISTS idx_desempenho_avaliador ON desempenho_historico(avaliado_por);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_resp     ON ocorrencias(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_aprov    ON ocorrencias(aprovado_por);
CREATE INDEX IF NOT EXISTS idx_sessoes_pessoa       ON sessoes_dispositivo(pessoa_id);


-- ═══════════════════════════════════════════════════════════════
-- PARTE 13 — VIEWS (consultas auxiliares)
-- ═══════════════════════════════════════════════════════════════

-- 13.1 SCORE MENSAL DO FUNCIONÁRIO
-- Retorna o score calculado para cada (pessoa, ano, mes)
-- baseado nos 3 pilares + bônus de domingo/feriado trabalhado.
-- Regras:
--   - Assiduidade: mensal (max_abs/12 por mês)
--   - Aptidões: fallback 5 quando sem histórico
--   - Desempenho: fallback p.perf quando sem histórico
--   - Bônus: domingo + feriados nacionais fixos + feriados custom (tabela)
--   - Afastado/maternidade: assiduidade = 100
-- ATENÇÃO: divisões com proteção contra zero (regra 2).
CREATE VIEW IF NOT EXISTS vw_score_mensal AS
SELECT
    p.id AS pessoa_id,
    p.nome,
    COALESCE(c.ano, CAST(strftime('%Y', 'now') AS INTEGER)) AS ano,
    COALESCE(c.mes, CAST(strftime('%m', 'now') AS INTEGER)) AS mes,
    -- Pilar 1: Desempenho (0-100) — fallback p.perf
    COALESCE(d.nota, p.perf, 0) AS desempenho_nota,
    -- Pilar 2: Média das aptidões × 10 — fallback 5
    ROUND(
        (COALESCE(c.qualidade,5) + COALESCE(c.proatividade,5)
         + COALESCE(c.conhecimento,5) + COALESCE(c.comunicacao,5)
         + COALESCE(c.produtividade,5) + COALESCE(c.assiduidade_comp,5)
         + COALESCE(c.organizacao,5) + COALESCE(c.equipe,5)
         + COALESCE(c.criatividade,5) + COALESCE(c.motivacao,5))
        / 10.0, 2
    ) * 10 AS aptidoes_nota,
    -- Pilar 3: Assiduidade (0-100) — mensal
    CASE
        WHEN p.afastado = 1 OR p.maternidade = 1 THEN 100.0
        ELSE ROUND(MAX(0, 100.0 - (
            COALESCE(fm.total_faltas, 0)
            / CAST(NULLIF(
                (SELECT max_abs FROM configuracoes WHERE id = 'global') / 12.0,
            0) AS REAL) * 100
        )), 2)
    END AS assiduidade_nota,
    -- Bônus: domingo + feriado trabalhado (+0.5/dia, máx +5)
    COALESCE(ROUND((
        SELECT CASE WHEN COUNT(*) * 0.5 > 5.0 THEN 5.0 ELSE COUNT(*) * 0.5 END
        FROM ponto_diario pd
        WHERE pd.pessoa_id = p.id
          AND pd.deleted_at IS NULL
          AND pd.status = 'presente'
          AND pd.data >= DATE(printf('%04d', COALESCE(c.ano, CAST(strftime('%Y', 'now') AS INTEGER)))
                            || '-' || printf('%02d', COALESCE(c.mes, CAST(strftime('%m', 'now') AS INTEGER)))
                            || '-01')
          AND pd.data < DATE(printf('%04d', COALESCE(c.ano, CAST(strftime('%Y', 'now') AS INTEGER)))
                           || '-' || printf('%02d', COALESCE(c.mes, CAST(strftime('%m', 'now') AS INTEGER)))
                           || '-01', '+1 month')
          AND (
              CAST(strftime('%w', pd.data) AS INTEGER) = 0  -- domingo
              OR EXISTS (
                  SELECT 1 FROM feriados f
                  WHERE f.deleted_at IS NULL
                    AND f.data = pd.data
              )
              -- Feriados nacionais fixos (matching JS calcBonus)
              OR (CAST(strftime('%m', pd.data) AS INTEGER) = 1  AND CAST(strftime('%d', pd.data) AS INTEGER) = 1)  -- Confraternização
              OR (CAST(strftime('%m', pd.data) AS INTEGER) = 4  AND CAST(strftime('%d', pd.data) AS INTEGER) = 21) -- Tiradentes
              OR (CAST(strftime('%m', pd.data) AS INTEGER) = 5  AND CAST(strftime('%d', pd.data) AS INTEGER) = 1)  -- Dia do Trabalho
              OR (CAST(strftime('%m', pd.data) AS INTEGER) = 9  AND CAST(strftime('%d', pd.data) AS INTEGER) = 7)  -- Independência
              OR (CAST(strftime('%m', pd.data) AS INTEGER) = 10 AND CAST(strftime('%d', pd.data) AS INTEGER) = 12) -- Nossa Sra.
              OR (CAST(strftime('%m', pd.data) AS INTEGER) = 11 AND CAST(strftime('%d', pd.data) AS INTEGER) = 2)  -- Finados
              OR (CAST(strftime('%m', pd.data) AS INTEGER) = 11 AND CAST(strftime('%d', pd.data) AS INTEGER) = 15) -- Proclamação
              OR (CAST(strftime('%m', pd.data) AS INTEGER) = 12 AND CAST(strftime('%d', pd.data) AS INTEGER) = 25) -- Natal
          )
    ), 1), 0) AS bonus
FROM pessoas p
LEFT JOIN competencias_historico c ON c.pessoa_id = p.id AND c.deleted_at IS NULL
LEFT JOIN desempenho_historico d   ON d.pessoa_id = p.id AND d.deleted_at IS NULL
                                   AND d.ano = COALESCE(c.ano, CAST(strftime('%Y', 'now') AS INTEGER))
                                   AND d.mes = COALESCE(c.mes, CAST(strftime('%m', 'now') AS INTEGER))
LEFT JOIN faltas_mes fm            ON fm.pessoa_id = p.id
                                   AND fm.ano = COALESCE(c.ano, CAST(strftime('%Y', 'now') AS INTEGER))
                                   AND fm.mes = COALESCE(c.mes, CAST(strftime('%m', 'now') AS INTEGER))
WHERE p.deleted_at IS NULL
  AND c.deleted_at IS NULL;

-- 13.2 RANKING GERAL
-- Usa a view vw_score_mensal + pesos da config.
-- Regra: perf + apt + abs = 100, cada peso >= 10.
-- Se perf_weight + apt_weight > 90, normaliza proporcional dentro de 90.
-- Garante que nenhum peso fique abaixo de 10.
CREATE VIEW IF NOT EXISTS vw_ranking AS
WITH clamped AS (
    SELECT
        s.*,
        MAX(10.0, MIN(80.0, COALESCE(cfg.perf_weight, 40))) AS pw,
        MAX(10.0, MIN(80.0, COALESCE(cfg.apt_weight, 35))) AS aw
    FROM vw_score_mensal s, configuracoes cfg
    WHERE cfg.id = 'global'
),
scaled AS (
    SELECT *,
        CASE WHEN pw + aw > 90
            THEN ROUND(pw * 90.0 / (pw + aw))
            ELSE pw
        END AS sp,
        CASE WHEN pw + aw > 90
            THEN ROUND(aw * 90.0 / (pw + aw))
            ELSE aw
        END AS sa
    FROM clamped
),
normalized AS (
    SELECT *,
        CASE
            WHEN sp < 10 THEN 10.0
            WHEN sa < 10 THEN 80.0
            ELSE sp
        END AS perf_norm,
        CASE
            WHEN sa < 10 THEN 10.0
            WHEN sp < 10 THEN 80.0
            ELSE sa
        END AS apt_norm
    FROM scaled
)
SELECT
    pessoa_id, nome, ano, mes, desempenho_nota, aptidoes_nota, assiduidade_nota, bonus,
    perf_norm, apt_norm,
    -- Score composto: abs = 100 - perf_norm - apt_norm (>= 10)
    ROUND(
        desempenho_nota * (perf_norm / 100.0)
        + aptidoes_nota  * (apt_norm  / 100.0)
        + assiduidade_nota * ((100.0 - perf_norm - apt_norm) / 100.0)
        + bonus,
        1
    ) AS score_bruto,
    -- Faixa
    CASE
        WHEN (desempenho_nota * (perf_norm / 100.0)
              + aptidoes_nota  * (apt_norm / 100.0)
              + assiduidade_nota * ((100.0 - perf_norm - apt_norm) / 100.0)
              + bonus) >= 85 THEN 'promocao'
        WHEN (desempenho_nota * (perf_norm / 100.0)
              + aptidoes_nota  * (apt_norm / 100.0)
              + assiduidade_nota * ((100.0 - perf_norm - apt_norm) / 100.0)
              + bonus) >= 70 THEN 'regular'
        WHEN (desempenho_nota * (perf_norm / 100.0)
              + aptidoes_nota  * (apt_norm / 100.0)
              + assiduidade_nota * ((100.0 - perf_norm - apt_norm) / 100.0)
              + bonus) >= 55 THEN 'atencao'
        ELSE 'risco'
    END AS faixa
FROM normalized;


-- ═══════════════════════════════════════════════════════════════
-- PARTE 14 — NOTAS DE MIGRAÇÃO
-- ═══════════════════════════════════════════════════════════════
--
-- 14.1 Migração de rh_ponto (localStorage)
--   Estrutura atual: { "empId_ano_mes": { "1": "presente", ... } }
--   Para SQLite: cada (empId → pessoa_id, ano, mes, dia, status) vira uma
--   linha em ponto_diario com data = "YYYY-MM-DD".
--   Script de migração deve iterar as chaves de rh_ponto e inserir
--   em lote (batch insert) para performance.
--
-- 14.2 Migração de rh_store.employees[].historico_cargos
--   Array atual: [{ cargo, tipo, data }]
--   Cada entrada vira 1 linha em historico_cargos.
--   Dedup: manter apenas a primeira ocorrência de (cargo, tipo, data)
--   por funcionário.
--
-- 14.3 Migração de rh_store.employees[].absences
--   Array atual: [0, 3, 1, ...] (12 posições, faltas por mês)
--   Inserir em faltas_mes (tabela local, recalculável).
--   Recalcular a partir de ponto_diario depois da migração.
--
-- 14.4 Migração de rh_store.employees[].competencies
--   Objeto atual: { qual: 7, prio: 8, ... }
--   Inserir como snapshot do mês corrente em competencias_historico.
--   Mapeamento APT_KEYS → colunas SQL:
--     qual → qualidade,  prio → proatividade, know → conhecimento,
--     comm → comunicacao, prod → produtividade, assid → assiduidade_comp,
--     org  → organizacao, equip → equipe,      cria → criatividade,
--     motv → motivacao
--   valores_json: salvar o JSON original intacto (ex: '{"qual":7,"prio":8,...}')
--
-- 14.5 Migração de rh_store.employees[].perf
--   Número atual (ex: 85) → inserir em desempenho_historico
--   como nota do mês corrente.
--
-- 14.6 Migração de rh_store.users
--   Cada chave em store.users vira 1 linha em pessoas com
--   nivel e senha_hash preenchidos.
--
-- 14.7 Migração de rh_store.employees
--   Cada item vira 1 linha em pessoas.
--   ⚠️ supervisor: coalesce(owner_id, ownerId) → supervisor_id
--   ⚠️ filial: coalesce(filial_id, filial) → pessoas.filial (texto)
--   ⚠️ demitido: extrair de !ativo ou data_demissao preenchida
--   ⚠️ maternidade: emp.maternidade (booleano), emp.data_maternidade, emp.data_maternidade_fim
--     mantidos com os mesmos nomes (maternidade, data_maternidade, data_maternidade_fim)
--   Se tiver nivel ou login_id, mantém; caso contrário, NULL.
--
-- 14.8 sequência de migração recomendada:
--   1. filiais, turnos, departamentos, funcoes, feriados
--   2. pessoas (unificar users + employees)
--   3. historico_cargos (de cada employee)
--   4. configuracoes
--   5. ponto_diario (de rh_ponto)
--   6. faltas_mes (de absences + recalcular)
--   7. competencias_historico (de competencies + competencies_history)
--   8. desempenho_historico (de perf + perf_history)
--   9. ocorrencias (de rh_ocorrencias)
--  10. quadro_filial + quadro_vagas (de rh_quadro)
--  11. permissoes_override (de store.permOverrides)
--  12. audit_log (de rh_audit_log)
--  13. FIM → sync inicial para Firebase


-- ═══════════════════════════════════════════════════════════════
-- FIM DO SCHEMA
-- ═══════════════════════════════════════════════════════════════
