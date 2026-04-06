// auth.js - cliente de autenticação com Supabase
(function () {
  // Helper: read/write config from localStorage
  let _configPromiseResolve = null;

  function getConfig() {
    // Prefer window.__ENV if present (set by env-config.js example)
    try {
      if (window.__ENV && window.__ENV.SUPABASE_URL && window.__ENV.SUPABASE_ANON_KEY) {
        return { url: window.__ENV.SUPABASE_URL, key: window.__ENV.SUPABASE_ANON_KEY };
      }
    } catch (e) {
      // ignore access errors
    }
    return {
      url: localStorage.getItem('SUPABASE_URL') || '',
      key: localStorage.getItem('SUPABASE_ANON_KEY') || ''
    };
  }

  function saveConfig(url, key) {
    localStorage.setItem('SUPABASE_URL', url);
    localStorage.setItem('SUPABASE_ANON_KEY', key);
  }

  function clearConfig() {
    localStorage.removeItem('SUPABASE_URL');
    localStorage.removeItem('SUPABASE_ANON_KEY');
  }

  function loadEnvConfigScript() {
    return new Promise((resolve, reject) => {
      if (window.__ENV) return resolve();
      const src = 'js/env-config.js';
      // avoid injecting multiple times
      const existing = document.querySelector('script[data-env-config]');
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('env-config load error')));
        return;
      }
      const s = document.createElement('script');
      s.setAttribute('src', src);
      s.setAttribute('data-env-config', '1');
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }

  async function ensureConfig() {
    let cfg = getConfig();
    if (cfg.url && cfg.key) return cfg;

    // try to load env-config.js which may set window.__ENV
    try {
      await loadEnvConfigScript();
    } catch (e) {
      // ignore load errors; we'll fallback to UI
    }

    cfg = getConfig();
    if (cfg.url && cfg.key) return cfg;

    // If inputs exist in the page, wait for the user to save them
    const urlInput = document.getElementById('supabase-url');
    const keyInput = document.getElementById('supabase-key');
    if (urlInput && keyInput) {
      // focus to guide the developer
      urlInput.focus();
      return new Promise((resolve) => {
        _configPromiseResolve = () => resolve(getConfig());
      });
    }

    // No configuration available and no UI: return current (possibly empty) config
    return cfg;
  }

  // Initialize supabase client if possible
  let supabase = null;
  function initSupabase() {
    const cfg = getConfig();
    if (!cfg.url || !cfg.key) {
      console.warn('initSupabase: missing SUPABASE_URL or SUPABASE_ANON_KEY', cfg);
      return null;
    }

    // If already initialized, return it
    if (supabase) return supabase;

    // Prefer global createClient (CDN bundles) or namespaced factory
    if (typeof window.createClient === 'function') {
      supabase = window.supabase = createClient(cfg.url, cfg.key);
      return supabase;
    }

    if (window.supabase && typeof window.supabase.createClient === 'function') {
      supabase = window.supabase = window.supabase.createClient(cfg.url, cfg.key);
      return supabase;
    }

    // If a pre-initialized client exists, use it
    if (window.supabase && window.supabase.auth) {
      supabase = window.supabase;
      return supabase;
    }

    console.warn('initSupabase: could not find supabase client factory or instance');
    return null;
  }

  // Auth wrapper helpers to support v1 and v2 supabase-js APIs
  async function authSignIn(email, password) {
    if (!supabase) initSupabase();
    if (!supabase) throw new Error('Supabase não inicializado');
    // v2: supabase.auth.signInWithPassword
    if (supabase.auth && typeof supabase.auth.signInWithPassword === 'function') {
      return await supabase.auth.signInWithPassword({ email, password });
    }
    // v1: supabase.auth.signIn
    if (supabase.auth && typeof supabase.auth.signIn === 'function') {
      return await supabase.auth.signIn({ email, password });
    }
    throw new Error('Método de autenticação não suportado pela versão do supabase-js carregada');
  }

  async function authSignUp(email, password, redirectTo) {
    if (!supabase) initSupabase();
    if (!supabase) throw new Error('Supabase não inicializado');
    if (supabase.auth && typeof supabase.auth.signUp === 'function') {
      try {
        // Try passing redirect option as second argument (common pattern)
        return await supabase.auth.signUp({ email, password }, { redirectTo });
      } catch (e) {
        // Fallback to calling without redirect if the bundle/version doesn't accept the option
      }
      try {
        return await supabase.auth.signUp({ email, password });
      } catch (e) {
        throw e;
      }
    }
    // Some older versions used signUp differently; fallback to signIn with provider
    throw new Error('Método de cadastro não suportado pela versão do supabase-js carregada');
  }

  async function authGetSession() {
    if (!supabase) initSupabase();
    if (!supabase) return { session: null };
    if (supabase.auth && typeof supabase.auth.getSession === 'function') {
      const { data } = await supabase.auth.getSession();
      return data || { session: null };
    }
    if (supabase.auth && typeof supabase.auth.session === 'function') {
      const session = await supabase.auth.session();
      return { session };
    }
    return { session: null };
  }

  async function authGetUser() {
    if (!supabase) initSupabase();
    if (!supabase) return { user: null };
    if (supabase.auth && typeof supabase.auth.getUser === 'function') {
      const { data } = await supabase.auth.getUser();
      return data || { user: null };
    }
    if (supabase.auth && typeof supabase.auth.user === 'function') {
      const user = await supabase.auth.user();
      return { user };
    }
    return { user: null };
  }

  async function authResetPassword(email) {
    if (!supabase) initSupabase();
    if (!supabase) throw new Error('Supabase não inicializado');

    // Build a safe redirect URL. Some dev environments expose IPv6 host `[::]`,
    // which encodes into redirect URLs and can cause server-side errors.
    // Normalize hostname to `localhost` when encountering IPv6 unspecified address.
    let host = window.location.hostname;
    if (host === '::' || host === '[::]' || host === '') {
      host = 'localhost';
    }
    const port = window.location.port ? (':' + window.location.port) : '';
    const redirectUrl = window.location.protocol + '//' + host + port + '/reset-password.html';

    if (supabase.auth && typeof supabase.auth.resetPasswordForEmail === 'function') {
      // Use dynamic redirect URL calculated from current origin
      const res = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl });
      console.debug('authResetPassword (supabase.auth.resetPasswordForEmail) returned:', res);
      return res;
    }
    if (supabase.auth && typeof supabase.auth.api !== 'undefined' && typeof supabase.auth.api.resetPasswordForEmail === 'function') {
      // v1 compat - use dynamic redirect URL
      const res = await supabase.auth.api.resetPasswordForEmail(email, { redirectTo: redirectUrl });
      console.debug('authResetPassword (supabase.auth.api.resetPasswordForEmail) returned:', res);
      return res;
    }

    throw new Error('Método de reset de senha não suportado pela versão do supabase-js carregada');
  }

  async function authUpdatePassword(password) {
    if (!supabase) initSupabase();
    if (!supabase) throw new Error('Supabase não inicializado');

    if (supabase.auth && typeof supabase.auth.updateUser === 'function') {
      return await supabase.auth.updateUser({ password });
    }
    if (supabase.auth && typeof supabase.auth.api !== 'undefined' && typeof supabase.auth.api.updateUser === 'function') {
      // v1 compat (which requires access token set in headers automatically after redirect)
      return await supabase.auth.api.updateUser({ password });
    }

    throw new Error('Método de atualização de senha não suportado pela versão do supabase-js carregada');
  }

  async function authSignInWithOAuth(provider) {
    if (!supabase) initSupabase();
    if (!supabase) throw new Error('Supabase não inicializado');

    // Build callback URL relative to server root
    let host = window.location.hostname;
    if (host === '::' || host === '[::]' || host === '') host = 'localhost';
    const port = window.location.port ? (':' + window.location.port) : '';
    const callbackUrl = window.location.protocol + '//' + host + port + '/auth/callback.html';

    const options = { redirectTo: callbackUrl };
    // Apple requires 'name email' scopes to receive the user's email address
    if (provider === 'apple') options.scopes = 'name email';

    return await supabase.auth.signInWithOAuth({ provider, options });
  }

  async function setSessionFromUrl() {
    if (!supabase) initSupabase();
    if (!supabase) return null;

    // Tokens may be provided either as query params or in the URL fragment (#)
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash ? window.location.hash.replace(/^#/, '') : '');

    const accessToken = searchParams.get('access_token') || hashParams.get('access_token');
    const refreshToken = searchParams.get('refresh_token') || hashParams.get('refresh_token');

    if (accessToken && refreshToken && supabase.auth && typeof supabase.auth.setSession === 'function') {
      try {
        console.group('Auth setSessionFromUrl');
        console.debug('Tokens found in URL, attempting to establish session...');
        
        // Add a safety timeout to avoid hanging the UI
        const sessionPromise = supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout: supabase.auth.setSession demorou muito a responder')), 15000)
        );

        const { data, error } = await Promise.race([sessionPromise, timeoutPromise]);
        
        if (error) {
          console.error('Erro no setSession (Supabase):', {
            message: error.message,
            status: error.status,
            name: error.name
          });
        } else {
          console.log('Sessão estabelecida com sucesso:', data.session?.user?.id);
        }

        // Clean hash to avoid leaking tokens in URL
        try {
          if (window.history && window.history.replaceState) {
            const url = new URL(window.location.href);
            url.hash = '';
            window.history.replaceState({}, document.title, url.toString());
          }
        } catch (e) {
          // ignore
        }
        console.groupEnd();
        return { data, error };
      } catch (e) {
        console.error('Excessão capturada em setSessionFromUrl:', e);
        console.groupEnd();
        return { data: null, error: e };
      }
    }

    return null;
  }

  // Wait until DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    // Wire up config UI if present
    const urlInput = document.getElementById('supabase-url');
    const keyInput = document.getElementById('supabase-key');
    const saveBtn = document.getElementById('save-config');
    const clearBtn = document.getElementById('clear-config');

    const cfg = getConfig();
    if (urlInput) urlInput.value = cfg.url || '';
    if (keyInput) keyInput.value = cfg.key || '';

    if (saveBtn) {
      saveBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const u = urlInput.value.trim();
        const k = keyInput.value.trim();
        if (!u || !k) return alert('Preencha SUPABASE_URL e SUPABASE_ANON_KEY');
        saveConfig(u, k);
        alert('Configuração salva no localStorage');
        if (typeof _configPromiseResolve === 'function') {
          try { _configPromiseResolve(); } catch (e) { /* ignore */ }
          _configPromiseResolve = null;
        }
        initSupabase();
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        clearConfig();
        if (urlInput) urlInput.value = '';
        if (keyInput) keyInput.value = '';
        alert('Configuração removida');
      });
    }

    // Ensure config is available (from window.__ENV, env-config.js or UI) before initializing
    ensureConfig().then(() => {
      initSupabase();
    }).catch(() => {
      // ignore
    });

    // Sign up form
    const signupForm = document.getElementById('signup-form');
    if (signupForm) {
      signupForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;
        const errEl = document.getElementById('signup-error');
        errEl.textContent = '';

        const client = initSupabase();
        if (!client) {
          console.error('signup: initSupabase failed', getConfig(), {
            createClient: typeof window.createClient,
            supabase_createClient: window.supabase && typeof window.supabase.createClient,
            supabase_auth: window.supabase && typeof window.supabase.auth,
            supabaseJs: window.supabaseJs && typeof window.supabaseJs.createClient
          });
          return (errEl.textContent = 'Supabase não configurado. Preencha as credenciais abaixo.');
        }

        try {
          // Force redirect to local static site (port 8000) for development
          const signupRedirect = 'http://localhost:8000';
          const res = await authSignUp(email, password, signupRedirect);
          // v2 returns { data, error } shape; v1 may throw or return differently
          const data = res?.data || res;
          const error = res?.error || null;
          if (error) {
            errEl.textContent = error.message || String(error);
            return;
          }
          // Some projects require email confirmation. Notify user then redirect to signin.
          alert('Conta criada. Verifique seu email se necessário. Redirecionando para login.');
          window.location.href = 'index.html';
        } catch (err) {
          errEl.textContent = err.message || String(err);
        }
      });
    }

    // Sign in form
    const signinForm = document.getElementById('signin-form');
    if (signinForm) {
      signinForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const email = document.getElementById('signin-email').value;
        const password = document.getElementById('signin-password').value;
        const errEl = document.getElementById('signin-error');
        errEl.textContent = '';

        const client = initSupabase();
        if (!client) {
          console.error('signin: initSupabase failed', getConfig(), {
            createClient: typeof window.createClient,
            supabase_createClient: window.supabase && typeof window.supabase.createClient,
            supabase_auth: window.supabase && typeof window.supabase.auth,
            supabaseJs: window.supabaseJs && typeof window.supabaseJs.createClient
          });
          return (errEl.textContent = 'Supabase não configurado. Preencha as credenciais abaixo.');
        }

        try {
          const res = await authSignIn(email, password);
          const data = res?.data || res;
          const error = res?.error || null;
          if (error) {
            errEl.textContent = error.message || String(error);
            return;
          }
          // successful
          window.location.href = 'profile.html';
        } catch (err) {
          errEl.textContent = err.message || String(err);
        }
      });
    }

    // Forgot password form logic
    const forgotForm = document.getElementById('forgot-form');
    if (forgotForm) {
      forgotForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const email = document.getElementById('forgot-email').value;
        const errEl = document.getElementById('forgot-error');
        const successEl = document.getElementById('forgot-success');
        errEl.textContent = '';
        successEl.textContent = '';

        const client = initSupabase();
        if (!client) {
          errEl.textContent = 'Supabase não configurado. Tente novamente.';
          return;
        }

        try {
          const res = await authResetPassword(email);
          console.debug('authResetPassword response:', res);
          const error = res?.error || null;
          if (error) {
            if (error.status === 429) {
              errEl.textContent = 'Você atingiu o limite de tentativas. Tente novamente em alguns minutos.';
            } else {
              errEl.textContent = error.message || String(error);
            }
            return;
          }
          successEl.textContent = 'Email de reset enviado. Verifique sua caixa de entrada.';
        } catch (err) {
          console.error('authResetPassword caught error:', err);
          if (err?.status === 429 || err?.message?.includes('rate limit')) {
            errEl.textContent = 'Você atingiu o limite de tentativas. Tente novamente em alguns minutos.';
          } else {
            errEl.textContent = 'Erro ao enviar email de recuperação: ' + (err.message || String(err));
          }
        }
      });
    }

    // Reset password form logic
    const resetForm = document.getElementById('reset-form');
    if (resetForm) {
      (async () => {
        const { data, error: sessionErr } = await (setSessionFromUrl() || { data: null, error: null });
        const errEl = document.getElementById('reset-error');
        const successEl = document.getElementById('reset-success');

        if (sessionErr) {
          errEl.textContent = 'Este link de recuperação expirou ou é inválido. Tente solicitar um novo email.';
        } else if (!data?.session) {
          // Se não há sessão e não há erro de parsing, o link pode ser inválido ou incompleto
          console.warn('Nenhuma sessão ativa encontrada após processar URL de reset.');
        }

        resetForm.addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const password = document.getElementById('reset-password').value;
          const confirmPassword = document.getElementById('reset-confirm-password').value;
          errEl.textContent = '';
          successEl.textContent = '';

          if (password !== confirmPassword) {
            errEl.textContent = 'As senhas não conferem.';
            return;
          }

          const client = initSupabase();
          if (!client) {
            errEl.textContent = 'Supabase não configurado. Tente novamente.';
            return;
          }

          try {
            const res = await authUpdatePassword(password);
            const error = res?.error || null;
            if (error) {
              errEl.textContent = error.message || String(error);
              return;
            }
            successEl.textContent = 'Senha alterada com sucesso. Redirecionando para login...';
            setTimeout(() => { window.location.href = 'index.html'; }, 2500);
          } catch (err) {
            errEl.textContent = err.message || String(err);
          }
        });
      })();
    }

    // Profile page logic
    const profileSection = document.getElementById('profile-section');
    if (profileSection) {
      (async () => {
        const errEl = document.getElementById('profile-error');
        if (!initSupabase()) return (errEl.textContent = 'Supabase não configurado.');
        try {
          const sessionData = await authGetSession();
          const session = sessionData.session;
          if (!session) {
            window.location.href = 'index.html';
            return;
          }
          const userData = await authGetUser();
          const user = userData.user;
          const meta = user?.user_metadata || {};

          // Avatar
          const avatarEl = document.getElementById('user-avatar');
          if (avatarEl && meta.avatar_url) {
            avatarEl.src = meta.avatar_url;
            avatarEl.classList.remove('hidden');
          }

          // Header fields
          document.getElementById('user-id').textContent = user?.id || '—';
          document.getElementById('user-email').textContent = user?.email || '—';
          const nameEl = document.getElementById('user-name');
          if (nameEl) nameEl.textContent = meta.full_name || meta.name || user?.email || '—';

          // Provider badge
          const providerEl = document.getElementById('user-provider');
          if (providerEl) {
            const provider = user?.app_metadata?.provider || 'email';
            providerEl.textContent = 'Login via: ' + provider;
          }

          // Metadata list
          const metaEl = document.getElementById('user-meta');
          if (metaEl) {
            const skip = new Set(['avatar_url']);
            const entries = Object.entries(meta).filter(([k]) => !skip.has(k));
            if (entries.length === 0) {
              metaEl.innerHTML = '<p class="text-sm text-gray-400 py-2">Sem metadados.</p>';
            } else {
              metaEl.innerHTML = entries.map(([k, v]) => {
                const label = k.replace(/_/g, ' ');
                const value = typeof v === 'object' ? JSON.stringify(v) : String(v);
                return [
                  '<div class="flex justify-between py-2 gap-4 text-sm">',
                  '  <dt class="text-gray-500 capitalize shrink-0">' + label + '</dt>',
                  '  <dd class="text-gray-900 text-right break-all">' + value + '</dd>',
                  '</div>'
                ].join('');
              }).join('');
            }
          }

          // Try fetch extra profile from 'users' table (optional)
          try {
            const { data: profile, error: profileErr } = await supabase.from('users').select('*').eq('id', user.id).single();
            if (!profileErr && profile) {
              const metaEl = document.getElementById('user-meta');
              const extra = Object.entries(profile).filter(([k]) => !['id'].includes(k));
              if (metaEl && extra.length > 0) {
                const extraHtml = extra.map(([k, v]) => {
                  const label = k.replace(/_/g, ' ');
                  const value = typeof v === 'object' ? JSON.stringify(v) : String(v ?? '—');
                  return [
                    '<div class="flex justify-between py-2 gap-4 text-sm border-t border-gray-100">',
                    '  <dt class="text-gray-500 capitalize shrink-0">' + label + '</dt>',
                    '  <dd class="text-gray-900 text-right break-all">' + value + '</dd>',
                    '</div>'
                  ].join('');
                }).join('');
                metaEl.insertAdjacentHTML('beforeend', extraHtml);
              }
            }
          } catch (e) {
            // ignore optional
          }
        } catch (err) {
          errEl.textContent = err.message || String(err);
        }
      })();
    }

    // OAuth social login buttons
    ['google', 'apple'].forEach((provider) => {
      const btn = document.getElementById('oauth-btn-' + provider);
      if (!btn) return;
      btn.addEventListener('click', async () => {
        const errEl = document.getElementById('signin-error');
        if (errEl) errEl.textContent = '';
        const client = initSupabase();
        if (!client) {
          if (errEl) errEl.textContent = 'Supabase não configurado.';
          return;
        }
        try {
          const { error } = await authSignInWithOAuth(provider);
          if (error && errEl) errEl.textContent = error.message || String(error);
        } catch (err) {
          if (errEl) errEl.textContent = err.message || String(err);
        }
      });
    });

    // Sign out
    const signoutBtn = document.getElementById('signout-btn');
    if (signoutBtn) {
      signoutBtn.addEventListener('click', async () => {
        try {
          await initSupabase();
          if (supabase && supabase.auth && typeof supabase.auth.signOut === 'function') {
            await supabase.auth.signOut();
          }
        } catch (e) {
          console.warn(e);
        }
        window.location.href = 'index.html';
      });
    }
  });
})();
