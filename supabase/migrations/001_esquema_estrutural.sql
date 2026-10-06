-- Clube do Manto: proposta estrutural do modelo relacional, 02/10/2026.
-- NAO EXECUTADO em PostgreSQL ou Supabase nesta etapa de modelagem.
-- Requer o contexto Supabase: auth.users e papeis anon/authenticated existentes.
-- Este arquivo nao e uma migracao funcional completa do aplicativo.
-- Inclui estrutura, restricoes locais e RLS sem politicas de acesso.
-- As funcoes transacionais, validacoes entre tabelas, politicas e testes
-- funcionais ainda deverao ser implementados antes da integracao ao front-end.

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE public.equipes (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome text NOT NULL CHECK (nome <> '' AND nome = btrim(nome)),
    pais_codigo text NOT NULL CHECK (pais_codigo ~ '^[A-Z]{2}$'),
    natureza text NOT NULL CHECK (natureza IN ('clube', 'selecao')),
    ativo boolean NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX uq_equipes_nome_pais_natureza
    ON public.equipes (lower(nome), pais_codigo, natureza);

CREATE TABLE public.planos (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome text NOT NULL UNIQUE,
    qtd_comuns smallint NOT NULL,
    qtd_especiais smallint NOT NULL,
    trocas_anuais smallint NOT NULL,
    possui_brinde boolean NOT NULL,
    valor_mensal numeric(10,2) CHECK (valor_mensal >= 0),
    ativo boolean NOT NULL DEFAULT true,
    CONSTRAINT ck_planos_configuracao CHECK (
        (nome = 'Torcedor' AND qtd_comuns = 1 AND qtd_especiais = 0
         AND trocas_anuais = 1 AND NOT possui_brinde)
        OR
        (nome = 'Fanático' AND qtd_comuns = 2 AND qtd_especiais = 0
         AND trocas_anuais = 2 AND possui_brinde)
        OR
        (nome = 'Colecionador' AND qtd_comuns = 2 AND qtd_especiais = 1
         AND trocas_anuais = 3 AND possui_brinde)
    )
);

CREATE TABLE public.camisas (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    equipe_id bigint NOT NULL REFERENCES public.equipes(id) ON DELETE RESTRICT,
    tipo text NOT NULL CHECK (tipo IN ('clube', 'selecao', 'especial')),
    categoria text NOT NULL CHECK (categoria IN ('Home', 'Away', 'Third')),
    temporada text NOT NULL CHECK (temporada ~ '^[0-9]{4}(/[0-9]{4})?$'),
    descricao text,
    ativo boolean NOT NULL DEFAULT true,
    CONSTRAINT uq_camisas_modelo UNIQUE (equipe_id, temporada, categoria)
);

CREATE TABLE public.estoque (
    camisa_id bigint NOT NULL REFERENCES public.camisas(id) ON DELETE RESTRICT,
    tamanho text NOT NULL CHECK (
        tamanho <> '' AND tamanho = btrim(tamanho) AND tamanho = upper(tamanho)
    ),
    quantidade integer NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
    atualizado_em timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (camisa_id, tamanho)
);

CREATE TABLE public.perfis (
    usuario_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
    nome text NOT NULL CHECK (nome <> '' AND nome = btrim(nome)),
    tamanho text CHECK (
        tamanho <> '' AND tamanho = btrim(tamanho) AND tamanho = upper(tamanho)
    ),
    equipe_preferida_id bigint REFERENCES public.equipes(id) ON DELETE RESTRICT,
    rival_id bigint REFERENCES public.equipes(id) ON DELETE RESTRICT,
    criado_em timestamptz NOT NULL DEFAULT now(),
    atualizado_em timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_perfis_equipes_distintas CHECK (equipe_preferida_id <> rival_id),
    CONSTRAINT ck_perfis_datas CHECK (atualizado_em >= criado_em)
);

CREATE TABLE public.assinaturas (
    usuario_id uuid PRIMARY KEY REFERENCES public.perfis(usuario_id) ON DELETE RESTRICT,
    plano_id bigint NOT NULL REFERENCES public.planos(id) ON DELETE RESTRICT,
    status text NOT NULL CHECK (status IN ('ativa', 'cancelada')),
    ativada_em timestamptz NOT NULL DEFAULT now(),
    cancelada_em timestamptz,
    inicio_beneficios_em timestamptz NOT NULL,
    CONSTRAINT ck_assinaturas_marco CHECK (inicio_beneficios_em <= ativada_em),
    CONSTRAINT ck_assinaturas_cancelamento CHECK (
        (status = 'ativa' AND cancelada_em IS NULL)
        OR
        (status = 'cancelada' AND cancelada_em IS NOT NULL
         AND cancelada_em >= ativada_em)
    )
);

CREATE TABLE public.kits (
    usuario_id uuid NOT NULL REFERENCES public.assinaturas(usuario_id) ON DELETE RESTRICT,
    competencia date NOT NULL CHECK (EXTRACT(DAY FROM competencia) = 1),
    plano_id bigint NOT NULL REFERENCES public.planos(id) ON DELETE RESTRICT,
    qtd_comuns_prevista smallint NOT NULL,
    qtd_especiais_prevista smallint NOT NULL,
    brinde_previsto boolean NOT NULL,
    brinde_descricao text,
    registrado_em timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (usuario_id, competencia),
    CONSTRAINT ck_kits_configuracao CHECK (
        (qtd_comuns_prevista = 1 AND qtd_especiais_prevista = 0 AND NOT brinde_previsto)
        OR
        (qtd_comuns_prevista = 2 AND qtd_especiais_prevista IN (0, 1) AND brinde_previsto)
    ),
    CONSTRAINT ck_kits_brinde_descricao CHECK (brinde_previsto OR brinde_descricao IS NULL)
);

CREATE TABLE public.kit_itens (
    usuario_id uuid NOT NULL,
    camisa_id bigint NOT NULL REFERENCES public.camisas(id) ON DELETE RESTRICT,
    competencia date NOT NULL,
    posicao smallint NOT NULL CHECK (posicao BETWEEN 1 AND 3),
    grupo text NOT NULL CHECK (grupo IN ('comum', 'especial')),
    tamanho_inicial text NOT NULL,
    tamanho_atual text NOT NULL,
    origem text NOT NULL CHECK (origem IN ('kit', 'troca')),
    estado text NOT NULL CHECK (estado IN ('atual', 'substituida')),
    registrado_em timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (usuario_id, camisa_id),
    CONSTRAINT fk_kit_itens_kit FOREIGN KEY (usuario_id, competencia)
        REFERENCES public.kits(usuario_id, competencia) ON DELETE RESTRICT,
    CONSTRAINT fk_kit_itens_estoque_inicial FOREIGN KEY (camisa_id, tamanho_inicial)
        REFERENCES public.estoque(camisa_id, tamanho) ON DELETE RESTRICT,
    CONSTRAINT fk_kit_itens_estoque_atual FOREIGN KEY (camisa_id, tamanho_atual)
        REFERENCES public.estoque(camisa_id, tamanho) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX uq_kit_itens_posicao_atual
    ON public.kit_itens (usuario_id, competencia, posicao) WHERE estado = 'atual';

CREATE UNIQUE INDEX uq_kit_itens_posicao_original
    ON public.kit_itens (usuario_id, competencia, posicao) WHERE origem = 'kit';

CREATE INDEX idx_kit_itens_kit ON public.kit_itens (usuario_id, competencia);

CREATE TABLE public.ciclos_troca (
    usuario_id uuid NOT NULL REFERENCES public.perfis(usuario_id) ON DELETE RESTRICT,
    inicio_em timestamptz NOT NULL,
    fim_em timestamptz NOT NULL,
    PRIMARY KEY (usuario_id, inicio_em),
    CONSTRAINT ck_ciclos_troca_intervalo CHECK (fim_em > inicio_em)
);

-- A duracao de 12 meses e a ausencia de sobreposicao exigem a operacao
-- protegida de criacao dos ciclos. Nao sao garantidas apenas pela PK acima.
-- O periodo cancelado nao conta: na reativacao, a operacao protegida estende
-- fim_em do ciclo em andamento pela duracao do cancelamento (decisao do autor).

CREATE TABLE public.trocas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id uuid NOT NULL,
    ciclo_inicio timestamptz NOT NULL,
    modalidade text NOT NULL CHECK (modalidade IN ('modelo', 'tamanho', 'ambos')),
    camisa_original_id bigint NOT NULL,
    tamanho_original text NOT NULL,
    tamanho_destino text NOT NULL CHECK (
        tamanho_destino <> '' AND tamanho_destino = btrim(tamanho_destino)
        AND tamanho_destino = upper(tamanho_destino)
    ),
    camisa_substituta_id bigint,
    estado text NOT NULL DEFAULT 'solicitada'
        CHECK (estado IN ('solicitada', 'concluida', 'rejeitada')),
    solicitada_em timestamptz NOT NULL DEFAULT now(),
    concluida_em timestamptz,
    CONSTRAINT fk_trocas_ciclo FOREIGN KEY (usuario_id, ciclo_inicio)
        REFERENCES public.ciclos_troca(usuario_id, inicio_em) ON DELETE RESTRICT,
    CONSTRAINT fk_trocas_item_original FOREIGN KEY (usuario_id, camisa_original_id)
        REFERENCES public.kit_itens(usuario_id, camisa_id) ON DELETE RESTRICT,
    CONSTRAINT fk_trocas_estoque_original FOREIGN KEY (camisa_original_id, tamanho_original)
        REFERENCES public.estoque(camisa_id, tamanho) ON DELETE RESTRICT,
    CONSTRAINT fk_trocas_estoque_destino FOREIGN KEY (camisa_substituta_id, tamanho_destino)
        REFERENCES public.estoque(camisa_id, tamanho) ON DELETE RESTRICT,
    CONSTRAINT ck_trocas_modalidade CHECK (
        (modalidade = 'modelo' AND tamanho_destino = tamanho_original
         AND (camisa_substituta_id IS NULL OR camisa_substituta_id <> camisa_original_id))
        OR
        (modalidade = 'tamanho' AND tamanho_destino <> tamanho_original
         AND (camisa_substituta_id IS NULL OR camisa_substituta_id = camisa_original_id))
        OR
        (modalidade = 'ambos' AND tamanho_destino <> tamanho_original
         AND (camisa_substituta_id IS NULL OR camisa_substituta_id <> camisa_original_id))
    ),
    CONSTRAINT ck_trocas_conclusao CHECK (
        (estado = 'concluida' AND camisa_substituta_id IS NOT NULL
         AND concluida_em IS NOT NULL AND concluida_em >= solicitada_em)
        OR
        (estado IN ('solicitada', 'rejeitada') AND concluida_em IS NULL)
    )
);

-- Proposta de simplificacao: uma solicitacao pendente por item original.
CREATE UNIQUE INDEX uq_trocas_item_pendente
    ON public.trocas (usuario_id, camisa_original_id) WHERE estado = 'solicitada';

CREATE INDEX idx_trocas_ciclo ON public.trocas (usuario_id, ciclo_inicio, estado);

CREATE TABLE private.administradores (
    usuario_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT
);

-- A estrutura fica fechada para a API enquanto politicas e RPCs nao existem.
ALTER TABLE public.equipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.camisas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assinaturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kit_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ciclos_troca ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trocas ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.administradores ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.equipes, public.planos, public.camisas, public.estoque,
    public.perfis, public.assinaturas, public.kits, public.kit_itens,
    public.ciclos_troca, public.trocas, private.administradores
    FROM PUBLIC, anon, authenticated;

REVOKE ALL ON SEQUENCE public.equipes_id_seq, public.planos_id_seq, public.camisas_id_seq
    FROM PUBLIC, anon, authenticated;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

COMMIT;
