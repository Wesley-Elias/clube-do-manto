// Página provisória para as telas que ainda não existem (A06 e A09).
// Exigem sessão: sem ela, volta ao login.
import { avisarSemConfiguracao } from "./supabase.js";
import { lerContexto, comContexto } from "./contexto.js";
import { PLANOS } from "./planos.js";
import { sessaoAtual, sair } from "./sessao.js";

avisarSemConfiguracao();

const NOMES = {
  A06: "Assinantes",
  A09: "Solicitações de troca",
};

const params = new URLSearchParams(location.search);
const tela = NOMES[params.get("tela")] ? params.get("tela") : "A06";
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
  if (!sessao) {
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
  if (!detalhes.children.length) detalhes.hidden = true;
})();
