// Sessão, autorização e destino após o login.
import { supabase } from "./supabase.js";
import { comContexto } from "./contexto.js";

// Endereço de cada tela. As que ainda não existem apontam para a página
// de etapa futura, que preserva o contexto.
export const TELAS = {
  P04: "colecao.html",
  A01: "admin.html",
  A02: "catalogo.html",
  A03: "equipe.html",
  A04: "camisa.html",
  A05: "estoque.html",
  A06: "proxima-etapa.html?tela=A06",
  A09: "proxima-etapa.html?tela=A09",
  C01: "painel.html",
  C02: "perfil.html",
  C03: "confirmar-plano.html",
  C04: "assinatura.html",
  C05: "kits.html",
  C06: "kit.html",
  C07: "solicitar-troca.html",
  C08: "trocas.html",
};

export async function sessaoAtual() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

function perfilCompleto(perfil) {
  return Boolean(perfil && perfil.tamanho && perfil.equipe_preferida_id && perfil.rival_id);
}

// Decide para onde levar o usuário autenticado.
// Administrador → A01. Cliente com intenção de plano → C02 (perfil incompleto)
// ou C03 (revisão); se já houver assinatura ativa, C04, sem mudança direta de plano.
// Destino do rodapé (C04/C05) é respeitado. Caso geral → C01.
export async function resolverDestino(contexto) {
  const { data: ehAdmin, error: erroAdmin } = await supabase.rpc("eh_administrador");
  if (erroAdmin) throw erroAdmin;
  if (ehAdmin) return TELAS.A01;

  if (contexto.plano) {
    const [{ data: perfil, error: e1 }, { data: assinatura, error: e2 }] = await Promise.all([
      supabase.from("perfis").select("tamanho, equipe_preferida_id, rival_id").maybeSingle(),
      supabase.from("assinaturas").select("status").maybeSingle(),
    ]);
    if (e1 || e2) throw e1 || e2;
    if (assinatura?.status === "ativa") return comContexto(TELAS.C04, { destino: null, plano: null });
    const tela = perfilCompleto(perfil) ? TELAS.C03 : TELAS.C02;
    return comContexto(tela, { plano: contexto.plano, destino: null });
  }
  if (contexto.destino) return TELAS[contexto.destino];
  return TELAS.C01;
}

// Sair limpa o contexto da sessão e volta para a P03, sem apagar dados da conta.
export async function sair() {
  if (supabase) await supabase.auth.signOut({ scope: "local" });
  location.replace("entrar.html");
}
