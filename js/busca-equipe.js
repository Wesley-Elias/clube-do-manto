// Seleção de equipe com busca (combobox com lista).
// Teclado: setas movem, Enter escolhe, Esc fecha; digitar filtra sem diferenciar acentos.
const GRUPOS = [
  ["clube", "Clubes internacionais"],
  ["selecao", "Seleções"],
];

const normalizar = (texto) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function criarBuscaEquipe(bloco, equipes) {
  const entrada = bloco.querySelector("[role=combobox]");
  const lista = bloco.querySelector("[role=listbox]");
  const abrirBotao = bloco.querySelector(".busca-equipe__abrir");
  const porId = new Map(equipes.map((e) => [String(e.id), e]));
  let selecionada = null;
  let opcoes = [];
  let ativa = -1;
  const ouvintes = [];

  function renderizar(filtro) {
    const termo = normalizar(filtro);
    lista.replaceChildren();
    opcoes = [];
    for (const [natureza, rotulo] of GRUPOS) {
      const doGrupo = equipes.filter((e) => e.natureza === natureza && (!termo || normalizar(e.nome).includes(termo)));
      if (!doGrupo.length) continue;
      const cabecalho = document.createElement("li");
      cabecalho.className = "busca-equipe__grupo";
      cabecalho.setAttribute("role", "presentation");
      cabecalho.textContent = rotulo;
      lista.append(cabecalho);
      for (const equipe of doGrupo) {
        const li = document.createElement("li");
        li.className = "busca-equipe__opcao";
        li.id = `${lista.id}-${equipe.id}`;
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", String(selecionada?.id === equipe.id));
        li.textContent = equipe.nome;
        li.dataset.id = equipe.id;
        li.addEventListener("mousedown", (e) => e.preventDefault());
        li.addEventListener("click", () => {
          escolher(equipe);
          fechar();
        });
        lista.append(li);
        opcoes.push(li);
      }
    }
    if (!opcoes.length) {
      const vazio = document.createElement("li");
      vazio.className = "busca-equipe__vazio";
      vazio.setAttribute("role", "presentation");
      vazio.textContent = "Nenhuma equipe encontrada.";
      lista.append(vazio);
    }
    marcarAtiva(opcoes.findIndex((o) => o.getAttribute("aria-selected") === "true"));
  }

  function marcarAtiva(indice) {
    opcoes.forEach((o) => o.classList.remove("busca-equipe__opcao--ativa"));
    ativa = indice;
    if (indice >= 0 && opcoes[indice]) {
      opcoes[indice].classList.add("busca-equipe__opcao--ativa");
      entrada.setAttribute("aria-activedescendant", opcoes[indice].id);
      opcoes[indice].scrollIntoView({ block: "nearest" });
    } else {
      entrada.removeAttribute("aria-activedescendant");
    }
  }

  function abrir(filtro = "") {
    renderizar(filtro);
    lista.hidden = false;
    entrada.setAttribute("aria-expanded", "true");
  }
  function fechar() {
    lista.hidden = true;
    entrada.setAttribute("aria-expanded", "false");
    entrada.removeAttribute("aria-activedescendant");
  }

  function escolher(equipe, avisar = true) {
    selecionada = equipe;
    entrada.value = equipe ? equipe.nome : "";
    if (avisar) ouvintes.forEach((f) => f(equipe));
  }

  // Ao sair do campo, o texto precisa corresponder a uma equipe da lista.
  function confirmarTexto() {
    const termo = normalizar(entrada.value);
    if (!termo) return escolher(null);
    const exata = equipes.find((e) => normalizar(e.nome) === termo);
    if (exata) return escolher(exata);
    entrada.value = selecionada ? selecionada.nome : "";
  }

  entrada.addEventListener("input", () => abrir(entrada.value));
  entrada.addEventListener("click", () => {
    if (lista.hidden) abrir();
  });
  entrada.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (lista.hidden) return abrir(entrada.value);
      if (!opcoes.length) return;
      const passo = e.key === "ArrowDown" ? 1 : -1;
      marcarAtiva((ativa + passo + opcoes.length) % opcoes.length);
    } else if (e.key === "Enter") {
      if (!lista.hidden && ativa >= 0) {
        e.preventDefault();
        escolher(porId.get(opcoes[ativa].dataset.id));
        fechar();
      }
    } else if (e.key === "Escape") {
      if (!lista.hidden) {
        e.preventDefault();
        fechar();
        entrada.value = selecionada ? selecionada.nome : "";
      }
    }
  });
  entrada.addEventListener("blur", () => {
    fechar();
    confirmarTexto();
  });
  abrirBotao.addEventListener("mousedown", (e) => e.preventDefault());
  abrirBotao.addEventListener("click", () => {
    if (lista.hidden) {
      abrir();
      entrada.focus();
    } else fechar();
  });

  return {
    entrada,
    get valor() {
      return selecionada ? selecionada.id : null;
    },
    get nome() {
      return selecionada ? selecionada.nome : "";
    },
    definir(id) {
      escolher(porId.get(String(id)) || null, false);
    },
    aoMudar(funcao) {
      ouvintes.push(funcao);
    },
  };
}
