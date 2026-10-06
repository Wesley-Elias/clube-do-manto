-- Clube do Manto: acesso mínimo para P01, P02 e P03 (06/10/2026).
-- Aplicar depois de 001_esquema_estrutural.sql.
-- Abre somente o necessário para esta etapa da implementação:
--   * leitura pública dos planos (P01);
--   * criação automática do perfil no cadastro (P02);
--   * leitura do próprio perfil e da própria assinatura e verificação do papel (P03).
-- Gravações de perfil, assinatura, kits e trocas ficam para as próximas etapas.

BEGIN;

-- ---------------------------------------------------------------
-- Planos oficiais (valores do Plano do MVP; ck_planos_configuracao valida a composição)
-- ---------------------------------------------------------------
INSERT INTO public.planos (nome, qtd_comuns, qtd_especiais, trocas_anuais, possui_brinde, valor_mensal, ativo)
VALUES
    ('Torcedor',     1, 0, 1, false,  99.00, true),
    ('Fanático',     2, 0, 2, true,  169.00, true),
    ('Colecionador', 2, 1, 3, true,  299.00, true)
ON CONFLICT (nome) DO NOTHING;

-- Visitantes e clientes leem os planos; ninguém altera pela API.
GRANT SELECT ON TABLE public.planos TO anon, authenticated;
CREATE POLICY planos_leitura_publica ON public.planos
    FOR SELECT TO anon, authenticated
    USING (true);

-- ---------------------------------------------------------------
-- Perfil criado junto com a conta (nome vem dos metadados do cadastro)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.criar_perfil_do_usuario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.perfis (usuario_id, nome)
    VALUES (
        NEW.id,
        COALESCE(
            NULLIF(btrim(NEW.raw_user_meta_data ->> 'nome'), ''),
            split_part(NEW.email, '@', 1)
        )
    )
    ON CONFLICT (usuario_id) DO NOTHING;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.criar_perfil_do_usuario() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER ao_criar_usuario_criar_perfil
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION private.criar_perfil_do_usuario();

-- ---------------------------------------------------------------
-- Leitura dos próprios dados (destino após o login)
-- ---------------------------------------------------------------
GRANT SELECT ON TABLE public.perfis TO authenticated;
CREATE POLICY perfis_leitura_propria ON public.perfis
    FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = usuario_id);

GRANT SELECT ON TABLE public.assinaturas TO authenticated;
CREATE POLICY assinaturas_leitura_propria ON public.assinaturas
    FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = usuario_id);

-- ---------------------------------------------------------------
-- Papel administrativo: decidido no banco, nunca pela tela
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.eh_administrador()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM private.administradores
        WHERE usuario_id = (SELECT auth.uid())
    );
$$;

REVOKE ALL ON FUNCTION public.eh_administrador() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eh_administrador() TO authenticated;

COMMIT;

-- Para tornar uma conta administradora (rodar no SQL Editor, como dono do projeto):
-- INSERT INTO private.administradores (usuario_id)
-- SELECT id FROM auth.users WHERE email = 'admin@exemplo.com';
