import { applyApiSecurity, enforceOptionalAuth, enforceRateLimit, sanitizeErrorMessage } from './_security.js';

export default async function handler(req, res) {
  if (applyApiSecurity(req, res, 'GET,POST,OPTIONS')) return;
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Método no permitido.' });
  }
  if (!enforceOptionalAuth(req, res)) return; // [OPTIONAL AUTH - ENABLE_API_AUTH=true]
  if (!enforceRateLimit(req, res, { maxRequests: 60 })) return;

  let text = '';
  if (req.method === 'POST') {
    text = typeof req.body?.text === 'string' ? req.body.text : '';
  } else {
    text = typeof req.query?.text === 'string' ? req.query.text : '';
  }

  const trimmedText = text.trim();
  if (!trimmedText) {
    return res.status(400).json({ error: "Parámetro 'text' requerido" });
  }
  if (trimmedText.length > 5000) {
    return res.status(400).json({ error: "El parámetro 'text' excede el máximo de 5000 caracteres" });
  }

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=es&dt=t&q=${encodeURIComponent(trimmedText)}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    const translated = (data[0] || []).map(p => p[0]).filter(Boolean).join('');
    return res.status(200).json({ original: trimmedText, translated });
  } catch (err) {
    return res.status(500).json({ error: `Error al traducir: ${sanitizeErrorMessage(err)}` });
  }
}
