# Guia de Autenticação Supabase

O Supabase utiliza um sistema de autenticação robusto baseado no **GoTrue API**, que gerencia usuários, sessões e tokens JWT. Os dados de autenticação são armazenados em um esquema isolado chamado `auth` no seu banco de dados Postgres.

## Estrutura da Autenticação (Esquema `auth`)

Abaixo estão as principais tabelas do sistema de autenticação já configuradas no projeto:

| Tabela | Função |
| :--- | :--- |
| `auth.users` | Armazena os dados primários do usuário (email, senha criptografada, metadados). |
| `auth.sessions` | Registra as sessões ativas dos usuários. |
| `auth.identities` | Mapeia usuários para provedores externos (Google, GitHub, apple, etc). |
| `auth.refresh_tokens` | Armazena tokens usados para renovar sessões sem novo login. |
| `auth.mfa_factors` | Gerencia fatores de autenticação de múltiplos fatores (MFA). |

## Requisição POST para Criar Usuário (Sign Up)

Para criar um novo usuário via interface REST (seguindo a documentação oficial), você deve enviar uma requisição `POST` para o endpoint de autenticação.

### Exemplo com `curl` (REST API)

Você pode usar tanto a chave **Legacy (anon)** quanto a **Moderna (publishable)**. Ambas são enviadas no cabeçalho `apikey`.

```bash
# Para Chave Legacy (anon) ou Moderna (sb_publishable)
curl -X POST 'https://your-project-ref.supabase.co/auth/v1/signup' \
-H "apikey: SUA_ANON_KEY" \
-H "Content-Type: application/json" \
-d '{
  "email": "usuario@exemplo.com",
  "password": "senha-segura-aqui"
}'
```

> [!IMPORTANT]
> Substitua `SUA_ANON_KEY` pela sua chave anônima (anon key).

### Exemplo Seguro com `supabase-js` (Recomendado)

O SDK oficial aceita qualquer um dos formatos de chave. No seu arquivo de ambiente (`.env`), você pode definir:

```bash
# Opção 1: Legacy
SUPABASE_ANON_KEY=eyJhbGciOi... (exemplo)

# Opção 2: Moderna (Recomendada)
SUPABASE_ANON_KEY=sb_publishable_...
```

**Inicialização no Código:**

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://your-project-ref.supabase.co',
  process.env.SUPABASE_ANON_KEY! // Drop-in replacement: aceita anon ou sb_publishable
)

async function signUpNewUser() {
  const { data, error } = await supabase.auth.signUp({
    email: 'usuario@exemplo.com',
    password: 'senha-segura-aqui',
  })
}
```

## Autenticação via Claims (RBAC)

Claims são atributos (pares chave-valor) anexados ao token JWT do usuário que permitem controlar o acesso de forma granular (Role-Based Access Control).

### App Metadata vs User Metadata

Existem dois lugares principais para armazenar claims no objeto do usuário:

1.  **`app_metadata`**: Armazena dados que o usuário **não pode alterar**. Ideal para funções (roles), permissões e níveis de acesso.
2.  **`user_metadata`**: Armazena dados que o usuário **pode alterar** (ex: nome, avatar). **Nunca** use este campo para autorização/segurança.

### Como atribuir Claims (Admin)

Como as claims de segurança devem ser protegidas, elas só podem ser definidas via **Service Role Key** (no backend ou Edge Functions):

```typescript
// No servidor (Node.js/Edge Functions) utilizando a SERVICE_ROLE_KEY
const { data, error } = await supabase.auth.admin.updateUserById(
  'uuid-do-usuario',
  { app_metadata: { role: 'admin' } }
)
```

### Usando Claims no banco de dados (RLS)

O Postgres consegue ler essas claims diretamente do JWT usando a função `auth.jwt()`.

**Exemplo de Política de Segurança (RLS):**

```sql
-- Criar uma política que permite acesso apenas para 'admins'
create policy "Apenas admins podem deletar logs"
on logs for delete
to authenticated
using (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);
```

### Vantagem de Segurança: Auth Hooks

O Supabase também oferece **Auth Hooks (Beta)**, que permitem que uma função Postgres intercepte a criação do token e injete claims dinamicamente baseadas em outras tabelas do banco, garantindo que o token esteja sempre sincronizado com as permissões atuais.


## Chave Anônima (Anon Key) e Segurança

A `SUPABASE_ANON_KEY` é uma peça central na arquitetura do Supabase, mas seu funcionamento gera dúvidas comuns sobre segurança.

### O usuário consegue capturar a Anon Key?
**Sim.** Como essa chave é enviada no cabeçalho das requisições feitas pelo navegador (front-end), qualquer usuário com um conhecimento básico de "Inspecionar Elemento" (aba Network) consegue ver a chave.

### Isso é um problema de segurança?
**Não, desde que o RLS (Row Level Security) esteja ativado.** A Anon Key foi desenhada para ser pública. Ela apenas identifica que a requisição vem de um "cliente anônimo" do seu projeto. O que impede um usuário mal-intencionado de deletar todo o seu banco de dados não é o "segredo" da chave, mas sim as políticas de segurança que você define no banco.

### Como encontrar e configurar a Anon Key
Para obter sua chave:
1.  Acesse o **Dashboard do Supabase**.
2.  Vá em **Project Settings** (ícone de engrenagem).
3.  Selecione **API**.
4.  Localize a seção **Project API keys**.
5.  Copie o valor de `anon` (public).

### Limitações da Anon Key
*   Ela assume o papel (role) `anon` no Postgres antes do login.
*   Após o login, ela passa a carregar o JWT do usuário, assumindo o papel `authenticated`.
*   **Não tem poderes administrativos.** Ela é filtrada por todas as políticas de RLS.

## Tipos de Chaves de API: Legacy vs. Modernas

O Supabase está em transição para um novo formato de chaves para aumentar a segurança e facilitar a gestão.

| Categoria | Chave Legacy (Antiga) | Chave Moderna (Recomendada) | Função e Segurança |
| :--- | :--- | :--- | :--- |
| **Pública** | `anon` | `sb_publishable_...` | **Uso no Front-end.** Identifica o projeto mas respeita todas as políticas de RLS. Pode ser exposta no navegador. |
| **Privada** | `service_role` | `sb_secret_...` | **Uso apenas no Back-end.** Ignora o RLS e tem acesso total ao banco. **Nunca** exponha esta chave. |

### Por que usar as chaves Modernas?
1.  **Segurança e Rotação**: As chaves modernas são desenhadas para serem rotacionadas de forma independente e oferecem maior controle sobre o escopo de acesso.
2.  **Formato**: As chaves modernas começam com prefixos claros (`sb_publishable_` ou `sb_secret_`), facilitando a identificação por ferramentas de análise de código e prevenindo que chaves secretas sejam enviadas acidentalmente para o front-end.
3.  **Compatibilidade**: Atualmente, o Supabase suporta ambos os formatos. Se o seu projeto é novo, priorize as chaves modernas (`Publishable` e `Secret`).



## Recomendações de Segurança (Prioridade)

1.  **Confirmação de Email**: Mantenha ativado para evitar spam de contas.
2.  **Variáveis de Ambiente**: Use `.env` no front-end. Embora a chave seja capturável no tráfego, manter fora do código-fonte evita vazamentos acidentais em repositórios públicos.
3.  **RLS (Row Level Security) é OBRIGATÓRIO**: Sem RLS, qualquer pessoa com a Anon Key pode ler e editar seus dados. Ative RLS em **todas** as tabelas no esquema `public`.
4.  **Diferenciação de Chaves**:
    *   **Anon Key**: Use no Front-end. Respeita o RLS.
    *   **Service Role Key**: Use **apenas** no Back-end. Ignora o RLS. **Nunca exponha esta chave.**

## Implementação de Sign In / Sign Up (Frontend estático)

Este projeto já inclui um helper cliente em [site/js/auth.js](site/js/auth.js#L1) que encapsula chamadas ao SDK `supabase-js` e é compatível com as versões v1/v2 do SDK.

Passos principais para o fluxo de autenticação no frontend:

- **Configurar chaves**: Para desenvolvimento local, adicione `SUPABASE_URL` e `SUPABASE_ANON_KEY` no arquivo `site/js/env-config.js` (ou em `localStorage`) para que o cliente seja inicializado. O projeto inclui um arquivo de exemplo `site/js/env-config.js` que popula o `localStorage` automaticamente quando preenchido.
- **Configurar chaves**: Para desenvolvimento local, adicione `SUPABASE_URL` e `SUPABASE_ANON_KEY` no arquivo `site/js/env-config.js` (ou em `localStorage`) para que o cliente seja inicializado. O projeto inclui um arquivo de exemplo `site/js/env-config.example.js` — copie para `site/js/env-config.js` e preencha os valores.
  Observação: o script gerador automático foi removido; atualmente a cópia é manual.
- **Sign Up**: O formulário em [site/signup.html](site/signup.html#L1) envia `email` e `password` para a função `auth.signUp` via o helper `auth.js`. Se a opção de confirmação por email estiver ativada no dashboard Supabase, o usuário receberá um email para verificar a conta antes de poder se autenticar.
- **Sign In**: O formulário em [site/index.html](site/index.html#L1) envia `email` e `password` para `auth.signIn`/`auth.signInWithPassword` conforme a versão do SDK. Em caso de sucesso, o helper redireciona para [site/profile.html](site/profile.html#L1).
- **Esqueci a senha / Reset**: O formulário em [site/forgot.html](site/forgot.html#L1) chama `resetPasswordForEmail` (com `redirectTo` apontando para `reset-password.html`). O arquivo [site/reset-password.html](site/reset-password.html#L1) executa `setSessionFromUrl()` e permite atualizar a senha via `auth.updateUser`.
- **Magic Link**: O projeto suporta tanto senha quanto magic link. Para habilitar magic links, ative a opção no dashboard Supabase e use `signIn` com `email` apenas (o helper `auth.js` pode ser estendido para chamar `signIn({ email }, { redirectTo })`).

Exemplo mínimo usando o helper existente (resumido):

```js
// Precondição: site/js/env-config.js preencheu localStorage com SUPABASE_URL/ANON
// auth.js inicializa o cliente automaticamente. Então apenas submeta o form:
// Sign up
// (já implementado em site/signup.html -> #signup-form)

// Sign in
// (já implementado em site/index.html -> #signin-form)

// Forgot password
// (site/forgot.html -> #forgot-form) -> envia email com redirectTo = /reset-password.html

// Reset password
// (site/reset-password.html -> #reset-form) -> setSessionFromUrl + updateUser
```

Referência: a documentação oficial de senhas do Supabase está em https://supabase.com/docs/guides/auth/passwords

### Redirect URLs (importante)

Garanta que as URLs de redirecionamento do projeto no Dashboard do Supabase incluam ao menos:

- `http://localhost:8000/reset-password.html` (ou seu domínio local)
- `http://localhost:8000/profile.html` (se você redirecionar para a página de perfil)

Sem essas URLs, os links de redefinição e magic links não serão aceitos pelo Supabase.

### Checklist de verificação rápida (dev)

1. Preencha `site/js/env-config.js` com `SUPABASE_URL` e `SUPABASE_ANON_KEY` (ou salve-os manualmente no `localStorage`).
2. Reinicie o servidor estático (por exemplo: `python3 -m http.server 8000 --directory site`).
3. Acesse `http://localhost:8000` e tente criar uma conta via `Criar conta`.
4. Se ativou confirmação por email, verifique o email; caso contrário, faça login e confirme que `profile.html` mostra os dados do usuário.
5. Teste o fluxo de recuperação: envie email via `Esqueci a senha`, abra o link recebido e altere a senha.
