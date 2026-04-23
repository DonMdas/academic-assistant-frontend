const CALENDAR_OAUTH_MESSAGE_TYPE = 'calendar_oauth_code';
export const CALENDAR_OAUTH_CALLBACK_PATH = '/auth/calendar/callback';

function buildCalendarRedirectUri() {
  return `${window.location.origin}${CALENDAR_OAUTH_CALLBACK_PATH}`;
}

function openCenteredPopup(url, title, width = 560, height = 700) {
  const dualScreenLeft = window.screenLeft ?? window.screenX ?? 0;
  const dualScreenTop = window.screenTop ?? window.screenY ?? 0;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || screen.width;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || screen.height;

  const left = Math.max(0, dualScreenLeft + (viewportWidth - width) / 2);
  const top = Math.max(0, dualScreenTop + (viewportHeight - height) / 2);

  return window.open(
    url,
    title,
    `scrollbars=yes,width=${width},height=${height},top=${top},left=${left}`,
  );
}

function waitForOAuthCode(popup, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      clearInterval(closeCheck);
      clearTimeout(timeoutHandle);
    };

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value);
    };

    const onMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      const payload = event.data;
      if (!payload || payload.type !== CALENDAR_OAUTH_MESSAGE_TYPE) return;

      if (payload.error) {
        finish(reject, new Error(payload.error_description || payload.error || 'Calendar authorization was denied'));
        return;
      }

      const code = String(payload.code || '').trim();
      if (!code) {
        finish(reject, new Error('Calendar authorization did not return a valid code'));
        return;
      }

      finish(resolve, code);
    };

    const closeCheck = window.setInterval(() => {
      if (popup.closed) {
        finish(reject, new Error('Calendar authorization window was closed before completion'));
      }
    }, 400);

    const timeoutHandle = window.setTimeout(() => {
      finish(reject, new Error('Calendar authorization timed out. Please try again.'));
    }, timeoutMs);

    window.addEventListener('message', onMessage);
  });
}

export async function connectCalendarWithPopup(authApi) {
  const redirectUri = buildCalendarRedirectUri();
  const { authorization_url: authorizationUrl } = await authApi.calendarAuthorizationUrl(redirectUri);

  const popup = openCenteredPopup(authorizationUrl, 'google-calendar-connect');
  if (!popup) {
    throw new Error('Popup blocked. Please allow popups and try again.');
  }

  const authorizationCode = await waitForOAuthCode(popup);
  try {
    popup.close();
  } catch {
    // no-op
  }

  return authApi.calendarConnect(authorizationCode, redirectUri);
}
