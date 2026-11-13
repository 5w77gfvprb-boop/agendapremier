# Agenda Premier — como colocar no ar

Sistema **separado** do financeiro: outro banco (Supabase), outro site (Vercel) e outro login.

## 1. Banco de dados (Supabase)
1. Em https://supabase.com, crie um **projeto novo** (ex.: `agenda-premier`), região São Paulo.
2. Abra **SQL Editor → New query**, cole todo o arquivo `supabase/migrations/0001_agenda.sql` e clique em **Run**.
   Depois, cada um numa query nova e nesta ordem: `0002_patio_fotos.sql`, `0003_correcoes.sql`, `0004_backup_ativo.sql`, `0005_cortesia_confirmacao.sql` e `0006_arrastar.sql`.
   Já rodou algum antes? Rode só os que faltam (rodar de novo também não estraga nada).
   Ele já cadastra: Elevador 1, 2 e 3, Rampa de alinhamento, os mecânicos Eric e Thales, e os serviços Alinhamento (rampa) e Balanceamento (elevador), os dois com 30 min e preço zerado (ajuste em Ajustes).
   Pode rodar de novo sem problema: não duplica nada.
3. **Authentication → Users → Add user**: crie o login de cada pessoa que vai usar (e-mail + senha, marque *Auto Confirm User*).
4. **Project Settings → API**: copie a *Project URL* e a chave pública (*anon* / *publishable*).

## 2. Código (GitHub)
Crie um repositório **novo** (ex.: `agenda-premier`) e suba o conteúdo deste zip (pastas `src`, `supabase`, `public` e os arquivos da raiz).

## 3. Site (Vercel)
1. **Add New → Project**, escolha o repositório `agenda-premier`.
2. *Environment Variables*: não precisa. O endereço e a chave pública do Supabase já estão em `src/lib/config.ts` (se um dia trocar de projeto do Supabase, mude lá).
3. **Deploy**. No celular, abra o site e use “Adicionar à tela de início” para virar app.

## Primeiros passos no sistema
- **Ajustes**: confira o horário de funcionamento (vem seg–sex 08:00–18:00, almoço 12:00–13:00), cadastre os serviços com o tempo e o preço, e os feriados.
- **Agenda**: clique num horário vazio da grade (ou em “Agendar”). O sistema soma o tempo e o valor dos serviços, mostra quem está ocupado e não deixa marcar o mesmo mecânico ou elevador em dois carros ao mesmo tempo.
- **Concluir** pede o checklist de entrega e quem conferiu. O serviço vai para **Finalizados** até você tocar em “Recebi”.
- **Retornos**: quem ligou e ficou de agendar; aparece no dia de lembrar, com WhatsApp e “Agendar”.
- **Pátio**: onde está cada carro (chegou, em serviço, aguardando peça, pronto para retirar).
- **Fotos**: ficam no Storage do Supabase (bucket `fotos`, criado pelo 0002). O plano grátis tem 1 GB; o sistema reduz cada foto para ~200–400 KB, o que dá alguns milhares de fotos.

## Esqueci a senha (configurar uma vez)
O botão “Esqueci a senha” manda um e-mail com um link para criar a senha nova. Para funcionar:

1. **Authentication → URL Configuration**
   - *Site URL*: o endereço do site na Vercel (ex.: `https://agenda-premier.vercel.app`).
   - *Redirect URLs* → **Add URL**: o mesmo endereço com `/nova-senha` no fim (ex.: `https://agenda-premier.vercel.app/nova-senha`).
2. **Authentication → Emails → Reset Password** (modelo do e-mail). Troque o texto por este e salve:
   ```html
   <h2>Agenda Premier: nova senha</h2>
   <p>Toque no link abaixo para criar uma senha nova. Ele vale por 1 hora e só funciona uma vez.</p>
   <p><a href="{{ .SiteURL }}/nova-senha?token_hash={{ .TokenHash }}&type=recovery">Criar senha nova</a></p>
   <p>Se não foi você que pediu, ignore este e-mail.</p>
   ```
   Assim o link funciona em qualquer aparelho (pedir no computador e abrir no celular), e o Outlook/Hotmail não “gasta” o link ao verificar o e-mail.
3. **Quem recebe o e-mail**: o envio grátis do Supabase só manda para e-mails que fazem parte da equipe da conta, no máximo 2 por hora. Escolha um:
   - **Mais simples** (se só você e o Thales usam): em **Organization → Team → Invite**, convide o e-mail de login de cada pessoa. Isso dá acesso ao painel do Supabase, então só convide sócios.
   - **Para qualquer pessoa** (funcionário, por exemplo): use um Gmail para enviar. No Google, ative a verificação em duas etapas e crie uma *senha de app*. No Supabase, em **Authentication → Emails → SMTP Settings**, ligue *Enable custom SMTP*: host `smtp.gmail.com`, porta `465`, usuário = o Gmail, senha = a senha de app, remetente = o mesmo Gmail.

**Se o e-mail não chegar de jeito nenhum**, troque a senha direto: **SQL Editor → New query**, troque o e-mail e a senha e clique em **Run**:
```sql
update auth.users set encrypted_password = extensions.crypt('SenhaNova123', extensions.gen_salt('bf')) where email = 'email@da.pessoa';
```
Depois a pessoa troca para uma senha só dela em **Ajustes → Trocar minha senha** (no celular: **Mais → Trocar minha senha**).

## Backup
- **Ajustes → Backup → Baixar backup** gera um arquivo `.json` com tudo (menos as fotos, que continuam no Supabase). Guarde no Drive ou mande para o seu e-mail.
- Se ninguém baixar por 30 dias, aparece um aviso amarelo no topo da agenda.
- O sistema também guarda uma cópia sozinho a cada 7 dias (ao abrir a agenda), as 8 últimas, dentro do próprio banco.
- **Restaurar** troca todos os dados pelos do backup. Antes, ele guarda uma cópia do estado atual, então dá para desfazer em “Cópias guardadas”.

## Para o Supabase não pausar
O plano grátis pausa o banco depois de 7 dias sem uso. O site já vem com uma rotina da Vercel (arquivo `vercel.json`) que consulta o banco uma vez por dia, então a pausa não deve acontecer nem nas férias.
- Para conferir: na Vercel, **Settings → Cron Jobs** deve mostrar `/api/manter-ativo`. Abrir `https://SEU-SITE/api/manter-ativo` no navegador deve mostrar `"ok":true`.
- Se mesmo assim pausar, a agenda mostra uma tela explicando: entre em supabase.com/dashboard, abra o projeto e clique em **Resume project**. Nada é perdido. O Supabase também manda um e-mail de aviso antes de pausar.
