(function () {
  let accessToken = '';
  let tokenClient = null;
  let successHandler = null;
  let failureHandler = null;

  window.google = window.google || {};
  window.google.script = window.google.script || {};

  async function callAppsScript(functionName, parameters) {
    if (!accessToken) {
      throw new Error('Logga in med Google först.');
    }

    const config = window.MASSE_CONFIG || {};
    const url =
      `https://script.googleapis.com/v1/scripts/` +
      `${config.appsScriptDeploymentId}:run`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        function: functionName,
        parameters: parameters || [],
        devMode: false
      })
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(
        payload.error?.message ||
        `Google svarade med fel ${response.status}.`
      );
    }

    if (payload.error) {
      const detail = payload.error.details?.[0];

      throw new Error(
        detail?.errorMessage ||
        payload.error.message ||
        'Apps Script kunde inte utföra åtgärden.'
      );
    }

    return payload.response?.result;
  }

  const runner = new Proxy({}, {
    get: function (_, property) {
      if (property === 'withSuccessHandler') {
        return function (handler) {
          successHandler = handler;
          return runner;
        };
      }

      if (property === 'withFailureHandler') {
        return function (handler) {
          failureHandler = handler;
          return runner;
        };
      }

      return function () {
        const parameters = Array.from(arguments);
        const onSuccess = successHandler;
        const onFailure = failureHandler;

        successHandler = null;
        failureHandler = null;

        callAppsScript(String(property), parameters)
          .then(result => {
            if (onSuccess) onSuccess(result);
          })
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

    if (button) {
      button.textContent = isLoggedIn
        ? 'Google anslutet'
        : 'Logga in med Google';

      button.classList.toggle('connected', isLoggedIn);
    }

    if (status) status.textContent = message || '';
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
      callback: response => {
        if (response.error) {
          setLoginState(
            false,
            response.error_description || response.error
          );
          return;
        }

        accessToken = response.access_token;

        setLoginState(
          true,
          'Dina profiler kan nu läsas och sparas.'
        );

        if (typeof window.loadRoasts === 'function') {
          window.loadRoasts();
        }
      }
    });
  }

  window.masseGoogleLogin = function () {
    if (!tokenClient) {
      setLoginState(
        false,
        'Google-inloggningen laddas. Försök igen om ett ögonblick.'
      );
      return;
    }

    tokenClient.requestAccessToken({
      prompt: accessToken ? '' : 'consent'
    });
  };

  document.addEventListener('DOMContentLoaded', function () {
    const panel = document.createElement('div');

    panel.className = 'google-login-panel';
    panel.innerHTML = `
      <button id="googleLoginButton" type="button">
        Logga in med Google
      </button>
      <span id="googleLoginStatus">
        Logga in för att öppna och spara profiler.
      </span>
    `;

    document.body.appendChild(panel);

    document
      .getElementById('googleLoginButton')
      .addEventListener('click', window.masseGoogleLogin);

    const style = document.createElement('style');

    style.textContent = `
      .google-login-panel {
        position: fixed;
        right: 14px;
        bottom: 14px;
        z-index: 200;
        display: flex;
        align-items: center;
        gap: 10px;
        max-width: calc(100vw - 28px);
        padding: 9px;
        background: #fbfaf6;
        border: 1px solid #d7d3ca;
        border-radius: 8px;
        box-shadow: 0 8px 30px #0003;
      }

      .google-login-panel button {
        border: 0;
        border-radius: 5px;
        background: #26342c;
        color: white;
        padding: 10px 13px;
        font-weight: bold;
      }

      .google-login-panel button.connected {
        background: #39704f;
      }

      .google-login-panel span {
        font-size: 11px;
        color: #60655e;
      }

      @media (max-width: 520px) {
        .google-login-panel {
          left: 10px;
          right: 10px;
          bottom: 10px;
        }

        .google-login-panel span {
          flex: 1;
        }
      }
    `;

    document.head.appendChild(style);
    initializeGoogleLogin();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('./sw.js')
        .catch(console.warn);
    }
  });
})();
