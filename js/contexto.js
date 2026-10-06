// Intenção de plano e destino solicitado.
// A intenção viaja somente pela URL (?plano=...&destino=...). Assim o acesso pelo
// menu, sem parâmetro, nunca assume um plano arbitrário, e escolher um plano não
// ativa assinatura: só a confirmação na C03 faz isso.
import { PLANOS } from "./planos.js";

const DESTINOS = new Set(["C04", "C05"]);

export function lerContexto() {
  const params = new URLSearchParams(location.search);
  const plano = params.get("plano");
  const destino = params.get("destino");
  return {
    plano: plano && PLANOS[plano] ? plano : null,
    destino: destino && DESTINOS.has(destino) ? destino : null,
  };
}

// Monta um link interno carregando a intenção atual.
export function comContexto(caminho, contexto = lerContexto(), extras = {}) {
  const url = new URL(caminho, location.href);
  if (contexto.plano) url.searchParams.set("plano", contexto.plano);
  if (contexto.destino) url.searchParams.set("destino", contexto.destino);
  for (const [chave, valor] of Object.entries(extras)) {
    if (valor) url.searchParams.set(chave, valor);
  }
  return url.pathname.split("/").pop() + url.search + url.hash;
}

// Atualiza todos os links marcados com data-contexto para levar plano/destino.
export function propagarContexto(contexto = lerContexto()) {
  document.querySelectorAll("a[data-contexto]").forEach((a) => {
    a.setAttribute("href", comContexto(a.getAttribute("href"), contexto));
  });
}
