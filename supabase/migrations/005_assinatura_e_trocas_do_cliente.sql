-- Clube do Manto: assinatura (C03/C04) e trocas do cliente (C05–C08), 06/10/2026.
-- Aplicar depois de 004_tamanhos_oficiais.sql.
--   * ativar, cancelar e reativar a própria assinatura por funções protegidas;
--   * ciclos de 12 meses de trocas contados desde a primeira ativação,
--     sem contar o período cancelado e sem renovação antecipada na reativação;
--   * consulta da situação do benefício de trocas (sem expor saldo);
--   * solicitação de troca pelo cliente.
-- Nada aqui realiza cobrança ou entrega: a ativação é demonstrativa.
--
-- Regras do autor aplicadas: ciclos consecutivos desde a primeira ativação; o período
-- cancelado não conta (o ciclo em andamento é estendido pelo tempo cancelado); a
-- reativação não renova o limite nem apaga as trocas usadas.
-- Proposta operacional ainda a consolidar (Dicionário de dados): cada solicitação
-- reserva uma troca do ciclo enquanto está Solicitada e a rejeição a libera. O uso do
-- ciclo é calculado a partir das trocas; não há saldo persistido nem exibido.

BEGIN;

-- ---------------------------------------------------------------
-- Ciclos de troca (uso interno)
-- ---------------------------------------------------------------

-- Cria os ciclos consecutivos que faltam até agora e devolve o início do ciclo atual.
-- Só deve ser chamada com a assinatura ativa e travada (FOR UPDATE) pela operação.
CREATE OR REPLACE FUNCTION private.ciclo_atual(p_usuario uuid)
RETURNS timestamptz
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
    v_ciclo public.ciclos_troca;
BEGIN
    SELECT * INTO v_ciclo
    FROM public.ciclos_troca
    WHERE usuario_id = p_usuario
    ORDER BY inicio_em DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ciclo_inexistente' USING ERRCODE = 'P0002';
    END IF;

    WHILE now() >= v_ciclo.fim_em LOOP
        INSERT INTO public.ciclos_troca (usuario_id, inicio_em, fim_em)
        VALUES (p_usuario, v_ciclo.fim_em, v_ciclo.fim_em + interval '12 months')
        RETURNING * INTO v_ciclo;
    END LOOP;

    RETURN v_ciclo.inicio_em;
END;
$$;

REVOKE ALL ON FUNCTION private.ciclo_atual(uuid) FROM PUBLIC, anon, authenticated;

-- Trocas que ocupam o limite do ciclo: concluídas e solicitadas (reserva proposta).
CREATE OR REPLACE FUNCTION private.trocas_usadas(p_usuario uuid, p_ciclo timestamptz)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT count(*)::integer
    FROM public.trocas
    WHERE usuario_id = p_usuario
      AND ciclo_inicio = p_ciclo
      AND estado IN ('solicitada', 'concluida');
$$;

REVOKE ALL ON FUNCTION private.trocas_usadas(uuid, timestamptz) FROM PUBLIC, anon, authenticated;

-- Perfil completo e válido para ativar ou reativar (UC23).
CREATE OR REPLACE FUNCTION private.perfil_valido(p_usuario uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.perfis p
        JOIN public.equipes f ON f.id = p.equipe_preferida_id AND f.ativo
        JOIN public.equipes r ON r.id = p.rival_id AND r.ativo
        WHERE p.usuario_id = p_usuario
          AND p.tamanho IN ('P', 'M', 'G', 'GG')
          AND p.equipe_preferida_id <> p.rival_id
    );
$$;

REVOKE ALL ON FUNCTION private.perfil_valido(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------
-- UC06/UC23 — Primeira ativação (C03)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ativar_assinatura(p_plano text)
RETURNS public.assinaturas
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_usuario uuid := (SELECT auth.uid());
    v_plano public.planos;
    v_atual public.assinaturas;
    v_nova public.assinaturas;
BEGIN
    IF v_usuario IS NULL THEN
        RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '28000';
    END IF;

    -- Serializa operações de assinatura do mesmo cliente
    PERFORM 1 FROM public.perfis WHERE usuario_id = v_usuario FOR UPDATE;

    SELECT * INTO v_atual FROM public.assinaturas WHERE usuario_id = v_usuario;
    IF FOUND THEN
        IF v_atual.status = 'ativa' THEN
            RAISE EXCEPTION 'assinatura_ativa' USING ERRCODE = '23505';
        END IF;
        RAISE EXCEPTION 'assinatura_cancelada' USING ERRCODE = '22023';
    END IF;

    IF NOT private.perfil_valido(v_usuario) THEN
        RAISE EXCEPTION 'perfil_incompleto' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_plano FROM public.planos WHERE nome = p_plano;
    IF NOT FOUND OR NOT v_plano.ativo THEN
        RAISE EXCEPTION 'plano_indisponivel' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.assinaturas (usuario_id, plano_id, status, ativada_em, inicio_beneficios_em)
    VALUES (v_usuario, v_plano.id, 'ativa', now(), now())
    RETURNING * INTO v_nova;

    -- Primeiro ciclo de 12 meses do benefício de trocas
    INSERT INTO public.ciclos_troca (usuario_id, inicio_em, fim_em)
    VALUES (v_usuario, v_nova.inicio_beneficios_em, v_nova.inicio_beneficios_em + interval '12 months');

    RETURN v_nova;
END;
$$;

REVOKE ALL ON FUNCTION public.ativar_assinatura(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ativar_assinatura(text) TO authenticated;

-- ---------------------------------------------------------------
-- UC18 — Cancelar (C04)
-- Novos kits e trocas ficam indisponíveis; o histórico permanece.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancelar_assinatura()
RETURNS public.assinaturas
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_usuario uuid := (SELECT auth.uid());
    v_atual public.assinaturas;
BEGIN
    IF v_usuario IS NULL THEN
        RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '28000';
    END IF;

    SELECT * INTO v_atual FROM public.assinaturas WHERE usuario_id = v_usuario FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'assinatura_inexistente' USING ERRCODE = 'P0002';
    END IF;
    IF v_atual.status <> 'ativa' THEN
        RAISE EXCEPTION 'assinatura_nao_ativa' USING ERRCODE = '22023';
    END IF;

    -- Fecha a contagem até o instante do cancelamento: o ciclo em andamento é o
    -- que será estendido na reativação.
    PERFORM private.ciclo_atual(v_usuario);

    UPDATE public.assinaturas
    SET status = 'cancelada', cancelada_em = now()
    WHERE usuario_id = v_usuario
    RETURNING * INTO v_atual;

    RETURN v_atual;
END;
$$;

REVOKE ALL ON FUNCTION public.cancelar_assinatura() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_assinatura() TO authenticated;

-- ---------------------------------------------------------------
-- UC18 — Reativar (C03 → C04)
-- Pode escolher outro plano. Preserva o marco dos benefícios, o histórico e as
-- trocas usadas; estende o ciclo em andamento pelo tempo cancelado.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reativar_assinatura(p_plano text)
RETURNS public.assinaturas
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_usuario uuid := (SELECT auth.uid());
    v_plano public.planos;
    v_atual public.assinaturas;
    v_ciclo public.ciclos_troca;
BEGIN
    IF v_usuario IS NULL THEN
        RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '28000';
    END IF;

    SELECT * INTO v_atual FROM public.assinaturas WHERE usuario_id = v_usuario FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'assinatura_inexistente' USING ERRCODE = 'P0002';
    END IF;
    IF v_atual.status = 'ativa' THEN
        RAISE EXCEPTION 'assinatura_ativa' USING ERRCODE = '23505';
    END IF;

    IF NOT private.perfil_valido(v_usuario) THEN
        RAISE EXCEPTION 'perfil_incompleto' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_plano FROM public.planos WHERE nome = p_plano;
    IF NOT FOUND OR NOT v_plano.ativo THEN
        RAISE EXCEPTION 'plano_indisponivel' USING ERRCODE = '22023';
    END IF;

    -- Ciclo em andamento no cancelamento: ganha de volta o tempo cancelado.
    SELECT * INTO v_ciclo
    FROM public.ciclos_troca
    WHERE usuario_id = v_usuario AND inicio_em <= v_atual.cancelada_em
    ORDER BY inicio_em DESC
    LIMIT 1;
    IF FOUND AND v_atual.cancelada_em < v_ciclo.fim_em THEN
        UPDATE public.ciclos_troca
        SET fim_em = fim_em + (now() - v_atual.cancelada_em)
        WHERE usuario_id = v_usuario AND inicio_em = v_ciclo.inicio_em;
    END IF;

    UPDATE public.assinaturas
    SET plano_id = v_plano.id,
        status = 'ativa',
        ativada_em = now(),
        cancelada_em = NULL
    WHERE usuario_id = v_usuario
    RETURNING * INTO v_atual;

    RETURN v_atual;
END;
$$;

REVOKE ALL ON FUNCTION public.reativar_assinatura(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reativar_assinatura(text) TO authenticated;

-- ---------------------------------------------------------------
-- Situação do benefício de trocas (C06, C07)
-- Devolve só a situação, sem números: 'disponivel', 'limite_atingido',
-- 'cancelada' ou 'sem_assinatura'.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.situacao_trocas()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_usuario uuid := (SELECT auth.uid());
    v_atual public.assinaturas;
    v_limite smallint;
    v_ciclo timestamptz;
BEGIN
    IF v_usuario IS NULL THEN
        RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '28000';
    END IF;

    SELECT * INTO v_atual FROM public.assinaturas WHERE usuario_id = v_usuario FOR UPDATE;
    IF NOT FOUND THEN
        RETURN 'sem_assinatura';
    END IF;
    IF v_atual.status <> 'ativa' THEN
        RETURN 'cancelada';
    END IF;

    SELECT trocas_anuais INTO v_limite FROM public.planos WHERE id = v_atual.plano_id;
    v_ciclo := private.ciclo_atual(v_usuario);
    IF private.trocas_usadas(v_usuario, v_ciclo) >= v_limite THEN
        RETURN 'limite_atingido';
    END IF;
    RETURN 'disponivel';
END;
$$;

REVOKE ALL ON FUNCTION public.situacao_trocas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.situacao_trocas() TO authenticated;

-- ---------------------------------------------------------------
-- UC19 — Solicitar troca (C07)
-- p_camisa_id identifica o item do kit do próprio cliente.
-- Modelo mantém o tamanho atual; Tamanho e Modelo e tamanho exigem tamanho diferente.
-- A substituta é definida no processamento (A10), não pelo cliente.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.solicitar_troca(
    p_camisa_id bigint,
    p_modalidade text,
    p_tamanho_destino text DEFAULT NULL
)
RETURNS public.trocas
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_usuario uuid := (SELECT auth.uid());
    v_atual public.assinaturas;
    v_item public.kit_itens;
    v_limite smallint;
    v_ciclo timestamptz;
    v_destino text := upper(btrim(coalesce(p_tamanho_destino, '')));
    v_troca public.trocas;
BEGIN
    IF v_usuario IS NULL THEN
        RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '28000';
    END IF;

    -- Trava a assinatura: serializa solicitações do mesmo cliente (limite do ciclo)
    SELECT * INTO v_atual FROM public.assinaturas WHERE usuario_id = v_usuario FOR UPDATE;
    IF NOT FOUND OR v_atual.status <> 'ativa' THEN
        RAISE EXCEPTION 'assinatura_inativa' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_item FROM public.kit_itens WHERE usuario_id = v_usuario AND camisa_id = p_camisa_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'item_inexistente' USING ERRCODE = 'P0002';
    END IF;
    IF v_item.estado <> 'atual' THEN
        RAISE EXCEPTION 'item_nao_atual' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.trocas
        WHERE usuario_id = v_usuario AND camisa_original_id = p_camisa_id AND estado = 'solicitada'
    ) THEN
        RAISE EXCEPTION 'solicitacao_existente' USING ERRCODE = '23505';
    END IF;

    IF p_modalidade NOT IN ('modelo', 'tamanho', 'ambos') THEN
        RAISE EXCEPTION 'modalidade_invalida' USING ERRCODE = '22023';
    END IF;
    IF p_modalidade = 'modelo' THEN
        v_destino := v_item.tamanho_atual;
    ELSIF v_destino NOT IN ('P', 'M', 'G', 'GG') THEN
        RAISE EXCEPTION 'tamanho_invalido' USING ERRCODE = '22023';
    ELSIF v_destino = v_item.tamanho_atual THEN
        RAISE EXCEPTION 'tamanho_igual' USING ERRCODE = '22023';
    END IF;

    SELECT trocas_anuais INTO v_limite FROM public.planos WHERE id = v_atual.plano_id;
    v_ciclo := private.ciclo_atual(v_usuario);
    IF private.trocas_usadas(v_usuario, v_ciclo) >= v_limite THEN
        RAISE EXCEPTION 'limite_atingido' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.trocas (usuario_id, ciclo_inicio, modalidade, camisa_original_id, tamanho_original, tamanho_destino)
    VALUES (v_usuario, v_ciclo, p_modalidade, p_camisa_id, v_item.tamanho_atual, v_destino)
    RETURNING * INTO v_troca;

    RETURN v_troca;
END;
$$;

REVOKE ALL ON FUNCTION public.solicitar_troca(bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.solicitar_troca(bigint, text, text) TO authenticated;

COMMIT;
