-- Clube do Manto: lista oficial de tamanhos P, M, G e GG (decisão do Wesley, 06/10/2026).
-- Aplicar depois de 003_painel_e_perfil_do_cliente.sql.
-- Substitui a lista provisória: o perfil, o estoque e as trocas aceitam só esses tamanhos.

BEGIN;

ALTER TABLE public.perfis
    ADD CONSTRAINT ck_perfis_tamanho_oficial CHECK (tamanho IN ('P', 'M', 'G', 'GG'));
ALTER TABLE public.estoque
    ADD CONSTRAINT ck_estoque_tamanho_oficial CHECK (tamanho IN ('P', 'M', 'G', 'GG'));
ALTER TABLE public.trocas
    ADD CONSTRAINT ck_trocas_tamanho_oficial CHECK (
        tamanho_original IN ('P', 'M', 'G', 'GG') AND tamanho_destino IN ('P', 'M', 'G', 'GG')
    );
-- kit_itens.tamanho_inicial e tamanho_atual referenciam o estoque e herdam a regra.

-- A lista oferecida no perfil é a oficial, em ordem crescente.
CREATE OR REPLACE FUNCTION public.tamanhos_do_catalogo()
RETURNS SETOF text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT unnest(ARRAY['P', 'M', 'G', 'GG']);
$$;

REVOKE ALL ON FUNCTION public.tamanhos_do_catalogo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tamanhos_do_catalogo() TO anon, authenticated;

COMMIT;
