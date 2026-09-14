(function () {
  let accessToken = '';
  let tokenClient = null;
  let successHandler = null;
  let failureHandler = null;

  window.google = window.google || {};
  window.google.script = window.google.script || {};

  async function callAppsScript(functionName, parameters) {
    if (!accessToken) throw new Error('Logga in med Google först.');
    const config = window.MASSE_CONFIG || {};
    const url = `https://script.googleapis.com/v1/scripts/${config.appsScriptDeploymentId}:run`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ function: functionName, parameters: parameters || [], devMode: false })
    });
    const payload = await response.json();
    if (response.status === 401) {
      accessToken = '';
      showAccessLock('Google-sessionen har gått ut. Logga in igen – din pågående rostning ligger kvar.');
    }
    if (!response.ok) throw new Error(payload.error?.message || `Google svarade med fel ${response.status}.`);
    if (payload.error) {
      const detail = payload.error.details?.[0];
      throw new Error(detail?.errorMessage || payload.error.message || 'Apps Script kunde inte utföra åtgärden.');
    }
    return payload.response?.result;
  }

  const runner = new Proxy({}, {
    get: function (_, property) {
      if (property === 'withSuccessHandler') {
        return function (handler) { successHandler = handler; return runner; };
      }
      if (property === 'withFailureHandler') {
        return function (handler) { failureHandler = handler; return runner; };
      }
      return function () {
        const parameters = Array.from(arguments);
        const onSuccess = successHandler;
        const onFailure = failureHandler;
        successHandler = null;
        failureHandler = null;
        callAppsScript(String(property), parameters)
          .then(result => { if (onSuccess) onSuccess(result); })
          .catch(error => {
            if (onFailure) onFailure(error);
            else console.error(error);
          });
      };
    }
  });
  window.google.script.run = runner;

  function setLoginState(isLoggedIn, message) {
    const button = document.getElementById('googleLoginButton');
    const status = document.getElementById('googleLoginStatus');
    if (button) button.textContent = isLoggedIn ? 'Google anslutet' : 'Logga in med Google';
    if (button) button.classList.toggle('connected', isLoggedIn);
    if (status) status.textContent = message || '';
  }

  function showAccessLock(message) {
    document.documentElement.classList.add('masse-locked');
    let panel = document.getElementById('masseAccessLock');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'masseAccessLock';
      panel.innerHTML = '<section class="masse-lock-card"><div class="masse-lock-mark">MC</div><h1>Masse Coffee</h1><div class="masse-lock-subtitle">Roasting Program</div><button id="googleLoginButton" type="button">Logga in med Google</button><span id="googleLoginStatus"></span></section>';
      document.body.appendChild(panel);
      document.getElementById('googleLoginButton').addEventListener('click', window.masseGoogleLogin);
    }
    setLoginState(false, message || 'Endast behörigt Google-konto kan öppna programmet.');
  }

  function initializeGoogleLogin() {
    if (!window.google?.accounts?.oauth2) {
      window.setTimeout(initializeGoogleLogin, 200);
      return;
    }
    const config = window.MASSE_CONFIG || {};
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: config.googleClientId,
      scope: config.scopes,
      callback: async response => {
        if (response.error) {
          setLoginState(false, response.error_description || response.error);
          return;
        }
        accessToken = response.access_token;
        setLoginState(false, 'Verifierar åtkomst till din rostningslogg…');
        try {
          await callAppsScript('getRoasts', []);
          const lock = document.getElementById('masseAccessLock');
          if (lock) lock.remove();
          document.documentElement.classList.remove('masse-locked');
          if (typeof window.loadRoasts === 'function') window.loadRoasts();
        } catch (error) {
          accessToken = '';
          setLoginState(false, 'Åtkomst nekad. Välj kontot som äger rostningsloggen.');
        }
      }
    });
  }

  window.masseGoogleLogin = function () {
    if (!tokenClient) {
      setLoginState(false, 'Google-inloggningen laddas. Försök igen om ett ögonblick.');
      return;
    }
    tokenClient.requestAccessToken({ prompt: 'select_account' });
  };

  document.addEventListener('DOMContentLoaded', function () {
    const style = document.createElement('style');
    style.textContent = 'html.masse-locked,html.masse-locked body{overflow:hidden!important}#masseAccessLock{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:22px;background:#26342c}.masse-lock-card{width:min(430px,100%);padding:34px 28px;text-align:center;color:#f7f3e9;background:#314139;border:1px solid #596a60;border-radius:14px;box-shadow:0 24px 80px #0007}.masse-lock-mark{display:grid;place-items:center;width:76px;height:76px;margin:0 auto 18px;color:#f7f3e9;font:700 26px Georgia,serif;border:3px solid #ecb94f;border-radius:50%}.masse-lock-card h1{margin:0;font:700 28px Georgia,serif}.masse-lock-subtitle{margin:7px 0 25px;color:#ecb94f;font:11px Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase}#googleLoginButton{width:100%;min-height:50px;border:0;border-radius:6px;background:#ecb94f;color:#26342c;font-weight:700;cursor:pointer}#googleLoginButton:disabled{cursor:wait;opacity:.7}#googleLoginStatus{display:block;min-height:32px;margin-top:14px;color:#c8d0ca;font-size:12px;line-height:1.4}';
    document.head.appendChild(style);
    showAccessLock('Endast behörigt Google-konto kan öppna programmet.');
    initializeGoogleLogin();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(console.warn);
  });
})();
