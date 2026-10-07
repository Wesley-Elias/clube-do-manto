-- Clube do Manto: peso do sorteio, 07/10/2026.
-- Aplicar depois de 009_recusa_clube_brasileiro.sql.
--   * decisão do autor: no sorteio das camisas do kit, cada modelo elegível da
--     equipe preferida tem peso 5 e cada um dos demais modelos elegíveis tem peso 1;
--   * o mesmo peso vale para a substituta escolhida na conclusão da troca de modelo;
--   * substitui a prioridade absoluta da migração 007: a preferida passa a ter
--     mais chance, sem garantia de aparecer no kit;
--   * filtros de elegibilidade, travas e baixa de estoque não mudam.
--
-- Método: amostragem ponderada sem reposição (Efraimidis e Spirakis, 2006).
-- Cada candidato recebe a chave -ln(U) / peso, com U uniforme em (0, 1]; os de
-- menor chave são escolhidos. Para um sorteio de uma camisa, a chance de cada
-- candidato é o seu peso dividido pela soma dos pesos.

BEGIN;

-- Chave do sorteio ponderado (uso interno). VOLATILE: muda a cada linha.
CREATE OR REPLACE FUNCTION private.chave_sorteio(p_preferida boolean)
RETURNS double precision
LANGUAGE sql
VOLATILE
SET search_path = ''
AS $$
    SELECT -ln(1.0 - random()) / CASE WHEN coalesce(p_preferida, false) THEN 5 ELSE 1 END;
$$;

REVOKE ALL ON FUNCTION private.chave_sorteio(boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_montar_kit(p_usuario uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_competencia date := private.competencia_atual();
    v_assinatura public.assinaturas;
    v_perfil public.perfis;
    v_plano public.planos;
    v_comuns bigint[];
    v_especiais bigint[] := '{}';
    v_posicao smallint := 0;
    v_camisa bigint;
BEGIN
    PERFORM private.exigir_administrador();

    -- Trava a assinatura: serializa montagem, trocas e mudanças do mesmo cliente
    SELECT * INTO v_assinatura FROM public.assinaturas WHERE usuario_id = p_usuario FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'assinatura_inexistente' USING ERRCODE = 'P0002';
    END IF;

    IF EXISTS (SELECT 1 FROM public.kits WHERE usuario_id = p_usuario AND competencia = v_competencia) THEN
        RETURN jsonb_build_object('resultado', 'existente', 'competencia', v_competencia);
    END IF;

    IF v_assinatura.status <> 'ativa' THEN
        RAISE EXCEPTION 'assinatura_cancelada' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_plano FROM public.planos WHERE id = v_assinatura.plano_id;
    IF NOT v_plano.ativo THEN
        RAISE EXCEPTION 'plano_inativo' USING ERRCODE = '22023';
    END IF;
    IF NOT private.perfil_valido(p_usuario) THEN
        RAISE EXCEPTION 'perfil_incompleto' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_perfil FROM public.perfis WHERE usuario_id = p_usuario;

    -- Camisas comuns elegíveis: clube ou seleção, catálogo ativo, sem rival, sem
    -- modelo já registrado para o cliente e com saldo no tamanho do perfil.
    SELECT array_agg(id) INTO v_comuns FROM (
        SELECT c.id
        FROM public.camisas c
        JOIN public.equipes e ON e.id = c.equipe_id
        JOIN public.estoque es ON es.camisa_id = c.id AND es.tamanho = v_perfil.tamanho
        WHERE c.ativo AND e.ativo
          AND c.tipo IN ('clube', 'selecao')
          AND NOT (e.natureza = 'clube' AND e.pais_codigo = 'BR')
          AND e.id <> v_perfil.rival_id
          AND es.quantidade > 0
          AND NOT EXISTS (SELECT 1 FROM public.kit_itens ki WHERE ki.usuario_id = p_usuario AND ki.camisa_id = c.id)
        -- Sorteio ponderado sem reposição: peso 5 para a equipe preferida, 1 para as demais
        ORDER BY private.chave_sorteio(e.id = v_perfil.equipe_preferida_id)
        LIMIT v_plano.qtd_comuns
        FOR UPDATE OF es
    ) s;
    IF coalesce(array_length(v_comuns, 1), 0) < v_plano.qtd_comuns THEN
        RAISE EXCEPTION 'estoque_insuficiente' USING ERRCODE = '22023', HINT = 'comum';
    END IF;

    IF v_plano.qtd_especiais > 0 THEN
        SELECT array_agg(id) INTO v_especiais FROM (
            SELECT c.id
            FROM public.camisas c
            JOIN public.equipes e ON e.id = c.equipe_id
            JOIN public.estoque es ON es.camisa_id = c.id AND es.tamanho = v_perfil.tamanho
            WHERE c.ativo AND e.ativo
              AND c.tipo = 'especial'
              AND NOT (e.natureza = 'clube' AND e.pais_codigo = 'BR')
              AND e.id <> v_perfil.rival_id
              AND es.quantidade > 0
              AND NOT EXISTS (SELECT 1 FROM public.kit_itens ki WHERE ki.usuario_id = p_usuario AND ki.camisa_id = c.id)
            -- Sorteio ponderado sem reposição: peso 5 para a equipe preferida, 1 para as demais
            ORDER BY private.chave_sorteio(e.id = v_perfil.equipe_preferida_id)
            LIMIT v_plano.qtd_especiais
            FOR UPDATE OF es
        ) s;
        IF coalesce(array_length(v_especiais, 1), 0) < v_plano.qtd_especiais THEN
            RAISE EXCEPTION 'estoque_insuficiente' USING ERRCODE = '22023', HINT = 'especial';
        END IF;
    END IF;

    INSERT INTO public.kits (usuario_id, competencia, plano_id, qtd_comuns_prevista,
                             qtd_especiais_prevista, brinde_previsto, brinde_descricao)
    VALUES (p_usuario, v_competencia, v_plano.id, v_plano.qtd_comuns,
            v_plano.qtd_especiais, v_plano.possui_brinde, NULL);

    FOREACH v_camisa IN ARRAY v_comuns LOOP
        v_posicao := v_posicao + 1;
        INSERT INTO public.kit_itens (usuario_id, camisa_id, competencia, posicao, grupo,
                                      tamanho_inicial, tamanho_atual, origem, estado)
        VALUES (p_usuario, v_camisa, v_competencia, v_posicao, 'comum',
                v_perfil.tamanho, v_perfil.tamanho, 'kit', 'atual');
    END LOOP;
    FOREACH v_camisa IN ARRAY v_especiais LOOP
        v_posicao := v_posicao + 1;
        INSERT INTO public.kit_itens (usuario_id, camisa_id, competencia, posicao, grupo,
                                      tamanho_inicial, tamanho_atual, origem, estado)
        VALUES (p_usuario, v_camisa, v_competencia, v_posicao, 'especial',
                v_perfil.tamanho, v_perfil.tamanho, 'kit', 'atual');
    END LOOP;

    -- Baixa no estoque (UC22): uma unidade de cada camisa no tamanho do kit
    UPDATE public.estoque
    SET quantidade = quantidade - 1, atualizado_em = now()
    WHERE tamanho = v_perfil.tamanho AND camisa_id = ANY (v_comuns || v_especiais);

    RETURN jsonb_build_object('resultado', 'registrado', 'competencia', v_competencia);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_montar_kit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_montar_kit(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_concluir_troca(p_troca uuid)
RETURNS public.trocas
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_troca public.trocas;
    v_assinatura public.assinaturas;
    v_item public.kit_itens;
    v_perfil public.perfis;
    v_limite smallint;
    v_concluidas integer;
    v_substituta bigint;
BEGIN
    PERFORM private.exigir_administrador();

    SELECT usuario_id INTO v_troca.usuario_id FROM public.trocas WHERE id = p_troca;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'troca_inexistente' USING ERRCODE = 'P0002';
    END IF;
    -- Mesma ordem de travas da solicitação e da montagem: assinatura, depois a troca
    SELECT * INTO v_assinatura FROM public.assinaturas WHERE usuario_id = v_troca.usuario_id FOR UPDATE;
    SELECT * INTO v_troca FROM public.trocas WHERE id = p_troca FOR UPDATE;

    IF v_troca.estado <> 'solicitada' THEN
        RAISE EXCEPTION 'troca_encerrada' USING ERRCODE = '22023';
    END IF;
    IF v_assinatura.usuario_id IS NULL OR v_assinatura.status <> 'ativa' THEN
        RAISE EXCEPTION 'assinatura_inativa' USING ERRCODE = '22023';
    END IF;

    -- Benefício do ciclo vinculado ao pedido: as concluídas não podem ter esgotado o limite
    SELECT trocas_anuais INTO v_limite FROM public.planos WHERE id = v_assinatura.plano_id;
    SELECT count(*) INTO v_concluidas FROM public.trocas
    WHERE usuario_id = v_troca.usuario_id AND ciclo_inicio = v_troca.ciclo_inicio AND estado = 'concluida';
    IF v_concluidas >= v_limite THEN
        RAISE EXCEPTION 'limite_atingido' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_item FROM public.kit_itens
    WHERE usuario_id = v_troca.usuario_id AND camisa_id = v_troca.camisa_original_id FOR UPDATE;
    IF NOT FOUND OR v_item.estado <> 'atual' THEN
        RAISE EXCEPTION 'item_nao_atual' USING ERRCODE = '22023';
    END IF;

    IF v_troca.modalidade = 'tamanho' THEN
        -- Mesmo modelo, outro tamanho
        PERFORM 1 FROM public.estoque
        WHERE camisa_id = v_item.camisa_id AND tamanho = v_troca.tamanho_destino AND quantidade > 0
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'sem_estoque' USING ERRCODE = '22023', HINT = 'tamanho';
        END IF;

        UPDATE public.kit_itens SET tamanho_atual = v_troca.tamanho_destino
        WHERE usuario_id = v_item.usuario_id AND camisa_id = v_item.camisa_id;
        v_substituta := v_item.camisa_id;
    ELSE
        -- Modelo inédito para o cliente, do mesmo grupo do item, sem rival e com saldo
        SELECT * INTO v_perfil FROM public.perfis WHERE usuario_id = v_troca.usuario_id;
        SELECT c.id INTO v_substituta
        FROM public.camisas c
        JOIN public.equipes e ON e.id = c.equipe_id
        JOIN public.estoque es ON es.camisa_id = c.id AND es.tamanho = v_troca.tamanho_destino
        WHERE c.ativo AND e.ativo
          AND (CASE WHEN v_item.grupo = 'especial' THEN c.tipo = 'especial' ELSE c.tipo IN ('clube', 'selecao') END)
          AND NOT (e.natureza = 'clube' AND e.pais_codigo = 'BR')
          AND e.id IS DISTINCT FROM v_perfil.rival_id
          AND es.quantidade > 0
          AND NOT EXISTS (SELECT 1 FROM public.kit_itens ki WHERE ki.usuario_id = v_troca.usuario_id AND ki.camisa_id = c.id)
        -- Sorteio ponderado sem reposição: peso 5 para a equipe preferida, 1 para as demais
        ORDER BY private.chave_sorteio(e.id = v_perfil.equipe_preferida_id)
        LIMIT 1
        FOR UPDATE OF es;
        IF v_substituta IS NULL THEN
            RAISE EXCEPTION 'sem_estoque' USING ERRCODE = '22023', HINT = 'modelo';
        END IF;

        UPDATE public.kit_itens SET estado = 'substituida'
        WHERE usuario_id = v_item.usuario_id AND camisa_id = v_item.camisa_id;
        INSERT INTO public.kit_itens (usuario_id, camisa_id, competencia, posicao, grupo,
                                      tamanho_inicial, tamanho_atual, origem, estado)
        VALUES (v_item.usuario_id, v_substituta, v_item.competencia, v_item.posicao, v_item.grupo,
                v_troca.tamanho_destino, v_troca.tamanho_destino, 'troca', 'atual');
    END IF;

    UPDATE public.estoque
    SET quantidade = quantidade - 1, atualizado_em = now()
    WHERE camisa_id = v_substituta AND tamanho = v_troca.tamanho_destino;

    UPDATE public.trocas
    SET estado = 'concluida', camisa_substituta_id = v_substituta, concluida_em = now()
    WHERE id = p_troca
    RETURNING * INTO v_troca;
    RETURN v_troca;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_concluir_troca(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_concluir_troca(uuid) TO authenticated;

COMMIT;
