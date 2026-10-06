// Página provisória para as telas que ainda não existem (P04 e A01).
// A01 exige sessão: sem ela, volta ao login.
import { avisarSemConfiguracao } from "./supabase.js";
import { lerContexto, comContexto } from "./contexto.js";
import { PLANOS } from "./planos.js";
import { sessaoAtual, sair } from "./sessao.js";

avisarSemConfiguracao();

const NOMES = {
  P04: "Coleção",
  A01: "Painel administrativo",
};
const FILTROS = { clubes: "Clubes internacionais", selecoes: "Seleções", especiais: "Especiais" };

const params = new URLSearchParams(location.search);
const tela = NOMES[params.get("tela")] ? params.get("tela") : "A01";
const contexto = lerContexto();

document.querySelector("[data-codigo]").textContent = tela;
document.querySelector("[data-titulo]").textContent = NOMES[tela];
document.title = `${NOMES[tela]} · Clube do Manto`;

const detalhes = document.querySelector("[data-detalhes]");
function detalhe(texto) {
  const li = document.createElement("li");
  li.textContent = texto;
  detalhes.append(li);
}

(async () => {
  let sessao = null;
  try {
    sessao = await sessaoAtual();
  } catch (erro) {
    console.error(erro);
  }
  if (tela !== "P04" && !sessao) {
    location.replace(comContexto("entrar.html", { plano: contexto.plano }));
    return;
  }
  if (sessao) {
    detalhe(`Conta: ${sessao.user.email}`);
    const botaoSair = document.querySelector("[data-sair]");
    botaoSair.hidden = false;
    botaoSair.addEventListener("click", () => {
      botaoSair.disabled = true;
      sair();
    });
  }
  if (contexto.plano) detalhe(`Plano escolhido: ${PLANOS[contexto.plano].nome} (ainda sem assinatura ativa)`);
  const filtro = FILTROS[params.get("filtro")];
  if (filtro) detalhe(`Filtro de origem: ${filtro}`);
  if (!detalhes.children.length) detalhes.hidden = true;
})();
