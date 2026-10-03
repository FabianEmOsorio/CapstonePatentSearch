export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { q } = req.query;
  const apiKey = process.env.SERPAPI_KEY || "95dbb01b74ac677ffca277c162bb09294c58b2795b8ff4bc9374c718e5299e00";

  if (!q) {
    return res.status(400).json({ error: 'Parámetro de búsqueda "q" es requerido' });
  }

  try {
    const targetUrl = `https://serpapi.com/search.json?engine=google_patents&q=${encodeURIComponent(q)}&api_key=${apiKey}`;
    const response = await fetch(targetUrl);
    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(502).json({
      error: `Error al consultar la API de patentes: ${error.message}`,
      query: q
    });
  }
}
