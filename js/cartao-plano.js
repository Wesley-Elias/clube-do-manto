// Cartão de plano (P01 e escolha do plano na C03).
// Disponível · falha de consulta · indisponível (botão desativado e explicação).
import { PLANOS, composicaoCurta, textoTrocas, formatarValor } from "./planos.js";

const ICONE_CAMISA = `<svg width="42" height="42" viewBox="0 0 42 42" aria-hidden="true"><path d="M14.7 4.62L9.24 6.3L2.94 11.76L7.14 18.06L10.5 15.96V38.22H31.5V15.96L34.86 18.06L39.06 11.76L32.76 6.3L27.3 4.62C23.1 7.7 18.9 7.7 14.7 4.62Z" fill="#0E1E15"/></svg>`;
const ICONE_ESPECIAL = `<svg width="42" height="42" viewBox="0 0 42 42" aria-hidden="true"><path d="M14.7 4.62L9.24 6.3L2.94 11.76L7.14 18.06L10.5 15.96V38.22H31.5V15.96L34.86 18.06L39.06 11.76L32.76 6.3L27.3 4.62C23.1 7.7 18.9 7.7 14.7 4.62Z" fill="#126B34"/><path d="M21 19.32L22.533 23.499L26.985 23.667L23.499 26.439L24.696 30.723L21 28.245L17.304 30.723L18.501 26.439L15.015 23.667L19.467 23.499L21 19.32Z" fill="#8EE06A"/></svg>`;
const ICONE_BRINDE = `<svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden="true"><path d="M17 9.917V28.333M17 9.917C14.875 5.667 9.917 4.958 9.917 8.217C9.917 9.917 13.458 9.917 17 9.917ZM17 9.917C19.125 5.667 24.083 4.958 24.083 8.217C24.083 9.917 20.542 9.917 17 9.917ZM5.667 15.583H28.333V28.333H5.667V15.583ZM4.25 9.917H29.75V15.583H4.25V9.917Z" stroke="#126B34" stroke-width="2.55" stroke-linejoin="round"/></svg>`;

function icones(p) {
  return ICONE_CAMISA.repeat(p.comuns) + ICONE_ESPECIAL.repeat(p.especiais) + (p.brinde ? ICONE_BRINDE : "");
}

export function cartaoPlano(slug, p, { falha = false, rotulo = `Escolher ${p.nome}`, titulo = "h3" } = {}) {
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
    rodape = `<button class="botao botao--escura botao--largo" type="button" data-escolher="${slug}">${rotulo}</button>`;
  }
  art.innerHTML = `
    <div class="cartao-plano__topo">
      <${titulo} class="cartao-plano__nome" id="plano-${slug}">${p.nome}</${titulo}>
      <p class="cartao-plano__preco">${preco}</p>
    </div>
    <div class="cartao-plano__corpo">
      <div class="cartao-plano__icones">${icones(p)}</div>
      <p class="cartao-plano__composicao">${composicaoCurta(p)}</p>
      ${selo}
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

