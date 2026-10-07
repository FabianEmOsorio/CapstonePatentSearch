export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let text = '';
  if (req.method === 'POST') {
    text = req.body?.text || '';
  } else {
    text = req.query?.text || '';
  }

  if (!text) {
    return res.status(400).json({ error: "Parámetro 'text' requerido" });
  }

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=es&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const data = await response.json();
    const translated = (data[0] || []).map(p => p[0]).filter(Boolean).join('');
    return res.status(200).json({ original: text, translated });
  } catch (err) {
    return res.status(500).json({ error: `Error al traducir: ${err.message}` });
  }
}
