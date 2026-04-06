# Integração OAuth2 — Supabase Auth

> Revisado em: 2026-04-03  
> Escopo: Google (ativo) + Apple (pendente)

---

## 1. Escopo desta Implementação

| Provider | Chave JS | Plataforma | Status |
|---|---|---|---|
| **Google** | `google` | Google Cloud Console | ✅ Ativo |
| **Apple** | `apple` | Apple Developer Program | 🔴 Pendente (requer Apple Developer Program) |

### Outros providers disponíveis no Supabase (fora do escopo)

Facebook, GitHub, Azure (Microsoft), Twitter/X, GitLab, Discord, LinkedIn, Spotify, Twitch, Bitbucket, Kakao, Notion, Slack, Zoom, WorkOS.

---

## 2. Cenários de Aceite

### AC1 — Unificação Manual → Social

> Usuário com conta email/senha faz login via Google ou Apple com o mesmo email.

**Comportamento esperado:** O sistema autentica no mesmo perfil existente — sem criar novo usuário. A identidade social é adicionada à tabela `auth.identities` vinculada ao mesmo `user_id`.

**Condição:** O email do usuário existente deve estar confirmado (`email_confirmed_at IS NOT NULL`) e o provider deve retornar o email como verificado.

**Mecanismo:** Supabase Automatic Identity Linking (ativo por padrão).

---

### AC2 — Unificação Social → Social

> Usuário com conta Google faz login via Apple com o mesmo email.

**Comportamento esperado:** Os dois providers ficam vinculados ao mesmo `user_id`. A `auth.identities` passa a ter duas entradas para o mesmo usuário (`google` + `apple`).

**Condição crítica — Apple:** A Apple só envia o email do usuário **no primeiro login** (quando o usuário autoriza o app pela primeira vez). Em logins subsequentes, Apple não reenvia o email — usa o Apple User ID para identificar o usuário.

**Mecanismo:** Supabase Automatic Identity Linking + persistência do Apple User ID.

---

### AC3 — Recuperação de Senha para Usuários OAuth

> Usuário cadastrado via Google ou Apple usa "Esqueci minha senha".

**Comportamento esperado:** O sistema envia um link de redefinição para o email vinculado. Ao clicar, o usuário define uma senha e passa a ter também autenticação email/password no mesmo perfil.

**Mecanismo:** `supabase.auth.resetPasswordForEmail()` — funciona para qualquer usuário independente do provider original. Já implementado em `site/forgot.html` + `site/js/auth.js`.

---

## 3. Regras de Negócio

| Regra | Implementação |
|---|---|
| Email é a chave primária de identidade | Constraint único em `auth.users.email` (Supabase nativo) |
| Vinculação automática só com email verificado | Supabase Automatic Linking exige `email_confirmed_at IS NOT NULL` no perfil existente |
| DB suporta múltiplos provider_ids por usuário | Tabela `auth.identities` — uma linha por provider, todas vinculadas ao mesmo `user_id` |
| Apple: email verificado exigido | Supabase valida que a Apple retornou o email como verificado antes de fazer o linking |

---

## 4. Estrutura de Dados — Múltiplos Providers

```sql
-- Um user, múltiplos providers (auth.identities)
SELECT u.email, i.provider, i.identity_data->>'email' AS provider_email
FROM auth.users u
JOIN auth.identities i ON i.user_id = u.id
WHERE u.email = 'usuario@example.com';

-- Resultado esperado após AC2:
-- usuario@example.com | google | usuario@example.com
-- usuario@example.com | apple  | usuario@example.com
```

**Query de verificação — detectar perfis duplicados:**
```sql
SELECT email, COUNT(*) AS total
FROM auth.users
GROUP BY email
HAVING COUNT(*) > 1;
-- Deve retornar 0 linhas
```

**Condições para o Automatic Linking funcionar:**
- O email deve estar **confirmado** (`email_confirmed_at IS NOT NULL`)
- O email deve ser **único** na tabela `auth.users`
- Usuários criados via **SAML SSO** não são alvo de linking automático

---

## 5. Tarefas de Ativação na Plataforma

### Task 1 — Google OAuth ✅

#### 5.1 Google Cloud Console

1. Acesse [Google Cloud Console](https://console.cloud.google.com/)
2. **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
3. Tipo: **Web application**
4. **Authorized JavaScript origins:**
   - `https://<SEU-PROJECT-ID>.supabase.co`
   - `http://localhost:8000`
5. **Authorized redirect URIs:**
   - `https://<SEU-PROJECT-ID>.supabase.co/auth/v1/callback`
6. Salvar `Client ID` e `Client Secret`

#### 5.2 Scopes necessários

[Google Auth Platform → Scopes](https://console.cloud.google.com/auth/scopes):
- `openid`
- `.../auth/userinfo.email`
- `.../auth/userinfo.profile`

#### 5.3 Supabase Dashboard

**Authentication → Providers → Google** → Enable → inserir Client ID + Secret → Save.

---

### Task 2 — Apple OAuth 🔴 (pendente)

> ⚠️ **Requer Apple Developer Program** (conta paga, USD 99/ano).

#### 5.4 Apple Developer Console — Configuração

1. **App ID** — [Identifiers → App IDs → New](https://developer.apple.com/account/resources/identifiers/list/bundleId)
   - Bundle ID: `com.suaempresa.seuapp` (reverse domain)
   - Capability: habilitar **Sign in with Apple**

2. **Services ID** — [Identifiers → Services IDs → New](https://developer.apple.com/account/resources/identifiers/list/serviceId)
   - Description: `Seu App Web`
   - Identifier: `com.suaempresa.seuapp.web`
   - Habilitar **Sign in with Apple → Configure**
     - **Web Domain:** `<SEU-PROJECT-ID>.supabase.co`
     - **Return URL:** `https://<SEU-PROJECT-ID>.supabase.co/auth/v1/callback`

3. **Signing Key** — [Keys → New Key](https://developer.apple.com/account/resources/authkeys/list)
   - Habilitar **Sign in with Apple → Configure** (selecionar o App ID criado)
   - Baixar e guardar o arquivo `.p8` em local seguro
   - Anotar o **Key ID**

4. **Team ID** — visível no canto superior direito do Apple Developer Console

5. **Gerar o Client Secret** — use a [ferramenta da Supabase](https://supabase.com/docs/guides/auth/social-login/auth-apple) com:
   - Account ID (Team ID), Services ID, Key ID, arquivo `.p8`

#### 5.5 Supabase Dashboard

**Authentication → Providers → Apple** → Enable:
- **Client ID:** Services ID (ex: `com.suaempresa.seuapp.web`)
- **Secret Key:** JWT gerado no passo anterior
→ Save

#### 5.6 ⚠️ Manutenção Obrigatória — Rotação de Secret a Cada 6 Meses

A Apple exige que o client secret (JWT) seja **regenerado a cada 6 meses** usando o arquivo `.p8`. Se não for renovado, a autenticação Apple falha para todos os usuários.

**Ação:** Criar lembrete recorrente no calendário:
1. Gerar novo secret com o mesmo `.p8`
2. Atualizar em **Authentication → Providers → Apple**
3. (opcional) Automatizar via Supabase Management API

---

## 6. Configuração de Redirect URLs no Supabase

**Auth → URL Configuration → Redirect URLs** — adicionar:
- `http://localhost:8000/auth/callback.html` ✅ (já configurado)
- (produção) `https://seu-dominio.com/auth/callback.html`

**Auth → Providers → Enable Manual Linking** — permite usuário logado vincular outros providers:
```javascript
const { data, error } = await supabase.auth.linkIdentity({ provider: 'apple' })
```

---

## 7. Fluxo OAuth2 — Implementado

### 7.1 Diagrama completo (PKCE flow)

```
Usuário clica "Entrar com Google" ou "Entrar com Apple"
    ↓
auth.js: authSignInWithOAuth(provider)
    → signInWithOAuth({ provider, options: { redirectTo: '.../auth/callback.html' } })
    ↓
Redireciona para provider (Google/Apple) → usuário autentica
    ↓
Provider retorna para: https://<SEU-PROJECT-ID>.supabase.co/auth/v1/callback
    ↓
Supabase verifica email verificado → aplica Automatic Linking se necessário
    ↓ (linking)  email existente confirmado → vincula ao perfil existente (AC1, AC2)
    ↓ (novo)     email não existe → cria novo perfil
    ↓
Supabase redireciona para: http://localhost:8000/auth/callback.html
    ↓
callback.html: onAuthStateChange → aguarda evento SIGNED_IN
    ↓
Sessão criada → redireciona para profile.html
```

### 7.2 Fluxo de Recuperação de Senha (AC3)

```
Usuário OAuth clica "Esqueci a senha" → forgot.html
    ↓
supabase.auth.resetPasswordForEmail(email, { redirectTo: reset-password.html })
    ↓
Supabase envia email para o endereço vinculado ao perfil OAuth
    ↓
Usuário clica no link → reset-password.html
    ↓
supabase.auth.updateUser({ password: '...' })
    ↓
Perfil passa a ter email/password + OAuth (multi-identity)
```

---

## 8. Código Implementado

### 8.1 `site/js/auth.js` — authSignInWithOAuth

```javascript
async function authSignInWithOAuth(provider) {
  // callbackUrl construído dinamicamente a partir de window.location
  const options = { redirectTo: callbackUrl };
  // Apple requer scopes 'name email' para receber o email do usuário
  if (provider === 'apple') options.scopes = 'name email';
  return await supabase.auth.signInWithOAuth({ provider, options });
}
```

### 8.2 `site/auth/callback.html`

Usa `onAuthStateChange` aguardando o evento `SIGNED_IN` (+ fallback `getSession()` e timeout de 10s). Não faz parse manual de `?code=` — deixa o `supabase-js` processar via `detectSessionInUrl: true`.

### 8.3 `site/index.html` — botões

- **Entrar com Google** (`#oauth-btn-google`)
- **Entrar com Apple** (`#oauth-btn-apple`)

---

## 9. Segurança

### 9.1 Advisor ativo — Leaked Password Protection

**Supabase Dashboard → Authentication → Sign In / Up → Enable HaveIBeenPwned protection**

### 9.2 Tabela de cenários e comportamentos

| Cenário | Email verificado? | Resultado |
|---|---|---|
| Usuário email/senha → login Google (mesmo email, confirmado) | ✅ Google verifica | Vincula ao perfil existente (AC1) |
| Usuário Google → login Apple (mesmo email, 1º login Apple) | ✅ Apple envia email | Vincula ao perfil existente (AC2) |
| Usuário Google → login Apple (login subsequente) | Apple não reenvia email | Usa Apple User ID para identificar |
| Usuário email/senha (não confirmado) → login Google | — | Supabase remove identidade não confirmada e vincula ao Google |
| Email novo → login Google | ✅ Google verifica | Cria novo perfil |
| Usuário OAuth → "Esqueci senha" | — | Envia reset para email vinculado (AC3) |

### 9.3 Garantias do Supabase

- **Um email = Um user** na `auth.users` (constraint único)
- Automatic Linking só funciona com **email confirmado** (previne account takeover)

---

## 10. Checklist

### Plataforma (manual)
- [x] Task 1: Criar OAuth App Google + ativar no Supabase Dashboard
- [ ] Task 2: Criar App ID + Services ID + Signing Key na Apple Developer Console
- [ ] Task 2: Gerar client secret (JWT) e ativar no Supabase Dashboard
- [x] Adicionar `http://localhost:8000/auth/callback.html` em Redirect URLs
- [ ] Habilitar Manual Linking
- [ ] Habilitar Leaked Password Protection
- [ ] ⏰ Agendar lembrete de 6 meses para rotação do secret Apple

### Código ✅ Concluído
- [x] `site/auth/callback.html` — processa retorno OAuth (onAuthStateChange)
- [x] `site/js/auth.js` — `authSignInWithOAuth(provider)` com scopes Apple
- [x] `site/index.html` — botões Google + Apple

---

## 11. Referências

- [Supabase — Login com Google](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase — Login com Apple](https://supabase.com/docs/guides/auth/social-login/auth-apple)
- [Supabase — Identity Linking](https://supabase.com/docs/guides/auth/auth-identity-linking)
- [Supabase — Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Apple Developer Console](https://developer.apple.com/account/)
- [Google Cloud Console](https://console.cloud.google.com/)
