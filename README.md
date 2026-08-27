# Central da Agência

Painel privado para organizar clientes, projetos, prazos, links, repositórios,
condições comerciais e assinaturas da agência. O MVP usa um projeto por cartão
no Kanban e mantém o sistema como fonte de verdade para o Google Agenda.

## O que já está implementado

- Visão geral operacional com atrasos, próximos 7 dias, bloqueios, renovações e margem.
- Portfólio separado do Kanban, com busca por projeto, cliente ou tecnologia e filtros por responsável, fluxo e situação.
- Múltiplos fluxos configuráveis, Kanban acessível, sprints opcionais e backlog por fluxo.
- Administração estilo Jira para criar, editar e excluir fluxos, etapas, sprints e tecnologias.
- Exclusão permanente dos registros operacionais com confirmação, regras de dependência e rastreabilidade.
- Log automático e imutável de criação, edição e exclusão, com autor, horário, entidade e campos alterados.
- Clientes, calendário, financeiro protegido e configurações da equipe.
- Despesas administrativas separadas das assinaturas, com ciclo, vencimento, status, edição e exclusão auditada.
- Página completa do projeto: resumo, fluxo/sprint, stack tecnológica, checklist/prazos, links/GitHub, financeiro/assinaturas e histórico.
- Modelos de site institucional, plataforma de cursos e manutenção.
- Gestão de acessos pelo proprietário, com nome completo, papel, suspensão e exclusão.
- Login por e-mail + PIN de seis dígitos ou Google, com sessão SSR em cookies/PKCE.
- Perfil individual com foto JPG, PNG ou WebP e troca do próprio PIN.
- Supabase Postgres com isolamento por workspace, RLS e grants explícitos.
- OAuth separado do Google Calendar, tokens AES-256-GCM, fila idempotente e cron diário.
- Snapshot demonstrativo sem segredos para abrir a interface antes de configurar a infraestrutura.

## Desenvolvimento local

Requisitos: Node.js 22.12+ e pnpm 11 via Corepack.

```bash
corepack enable
corepack pnpm install
corepack pnpm dev
```

Abra `http://localhost:3000`. Sem variáveis de ambiente, a aplicação entra em
modo demonstração somente para leitura/gravações simuladas. Ela nunca mistura
esse snapshot com linhas de um Supabase configurado.

Validação local:

```bash
corepack pnpm lint
corepack pnpm test
corepack pnpm exec tsc --noEmit
corepack pnpm build
```

## Configuração do Supabase

1. Crie um projeto Supabase e aplique, em ordem, as migrações de
   `supabase/migrations/`. As migrações posteriores adicionam fluxos, sprints,
   backlog, tecnologias e o log imutável sem descartar os projetos existentes.
2. No Auth, habilite e-mail/senha e, se desejado, o provedor Google. Para aceitar
   o PIN solicitado pelo produto, a política de senha precisa permitir seis
   caracteres. Isso é uma concessão consciente: o Supabase recomenda no mínimo
   oito caracteres, portanto o login Google deve continuar como opção preferencial.
   Registre `https://SEU-DOMINIO/auth/callback` nas URLs permitidas para o Google.
3. Copie `.env.example` para `.env.local` e preencha URL, publishable key e a
   secret key de servidor.
4. Faça o primeiro login e associe o UUID do usuário proprietário ao workspace
   inicial seguindo `supabase/README.md`. O bootstrap é deliberadamente manual
   para impedir que um usuário não autorizado reivindique a empresa.
   No provedor Google do Supabase, informe o Client ID e o Client Secret criados
   no Google Cloud. No Google Cloud, a URI de callback autorizada deve ser a URL
   do callback do próprio projeto Supabase, exibida na tela do provedor Google;
   a URL da aplicação (`http://localhost:3000/auth/callback`) entra na lista de
   Redirect URLs do Supabase.
5. A migração de acessos cria o bucket público `avatars`, limitado a imagens de
   até 2 MB. Somente o próprio usuário pode gravar ou excluir arquivos em sua pasta.

O PIN nunca é armazenado nas tabelas operacionais ou no log. O Supabase Auth
mantém a credencial protegida; o banco registra somente quando ela foi alterada.
A secret key de servidor é obrigatória para criar, redefinir e remover acessos.

Com Supabase CLI e um runtime de contêineres, use:

```bash
supabase start
supabase db reset
supabase test db
supabase db lint --level warning --local
```

## Configuração do Google Agenda

Crie outro cliente OAuth no Google Cloud para a integração do calendário. Ele
é independente do login. Na tela de consentimento, cadastre estes escopos de
escrita (nessa ordem; o app aceita qualquer um deles):

- `https://www.googleapis.com/auth/calendar.app.created`
- `https://www.googleapis.com/auth/calendar.calendars`
- `https://www.googleapis.com/auth/calendar`

`calendar.readonly` e `calendar.calendars.readonly` servem só para ler a agenda
e **não** exportam eventos; por isso não são pedidos no OAuth.

- Redirect local: `http://localhost:3000/api/google-calendar/callback`
- Redirect de produção: `https://SEU-DOMINIO/api/google-calendar/callback`
- Defina `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`,
  `GOOGLE_CALENDAR_ENCRYPTION_KEY` e `CRON_SECRET`.
- Mantenha a mesma encryption key depois de conectar a conta; trocá-la torna os
  tokens existentes ilegíveis.
- Em OAuth externo no modo Testing, refresh tokens podem expirar em sete dias.
  Publique corretamente a tela de consentimento antes do uso contínuo.

Prazos usam D-7, D-2 e o dia. Renovações usam D-30, D-7 e D-1. Como o Google
limita lembretes nativos a 28 dias, o D-30 é um evento auxiliar determinístico.
Falhas permanecem na fila e podem ser reenviadas manualmente ou pelo cron.

## Deploy na Vercel

1. Importe o repositório na Vercel e mantenha o comando de build `pnpm build`.
2. Cadastre todas as variáveis de `.env.example` separadamente em Preview e Production.
3. Use a URL de cada ambiente em `APP_URL`, `NEXT_PUBLIC_APP_URL` e nos redirects OAuth.
4. O `vercel.json` executa a fila todos os dias às 09:00 UTC (06:00 em São Paulo).
5. A Vercel envia `Authorization: Bearer $CRON_SECRET` automaticamente ao cron.

Nenhuma senha de cliente, token OAuth ou chave secreta deve entrar no Git,
nos campos de projeto ou no bundle do navegador. Assinaturas guardam somente
uma referência para o cofre externo.
