// P01 — Apresentação e planos.
import { supabase, avisarSemConfiguracao } from "./supabase.js";
import { PLANOS, deLinha, slugDoNome, composicaoCurta, textoTrocas, formatarValor } from "./planos.js";
import { sessaoAtual, resolverDestino } from "./sessao.js";

avisarSemConfiguracao();

// ---------- Menu mobile ----------
const botaoMenu = document.querySelector(".nav__menu-botao");
const menu = document.getElementById("menu-mobile");
const fecharMenuBotao = menu.querySelector("[data-fechar-menu]");

function abrirMenu() {
  menu.hidden = false;
  botaoMenu.setAttribute("aria-expanded", "true");
  fecharMenuBotao.focus();
}
function fecharMenu(devolverFoco = true) {
  menu.hidden = true;
  botaoMenu.setAttribute("aria-expanded", "false");
  if (devolverFoco) botaoMenu.focus();
}
botaoMenu.addEventListener("click", abrirMenu);
fecharMenuBotao.addEventListener("click", () => fecharMenu());
menu.addEventListener("keydown", (e) => {
  if (e.key === "Escape") fecharMenu();
});
menu.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => fecharMenu(false)));
matchMedia("(min-width: 1024px)").addEventListener("change", (e) => {
  if (e.matches && !menu.hidden) fecharMenu(false);
});

// ---------- Faixa de equipes ----------
// Rola sem parar da direita para a esquerda; o botão pausa e retoma.
// Com movimento reduzido, a animação já fica parada pelo tokens.css.
const faixa = document.querySelector(".faixa");
const trilho = faixa.querySelector(".faixa__trilho");
const listaFaixa = trilho.querySelector(".faixa__lista");
const copia = listaFaixa.cloneNode(true);
copia.setAttribute("aria-hidden", "true");
copia.removeAttribute("aria-label");
trilho.append(copia);

const botaoPausa = faixa.querySelector(".faixa__pausa");
function pausarFaixa(pausar) {
  faixa.dataset.pausada = String(pausar);
  botaoPausa.setAttribute("aria-pressed", String(pausar));
  botaoPausa.setAttribute("aria-label", pausar ? "Retomar faixa de equipes" : "Pausar faixa de equipes");
  botaoPausa.textContent = pausar ? "▶" : "❚❚";
}
// Com "reduzir movimento" ligado no sistema, a faixa começa parada e o botão mostra ▶.
// Se a pessoa apertar ▶, a escolha dela vale e a faixa passa a rolar.
if (matchMedia("(prefers-reduced-motion: reduce)").matches) pausarFaixa(true);
botaoPausa.addEventListener("click", () => {
  faixa.dataset.escolhaDoUsuario = "true";
  pausarFaixa(faixa.dataset.pausada !== "true");
});

// ---------- Dúvidas frequentes ----------
const DUVIDAS = [
  ["Como funciona a garantia anti-repetição?", "O histórico considera a combinação de equipe, temporada e categoria Home, Away ou Third. A mesma equipe pode aparecer em outra temporada ou categoria, sem repetir o modelo."],
  ["Que tipos de camisas posso receber?", "Camisas de clubes internacionais e seleções. O Colecionador também inclui uma camisa especial."],
  ["Posso escolher uma camisa específica?", "A composição do kit considera suas preferências, tamanho, estoque e histórico. Não há escolha direta de uma camisa específica."],
  ["Posso bloquear meu time rival?", "Sim. A equipe rival informada nas preferências é excluída da seleção."],
  ["Como funcionam as trocas?", "As trocas podem ser de modelo ou tamanho. Torcedor: 1; Fanático: 2; Colecionador: 3, a cada 12 meses de assinatura."],
  ["Onde informo meu tamanho?", "O tamanho é informado nas preferências do seu perfil."],
  ["Existe fidelidade? E se eu reativar a assinatura?", "Não há fidelidade. A reativação é revisada na conta e não renova antecipadamente o saldo de trocas do ciclo."],
  ["Qual plano inclui camisas especiais e brindes?", "Torcedor: 1 comum. Fanático: 2 comuns e brinde. Colecionador: 2 comuns, 1 especial e brinde."],
];

const blocoDuvidas = document.querySelector("[data-duvidas]");
DUVIDAS.forEach(([pergunta, resposta], i) => {
  const aberta = i === 0;
  const item = document.createElement("div");
  item.className = "duvida" + (aberta ? " duvida--aberta" : "");
  item.innerHTML = `
    <h3>
      <button class="duvida__pergunta" type="button" aria-expanded="${aberta}" aria-controls="resposta-${i}" id="pergunta-${i}">
        <span></span><span class="duvida__sinal" aria-hidden="true">${aberta ? "−" : "+"}</span>
      </button>
    </h3>
    <div class="duvida__resposta" id="resposta-${i}" role="region" aria-labelledby="pergunta-${i}" ${aberta ? "" : "hidden"}><p></p></div>`;
  item.querySelector(".duvida__pergunta span").textContent = pergunta;
  item.querySelector(".duvida__resposta p").textContent = resposta;
  blocoDuvidas.append(item);
});
blocoDuvidas.addEventListener("click", (e) => {
  const botao = e.target.closest(".duvida__pergunta");
  if (!botao) return;
  const abrir = botao.getAttribute("aria-expanded") !== "true";
  const item = botao.closest(".duvida");
  botao.setAttribute("aria-expanded", String(abrir));
  item.classList.toggle("duvida--aberta", abrir);
  item.querySelector(".duvida__sinal").textContent = abrir ? "−" : "+";
  item.querySelector(".duvida__resposta").hidden = !abrir;
});

// ---------- Planos ----------
const blocoPlanos = document.querySelector("[data-planos]");
const alertaFalha = document.querySelector("[data-falha-planos]");

const ICONE_CAMISA = `<svg width="42" height="42" viewBox="0 0 42 42" aria-hidden="true"><path d="M14.7 4.62L9.24 6.3L2.94 11.76L7.14 18.06L10.5 15.96V38.22H31.5V15.96L34.86 18.06L39.06 11.76L32.76 6.3L27.3 4.62C23.1 7.7 18.9 7.7 14.7 4.62Z" fill="#0E1E15"/></svg>`;
const ICONE_ESPECIAL = `<svg width="42" height="42" viewBox="0 0 42 42" aria-hidden="true"><path d="M14.7 4.62L9.24 6.3L2.94 11.76L7.14 18.06L10.5 15.96V38.22H31.5V15.96L34.86 18.06L39.06 11.76L32.76 6.3L27.3 4.62C23.1 7.7 18.9 7.7 14.7 4.62Z" fill="#126B34"/><path d="M21 19.32L22.533 23.499L26.985 23.667L23.499 26.439L24.696 30.723L21 28.245L17.304 30.723L18.501 26.439L15.015 23.667L19.467 23.499L21 19.32Z" fill="#8EE06A"/></svg>`;
const ICONE_BRINDE = `<svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden="true"><path d="M17 9.917V28.333M17 9.917C14.875 5.667 9.917 4.958 9.917 8.217C9.917 9.917 13.458 9.917 17 9.917ZM17 9.917C19.125 5.667 24.083 4.958 24.083 8.217C24.083 9.917 20.542 9.917 17 9.917ZM5.667 15.583H28.333V28.333H5.667V15.583ZM4.25 9.917H29.75V15.583H4.25V9.917Z" stroke="#126B34" stroke-width="2.55" stroke-linejoin="round"/></svg>`;

function icones(p) {
  return ICONE_CAMISA.repeat(p.comuns) + ICONE_ESPECIAL.repeat(p.especiais) + (p.brinde ? ICONE_BRINDE : "");
}

function esqueleto() {
  blocoPlanos.setAttribute("aria-busy", "true");
  blocoPlanos.innerHTML = Array.from({ length: 3 }, () => `
    <article class="cartao-plano" aria-hidden="true">
      <div class="cartao-plano__topo"><div class="esqueleto" style="height:22px;width:50%"></div><div class="esqueleto" style="height:40px;width:40%"></div></div>
      <div class="cartao-plano__corpo"><div class="esqueleto" style="height:42px;width:60%"></div><div class="esqueleto" style="height:120px"></div><div class="esqueleto" style="height:44px"></div></div>
    </article>`).join("");
}

function cartao(slug, p, { falha = false } = {}) {
  const art = document.createElement("article");
  art.className = "cartao-plano";
  art.setAttribute("aria-labelledby", `plano-${slug}`);
  const indisponivel = !falha && p.ativo === false;
  const preco = falha
    ? `<span class="cartao-plano__valor">—</span>`
    : `<span class="cartao-plano__moeda">R$</span><span class="cartao-plano__valor">${formatarValor(p.valor)}</span><span class="cartao-plano__periodo">/ mês</span>`;
  const selo = p.especiais > 0 ? `<span class="selo">Inclui camisa especial</span>` : "";
  let rodape;
  if (falha) {
    rodape = `<p class="cartao-plano__aviso"><span class="cartao-plano__aviso-icone" aria-hidden="true">!</span>Não foi possível consultar os planos. Tente novamente.</p>`;
  } else if (indisponivel) {
    const outros = Object.entries(PLANOS).filter(([s]) => s !== slug).map(([, o]) => o.nome).join(" ou ");
    rodape = `<p class="cartao-plano__aviso"><span class="cartao-plano__aviso-icone" aria-hidden="true">⊘</span>Plano temporariamente indisponível. Escolha ${outros}.</p>
      <button class="botao botao--largo" type="button" disabled>Indisponível</button>`;
  } else {
    rodape = `<button class="botao botao--escura botao--largo" type="button" data-escolher="${slug}">Escolher ${p.nome}</button>`;
  }
  art.innerHTML = `
    <div class="cartao-plano__topo">
      ${selo}
      <h3 class="cartao-plano__nome" id="plano-${slug}">${p.nome}</h3>
      <p class="cartao-plano__preco">${preco}</p>
    </div>
    <div class="cartao-plano__corpo">
      <div class="cartao-plano__icones">${icones(p)}</div>
      <p class="cartao-plano__composicao">${composicaoCurta(p)}</p>
      <ul class="beneficios">
        <li>Perfil com tamanho e preferências</li>
        <li>${textoTrocas(p)}</li>
        <li>Garantia anti-repetição</li>
        <li>Bloqueio do time rival</li>
        <li>Sem fidelidade</li>
      </ul>
      <div class="cartao-plano__espaco"></div>
      ${rodape}
    </div>`;
  return art;
}

async function carregarPlanos(porTentativa = false) {
  esqueleto();
  alertaFalha.hidden = true;
  try {
    if (!supabase) throw new Error("Supabase não configurado");
    const { data, error } = await supabase
      .from("planos")
      .select("nome, qtd_comuns, qtd_especiais, trocas_anuais, possui_brinde, valor_mensal, ativo")
      .order("valor_mensal");
    if (error) throw error;
    const porSlug = Object.fromEntries(data.map((l) => [slugDoNome(l.nome), deLinha(l)]));
    blocoPlanos.replaceChildren(
      ...Object.keys(PLANOS)
        .filter((slug) => porSlug[slug])
        .map((slug) => cartao(slug, porSlug[slug]))
    );
    if (!blocoPlanos.children.length) throw new Error("Nenhum plano cadastrado");
  } catch (erro) {
    console.error(erro);
    blocoPlanos.replaceChildren(...Object.entries(PLANOS).map(([slug, p]) => cartao(slug, p, { falha: true })));
    alertaFalha.hidden = false;
    if (porTentativa) alertaFalha.focus();
  } finally {
    blocoPlanos.setAttribute("aria-busy", "false");
  }
}

// Escolher um plano não ativa assinatura: apenas leva a intenção adiante.
// Visitante → cadastro (ou login, se veio de "Alterar plano" no login).
// Já autenticado → destino calculado (C02, C03 ou C04).
alertaFalha.querySelector("[data-tentar]").addEventListener("click", () => carregarPlanos(true));

blocoPlanos.addEventListener("click", async (e) => {
  const botao = e.target.closest("[data-escolher]");
  if (!botao || botao.disabled) return;
  const plano = botao.dataset.escolher;
  blocoPlanos.querySelectorAll("[data-escolher]").forEach((b) => (b.disabled = true));
  const retorno = new URLSearchParams(location.search).get("retorno");
  try {
    const sessao = await sessaoAtual();
    if (sessao) {
      location.assign(await resolverDestino({ plano, destino: null }));
      return;
    }
  } catch (erro) {
    console.error(erro);
  }
  const pagina = retorno === "entrar" ? "entrar.html" : "cadastro.html";
  location.assign(`${pagina}?plano=${plano}`);
});

// Ao voltar pelo histórico, a página pode vir do cache com os botões bloqueados.
addEventListener("pageshow", (e) => {
  if (e.persisted) blocoPlanos.querySelectorAll("[data-escolher]").forEach((b) => (b.disabled = false));
});

carregarPlanos();
