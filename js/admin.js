// Área administrativa: exige sessão e papel de administrador (decidido no banco),
// monta o cabeçalho administrativo e reúne rótulos e formatação de A01–A05.
import { supabase } from "./supabase.js";
import { TELAS } from "./sessao.js";
import { el, montarCabecalhoArea } from "./cliente.js";
import { exigirSessao } from "./cliente.js";

const ITENS = [
  { tela: "A01", rotulo: "Painel" },
  { tela: "A02", rotulo: "Catálogo" },
  { tela: "A05", rotulo: "Estoque" },
  { tela: "A06", rotulo: "Assinantes" },
  { tela: "A09", rotulo: "Trocas" },
];

export function montarCabecalhoAdmin(telaAtual) {
  montarCabecalhoArea({ itens: ITENS, telaAtual, rotulo: "Administração", inicio: TELAS.A01, idMenu: "menu-admin", nomeFixo: "Administrador" });
}

// Sem sessão → login. Sessão sem papel administrativo → aviso "sem autorização"
// com retorno à área do cliente. Ocultar o menu não é o controle: as funções do
// banco recusam quem não é administrador.
export async function exigirAdministrador(principal) {
  const sessao = await exigirSessao();
  if (!sessao) return false;
  let autorizado = false;
  try {
    const { data, error } = await supabase.rpc("eh_administrador");
    if (error) throw error;
    autorizado = data === true;
  } catch (erro) {
    console.error(erro);
    mostrarFalhaGeral(principal, "Não foi possível confirmar seu acesso", () => location.reload());
    return false;
  }
  if (!autorizado) {
    principal.setAttribute("aria-busy", "false");
    principal.replaceChildren(el("div", { class: "container" },
      el("div", { class: "area-cliente__topo" },
        el("p", { class: "chamada chamada--no-escuro" }, "Administração"),
        el("h1", { class: "area-cliente__titulo", tabindex: "-1" }, "Acesso não autorizado")),
      el("section", { class: "cartao cartao--falha", role: "alert" },
        el("span", { class: "cartao--falha__icone", "aria-hidden": "true" }, "!"),
        el("h2", { class: "cartao__titulo" }, "Você não possui acesso a esta área"),
        el("p", { class: "cartao__texto" }, "Esta área é exclusiva da administração do Clube do Manto."),
        el("a", { class: "botao botao--primaria", href: TELAS.C01 }, "Retornar à sua área"))));
    principal.querySelector("h1").focus();
    return false;
  }
  return true;
}

export function mostrarFalhaGeral(alvo, titulo, aoTentar) {
  const caixa = el("section", { class: "cartao cartao--falha", role: "alert" },
    el("span", { class: "cartao--falha__icone", "aria-hidden": "true" }, "!"),
    el("h2", { class: "cartao__titulo" }, titulo),
    el("p", { class: "cartao__texto" }, "Verifique sua conexão e tente novamente."),
    el("button", { class: "botao botao--primaria", type: "button" }, "Tentar novamente"));
  caixa.querySelector("button").addEventListener("click", aoTentar);
  alvo.setAttribute("aria-busy", "false");
  alvo.replaceChildren(el("div", { class: "container" }, caixa));
}

// ---------- Rótulos ----------
export const NATUREZAS = { clube: "Clube", selecao: "Seleção" };
export const TIPOS_CAMISA = { clube: "Clube", selecao: "Seleção", especial: "Especial" };
export const CATEGORIAS = ["Home", "Away", "Third"];
export const TAMANHOS = ["P", "M", "G", "GG"];

// Países para o cadastro de equipe (código ISO de 2 letras, como no banco).
// Lista de apoio da tela; o banco aceita qualquer código de 2 letras.
export const PAISES = [
  ["DE", "Alemanha"], ["SA", "Arábia Saudita"], ["DZ", "Argélia"], ["AR", "Argentina"], ["AU", "Austrália"],
  ["AT", "Áustria"], ["BE", "Bélgica"], ["BO", "Bolívia"], ["BR", "Brasil"], ["CM", "Camarões"],
  ["CA", "Canadá"], ["CL", "Chile"], ["CN", "China"], ["CO", "Colômbia"], ["KR", "Coreia do Sul"],
  ["CI", "Costa do Marfim"], ["CR", "Costa Rica"], ["HR", "Croácia"], ["DK", "Dinamarca"], ["EG", "Egito"],
  ["EC", "Equador"], ["SK", "Eslováquia"], ["SI", "Eslovênia"], ["ES", "Espanha"],
  ["US", "Estados Unidos"], ["FR", "França"], ["GH", "Gana"], ["GR", "Grécia"], ["NL", "Holanda"],
  ["HU", "Hungria"], ["GB", "Inglaterra / Reino Unido"], ["IR", "Irã"], ["IE", "Irlanda"], ["IT", "Itália"],
  ["JM", "Jamaica"], ["JP", "Japão"], ["MA", "Marrocos"], ["MX", "México"], ["NG", "Nigéria"],
  ["NO", "Noruega"], ["PA", "Panamá"], ["PY", "Paraguai"], ["PE", "Peru"], ["PL", "Polônia"],
  ["PT", "Portugal"], ["QA", "Catar"], ["CZ", "República Tcheca"], ["RO", "Romênia"], ["SN", "Senegal"],
  ["RS", "Sérvia"], ["SE", "Suécia"], ["CH", "Suíça"], ["TN", "Tunísia"], ["TR", "Turquia"],
  ["UA", "Ucrânia"], ["UY", "Uruguai"], ["VE", "Venezuela"],
];
const NOMES_PAISES = new Map(PAISES);
export function nomeDoPais(codigo) {
  return NOMES_PAISES.get(codigo) || codigo;
}

export function chipSituacao(ativo) {
  return el("span", { class: `chip ${ativo ? "chip--sucesso" : "chip--neutro"}` },
    el("span", { "aria-hidden": "true" }, ativo ? "●" : "○"), ativo ? "Ativo" : "Inativo");
}

export function chipSaldo(quantidade) {
  return quantidade > 0
    ? el("span", { class: "chip chip--sucesso" }, el("span", { "aria-hidden": "true" }, "✓"), "Disponível")
    : el("span", { class: "chip chip--neutro" }, el("span", { "aria-hidden": "true" }, "–"), "Sem saldo");
}

// "Real Madrid · Clube · Home · 2025/2026"
export function nomeDoModelo(camisa) {
  return `${camisa.equipes.nome} · ${TIPOS_CAMISA[camisa.tipo]} · ${camisa.categoria} · ${camisa.temporada}`;
}

export function dataHora(iso) {
  const d = new Date(iso);
  const data = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${data} • ${hora}`;
}

// Mensagem fixa vinda do banco (RAISE EXCEPTION 'codigo')
export function codigoDoErro(erro) {
  return (erro?.message || "").trim();
}

// Falha de comunicação: não prova que nada foi gravado
export function falhaIncerta(erro) {
  const status = erro?.status ?? 0;
  return !erro?.code && (status === 0 || status >= 500 || /fetch|network/i.test(erro?.message || ""));
}

export function normalizar(texto) {
  return (texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function linhaDado(rotulo, valor) {
  return el("div", {}, el("dt", {}, rotulo), el("dd", {}, valor));
}
