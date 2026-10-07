-- Clube do Manto: administração A06–A10, 07/10/2026.
-- Aplicar depois de 006_colecao_catalogo_e_estoque.sql.
--   * consulta de assinantes e detalhes do assinante (A06, A07);
--   * montagem integral do kit mensal (A08);
--   * consulta e processamento das solicitações de troca (A09, A10).
-- Toda leitura e escrita passa por funções SECURITY DEFINER que conferem o papel
-- administrativo no banco. Nenhuma tabela ganha leitura geral pela API.
--
-- Referências exibidas (CL-001, TR-001) são calculadas pela ordem de cadastro do
-- perfil e da solicitação; não há coluna nova. Perfis e trocas não são apagados,
-- então a numeração não muda.
--
-- Propostas operacionais aplicadas aqui (Guia §9, ainda a consolidar):
--   * a equipe preferida tem prioridade entre os modelos elegíveis, sem peso numérico
--     nem garantia; o desempate é aleatório;
--   * a substituta da troca de modelo é escolhida automaticamente na conclusão,
--     no mesmo grupo do item (comum por comum, especial por especial);
--   * sem estoque elegível, a solicitação continua Solicitada, sem baixa parcial;
--   * a camisa devolvida não volta ao estoque (reposição explícita na A05).

BEGIN;

-- ---------------------------------------------------------------
-- Apoio (uso interno)
-- ---------------------------------------------------------------

-- Competência mensal atual no fuso de São Paulo (UC16).
CREATE OR REPLACE FUNCTION private.competencia_atual()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')::date;
$$;

REVOKE ALL ON FUNCTION private.competencia_atual() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.referencia_cliente(p_usuario uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT 'CL-' || lpad(count(*)::text, 3, '0')
    FROM public.perfis o, public.perfis p
    WHERE p.usuario_id = p_usuario
      AND (o.criado_em, o.usuario_id) <= (p.criado_em, p.usuario_id);
$$;

REVOKE ALL ON FUNCTION private.referencia_cliente(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.numero_troca(p_troca uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT 'TR-' || lpad(count(*)::text, 3, '0')
    FROM public.trocas o, public.trocas t
    WHERE t.id = p_troca
      AND (o.solicitada_em, o.id) <= (t.solicitada_em, t.id);
$$;

REVOKE ALL ON FUNCTION private.numero_troca(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.camisa_json(p_camisa bigint)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT jsonb_build_object(
        'id', c.id, 'tipo', c.tipo, 'categoria', c.categoria, 'temporada', c.temporada,
        'ativo', c.ativo, 'equipes', jsonb_build_object('nome', e.nome))
    FROM public.camisas c
    JOIN public.equipes e ON e.id = c.equipe_id
    WHERE c.id = p_camisa;
$$;

REVOKE ALL ON FUNCTION private.camisa_json(bigint) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------
-- A06 — Assinantes: titulares com assinatura, inclusive cancelada
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_assinantes()
RETURNS TABLE (
    usuario_id uuid,
    referencia text,
    nome text,
    plano text,
    status text,
    tamanho text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    PERFORM private.exigir_administrador();
    RETURN QUERY
    WITH numerados AS (
        SELECT p.usuario_id, p.nome, p.tamanho,
               'CL-' || lpad(row_number() OVER (ORDER BY p.criado_em, p.usuario_id)::text, 3, '0') AS referencia
        FROM public.perfis p
    )
    SELECT n.usuario_id, n.referencia, n.nome, pl.nome, a.status, n.tamanho
    FROM numerados n
    JOIN public.assinaturas a ON a.usuario_id = n.usuario_id
    JOIN public.planos pl ON pl.id = a.plano_id
    ORDER BY n.nome, n.referencia;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_assinantes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_assinantes() TO authenticated;

-- ---------------------------------------------------------------
-- A07/A08 — Detalhes do assinante: perfil, assinatura, kits, itens e trocas
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_assinante(p_usuario uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_perfil public.perfis;
    v_competencia date := private.competencia_atual();
BEGIN
    PERFORM private.exigir_administrador();

    SELECT * INTO v_perfil FROM public.perfis WHERE usuario_id = p_usuario;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'assinante_inexistente' USING ERRCODE = 'P0002';
    END IF;

    RETURN jsonb_build_object(
        'usuario_id', v_perfil.usuario_id,
        'referencia', private.referencia_cliente(v_perfil.usuario_id),
        'nome', v_perfil.nome,
        'tamanho', v_perfil.tamanho,
        'preferida', (SELECT nome FROM public.equipes WHERE id = v_perfil.equipe_preferida_id),
        'rival', (SELECT nome FROM public.equipes WHERE id = v_perfil.rival_id),
        'perfil_completo', private.perfil_valido(v_perfil.usuario_id),
        'competencia', v_competencia,
        'kit_do_mes', EXISTS (
            SELECT 1 FROM public.kits WHERE usuario_id = p_usuario AND competencia = v_competencia),
        'assinatura', (
            SELECT jsonb_build_object(
                'status', a.status, 'ativada_em', a.ativada_em, 'cancelada_em', a.cancelada_em,
                'plano', pl.nome, 'plano_ativo', pl.ativo, 'qtd_comuns', pl.qtd_comuns,
                'qtd_especiais', pl.qtd_especiais, 'possui_brinde', pl.possui_brinde,
                'trocas_anuais', pl.trocas_anuais)
            FROM public.assinaturas a
            JOIN public.planos pl ON pl.id = a.plano_id
            WHERE a.usuario_id = p_usuario),
        'kits', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'competencia', k.competencia, 'plano', pl.nome,
                'qtd_comuns_prevista', k.qtd_comuns_prevista, 'qtd_especiais_prevista', k.qtd_especiais_prevista,
                'brinde_previsto', k.brinde_previsto, 'brinde_descricao', k.brinde_descricao,
                'registrado_em', k.registrado_em) ORDER BY k.competencia DESC)
            FROM public.kits k
            JOIN public.planos pl ON pl.id = k.plano_id
            WHERE k.usuario_id = p_usuario), '[]'::jsonb),
        'itens', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'competencia', ki.competencia, 'camisa_id', ki.camisa_id, 'posicao', ki.posicao,
                'grupo', ki.grupo, 'tamanho_inicial', ki.tamanho_inicial, 'tamanho_atual', ki.tamanho_atual,
                'origem', ki.origem, 'estado', ki.estado, 'registrado_em', ki.registrado_em,
                'camisas', private.camisa_json(ki.camisa_id)) ORDER BY ki.competencia DESC, ki.posicao, ki.registrado_em)
            FROM public.kit_itens ki
            WHERE ki.usuario_id = p_usuario), '[]'::jsonb),
        'trocas', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'id', t.id, 'numero', private.numero_troca(t.id), 'modalidade', t.modalidade, 'estado', t.estado,
                'camisa_original_id', t.camisa_original_id, 'camisa_substituta_id', t.camisa_substituta_id,
                'tamanho_original', t.tamanho_original, 'tamanho_destino', t.tamanho_destino,
                'solicitada_em', t.solicitada_em, 'concluida_em', t.concluida_em) ORDER BY t.solicitada_em DESC)
            FROM public.trocas t
            WHERE t.usuario_id = p_usuario), '[]'::jsonb)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_assinante(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_assinante(uuid) TO authenticated;

-- ---------------------------------------------------------------
-- A08 — Montagem do kit mensal (UC16, UC20, UC21, UC22)
-- Operação integral: seleciona, registra o kit e os itens e baixa o estoque na
-- mesma transação. Se o kit da competência já existe, devolve esse registro sem
-- nova seleção nem baixa. Falta de camisas elegíveis recusa o kit inteiro.
-- ---------------------------------------------------------------
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
        ORDER BY (e.id = v_perfil.equipe_preferida_id) DESC, random()
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
            ORDER BY (e.id = v_perfil.equipe_preferida_id) DESC, random()
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

-- ---------------------------------------------------------------
-- A09 — Solicitações de troca de todos os assinantes
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_trocas()
RETURNS TABLE (
    troca_id uuid,
    numero text,
    usuario_id uuid,
    assinante text,
    competencia date,
    plano_kit text,
    posicao smallint,
    equipe text,
    tipo text,
    categoria text,
    temporada text,
    modalidade text,
    tamanho_original text,
    tamanho_destino text,
    estado text,
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
    WITH numeradas AS (
        SELECT t.*, 'TR-' || lpad(row_number() OVER (ORDER BY t.solicitada_em, t.id)::text, 3, '0') AS numero
        FROM public.trocas t
    )
    SELECT n.id, n.numero, n.usuario_id, p.nome, ki.competencia, pl.nome, ki.posicao,
           e.nome, c.tipo, c.categoria, c.temporada,
           n.modalidade, n.tamanho_original, n.tamanho_destino, n.estado, n.solicitada_em
    FROM numeradas n
    JOIN public.perfis p ON p.usuario_id = n.usuario_id
    JOIN public.kit_itens ki ON ki.usuario_id = n.usuario_id AND ki.camisa_id = n.camisa_original_id
    JOIN public.kits k ON k.usuario_id = ki.usuario_id AND k.competencia = ki.competencia
    JOIN public.planos pl ON pl.id = k.plano_id
    JOIN public.camisas c ON c.id = n.camisa_original_id
    JOIN public.equipes e ON e.id = c.equipe_id
    ORDER BY (n.estado = 'solicitada') DESC, n.solicitada_em DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_trocas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_trocas() TO authenticated;

-- ---------------------------------------------------------------
-- A10 — Uma solicitação com solicitante, assinatura, kit e itens
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_troca(p_troca uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_troca public.trocas;
    v_item public.kit_itens;
BEGIN
    PERFORM private.exigir_administrador();

    SELECT * INTO v_troca FROM public.trocas WHERE id = p_troca;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'troca_inexistente' USING ERRCODE = 'P0002';
    END IF;
    SELECT * INTO v_item FROM public.kit_itens
    WHERE usuario_id = v_troca.usuario_id AND camisa_id = v_troca.camisa_original_id;

    RETURN jsonb_build_object(
        'id', v_troca.id,
        'numero', private.numero_troca(v_troca.id),
        'modalidade', v_troca.modalidade,
        'estado', v_troca.estado,
        'tamanho_original', v_troca.tamanho_original,
        'tamanho_destino', v_troca.tamanho_destino,
        'solicitada_em', v_troca.solicitada_em,
        'concluida_em', v_troca.concluida_em,
        'assinante', (
            SELECT jsonb_build_object(
                'usuario_id', p.usuario_id, 'nome', p.nome,
                'referencia', private.referencia_cliente(p.usuario_id),
                'rival', (SELECT nome FROM public.equipes WHERE id = p.rival_id))
            FROM public.perfis p WHERE p.usuario_id = v_troca.usuario_id),
        'assinatura', (
            SELECT jsonb_build_object('status', a.status, 'plano', pl.nome, 'trocas_anuais', pl.trocas_anuais)
            FROM public.assinaturas a JOIN public.planos pl ON pl.id = a.plano_id
            WHERE a.usuario_id = v_troca.usuario_id),
        'kit', (
            SELECT jsonb_build_object('competencia', k.competencia, 'plano', pl.nome)
            FROM public.kits k JOIN public.planos pl ON pl.id = k.plano_id
            WHERE k.usuario_id = v_item.usuario_id AND k.competencia = v_item.competencia),
        'item', jsonb_build_object(
            'posicao', v_item.posicao, 'grupo', v_item.grupo, 'estado', v_item.estado,
            'camisas', private.camisa_json(v_item.camisa_id)),
        'substituta', CASE WHEN v_troca.camisa_substituta_id IS NULL THEN NULL
                           ELSE private.camisa_json(v_troca.camisa_substituta_id) END
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_troca(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_troca(uuid) TO authenticated;

-- ---------------------------------------------------------------
-- A10 — Concluir troca (UC17)
-- Revalida pedido, assinatura, benefício do ciclo e item; define a substituta e
-- registra a substituição com a baixa de estoque em uma só operação. Sem estoque
-- elegível, nada muda e o pedido continua Solicitada.
-- ---------------------------------------------------------------
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
        ORDER BY (e.id = v_perfil.equipe_preferida_id) DESC, random()
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

-- ---------------------------------------------------------------
-- A10 — Rejeitar solicitação: registra só o estado (sem motivo nem data no modelo)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_rejeitar_troca(p_troca uuid)
RETURNS public.trocas
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_troca public.trocas;
BEGIN
    PERFORM private.exigir_administrador();

    SELECT * INTO v_troca FROM public.trocas WHERE id = p_troca FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'troca_inexistente' USING ERRCODE = 'P0002';
    END IF;
    IF v_troca.estado <> 'solicitada' THEN
        RAISE EXCEPTION 'troca_encerrada' USING ERRCODE = '22023';
    END IF;

    UPDATE public.trocas SET estado = 'rejeitada' WHERE id = p_troca RETURNING * INTO v_troca;
    RETURN v_troca;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_rejeitar_troca(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_rejeitar_troca(uuid) TO authenticated;

COMMIT;
