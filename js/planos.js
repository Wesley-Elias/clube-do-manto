// Regras oficiais dos planos (Plano do MVP e ck_planos_configuracao).
// Usadas no Resumo do plano do cadastro e do login. A P01 consulta a tabela planos.
export const PLANOS = {
  torcedor: { nome: "Torcedor", valor: 99, comuns: 1, especiais: 0, trocas: 1, brinde: false },
  fanatico: { nome: "Fanático", valor: 169, comuns: 2, especiais: 0, trocas: 2, brinde: true },
  colecionador: { nome: "Colecionador", valor: 299, comuns: 2, especiais: 1, trocas: 3, brinde: true },
};

export function slugDoNome(nome) {
  return nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function composicaoCurta(p) {
  if (p.especiais > 0) return `${p.comuns} comuns + ${p.especiais} especial por mês${p.brinde ? " + brinde" : ""}`;
  const camisas = p.comuns === 1 ? "1 camisa comum" : `${p.comuns} camisas comuns`;
  return `${camisas} por mês${p.brinde ? " + brinde" : ""}`;
}

export function textoTrocas(p) {
  return p.trocas === 1 ? "1 troca a cada 12 meses" : `${p.trocas} trocas a cada 12 meses`;
}

export function formatarValor(valor) {
  return Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

// Converte uma linha da tabela planos para o formato usado na interface.
export function deLinha(linha) {
  return {
    nome: linha.nome,
    valor: linha.valor_mensal,
    comuns: linha.qtd_comuns,
    especiais: linha.qtd_especiais,
    trocas: linha.trocas_anuais,
    brinde: linha.possui_brinde,
    ativo: linha.ativo,
  };
}

// Preenche um bloco .resumo-plano já presente no HTML.
export function preencherResumo(elemento, slug) {
  const p = PLANOS[slug];
  if (!elemento || !p) return;
  elemento.querySelector("[data-resumo='nome']").textContent = p.nome;
  elemento.querySelector("[data-resumo='valor']").textContent = `R$ ${formatarValor(p.valor)}`;
  const composicao = composicaoCurta(p).replace("+ brinde", "+ brinde previsto");
  elemento.querySelector("[data-resumo='composicao']").textContent = composicao;
  elemento.querySelector("[data-resumo='trocas']").textContent = textoTrocas(p);
}
