// Área do cliente: exige sessão, monta o cabeçalho do cliente (desktop e menu mobile)
// e reúne utilidades de leitura usadas por C01 e C02.
import { supabase } from "./supabase.js";
import { comContexto } from "./contexto.js";
import { sessaoAtual, sair, TELAS } from "./sessao.js";

// Rótulos e ordem da especificação (cabeçalho do cliente)
const ITENS = [
  { tela: "C01", rotulo: "Painel" },
  { tela: "C02", rotulo: "Meu perfil" },
  { tela: "C04", rotulo: "Minha assinatura" },
  { tela: "C05", rotulo: "Kits e histórico" },
  { tela: "C08", rotulo: "Minhas trocas" },
];

// Sem sessão, volta ao login preservando a intenção de plano.
export async function exigirSessao(contexto = {}) {
  let sessao = null;
  try {
    sessao = await sessaoAtual();
  } catch (erro) {
    console.error(erro);
  }
  if (!sessao) {
    location.replace(comContexto("entrar.html", { plano: contexto.plano || null, destino: contexto.destino || null }));
    return null;
  }
  return sessao;
}

// Telas do cliente (C01–C08): além da sessão, a conta administradora vai para a A01,
// como no login. Se a consulta do papel falhar, a tela segue e trata as próprias falhas.
export async function exigirCliente(contexto = {}) {
  const sessao = await exigirSessao(contexto);
  if (!sessao) return null;
  try {
    const { data, error } = await supabase.rpc("eh_administrador");
    if (error) throw error;
    if (data === true) {
      location.replace(TELAS.A01);
      return null;
    }
  } catch (erro) {
    console.error(erro);
  }
  return sessao;
}

function el(tag, atributos = {}, ...filhos) {
  const elemento = document.createElement(tag);
  for (const [chave, valor] of Object.entries(atributos)) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (chave === "class") elemento.className = valor;
    else elemento.setAttribute(chave, valor === true ? "" : valor);
  }
  elemento.append(...filhos.filter((f) => f !== null && f !== undefined));
  return elemento;
}
export { el };

function logo(inicio) {
  return el("a", { class: "logo", href: inicio }, el("span", { class: "logo__marca", "aria-hidden": "true" }, "///"), "Clube do Manto");
}

// Monta o cabeçalho dentro de <header data-cabecalho-cliente="C01">.
export function montarCabecalho(telaAtual) {
  montarCabecalhoArea({ itens: ITENS, telaAtual, rotulo: "Área do cliente", inicio: TELAS.C01, idMenu: "menu-cliente" });
}

// Cabeçalho das áreas internas (cliente e administração): mesmos componentes,
// itens e rótulo próprios. No mobile, botão Menu abre um painel com os mesmos destinos.
export function montarCabecalhoArea({ itens, telaAtual, rotulo, inicio, idMenu, nomeFixo = null }) {
  const cabecalho = document.querySelector("[data-cabecalho-cliente]");
  const interno = el("div", { class: "container cab-cliente__interno" });
  const nav = el("nav", { class: "cab-cliente__nav", "aria-label": rotulo });
  for (const item of itens) {
    const atual = item.tela === telaAtual;
    nav.append(el("a", { class: "cab-cliente__item", href: TELAS[item.tela], "aria-current": atual ? "page" : null }, item.rotulo));
  }
  const nome = el("span", { class: "cab-cliente__nome", "data-nome-usuario": nomeFixo ? null : true }, nomeFixo);
  const botaoSair = el("button", { class: "botao botao--sec-escuro", type: "button", "data-sair": true }, "Sair");
  const botaoMenu = el("button", { class: "botao botao--sec-escuro cab-cliente__menu-botao", type: "button", "aria-expanded": "false", "aria-controls": idMenu }, "Menu");
  interno.append(logo(inicio), nav, el("div", { class: "cab-cliente__conta" }, nome, botaoSair), botaoMenu);

  // Menu mobile: painel sobreposto com os mesmos destinos
  const fechar = el("button", { class: "botao botao--sec-escuro", type: "button" }, "Fechar menu");
  const lista = el("ul", { class: "menu-cliente__lista" });
  for (const item of itens) {
    const atual = item.tela === telaAtual;
    const link = el("a", { class: "menu-cliente__item", href: TELAS[item.tela], "aria-current": atual ? "page" : null }, item.rotulo);
    if (atual) link.append(el("span", { class: "menu-cliente__atual" }, "Página atual"));
    lista.append(el("li", {}, link));
  }
  // Caminho de volta à página inicial (P01), sem sair da conta
  lista.append(el("li", {}, el("a", { class: "menu-cliente__item", href: "index.html" }, "Página inicial")));
  const sairMenu = el("button", { class: "botao botao--sec-escuro botao--largo", type: "button", "data-sair": true }, "Sair");
  const menu = el("div", { class: "menu-cliente", id: idMenu, hidden: true },
    el("div", { class: "container" },
      el("div", { class: "menu-cliente__topo" }, logo(inicio), fechar),
      el("p", { class: "menu-cliente__nome", "data-nome-usuario": nomeFixo ? null : true }, nomeFixo),
      el("nav", { "aria-label": rotulo }, lista),
      sairMenu));
  cabecalho.className = "cab-cliente";
  cabecalho.replaceChildren(interno, menu);
  document.querySelector(".rodape-fluxo__links")?.prepend(el("a", { class: "rodape-fluxo__link", href: "index.html" }, "Página inicial"));

  function abrir() {
    menu.hidden = false;
    botaoMenu.setAttribute("aria-expanded", "true");
    fechar.focus();
  }
  function fecharMenu(devolverFoco = true) {
    menu.hidden = true;
    botaoMenu.setAttribute("aria-expanded", "false");
    if (devolverFoco) botaoMenu.focus();
  }
  botaoMenu.addEventListener("click", abrir);
  fechar.addEventListener("click", () => fecharMenu());
  menu.addEventListener("keydown", (e) => {
    if (e.key === "Escape") fecharMenu();
  });
  matchMedia("(min-width: 1024px)").addEventListener("change", (e) => {
    if (e.matches && !menu.hidden) fecharMenu(false);
  });

  cabecalho.querySelectorAll("[data-sair]").forEach((botao) =>
    botao.addEventListener("click", () => {
      cabecalho.querySelectorAll("[data-sair]").forEach((b) => (b.disabled = true));
      sair();
    }),
  );
}

export function mostrarNome(nomeCompleto) {
  const primeiro = (nomeCompleto || "").trim().split(/\s+/)[0] || "";
  document.querySelectorAll("[data-nome-usuario]").forEach((n) => (n.textContent = primeiro));
}

export function perfilCompleto(perfil) {
  return Boolean(perfil && perfil.tamanho && perfil.equipe_preferida_id && perfil.rival_id);
}

export async function carregarPerfil() {
  const { data, error } = await supabase
    .from("perfis")
    .select("nome, tamanho, equipe_preferida_id, rival_id")
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ---------- Formatação ----------
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// competencia vem como "AAAA-MM-01"
export function nomeDoMes(competencia) {
  return MESES[Number(competencia.slice(5, 7)) - 1];
}
export function competenciaExtenso(competencia) {
  return `${nomeDoMes(competencia)}/${competencia.slice(0, 4)}`;
}
export function competenciaAtual(hoje = new Date()) {
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`;
}
export function dataCurta(iso) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function chip(texto, familia, simbolo) {
  return el("span", { class: `chip chip--${familia}` }, el("span", { "aria-hidden": "true" }, simbolo), texto);
}
