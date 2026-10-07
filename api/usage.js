export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const SERPAPI_KEY = process.env.SERPAPI_KEY || "95dbb01b74ac677ffca277c162bb09294c58b2795b8ff4bc9374c718e5299e00";

  const serpapiUsage = {
    name: "Google Patents (SerpApi)",
    status: "Activa",
    plan: "Free Plan",
    total_monthly: 250,
    used_this_month: 0,
    remaining: 250,
    percentage_used: 0.0,
    renewal_date: null,
    connected: false
  };

  try {
    const accUrl = `https://serpapi.com/account.json?api_key=${SERPAPI_KEY}`;
    const r = await fetch(accUrl);
    if (r.ok) {
      const data = await r.json();
      const total = data.searches_per_month || 250;
      const used = data.this_month_usage || 0;
      const left = data.total_searches_left ?? (total - used);
      const pct = total ? Math.round((used / total) * 1000) / 10 : 0.0;
      serpapiUsage.connected = true;
      serpapiUsage.plan = data.plan_name || 'Free Plan';
      serpapiUsage.total_monthly = total;
      serpapiUsage.used_this_month = used;
      serpapiUsage.remaining = left;
      serpapiUsage.percentage_used = pct;
      serpapiUsage.renewal_date = data.plan_renewal_date;
    }
  } catch (e) {
    serpapiUsage.error = e.message;
  }

  const lensUsage = {
    name: "The Lens API",
    token_configured: true,
    plan: "Trial Access (14 días)",
    limit_total: 1000,
    rate_limit: "10 req/min",
    status: "Token configurado (Pendiente activación de Trial)",
    remaining: 1000,
    percentage_used: 0.0
  };

  const epoUsage = {
    name: "EPO OPS (European Patent Office)",
    plan: "Free Academic / Research",
    limit: "2.5 GB / semana",
    status: "Pendiente de aprobación administrativa (Ref: 46581)",
    connected: false
  };

  return res.status(200).json({
    serpapi: serpapiUsage,
    lens: lensUsage,
    epo: epoUsage
  });
}
