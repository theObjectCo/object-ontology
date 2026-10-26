export function handleOAuthPopupCallbackIfPresent(): boolean {
  if (typeof window === 'undefined' || !window.opener || window.opener === window) return false;
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));

  if (search.has('code') || search.has('error') || hash.has('access_token') || hash.has('error')) {
    window.opener.postMessage(
      {
        type: 'PHENOME_OAUTH_CALLBACK',
        search: window.location.search,
        hash: window.location.hash,
        href: window.location.href,
      },
      window.location.origin,
    );
    window.close();
    return true;
  }
  return false;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function generatePkcePair(): Promise<{ verifier: string; challenge: string }> {
  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  const verifier = base64UrlEncode(random);
  const encoded = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  const challenge = base64UrlEncode(new Uint8Array(digest));
  return { verifier, challenge };
}

export function waitForPopupCallback(popup: Window): Promise<{ search: string; hash: string }> {
  return new Promise((resolve, reject) => {
    const timer = window.setInterval(() => {
      if (popup.closed) {
        window.clearInterval(timer);
        window.removeEventListener('message', onMsg);
        reject(new Error('Okno logowania zostało zamknięte przed zakończeniem autoryzacji.'));
      }
    }, 500);

    const onMsg = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin || ev.source !== popup) return;
      if (ev.data && ev.data.type === 'PHENOME_OAUTH_CALLBACK') {
        window.clearInterval(timer);
        window.removeEventListener('message', onMsg);
        resolve({ search: ev.data.search || '', hash: ev.data.hash || '' });
      }
    };

    window.addEventListener('message', onMsg);
  });
}
