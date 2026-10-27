-- Clube do Manto: simulação dos kits dos próximos meses, 27/10/2026.
-- Aplicar depois de 010_peso_do_sorteio.sql.
--   * pedido do autor: prever, sem gravar, como ficariam os kits dos meses seguintes
--     de um assinante (prévia na A07);
--   * mesmo sorteio e mesmos filtros de admin_montar_kit(): catálogo ativo, sem
--     clube brasileiro, sem rival, sem modelo já registrado, com saldo no tamanho
--     do perfil e peso 5 para a equipe preferida;
--   * um mês simulado conta como registrado para os meses seguintes (não repete
--     modelo dentro da simulação);
--   * somente leitura: não grava kit, não baixa estoque, não trava linhas. Não
--     considera kits de outros assinantes, reposições nem trocas futuras;
--   * começa no mês atual quando ele ainda não tem kit; senão, no mês seguinte
--     ao último kit registrado. Para no primeiro mês sem estoque suficiente.

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_simular_kits(p_usuario uuid, p_meses integer DEFAULT 3)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_assinatura public.assinaturas;
    v_perfil public.perfis;
    v_plano public.planos;
    v_competencia date;
    v_usadas bigint[];
    v_comuns bigint[];
    v_especiais bigint[];
    v_itens jsonb;
    v_meses jsonb := '[]';
    v_interrupcao jsonb := NULL;
    v_posicao integer;
    v_camisa bigint;
BEGIN
    PERFORM private.exigir_administrador();

    IF p_meses IS NULL OR p_meses < 1 OR p_meses > 12 THEN
        RAISE EXCEPTION 'meses_invalidos' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_assinatura FROM public.assinaturas WHERE usuario_id = p_usuario;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'assinatura_inexistente' USING ERRCODE = 'P0002';
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

    SELECT greatest(private.competencia_atual(), (max(competencia) + interval '1 month')::date)
    INTO v_competencia
    FROM public.kits WHERE usuario_id = p_usuario;
    v_competencia := coalesce(v_competencia, private.competencia_atual());

    SELECT coalesce(array_agg(camisa_id), '{}') INTO v_usadas
    FROM public.kit_itens WHERE usuario_id = p_usuario;

    FOR i IN 1..p_meses LOOP
        SELECT coalesce(array_agg(id), '{}') INTO v_comuns FROM (
            SELECT c.id
            FROM public.camisas c
            JOIN public.equipes e ON e.id = c.equipe_id
            JOIN public.estoque es ON es.camisa_id = c.id AND es.tamanho = v_perfil.tamanho
            WHERE c.ativo AND e.ativo
              AND c.tipo IN ('clube', 'selecao')
              AND NOT (e.natureza = 'clube' AND e.pais_codigo = 'BR')
              AND e.id <> v_perfil.rival_id
              AND es.quantidade > 0
              AND NOT (c.id = ANY (v_usadas))
            ORDER BY private.chave_sorteio(e.id = v_perfil.equipe_preferida_id)
            LIMIT v_plano.qtd_comuns
        ) s;
        IF array_length(v_comuns, 1) IS DISTINCT FROM v_plano.qtd_comuns::integer THEN
            v_interrupcao := jsonb_build_object('competencia', v_competencia, 'motivo', 'estoque_insuficiente', 'grupo', 'comum');
            EXIT;
        END IF;

        v_especiais := '{}';
        IF v_plano.qtd_especiais > 0 THEN
            SELECT coalesce(array_agg(id), '{}') INTO v_especiais FROM (
                SELECT c.id
                FROM public.camisas c
                JOIN public.equipes e ON e.id = c.equipe_id
                JOIN public.estoque es ON es.camisa_id = c.id AND es.tamanho = v_perfil.tamanho
                WHERE c.ativo AND e.ativo
                  AND c.tipo = 'especial'
                  AND NOT (e.natureza = 'clube' AND e.pais_codigo = 'BR')
                  AND e.id <> v_perfil.rival_id
                  AND es.quantidade > 0
                  AND NOT (c.id = ANY (v_usadas))
                ORDER BY private.chave_sorteio(e.id = v_perfil.equipe_preferida_id)
                LIMIT v_plano.qtd_especiais
            ) s;
            IF array_length(v_especiais, 1) IS DISTINCT FROM v_plano.qtd_especiais::integer THEN
                v_interrupcao := jsonb_build_object('competencia', v_competencia, 'motivo', 'estoque_insuficiente', 'grupo', 'especial');
                EXIT;
            END IF;
        END IF;

        v_itens := '[]';
        v_posicao := 0;
        FOREACH v_camisa IN ARRAY v_comuns || v_especiais LOOP
            v_posicao := v_posicao + 1;
            v_itens := v_itens || jsonb_build_object(
                'posicao', v_posicao,
                'grupo', CASE WHEN v_posicao > v_plano.qtd_comuns THEN 'especial' ELSE 'comum' END,
                'tamanho_atual', v_perfil.tamanho,
                'camisas', private.camisa_json(v_camisa));
        END LOOP;

        v_meses := v_meses || jsonb_build_object(
            'competencia', v_competencia,
            'plano', v_plano.nome,
            'qtd_comuns_prevista', v_plano.qtd_comuns,
            'qtd_especiais_prevista', v_plano.qtd_especiais,
            'brinde_previsto', v_plano.possui_brinde,
            'itens', v_itens);

        v_usadas := v_usadas || v_comuns || v_especiais;
        v_competencia := (v_competencia + interval '1 month')::date;
    END LOOP;

    RETURN jsonb_build_object('meses', v_meses, 'interrupcao', v_interrupcao);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_simular_kits(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_simular_kits(uuid, integer) TO authenticated;

COMMIT;
