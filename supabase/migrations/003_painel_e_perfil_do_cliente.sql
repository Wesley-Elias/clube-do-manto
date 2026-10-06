-- Clube do Manto: acesso para C01 (Painel) e C02 (Preferências e Meu perfil), 06/10/2026.
-- Aplicar depois de 002_acesso_publico_e_autenticacao.sql.
--   * lista de equipes (clubes internacionais e seleções; sem clubes brasileiros);
--   * tamanhos oferecidos no perfil;
--   * gravação do perfil por uma função que valida as regras;
--   * leitura dos próprios kits, itens e trocas e do catálogo de camisas.
-- Assinatura, montagem de kits e trocas continuam sem escrita pela API.

BEGIN;

-- ---------------------------------------------------------------
-- Equipes provisórias do perfil (Guia §9: alcance da lista ainda pendente)
-- ---------------------------------------------------------------
INSERT INTO public.equipes (nome, pais_codigo, natureza)
SELECT v.nome, v.pais, v.natureza
FROM (VALUES
    ('Real Madrid', 'ES', 'clube'),
    ('Barcelona', 'ES', 'clube'),
    ('Atlético de Madrid', 'ES', 'clube'),
    ('Milan', 'IT', 'clube'),
    ('Inter de Milão', 'IT', 'clube'),
    ('Juventus', 'IT', 'clube'),
    ('Napoli', 'IT', 'clube'),
    ('Roma', 'IT', 'clube'),
    ('Liverpool', 'GB', 'clube'),
    ('Manchester United', 'GB', 'clube'),
    ('Manchester City', 'GB', 'clube'),
    ('Arsenal', 'GB', 'clube'),
    ('Chelsea', 'GB', 'clube'),
    ('Tottenham', 'GB', 'clube'),
    ('Bayern de Munique', 'DE', 'clube'),
    ('Borussia Dortmund', 'DE', 'clube'),
    ('Bayer Leverkusen', 'DE', 'clube'),
    ('Paris Saint-Germain', 'FR', 'clube'),
    ('Olympique de Marseille', 'FR', 'clube'),
    ('Ajax', 'NL', 'clube'),
    ('PSV', 'NL', 'clube'),
    ('Feyenoord', 'NL', 'clube'),
    ('Benfica', 'PT', 'clube'),
    ('Porto', 'PT', 'clube'),
    ('Sporting', 'PT', 'clube'),
    ('Boca Juniors', 'AR', 'clube'),
    ('River Plate', 'AR', 'clube'),
    ('Brasil', 'BR', 'selecao'),
    ('Argentina', 'AR', 'selecao'),
    ('Uruguai', 'UY', 'selecao'),
    ('Colômbia', 'CO', 'selecao'),
    ('Alemanha', 'DE', 'selecao'),
    ('França', 'FR', 'selecao'),
    ('Espanha', 'ES', 'selecao'),
    ('Itália', 'IT', 'selecao'),
    ('Inglaterra', 'GB', 'selecao'),
    ('Portugal', 'PT', 'selecao'),
    ('Holanda', 'NL', 'selecao'),
    ('Bélgica', 'BE', 'selecao'),
    ('Croácia', 'HR', 'selecao'),
    ('México', 'MX', 'selecao'),
    ('Estados Unidos', 'US', 'selecao'),
    ('Japão', 'JP', 'selecao'),
    ('Marrocos', 'MA', 'selecao')
) AS v(nome, pais, natureza)
WHERE NOT EXISTS (
    SELECT 1 FROM public.equipes e
    WHERE lower(e.nome) = lower(v.nome) AND e.pais_codigo = v.pais AND e.natureza = v.natureza
);

GRANT SELECT ON TABLE public.equipes TO anon, authenticated;
CREATE POLICY equipes_leitura_publica ON public.equipes
    FOR SELECT TO anon, authenticated
    USING (true);

-- Catálogo de camisas: leitura pública (P04 e itens dos kits)
GRANT SELECT ON TABLE public.camisas TO anon, authenticated;
CREATE POLICY camisas_leitura_publica ON public.camisas
    FOR SELECT TO anon, authenticated
    USING (true);

-- ---------------------------------------------------------------
-- Tamanhos oferecidos no perfil
-- Os tamanhos com saldo no estoque de camisas ativas formam a lista. Enquanto o
-- estoque estiver vazio, vale uma lista provisória (Guia §9: lista oficial pendente).
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tamanhos_do_catalogo()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    WITH do_estoque AS (
        SELECT DISTINCT es.tamanho
        FROM public.estoque es
        JOIN public.camisas c ON c.id = es.camisa_id AND c.ativo
    ),
    provisoria(tamanho) AS (
        VALUES ('P'), ('M'), ('G'), ('GG')
    ),
    lista AS (
        SELECT tamanho FROM do_estoque
        UNION ALL
        SELECT tamanho FROM provisoria WHERE NOT EXISTS (SELECT 1 FROM do_estoque)
    )
    SELECT tamanho FROM lista
    ORDER BY array_position(ARRAY['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG'], tamanho) NULLS LAST, tamanho;
$$;

REVOKE ALL ON FUNCTION public.tamanhos_do_catalogo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tamanhos_do_catalogo() TO anon, authenticated;

-- ---------------------------------------------------------------
-- Gravação do próprio perfil (C02)
-- Valida nome, tamanho da lista, equipes ativas e favorita diferente da rival.
-- Altera só o perfil: kits e histórico já registrados mantêm seus dados.
-- Erros sobem com mensagens fixas que a tela traduz.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.salvar_perfil(
    p_tamanho text,
    p_equipe_preferida_id bigint,
    p_rival_id bigint,
    p_nome text DEFAULT NULL
)
RETURNS public.perfis
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_usuario uuid := (SELECT auth.uid());
    v_tamanho text := upper(btrim(coalesce(p_tamanho, '')));
    v_nome text := btrim(coalesce(p_nome, ''));
    v_perfil public.perfis;
BEGIN
    IF v_usuario IS NULL THEN
        RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '28000';
    END IF;
    IF p_nome IS NOT NULL AND v_nome = '' THEN
        RAISE EXCEPTION 'nome_obrigatorio' USING ERRCODE = '22023';
    END IF;
    IF v_tamanho = '' OR NOT EXISTS (
        SELECT 1 FROM public.tamanhos_do_catalogo() t WHERE t = v_tamanho
    ) THEN
        RAISE EXCEPTION 'tamanho_invalido' USING ERRCODE = '22023';
    END IF;
    IF p_equipe_preferida_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.equipes WHERE id = p_equipe_preferida_id AND ativo
    ) THEN
        RAISE EXCEPTION 'favorita_invalida' USING ERRCODE = '22023';
    END IF;
    IF p_rival_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.equipes WHERE id = p_rival_id AND ativo
    ) THEN
        RAISE EXCEPTION 'rival_invalida' USING ERRCODE = '22023';
    END IF;
    IF p_equipe_preferida_id = p_rival_id THEN
        RAISE EXCEPTION 'equipes_iguais' USING ERRCODE = '22023';
    END IF;

    UPDATE public.perfis
    SET nome = CASE WHEN p_nome IS NULL THEN nome ELSE v_nome END,
        tamanho = v_tamanho,
        equipe_preferida_id = p_equipe_preferida_id,
        rival_id = p_rival_id,
        atualizado_em = now()
    WHERE usuario_id = v_usuario
    RETURNING * INTO v_perfil;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'perfil_inexistente' USING ERRCODE = 'P0002';
    END IF;
    RETURN v_perfil;
END;
$$;

REVOKE ALL ON FUNCTION public.salvar_perfil(text, bigint, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_perfil(text, bigint, bigint, text) TO authenticated;

-- ---------------------------------------------------------------
-- Leitura dos próprios kits, itens e trocas (C01)
-- ---------------------------------------------------------------
GRANT SELECT ON TABLE public.kits TO authenticated;
CREATE POLICY kits_leitura_propria ON public.kits
    FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = usuario_id);

GRANT SELECT ON TABLE public.kit_itens TO authenticated;
CREATE POLICY kit_itens_leitura_propria ON public.kit_itens
    FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = usuario_id);

GRANT SELECT ON TABLE public.trocas TO authenticated;
CREATE POLICY trocas_leitura_propria ON public.trocas
    FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = usuario_id);

COMMIT;
