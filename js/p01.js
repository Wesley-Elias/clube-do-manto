// P01 — Apresentação e planos.
import { supabase, avisarSemConfiguracao } from "./supabase.js";
import { PLANOS, deLinha, slugDoNome } from "./planos.js";
import { cartaoPlano } from "./cartao-plano.js";
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

function esqueleto() {
  blocoPlanos.setAttribute("aria-busy", "true");
  blocoPlanos.innerHTML = Array.from({ length: 3 }, () => `
    <article class="cartao-plano" aria-hidden="true">
      <div class="cartao-plano__topo"><div class="esqueleto" style="height:22px;width:50%"></div><div class="esqueleto" style="height:40px;width:40%"></div></div>
      <div class="cartao-plano__corpo"><div class="esqueleto" style="height:42px;width:60%"></div><div class="esqueleto" style="height:120px"></div><div class="esqueleto" style="height:44px"></div></div>
    </article>`).join("");
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
        .map((slug) => cartaoPlano(slug, porSlug[slug]))
    );
    if (!blocoPlanos.children.length) throw new Error("Nenhum plano cadastrado");
  } catch (erro) {
    console.error(erro);
    blocoPlanos.replaceChildren(...Object.entries(PLANOS).map(([slug, p]) => cartaoPlano(slug, p, { falha: true })));
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

// Com sessão aberta, "Entrar" e "Criar conta" dão lugar a "Minha conta",
// que leva de volta à área da pessoa (o login redireciona quem já entrou).
sessaoAtual().then((sessao) => {
  if (!sessao) return;
  document.querySelectorAll(".nav__acoes, .menu-mobile__acoes").forEach((acoes) => {
    const largo = acoes.classList.contains("menu-mobile__acoes") ? " botao--largo" : "";
    const link = document.createElement("a");
    link.className = "botao botao--primaria" + largo;
    link.href = "entrar.html";
    link.textContent = "Minha conta";
    acoes.replaceChildren(link);
  });
}).catch((erro) => console.error(erro));
