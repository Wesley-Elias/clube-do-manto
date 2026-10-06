# Clube do Manto — site (HTML, CSS, JavaScript + Supabase)

Implementado até aqui: **P01** (apresentação e planos), **P02** (cadastro), **P03** (login e recuperação de senha), **C01** (painel do cliente) e **C02** (preferências e Meu perfil). Segue o design final do Figma e a especificação em `design-final/especificacao/`.

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
| `proxima-etapa.html` | provisória | marca C03–C08, A01 e P04 até essas telas existirem; exige sessão nas telas da conta; botão Sair |

## Regras que o código garante

- Escolher um plano **não ativa assinatura**: a intenção viaja só na URL (`?plano=torcedor|fanatico|colecionador`) por cadastro, login, recuperação e link de e-mail. Acesso pelo menu não carrega plano.
- Destino após o login: administrador → A01; com plano → C02 (perfil incompleto), C03 (perfil completo) ou C04 (já tem assinatura ativa); com `?destino=C04|C05` (rodapé) → essa tela; senão C01. O papel vem do banco (`eh_administrador()`), nunca da tela.
- Botões que enviam ficam bloqueados até a resposta (sem clique duplicado).
- Redefinir a senha encerra a sessão temporária do link e manda de volta ao login.
- Sair limpa a sessão local e volta para `entrar.html`.
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
supabase/migrations/  001 = esquema; 002 = acesso público e login; 003 = painel e perfil
```

## Supabase

Projeto **clube-do-manto** (região São Paulo, plano gratuito), com as migrações 001 e 002 aplicadas. `js/config.js` já aponta para ele. A chave em `config.js` é a **publicável** (pública por natureza); a proteção vem das políticas de RLS. Nunca coloque a chave `service_role` no site.

A migração 003 cadastra as equipes provisórias (clubes internacionais e seleções, sem clubes brasileiros), oferece `tamanhos_do_catalogo()` (tamanhos com estoque; enquanto o estoque estiver vazio, a lista provisória P, M, G, GG), grava o perfil só pela função `salvar_perfil()`, que valida tamanho, equipes e favorita diferente da rival, e libera a leitura dos próprios kits, itens e trocas.

A migração 002 abre só o necessário: leitura pública de `planos`, criação automática do perfil no cadastro (nome vem do formulário), leitura do próprio perfil e da própria assinatura e a função `eh_administrador()`.

**Ajustes no painel do Supabase** (Authentication → URL Configuration), necessários para os links de e-mail:

- *Site URL*: o endereço onde o site for publicado (ou `http://localhost:8000` enquanto testa localmente).
- *Redirect URLs*: adicione `<endereço>/entrar.html**` e `<endereço>/redefinir-senha.html**`.

Observações:

- A confirmação de e-mail vem ligada por padrão. Com ela, o cadastro mostra "Confirmação de e-mail necessária". Se desligar (Authentication → Sign In / Providers → Email → *Confirm email*), o cadastro abre a sessão e mostra "Conta criada!".
- O envio de e-mails padrão do Supabase tem limite baixo por hora; para a apresentação, vale configurar um SMTP próprio ou desligar a confirmação.
- O link de recuperação usa PKCE: precisa ser aberto no mesmo navegador em que foi pedido. Em outro navegador ele aparece como "Este link é inválido".

Para tornar uma conta administradora, no SQL Editor:

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
