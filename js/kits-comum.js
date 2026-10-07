// Peças compartilhadas por C05, C06, C07 e C08 (kits, camisas e trocas).
import { supabase } from "./supabase.js";
import { el, chip, competenciaExtenso } from "./cliente.js";
import { SUPABASE_URL } from "./config.js";

export const TIPOS = { clube: "Clube internacional", selecao: "Seleção mundial", especial: "Especial retrô" };
export const MODALIDADES = { modelo: "Modelo", tamanho: "Tamanho", ambos: "Modelo e tamanho" };
export const ESTADOS_TROCA = {
  solicitada: ["Solicitada", "aviso", "◷"],
  concluida: ["Concluída", "sucesso", "✓"],
  rejeitada: ["Rejeitada", "erro", "×"],
};

const CAMPOS_CAMISA = "tipo, categoria, temporada, imagem, equipes(nome)";

export function chipDeTroca(estado) {
  const [rotulo, familia, simbolo] = ESTADOS_TROCA[estado];
  return chip(rotulo, familia, simbolo);
}

// "2 camisas comuns + 1 especial"
export function composicaoRegistrada(kit) {
  const partes = [kit.qtd_comuns_prevista === 1 ? "1 camisa comum" : `${kit.qtd_comuns_prevista} camisas comuns`];
  if (kit.qtd_especiais_prevista) partes.push(`${kit.qtd_especiais_prevista} especial`);
  return partes.join(" + ");
}

export function descricaoCamisa(camisa) {
  return `${camisa.temporada} • ${camisa.categoria}`;
}
export function tipoDaCamisa(camisa) {
  return TIPOS[camisa.tipo] || camisa.tipo;
}

// ---------- Leitura ----------
export async function carregarKits() {
  const { data, error } = await supabase
    .from("kits")
    .select("competencia, qtd_comuns_prevista, qtd_especiais_prevista, brinde_previsto, brinde_descricao, planos(nome)")
    .order("competencia", { ascending: false });
  if (error) throw error;
  return data;
}

export async function carregarItens(competencia = null) {
  let consulta = supabase
    .from("kit_itens")
    .select(`camisa_id, competencia, posicao, grupo, tamanho_inicial, tamanho_atual, origem, estado, registrado_em, camisas!kit_itens_camisa_id_fkey(${CAMPOS_CAMISA})`)
    .order("posicao");
  if (competencia) consulta = consulta.eq("competencia", competencia);
  const { data, error } = await consulta;
  if (error) throw error;
  return data;
}

// trocas não tem chave estrangeira direta para camisas (o vínculo passa por
// kit_itens e estoque), então as camisas vêm em uma consulta à parte.
export async function carregarTrocas() {
  const { data, error } = await supabase
    .from("trocas")
    .select("id, modalidade, estado, solicitada_em, concluida_em, camisa_original_id, tamanho_original, tamanho_destino, camisa_substituta_id")
    .order("solicitada_em", { ascending: false });
  if (error) throw error;
  return data;
}

export async function carregarCamisas(ids) {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return {};
  const { data, error } = await supabase.from("camisas").select(`id, ${CAMPOS_CAMISA}`).in("id", unicos);
  if (error) throw error;
  return Object.fromEntries(data.map((c) => [c.id, c]));
}

// Situação do benefício no ciclo: disponivel · limite_atingido · cancelada · sem_assinatura.
export async function situacaoDasTrocas() {
  const { data, error } = await supabase.rpc("situacao_trocas");
  if (error) throw error;
  return data;
}

// ---------- Ilustração provisória ----------
export function ilustracaoCamisa(especial = false) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 80 64");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "camisa-icone");
  const caminho = document.createElementNS(ns, "path");
  caminho.setAttribute("d", "M27 2 L14 6 L1 18 L10 30 L18 24 L18 62 L62 62 L62 24 L70 30 L79 18 L66 6 L53 2 C50 8 46 10 40 10 C34 10 30 8 27 2 Z");
  caminho.setAttribute("fill", "currentColor");
  svg.append(caminho);
  if (especial) {
    const estrela = document.createElementNS(ns, "path");
    estrela.setAttribute("d", "M40 30 L43 38 L51 38 L45 43 L47 51 L40 46 L33 51 L35 43 L29 38 L37 38 Z");
    estrela.setAttribute("fill", "var(--marca-estrela)");
    svg.append(estrela);
  }
  return svg;
}

// ---------- Foto do modelo ----------
// Endereço público da foto guardada no bucket "camisas".
export function urlDaFoto(caminho) {
  return `${SUPABASE_URL}/storage/v1/object/public/camisas/${caminho}`;
}

// Foto do modelo quando cadastrada; sem foto (ou se ela não carregar), a ilustração.
// A foto é decorativa: equipe, temporada e categoria estão sempre no texto ao lado.
export function figuraCamisa(camisa, especial = false, ilustracao = ilustracaoCamisa(especial)) {
  if (!camisa?.imagem) return ilustracao;
  const foto = el("img", { class: "camisa-foto", src: urlDaFoto(camisa.imagem), alt: "", loading: "lazy", decoding: "async" });
  foto.addEventListener("error", () => foto.replaceWith(ilustracao), { once: true });
  return foto;
}

// Cartão de uma camisa do kit (C06, C07 e detalhe da C08)
export function camisaDoKit(item, { rotulo, chipEstado = null, acao = null, motivo = null } = {}) {
  const camisa = item.camisas || item.camisa;
  const especial = item.grupo === "especial" || camisa.tipo === "especial";
  return el("article", { class: "camisa-kit" },
    el("div", { class: "camisa-kit__topo" },
      el("h3", { class: "camisa-kit__posicao" }, rotulo),
      chipEstado),
    el("div", { class: "camisa-kit__corpo" },
      el("div", { class: "camisa-kit__imagem" }, figuraCamisa(camisa, especial), especial ? el("span", { class: "selo-especial" }, "Especial") : null),
      el("div", { class: "camisa-kit__dados" },
        el("p", { class: "camisa-kit__equipe" }, camisa.equipes.nome),
        el("p", {}, descricaoCamisa(camisa)),
        el("p", {}, `${tipoDaCamisa(camisa)} • Tamanho ${item.tamanho_atual || item.tamanho}`))),
    motivo ? el("p", { class: "camisa-kit__motivo" }, motivo) : null,
    acao);
}

// Faixa branca com os dados do kit (C06 e C07)
export function faixaDeDados(pares) {
  return el("section", { class: "faixa-dados", "aria-label": "Dados do kit" },
    ...pares.map(([rotulo, valor]) =>
      el("div", { class: "faixa-dados__item" },
        el("p", { class: "faixa-dados__rotulo" }, rotulo),
        el("p", { class: "faixa-dados__valor" }, valor))));
}

export function tituloDoKit(kit) {
  return competenciaExtenso(kit.competencia);
}
