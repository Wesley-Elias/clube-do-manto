// Peças compartilhadas por A06 a A10 (assinantes, montagem do kit e trocas).
// Os dados chegam por funções do banco que conferem o papel administrativo.
import { supabase } from "./supabase.js";
import { TELAS } from "./sessao.js";
import { el, chip, competenciaExtenso } from "./cliente.js";
import { linhaDado } from "./admin.js";

export const SITUACOES = { ativa: "Ativas", cancelada: "Canceladas" };

export function chipAssinatura(status) {
  if (status === "ativa") return chip("Ativa", "sucesso", "✓");
  if (status === "cancelada") return chip("Cancelada", "erro", "×");
  return chip("Sem assinatura", "neutro", "–");
}

// "2 camisas comuns" · "2 camisas comuns e 1 especial" (composição do plano)
export function composicaoDoPlano(assinatura) {
  const comuns = assinatura.qtd_comuns === 1 ? "1 camisa comum" : `${assinatura.qtd_comuns} camisas comuns`;
  return assinatura.qtd_especiais ? `${comuns} e ${assinatura.qtd_especiais} especial` : comuns;
}

export function textoTrocasDoPlano(limite) {
  return `${limite} ${limite === 1 ? "troca" : "trocas"} a cada 12 meses de assinatura.`;
}

// Endereço de retorno vindo da URL: só páginas da própria administração.
export function retornoSeguro(valor, padrao, permitidas) {
  if (!valor) return padrao;
  const pagina = valor.split("?")[0];
  return permitidas.includes(pagina) && !/[\s:/\\]/.test(pagina) ? valor : padrao;
}

export async function carregarAssinante(usuarioId) {
  const { data, error } = await supabase.rpc("admin_assinante", { p_usuario: usuarioId });
  if (error) throw error;
  return data;
}

// Situação do titular para um kit novo na competência atual.
// pronto · kit_existente · sem_assinatura · cancelada · plano_inativo · perfil_incompleto
export function situacaoDoKit(d) {
  if (!d.assinatura) return "sem_assinatura";
  if (d.assinatura.status !== "ativa") return "cancelada";
  if (d.kit_do_mes) return "kit_existente";
  if (!d.assinatura.plano_ativo) return "plano_inativo";
  if (!d.perfil_completo) return "perfil_incompleto";
  return "pronto";
}

export const INELEGIVEL = {
  sem_assinatura: ["Sem assinatura", "Este titular não possui assinatura registrada. Não há kit a montar."],
  cancelada: ["Assinatura cancelada", "Kits e trocas anteriores permanecem consultáveis. Novos kits e novas operações de troca estão indisponíveis."],
  plano_inativo: ["Plano inativo", "O plano desta assinatura está inativo. Novos kits ficam indisponíveis até que o plano volte a ser oferecido."],
  perfil_incompleto: ["Perfil incompleto", "O titular precisa ter tamanho, equipe preferida e equipe rival válidos antes da montagem."],
};

export function alerta(tipo, titulo, texto, extra = {}) {
  const icones = { sucesso: "✓", aviso: "!", erro: "!", info: "i" };
  const classes = { sucesso: "alerta--sucesso", aviso: "alerta--aviso", erro: "", info: "alerta--info" };
  return el("div", { class: `alerta ${classes[tipo]}`, ...extra },
    el("span", { class: "alerta__icone", "aria-hidden": "true" }, icones[tipo]),
    el("div", {}, el("p", { class: "alerta__titulo" }, titulo), el("p", { class: "alerta__texto" }, texto)));
}

// Cartão lateral com o perfil do titular (A07 e A08)
export function cartaoPerfil(d, { rotuloTamanho = "Tamanho para novos kits", extra = [] } = {}) {
  const valor = (v) => v || "Não informado";
  return el("section", { class: "cartao cartao--lateral", "aria-labelledby": "titulo-titular" },
    el("h2", { class: "cartao-lateral__nome", id: "titulo-titular" }, d.nome),
    el("p", { class: "cartao__nota" }, `Referência: ${d.referencia}`),
    el("dl", { class: "dados-lateral" },
      linhaDado(rotuloTamanho, valor(d.tamanho)),
      linhaDado("Equipe preferida", valor(d.preferida)),
      linhaDado("Equipe rival", valor(d.rival))),
    ...extra);
}

// Linhas da tabela de kits por mês (A07)
export function composicaoRegistradaCurta(kit) {
  if (kit.qtd_especiais_prevista) return `${kit.qtd_comuns_prevista} comuns + ${kit.qtd_especiais_prevista} especial`;
  return kit.qtd_comuns_prevista === 1 ? "1 camisa comum" : `${kit.qtd_comuns_prevista} camisas comuns`;
}

export function brindeDoKit(kit) {
  return kit.brinde_previsto ? kit.brinde_descricao || "Previsto" : "Não previsto";
}

export function linkDoAssinante(usuarioId, { kit = null, voltar = null } = {}) {
  const url = new URLSearchParams({ id: usuarioId });
  if (kit) url.set("kit", kit);
  if (voltar) url.set("voltar", voltar);
  return `${TELAS.A07}?${url}`;
}

export function rotuloCompetencia(competencia) {
  return competenciaExtenso(competencia);
}
