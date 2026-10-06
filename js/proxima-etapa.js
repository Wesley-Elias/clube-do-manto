// Página provisória para as telas das próximas etapas (C01–C05, A01, P04).
// Telas da conta exigem sessão: sem ela, volta ao login guardando o destino.
import { avisarSemConfiguracao } from "./supabase.js";
import { lerContexto, comContexto } from "./contexto.js";
import { PLANOS } from "./planos.js";
import { sessaoAtual, sair } from "./sessao.js";

avisarSemConfiguracao();

const NOMES = {
  P04: "Coleção",
  C01: "Painel do cliente",
  C02: "Meu perfil",
  C03: "Confirmação da assinatura",
  C04: "Minha assinatura",
  C05: "Kits e histórico",
  C06: "Detalhes do kit",
  C08: "Minhas trocas",
  A01: "Painel administrativo",
};
const FILTROS = { clubes: "Clubes internacionais", selecoes: "Seleções", especiais: "Especiais" };

const params = new URLSearchParams(location.search);
const tela = NOMES[params.get("tela")] ? params.get("tela") : "C01";
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
    const destino = tela === "C04" || tela === "C05" ? tela : null;
    location.replace(comContexto("entrar.html", { plano: contexto.plano, destino }));
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
