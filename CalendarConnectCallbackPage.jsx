import { useEffect } from 'react';

const CALENDAR_OAUTH_MESSAGE_TYPE = 'calendar_oauth_code';

export default function CalendarConnectCallbackPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payload = {
      type: CALENDAR_OAUTH_MESSAGE_TYPE,
      code: params.get('code') || '',
      error: params.get('error') || '',
      error_description: params.get('error_description') || '',
      state: params.get('state') || '',
    };

    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(payload, window.location.origin);
      window.close();
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#f0ede8] dark:bg-slate-900 flex items-center justify-center p-4 transition-colors">
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-sm dark:shadow-none dark:border dark:border-slate-700 max-w-md w-full text-center">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Google Calendar Authorization</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          You can close this tab and return to the app.
        </p>
      </div>
    </div>
  );
}
