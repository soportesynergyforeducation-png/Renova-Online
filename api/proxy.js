const GAS_URL = 'https://script.google.com/macros/s/AKfycbxSrcAKPWAxX0GW73QTQOkfl2s6GusWk3XIYyKSl6L7Iq_4AfjxrprCNPanOwArG1yvIA/exec';

export const config = {
  maxDuration: 60,
};

async function fetchFollowingRedirects(url, maxRedirects = 10) {
  let currentUrl = url;
  let redirectCount = 0;

  while (redirectCount < maxRedirects) {
    const response = await fetch(currentUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json, text/plain, */*',
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) break;
      currentUrl = location.startsWith('http') ? location : new URL(location, currentUrl).toString();
      redirectCount++;
      continue;
    }

    return response;
  }

  throw new Error('Demasiados redirects');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const params = new URLSearchParams(req.query).toString();
    const url = params ? `${GAS_URL}?${params}` : GAS_URL;

    const response = await fetchFollowingRedirects(url);
    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(502).json({ ok: false, error: 'Respuesta invalida: ' + text.slice(0, 100) });
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
