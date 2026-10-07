-- Clube do Manto: coleção pública (P04) e administração A01–A05, 06/10/2026.
-- Aplicar depois de 005_assinatura_e_trocas_do_cliente.sql.
--   * modelos demonstrativos para a coleção (os mesmos do design final);
--   * leitura do estoque e das solicitações em aberto só para administradores;
--   * cadastro e edição de equipes e camisas por funções que validam as regras;
--   * cadastro de saldo e reposição de estoque (sem baixa arbitrária).
-- Toda escrita passa por funções SECURITY DEFINER que conferem o papel no banco.
-- Erros sobem com mensagens fixas que a tela traduz.

BEGIN;

-- ---------------------------------------------------------------
-- Papel administrativo exigido pelas funções abaixo
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.exigir_administrador()
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
    IF (SELECT auth.uid()) IS NULL THEN
        RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '28000';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM private.administradores WHERE usuario_id = (SELECT auth.uid())
    ) THEN
        RAISE EXCEPTION 'sem_autorizacao' USING ERRCODE = '42501';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.exigir_administrador() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------
-- Modelos demonstrativos da coleção (P04). São os modelos do design final,
-- marcados na descrição; o administrador pode editá-los ou inativá-los.
-- ---------------------------------------------------------------
INSERT INTO public.camisas (equipe_id, tipo, categoria, temporada, descricao)
SELECT e.id, v.tipo, v.categoria, v.temporada, 'Modelo demonstrativo do protótipo.'
FROM (VALUES
    ('Real Madrid', 'clube', 'clube', 'Home', '2025/2026'),
    ('Ajax', 'clube', 'clube', 'Away', '2022/2023'),
    ('Bayern de Munique', 'clube', 'clube', 'Away', '2025/2026'),
    ('Brasil', 'selecao', 'selecao', 'Home', '2026'),
    ('Itália', 'selecao', 'selecao', 'Third', '2024/2025'),
    ('Itália', 'selecao', 'especial', 'Home', '1994')
) AS v(equipe, natureza, tipo, categoria, temporada)
JOIN public.equipes e ON e.nome = v.equipe AND e.natureza = v.natureza
ON CONFLICT ON CONSTRAINT uq_camisas_modelo DO NOTHING;

-- ---------------------------------------------------------------
-- Leitura administrativa
-- ---------------------------------------------------------------
GRANT SELECT ON TABLE public.estoque TO authenticated;
CREATE POLICY estoque_leitura_administrador ON public.estoque
    FOR SELECT TO authenticated
    USING ((SELECT public.eh_administrador()));

-- A01: solicitações em Solicitada com o nome do assinante, o kit e a camisa.
CREATE OR REPLACE FUNCTION public.admin_trocas_em_aberto()
RETURNS TABLE (
    troca_id uuid,
    assinante text,
    competencia date,
    posicao smallint,
    equipe text,
    categoria text,
    temporada text,
    tamanho_original text,
    modalidade text,
    solicitada_em timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    PERFORM private.exigir_administrador();
    RETURN QUERY
    SELECT t.id, p.nome, ki.competencia, ki.posicao, e.nome, c.categoria, c.temporada,
           t.tamanho_original, t.modalidade, t.solicitada_em
    FROM public.trocas t
    JOIN public.perfis p ON p.usuario_id = t.usuario_id
    JOIN public.kit_itens ki ON ki.usuario_id = t.usuario_id AND ki.camisa_id = t.camisa_original_id
    JOIN public.camisas c ON c.id = t.camisa_original_id
    JOIN public.equipes e ON e.id = c.equipe_id
    WHERE t.estado = 'solicitada'
    ORDER BY t.solicitada_em;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_trocas_em_aberto() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_trocas_em_aberto() TO authenticated;

-- ---------------------------------------------------------------
-- Uso de equipes e camisas (campos bloqueados em A03 e A04)
-- ---------------------------------------------------------------

-- Modelo usado: já entrou em algum kit (como item original ou substituto).
CREATE OR REPLACE FUNCTION private.camisa_em_uso(p_camisa bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT EXISTS (SELECT 1 FROM public.kit_itens WHERE camisa_id = p_camisa)
        OR EXISTS (SELECT 1 FROM public.trocas WHERE camisa_substituta_id = p_camisa);
$$;

REVOKE ALL ON FUNCTION private.camisa_em_uso(bigint) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_uso_da_camisa(p_camisa bigint)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    PERFORM private.exigir_administrador();
    RETURN private.camisa_em_uso(p_camisa);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_uso_da_camisa(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_uso_da_camisa(bigint) TO authenticated;

-- tem_camisas: a natureza não muda (a classificação das camisas depende dela).
-- tem_historico: alguma camisa da equipe já entrou em kit; nome e país também não mudam.
CREATE OR REPLACE FUNCTION public.admin_uso_da_equipe(p_equipe bigint)
RETURNS TABLE (tem_camisas boolean, tem_historico boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    PERFORM private.exigir_administrador();
    RETURN QUERY
    SELECT EXISTS (SELECT 1 FROM public.camisas WHERE equipe_id = p_equipe),
           EXISTS (SELECT 1 FROM public.camisas c WHERE c.equipe_id = p_equipe AND private.camisa_em_uso(c.id));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_uso_da_equipe(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_uso_da_equipe(bigint) TO authenticated;

-- ---------------------------------------------------------------
-- A03 — Cadastro e edição de equipe
-- p_id nulo cadastra; informado, edita. Equipes não são apagadas, só inativadas.
-- ---------------------------------------------------------------
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
    -- Clube brasileiro não fornece camisas ao catálogo
    IF v_tem_camisas AND p_natureza = 'clube' AND v_pais = 'BR' THEN
        RAISE EXCEPTION 'clube_brasileiro' USING ERRCODE = '22023';
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

-- ---------------------------------------------------------------
-- A04 — Cadastro e edição de camisa
-- Modelo usado não tem equipe, tipo, categoria ou temporada redefinidos.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_salvar_camisa(
    p_id bigint,
    p_equipe_id bigint,
    p_tipo text,
    p_categoria text,
    p_temporada text,
    p_descricao text DEFAULT NULL,
    p_ativo boolean DEFAULT true
)
RETURNS public.camisas
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_temporada text := btrim(coalesce(p_temporada, ''));
    v_descricao text := nullif(btrim(coalesce(p_descricao, '')), '');
    v_equipe public.equipes;
    v_atual public.camisas;
    v_resultado public.camisas;
    v_identidade_muda boolean;
BEGIN
    PERFORM private.exigir_administrador();

    SELECT * INTO v_equipe FROM public.equipes WHERE id = p_equipe_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'equipe_invalida' USING ERRCODE = '22023';
    END IF;
    IF p_tipo IS NULL OR p_tipo NOT IN ('clube', 'selecao', 'especial') THEN
        RAISE EXCEPTION 'tipo_invalido' USING ERRCODE = '22023';
    END IF;
    IF p_categoria IS NULL OR p_categoria NOT IN ('Home', 'Away', 'Third') THEN
        RAISE EXCEPTION 'categoria_invalida' USING ERRCODE = '22023';
    END IF;
    IF v_temporada !~ '^[0-9]{4}(/[0-9]{4})?$' THEN
        RAISE EXCEPTION 'temporada_invalida' USING ERRCODE = '22023';
    END IF;
    IF v_descricao IS NOT NULL AND length(v_descricao) > 280 THEN
        RAISE EXCEPTION 'descricao_longa' USING ERRCODE = '22023';
    END IF;

    -- Classificação coerente: camisa de clube vem de clube; de seleção, de seleção.
    -- Especial pode ser de qualquer equipe permitida.
    IF (p_tipo = 'clube' AND v_equipe.natureza <> 'clube')
       OR (p_tipo = 'selecao' AND v_equipe.natureza <> 'selecao') THEN
        RAISE EXCEPTION 'classificacao_incoerente' USING ERRCODE = '22023';
    END IF;
    -- Clubes brasileiros ficam fora do catálogo, inclusive nas especiais
    IF v_equipe.natureza = 'clube' AND v_equipe.pais_codigo = 'BR' THEN
        RAISE EXCEPTION 'clube_brasileiro' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.camisas
        WHERE equipe_id = p_equipe_id AND temporada = v_temporada AND categoria = p_categoria
          AND id IS DISTINCT FROM p_id
    ) THEN
        RAISE EXCEPTION 'modelo_duplicado' USING ERRCODE = '23505';
    END IF;

    IF p_id IS NULL THEN
        IF NOT v_equipe.ativo THEN
            RAISE EXCEPTION 'equipe_inativa' USING ERRCODE = '22023';
        END IF;
        INSERT INTO public.camisas (equipe_id, tipo, categoria, temporada, descricao, ativo)
        VALUES (p_equipe_id, p_tipo, p_categoria, v_temporada, v_descricao, true)
        RETURNING * INTO v_resultado;
        RETURN v_resultado;
    END IF;

    SELECT * INTO v_atual FROM public.camisas WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'camisa_inexistente' USING ERRCODE = 'P0002';
    END IF;

    v_identidade_muda := p_equipe_id <> v_atual.equipe_id OR p_tipo <> v_atual.tipo
        OR p_categoria <> v_atual.categoria OR v_temporada <> v_atual.temporada;
    IF v_identidade_muda AND private.camisa_em_uso(p_id) THEN
        RAISE EXCEPTION 'modelo_em_uso' USING ERRCODE = '22023';
    END IF;
    IF (p_equipe_id <> v_atual.equipe_id OR (coalesce(p_ativo, true) AND NOT v_atual.ativo))
       AND NOT v_equipe.ativo THEN
        RAISE EXCEPTION 'equipe_inativa' USING ERRCODE = '22023';
    END IF;

    UPDATE public.camisas
    SET equipe_id = p_equipe_id, tipo = p_tipo, categoria = p_categoria, temporada = v_temporada,
        descricao = v_descricao, ativo = coalesce(p_ativo, ativo)
    WHERE id = p_id
    RETURNING * INTO v_resultado;
    RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_salvar_camisa(bigint, bigint, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_salvar_camisa(bigint, bigint, text, text, text, text, boolean) TO authenticated;

-- ---------------------------------------------------------------
-- A02 — Inativar (confirmação na tela). Reativar acontece na edição.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_inativar_equipe(p_id bigint)
RETURNS public.equipes
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_resultado public.equipes;
BEGIN
    PERFORM private.exigir_administrador();
    UPDATE public.equipes SET ativo = false WHERE id = p_id RETURNING * INTO v_resultado;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'equipe_inexistente' USING ERRCODE = 'P0002';
    END IF;
    RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_inativar_equipe(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_inativar_equipe(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_inativar_camisa(p_id bigint)
RETURNS public.camisas
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_resultado public.camisas;
BEGIN
    PERFORM private.exigir_administrador();
    UPDATE public.camisas SET ativo = false WHERE id = p_id RETURNING * INTO v_resultado;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'camisa_inexistente' USING ERRCODE = 'P0002';
    END IF;
    RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_inativar_camisa(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_inativar_camisa(bigint) TO authenticated;

-- ---------------------------------------------------------------
-- A05 — Estoque: cadastrar saldo de um tamanho novo e repor unidades.
-- Não há baixa arbitrária: kits e trocas baixam o estoque nas próprias operações.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_cadastrar_saldo(
    p_camisa_id bigint,
    p_tamanho text,
    p_quantidade integer
)
RETURNS public.estoque
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tamanho text := upper(btrim(coalesce(p_tamanho, '')));
    v_camisa public.camisas;
    v_resultado public.estoque;
BEGIN
    PERFORM private.exigir_administrador();

    SELECT * INTO v_camisa FROM public.camisas WHERE id = p_camisa_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'camisa_inexistente' USING ERRCODE = 'P0002';
    END IF;
    IF NOT v_camisa.ativo THEN
        RAISE EXCEPTION 'camisa_inativa' USING ERRCODE = '22023';
    END IF;
    IF v_tamanho NOT IN ('P', 'M', 'G', 'GG') THEN
        RAISE EXCEPTION 'tamanho_invalido' USING ERRCODE = '22023';
    END IF;
    IF p_quantidade IS NULL OR p_quantidade < 0 OR p_quantidade > 10000 THEN
        RAISE EXCEPTION 'quantidade_invalida' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.estoque (camisa_id, tamanho, quantidade, atualizado_em)
    VALUES (p_camisa_id, v_tamanho, p_quantidade, now())
    ON CONFLICT (camisa_id, tamanho) DO NOTHING
    RETURNING * INTO v_resultado;

    IF v_resultado IS NULL THEN
        RAISE EXCEPTION 'tamanho_ja_registrado' USING ERRCODE = '23505';
    END IF;
    RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_cadastrar_saldo(bigint, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cadastrar_saldo(bigint, text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_repor_estoque(
    p_camisa_id bigint,
    p_tamanho text,
    p_quantidade integer
)
RETURNS public.estoque
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tamanho text := upper(btrim(coalesce(p_tamanho, '')));
    v_resultado public.estoque;
BEGIN
    PERFORM private.exigir_administrador();

    IF p_quantidade IS NULL OR p_quantidade < 1 OR p_quantidade > 10000 THEN
        RAISE EXCEPTION 'quantidade_invalida' USING ERRCODE = '22023';
    END IF;

    UPDATE public.estoque
    SET quantidade = quantidade + p_quantidade, atualizado_em = now()
    WHERE camisa_id = p_camisa_id AND tamanho = v_tamanho
    RETURNING * INTO v_resultado;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'saldo_inexistente' USING ERRCODE = 'P0002';
    END IF;
    RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_repor_estoque(bigint, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_repor_estoque(bigint, text, integer) TO authenticated;

COMMIT;
