# auth-supabase
Projeto de exemplo para autenticação com Supabase: cadastro, login, recuperação de senha e perfil de usuário.

## Objetivo

Este repositório contém uma aplicação frontend estática (em `site/`) com exemplos de formulários de autenticação e um helper em `site/js/auth.js` para inicializar o cliente Supabase em ambientes de desenvolvimento.

## Configuração local (pt-BR)

Siga estes passos para executar o site localmente em modo de desenvolvimento.

1) Crie o arquivo de configuração local a partir do exemplo:

```bash
cp site/js/env-config.example.js site/js/env-config.js
```

2) Abra `site/js/env-config.js` e substitua os placeholders por seus valores do Supabase:

- `SUPABASE_URL`: a URL do seu projeto Supabase (ex.: `https://<projeto>.supabase.co`)
- `SUPABASE_ANON_KEY`: sua chave anônima (anon ou sb_publishable_...)

3) Segurança: não comite `site/js/env-config.js` em repositórios públicos. Este arquivo já está listado em `.gitignore`.

4) Inicie o servidor estático e abra o navegador:

```bash
python3 -m http.server 8000 --directory site
# depois abra: http://localhost:8000
```

5) Observações importantes

- Armazenar a `SUPABASE_ANON_KEY` em `localStorage` ou em um arquivo JS é aceitável somente para desenvolvimento local. Nunca exponha `service_role` ou chaves secretas no frontend.
- Para que links de confirmação e reset funcionem em desenvolvimento, adicione `http://localhost:8000` nas Allowed Redirect URLs do painel do Supabase (Authentication → Settings).

## Testes rápidos

1. Copie o example e preencha as chaves.
2. Inicie o servidor estático (comando acima).
3. Crie uma conta em `signup.html` e verifique o fluxo de confirmação (se habilitado) e login.
4. Teste `Esqueci a senha` e verifique o redirecionamento para `reset-password.html`.

## Mais informações

Veja `docs/supabase_auth_guide.md` para detalhes sobre chaves, RLS, SMTP e boas práticas de autenticação.

