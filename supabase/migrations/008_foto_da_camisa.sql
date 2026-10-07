-- Clube do Manto: foto opcional por modelo de camisa, 07/10/2026.
-- Aplicar depois de 007_assinantes_kits_e_trocas_admin.sql.
--   * camisas.imagem guarda o caminho da foto no bucket "camisas" (ou NULL);
--   * o bucket é público para leitura (galeria e kits); só administradores
--     enviam e apagam arquivos;
--   * a foto do modelo muda só por admin_definir_imagem_camisa(), que confere
--     se o arquivo existe e pertence à camisa.
-- Sem foto, o site continua mostrando a ilustração genérica.

BEGIN;

ALTER TABLE public.camisas
    ADD COLUMN IF NOT EXISTS imagem text
    CONSTRAINT camisas_imagem_formato
        CHECK (imagem IS NULL OR imagem ~ '^[0-9]+/[A-Za-z0-9_-]+\.(jpg|png|webp)$');

-- Bucket público: JPG, PNG ou WebP de até 2 MB
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('camisas', 'camisas', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Envio, consulta e remoção de arquivos só para administradores. A leitura das
-- fotos pelo endereço público do bucket não depende destas políticas.
DROP POLICY IF EXISTS camisas_fotos_admin_envio ON storage.objects;
CREATE POLICY camisas_fotos_admin_envio ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'camisas' AND public.eh_administrador());

DROP POLICY IF EXISTS camisas_fotos_admin_leitura ON storage.objects;
CREATE POLICY camisas_fotos_admin_leitura ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'camisas' AND public.eh_administrador());

DROP POLICY IF EXISTS camisas_fotos_admin_remocao ON storage.objects;
CREATE POLICY camisas_fotos_admin_remocao ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'camisas' AND public.eh_administrador());

-- ---------------------------------------------------------------
-- A04 — Definir ou remover a foto do modelo
-- O arquivo precisa estar na pasta da própria camisa ("<id>/...") e já enviado.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_definir_imagem_camisa(p_id bigint, p_imagem text)
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

    PERFORM 1 FROM public.camisas WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'camisa_inexistente' USING ERRCODE = 'P0002';
    END IF;

    IF p_imagem IS NOT NULL THEN
        IF p_imagem !~ '^[0-9]+/[A-Za-z0-9_-]+\.(jpg|png|webp)$'
           OR split_part(p_imagem, '/', 1) <> p_id::text THEN
            RAISE EXCEPTION 'imagem_invalida' USING ERRCODE = '22023';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'camisas' AND name = p_imagem) THEN
            RAISE EXCEPTION 'imagem_inexistente' USING ERRCODE = '22023';
        END IF;
    END IF;

    UPDATE public.camisas SET imagem = p_imagem WHERE id = p_id RETURNING * INTO v_resultado;
    RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_definir_imagem_camisa(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_definir_imagem_camisa(bigint, text) TO authenticated;

-- Camisas devolvidas pelas funções da administração (A07, A08, A10) levam a foto
CREATE OR REPLACE FUNCTION private.camisa_json(p_camisa bigint)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT jsonb_build_object(
        'id', c.id, 'tipo', c.tipo, 'categoria', c.categoria, 'temporada', c.temporada,
        'ativo', c.ativo, 'imagem', c.imagem, 'equipes', jsonb_build_object('nome', e.nome))
    FROM public.camisas c
    JOIN public.equipes e ON e.id = c.equipe_id
    WHERE c.id = p_camisa;
$$;

REVOKE ALL ON FUNCTION private.camisa_json(bigint) FROM PUBLIC, anon, authenticated;

COMMIT;
