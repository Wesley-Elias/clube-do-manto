// Diálogo modal sobre <dialog>: foco preso pelo navegador, Esc fecha e o foco
// volta para o elemento que abriu. Usado na C03 (escolher plano) e na C04 (cancelar).

export function criarDialogo(dialogo, { aoFechar } = {}) {
  let origem = null;
  let bloqueado = false;

  function abrir(gatilho = document.activeElement) {
    origem = gatilho;
    if (!dialogo.open) dialogo.showModal();
    const alvo = dialogo.querySelector("[data-foco-inicial]") || dialogo.querySelector("h2");
    alvo?.focus();
  }

  function fechar() {
    if (!dialogo.open) return;
    dialogo.close();
  }

  // Durante uma operação, Esc e o fundo não fecham o diálogo.
  function bloquear(sim) {
    bloqueado = sim;
  }

  dialogo.addEventListener("cancel", (e) => {
    if (bloqueado) e.preventDefault();
  });
  dialogo.addEventListener("close", () => {
    aoFechar?.();
    if (origem && document.contains(origem)) origem.focus();
  });
  // Clique no véu (fora da caixa) fecha
  dialogo.addEventListener("click", (e) => {
    if (e.target === dialogo && !bloqueado) fechar();
  });
  dialogo.querySelectorAll("[data-fechar-dialogo]").forEach((b) => b.addEventListener("click", fechar));

  return { abrir, fechar, bloquear, elemento: dialogo };
}
