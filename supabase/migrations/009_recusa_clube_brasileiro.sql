-- Clube do Manto: A03 recusa clube brasileiro, 07/10/2026.
-- Aplicar depois de 008_foto_da_camisa.sql.
--   * decisão do autor: clubes brasileiros não são cadastrados; a seleção
--     brasileira continua permitida;
--   * admin_salvar_equipe() recusa clube com país BR no cadastro e na edição,
--     tenha ou não camisas;
--   * a tabela equipes ganha a mesma regra como restrição.

BEGIN;

ALTER TABLE public.equipes
    ADD CONSTRAINT equipes_sem_clube_brasileiro
        CHECK (NOT (natureza = 'clube' AND pais_codigo = 'BR'));

CREATE OR REPLACE FUNCTION public.admin_salvar_equipe(
    p_id bigint,
    p_nome text,
    p_pais text,
    p_natureza text,
    p_ativo boolean DEFAULT true
)
RETURNS public.equipes
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_nome text := btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g'));
    v_pais text := upper(btrim(coalesce(p_pais, '')));
    v_atual public.equipes;
    v_resultado public.equipes;
    v_tem_camisas boolean := false;
    v_tem_historico boolean := false;
BEGIN
    PERFORM private.exigir_administrador();

    IF v_nome = '' OR length(v_nome) > 80 THEN
        RAISE EXCEPTION 'nome_invalido' USING ERRCODE = '22023';
    END IF;
    IF v_pais !~ '^[A-Z]{2}$' THEN
        RAISE EXCEPTION 'pais_invalido' USING ERRCODE = '22023';
    END IF;
    IF p_natureza IS NULL OR p_natureza NOT IN ('clube', 'selecao') THEN
        RAISE EXCEPTION 'natureza_invalida' USING ERRCODE = '22023';
    END IF;
    -- Clubes brasileiros não são cadastrados; a seleção brasileira é permitida
    IF p_natureza = 'clube' AND v_pais = 'BR' THEN
        RAISE EXCEPTION 'clube_brasileiro' USING ERRCODE = '22023';
    END IF;

    -- Registro equivalente: mesmo nome (sem diferenciar maiúsculas), país e natureza
    IF EXISTS (
        SELECT 1 FROM public.equipes
        WHERE lower(nome) = lower(v_nome) AND pais_codigo = v_pais AND natureza = p_natureza
          AND id IS DISTINCT FROM p_id
    ) THEN
        RAISE EXCEPTION 'equipe_equivalente' USING ERRCODE = '23505';
    END IF;

    IF p_id IS NULL THEN
        INSERT INTO public.equipes (nome, pais_codigo, natureza, ativo)
        VALUES (v_nome, v_pais, p_natureza, true)
        RETURNING * INTO v_resultado;
        RETURN v_resultado;
    END IF;

    SELECT * INTO v_atual FROM public.equipes WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'equipe_inexistente' USING ERRCODE = 'P0002';
    END IF;

    SELECT u.tem_camisas, u.tem_historico INTO v_tem_camisas, v_tem_historico
    FROM public.admin_uso_da_equipe(p_id) u;

    IF v_tem_camisas AND p_natureza <> v_atual.natureza THEN
        RAISE EXCEPTION 'natureza_bloqueada' USING ERRCODE = '22023';
    END IF;
    IF v_tem_historico AND (v_nome <> v_atual.nome OR v_pais <> v_atual.pais_codigo) THEN
        RAISE EXCEPTION 'equipe_com_historico' USING ERRCODE = '22023';
    END IF;

    UPDATE public.equipes
    SET nome = v_nome, pais_codigo = v_pais, natureza = p_natureza, ativo = coalesce(p_ativo, ativo)
    WHERE id = p_id
    RETURNING * INTO v_resultado;
    RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_salvar_equipe(bigint, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_salvar_equipe(bigint, text, text, text, boolean) TO authenticated;

COMMIT;
