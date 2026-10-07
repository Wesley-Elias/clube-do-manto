# Clube do Manto — site (HTML, CSS, JavaScript + Supabase)

Implementado até aqui: **P01** (apresentação e planos), **P02** (cadastro), **P03** (login e recuperação de senha), **P04** (coleção), a área do cliente **C01 a C08** (painel, perfil, confirmação da assinatura, minha assinatura, kits e histórico, detalhes do kit, solicitar troca e minhas trocas) e a administração **A01 a A10** (painel, catálogo, equipe, camisa, estoque, assinantes, detalhes do assinante, montagem do kit, solicitações de troca e processamento da troca). Segue o design final do Figma e a especificação em `design-final/especificacao/`.

## Páginas

| Arquivo | Tela | Estados cobertos |
| --- | --- | --- |
| `index.html` | P01 | planos carregando, disponíveis, falha de consulta, plano indisponível; menu mobile; faixa com pausa; dúvidas |
| `cadastro.html` | P02 | pelo menu (sem plano) ou com `?plano=`; validação; criando conta; falha; conta criada; confirmação de e-mail necessária |
| `entrar.html` | P03 login | pelo menu ou com plano; validação; entrando; credenciais incorretas; falha de comunicação; destino por papel |
| `recuperar-senha.html` | P03 recuperação | e-mail inválido; enviando; orientação após envio; reenviar; falha no envio |
| `redefinir-senha.html` | P03 nova senha | link expirado; link inválido; senhas diferentes; salvando; falha ao salvar; senha alterada (não autentica) |
| `painel.html` | C01 | carregando; falha com Tentar novamente; perfil incompleto; sem assinatura; ativa com kit do mês, sem kit do mês ou primeiro kit; cancelada; trocas recentes; menu mobile |
| `perfil.html` | C02 | preferências no primeiro acesso (2 etapas) ou com plano (3 etapas, segue para C03); Meu perfil; campos obrigatórios; favorita igual à rival; salvando; salvo; falha |
| `confirmar-plano.html` | C03 | escolha do plano na própria tela (sem `?plano=`); revisão; perfil incompleto; plano indisponível; confirmando; falha com Tentar novamente; assinatura confirmada; assinatura já ativa; revisão e falha da reativação |
| `assinatura.html` | C04 | carregando; falha; sem assinatura; ativa; cancelada; diálogo de cancelamento (confirmar, processando, falha); aviso após reativar |
| `kits.html` | C05 | abas Kits por mês e Histórico de modelos (`?aba=historico`); listas vazias; aviso de assinatura cancelada; falha |
| `kit.html` | C06 | faixa de dados do kit; composição atual com Solicitar troca, Ver solicitação ou motivo do bloqueio; composição original e alterações (expansível); kit não encontrado; falha |
| `solicitar-troca.html` | C07 | modalidades Modelo, Tamanho e Modelo e tamanho; tamanho de destino diferente do atual; resumo do pedido; enviando; solicitação registrada; bloqueios (camisa inexistente, não atual, pedido em aberto, assinatura inativa, limite atingido); recusa do banco e resultado não confirmado |
| `trocas.html` | C08 | lista com detalhe expansível (`?troca=`); camisa do pedido e após a conclusão; vazia; aviso de assinatura cancelada; falha |
| `colecao.html` | P04 | filtros Todas, Clubes internacionais, Seleções e Especiais (`?filtro=`); carregando; sem resultados; falha; detalhes do modelo (`?camisa=`) que voltam ao filtro de origem; modelo não encontrado |
| `admin.html` | A01 | atalhos para Catálogo, Estoque, Assinantes e Trocas; solicitações em Solicitada; nenhum pedido; falha; acesso não autorizado; sem sessão → login |
| `catalogo.html` | A02 | abas Equipes e Camisas (`?aba=`); busca e filtro na URL; Limpar; vazio; sem resultado; chips Ativo/Inativo; diálogo de inativação (processando, falha, resultado não confirmado) |
| `equipe.html` | A03 | cadastro e edição (`?id=`); campos obrigatórios; registro equivalente; campos bloqueados quando a equipe tem camisas ou histórico; salvando; sucesso com atalho para cadastrar camisa; falha |
| `camisa.html` | A04 | cadastro e edição (`?id=`, `?equipe=`); temporada AAAA ou AAAA/AAAA; classificação incoerente; clube brasileiro; modelo duplicado; campos bloqueados quando o modelo já entrou em kit; sucesso com Cadastrar estoque |
| `estoque.html` | A05 | filtro por modelo (`?camisa=`); Disponível/Sem saldo; sem linhas; diálogos Cadastrar saldo (só tamanhos ainda não registrados) e Repor; quantidade inválida; processando; sucesso; resultado não confirmado atualiza a consulta antes de repetir |
| `assinantes.html` | A06 | busca por nome ou referência e filtro Ativas/Canceladas na URL; Limpar filtros; nenhum assinante; sem resultado; falha |
| `assinante.html` | A07 | perfil, plano e trocas da assinatura (sem saldo); kit da competência atual (montar, consultar ou motivo da inelegibilidade); abas Kits por mês e Histórico de modelos; kit aberto (`?kit=`) com composição atual, original e alterações; não encontrado |
| `montar-kit.html` | A08 | pronto para montar; kit registrado; kit já existente (sem nova baixa); inelegível (cancelada, plano inativo, perfil incompleto); estoque insuficiente com Consultar estoque; resultado não confirmado com Consultar situação; falha |
| `solicitacoes-troca.html` | A09 | filtros Assinante e Estado na URL (`?assinante=`, `?estado=`); Atualizar consulta; Solicitada primeiro; vazio; sem resultado; falha |
| `processar-troca.html` | A10 | solicitação em aberto com verificações; diálogos Concluir troca e Rejeitar solicitação; sem estoque (pedido segue Solicitada); bloqueios (cancelada, limite, item não atual); pedido já encerrado; resultado não confirmado; registro de concluídas e rejeitadas |

## Regras que o código garante

- Escolher um plano **não ativa assinatura**: a intenção viaja só na URL (`?plano=torcedor|fanatico|colecionador`) por cadastro, login, recuperação e link de e-mail. Acesso pelo menu não carrega plano.
- Destino após o login: administrador → A01; com plano → C02 (perfil incompleto), C03 (perfil completo) ou C04 (já tem assinatura ativa); com `?destino=C04|C05` (rodapé) → essa tela; senão C01. O papel vem do banco (`eh_administrador()`), nunca da tela.
- Ativar, cancelar e reativar passam por funções do banco (`ativar_assinatura`, `cancelar_assinatura`, `reativar_assinatura`). A reativação pode mudar de plano, **não renova o limite de trocas** e estende o ciclo pelo tempo em que a assinatura ficou cancelada (o período cancelado não conta nos 12 meses).
- A interface **não mostra saldo de trocas nem datas do ciclo** (decisão de 05/10/2026): `situacao_trocas()` devolve só `disponivel`, `limite_atingido`, `cancelada` ou `sem_assinatura`.
- Solicitar uma troca (`solicitar_troca`) não altera a composição do kit: o pedido fica em **Solicitada** e a camisa substituta é definida no processamento administrativo. Não há campo de motivo, e a rejeição não registra motivo nem data.
- Modalidade **Modelo** mantém o tamanho; **Tamanho** e **Modelo e tamanho** exigem um destino diferente do atual.
- Botões que enviam ficam bloqueados até a resposta (sem clique duplicado).
- Redefinir a senha encerra a sessão temporária do link e manda de volta ao login.
- Sair limpa a sessão local e volta para `entrar.html`.
- A coleção mostra só camisas ativas de equipes ativas e não promete disponibilidade nem um modelo específico. As ilustrações são genéricas e provisórias.
- A área administrativa confere o papel no banco (`eh_administrador()`); um cliente que abre essas páginas vê "Você não possui acesso a esta área". Toda gravação do admin passa por funções `admin_*` que recusam quem não é administrador.
- Catálogo é inativado, nunca apagado. Modelo já usado em kit não muda equipe, tipo, categoria nem temporada; equipe com camisas não muda natureza; equipe com histórico não muda nome nem país. Clubes brasileiros não recebem camisas.
- O estoque só permite cadastrar o saldo de um tamanho novo (P, M, G ou GG) e repor unidades. Não há baixa arbitrária.
- A montagem do kit (`admin_montar_kit`) é integral: o kit inteiro é registrado com a baixa de estoque ou nada muda. Vale uma vez por cliente e competência (mês no fuso de São Paulo); repetir devolve o kit existente sem nova baixa. Só entram camisas ativas, no tamanho do perfil, com saldo, de equipe que não é a rival e de modelo nunca recebido pelo cliente (equipe + temporada + categoria).
- Propostas operacionais aplicadas, ainda a consolidar: a equipe preferida tem prioridade entre os modelos elegíveis, sem peso numérico nem garantia; na conclusão de uma troca de modelo, a substituta é escolhida automaticamente no mesmo grupo (comum por comum, especial por especial); sem estoque elegível a solicitação continua Solicitada; a camisa devolvida não volta ao estoque.
- Concluir troca (`admin_concluir_troca`) revalida pedido, assinatura ativa, limite do ciclo e item atual; rejeitar (`admin_rejeitar_troca`) muda só o estado. As referências CL-001 e TR-001 são calculadas pela ordem de cadastro, sem coluna nova.
- Contato, Termos de uso e Política de privacidade são texto, sem link.
- `prefers-reduced-motion` para a faixa e as transições (regra em `tokens.css`).

## Estrutura

```
css/tokens.css        cópia de design-final/especificacao/tokens.css (a fonte é a da especificação)
css/componentes.css   botão, campo, alerta, resumo do plano, cabeçalho/rodapé de fluxo
css/p01.css           layout da P01
css/fluxo.css         layout de P02/P03
js/config.js          URL e chave pública do Supabase
js/supabase.js        cliente único (PKCE)
js/planos.js          regras dos planos e Resumo do plano
js/contexto.js        intenção de plano e destino na URL
js/sessao.js          sessão, destino após login e Sair
js/formulario.js      validação junto ao campo, mostrar senha, processamento
css/cliente.css       cabeçalho do cliente, C01 e C02
js/cliente.js         sessão obrigatória, cabeçalho do cliente e formatação
js/busca-equipe.js    seleção de equipe com busca (teclado e leitor de tela)
css/planos.css        cartão de plano e selo (P01 e diálogo da C03)
css/conta.css         C03 a C08: diálogos, tabelas que viram cartões no celular, abas, faixa de dados, camisas do kit
js/cartao-plano.js    cartão de plano reutilizado por P01 e C03
js/dialogo.js         diálogo modal (<dialog>) com foco preso e retorno ao gatilho
js/assinatura-comum.js  planos, assinatura e blocos compartilhados por C03 e C04
js/kits-comum.js      leitura de kits, itens, trocas e camisas; cartão de camisa e faixa de dados
css/colecao.css       P04
css/admin.css         A01 a A10 (atalhos, consulta, formulários, estoque, assinante, kit e troca)
js/colecao.js         P04: galeria, filtros e detalhes
js/admin.js          sessão e papel de administrador, cabeçalho administrativo, rótulos e países
js/admin-painel.js, js/catalogo.js, js/equipe.js, js/camisa.js, js/estoque.js   A01 a A05
js/admin-operacao.js  peças compartilhadas por A06 a A10
js/assinantes.js, js/assinante.js, js/montar-kit.js, js/solicitacoes-troca.js, js/processar-troca.js   A06 a A10
supabase/migrations/  001 = esquema; 002 = acesso público e login; 003 = painel e perfil; 004 = tamanhos oficiais; 005 = assinatura e trocas do cliente; 006 = coleção, catálogo e estoque; 007 = assinantes, kits e trocas da administração
```

## Supabase

Projeto **clube-do-manto** (região São Paulo, plano gratuito), com as migrações 001 e 002 aplicadas. `js/config.js` já aponta para ele. A chave em `config.js` é a **publicável** (pública por natureza); a proteção vem das políticas de RLS. Nunca coloque a chave `service_role` no site.

A migração 003 cadastra as equipes provisórias (clubes internacionais e seleções, sem clubes brasileiros), oferece `tamanhos_do_catalogo()`, grava o perfil só pela função `salvar_perfil()`, que valida tamanho, equipes e favorita diferente da rival, e libera a leitura dos próprios kits, itens e trocas.

A migração 004 fixa a lista oficial de tamanhos: **P, M, G e GG** (decisão de 06/10/2026). Perfil, estoque e trocas só aceitam esses valores, e `tamanhos_do_catalogo()` devolve essa lista.

A migração 005 traz as regras de assinatura e troca do cliente: `ativar_assinatura()`, `cancelar_assinatura()`, `reativar_assinatura()`, `situacao_trocas()` e `solicitar_troca()`. Os ciclos de 12 meses são criados e renovados pelo banco, o período cancelado é descontado na reativação e as funções auxiliares ficam no esquema `private`, sem acesso pelo site.

A migração 006 cadastra seis modelos demonstrativos (os mesmos do design final, marcados na descrição), libera a leitura do estoque só para administradores e cria as funções da administração: `admin_trocas_em_aberto()`, `admin_salvar_equipe()`, `admin_salvar_camisa()`, `admin_inativar_equipe()`, `admin_inativar_camisa()`, `admin_uso_da_equipe()`, `admin_uso_da_camisa()`, `admin_cadastrar_saldo()` e `admin_repor_estoque()`.

A migração 007 cria as funções de A06 a A10: `admin_assinantes()`, `admin_assinante()`, `admin_montar_kit()`, `admin_trocas()`, `admin_troca()`, `admin_concluir_troca()` e `admin_rejeitar_troca()`. Todas conferem o papel de administrador; nenhuma tabela ganha leitura geral pela API.

A migração 002 abre só o necessário: leitura pública de `planos`, criação automática do perfil no cadastro (nome vem do formulário), leitura do próprio perfil e da própria assinatura e a função `eh_administrador()`.

**Ajustes no painel do Supabase** (Authentication → URL Configuration), necessários para os links de e-mail:

- *Site URL*: o endereço onde o site for publicado (ou `http://localhost:8000` enquanto testa localmente).
- *Redirect URLs*: adicione `<endereço>/entrar.html**` e `<endereço>/redefinir-senha.html**`.

Observações:

- A confirmação de e-mail vem ligada por padrão. Com ela, o cadastro mostra "Confirmação de e-mail necessária". Se desligar (Authentication → Sign In / Providers → Email → *Confirm email*), o cadastro abre a sessão e mostra "Conta criada!".
- O envio de e-mails padrão do Supabase tem limite baixo por hora; para a apresentação, vale configurar um SMTP próprio ou desligar a confirmação.
- O link de recuperação usa PKCE: precisa ser aberto no mesmo navegador em que foi pedido. Em outro navegador ele aparece como "Este link é inválido".

Para tornar uma conta administradora, no SQL Editor (a conta administradora entra direto na A01, sem passar pela área do cliente; para testar as duas áreas, use contas diferentes):

```sql
INSERT INTO private.administradores (usuario_id)
SELECT id FROM auth.users WHERE email = 'seu-email@exemplo.com';
```

## Rodar localmente

Os scripts são módulos ES, então é preciso um servidor (abrir o arquivo direto no navegador não funciona):

```
cd site
python3 -m http.server 8000
```

Depois abra `http://localhost:8000`.
