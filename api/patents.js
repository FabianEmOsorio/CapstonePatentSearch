export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { q, source = 'all' } = req.query;
  const SERPAPI_KEY = process.env.SERPAPI_KEY || "95dbb01b74ac677ffca277c162bb09294c58b2795b8ff4bc9374c718e5299e00";
  const LENS_TOKEN = process.env.LENS_TOKEN || "cjBPheEuwpYJ0X2VrGNHbuDGGNVoTDQxFYN6jkhpB2CiNQ1hRxDqo";

  if (!q) {
    return res.status(400).json({ error: 'Parámetro de búsqueda "q" es requerido' });
  }

  const combinedResults = [];
  const cpcSummaries = [];
  let sourceMessage = null;
  let totalFound = 0;

  // 1. Google Patents via SerpApi
  if (source === 'all' || source === 'google') {
    try {
      const targetUrl = `https://serpapi.com/search.json?engine=google_patents&q=${encodeURIComponent(q)}&api_key=${SERPAPI_KEY}`;
      const response = await fetch(targetUrl);
      const data = await response.json();

      if (data.summary && data.summary.cpc) {
        for (const item of data.summary.cpc) {
          if (item.key && item.key !== 'Total') {
            cpcSummaries.push({
              code: item.key,
              percentage: item.percentage || 0,
              type: 'CPC'
            });
          }
        }
      }

      if (data.organic_results) {
        for (const p of data.organic_results) {
          let pubNum = p.publication_number;
          if (!pubNum && p.patent_id) {
            const parts = p.patent_id.split('/');
            pubNum = parts.length >= 2 ? parts[1] : p.patent_id;
          }

          let status = 'Registrada';
          if (p.country_status) {
            const firstVal = Object.values(p.country_status)[0];
            if (firstVal) status = firstVal;
          }

          const figures = [];
          if (p.figures) {
            for (const fig of p.figures) {
              figures.push(fig.thumbnail || fig.full);
            }
          } else if (p.thumbnail) {
            figures.push(p.thumbnail);
          }

          // Atribuir CPCs relevantes del resumen
          const assignedCpcs = cpcSummaries.slice(0, 3).map(c => c.code);

          combinedResults.push({
            source: 'Google Patents',
            source_badge: 'google',
            publication_number: pubNum || 'N/A',
            title: p.title || 'Sin título registrado',
            snippet: p.snippet || '',
            assignee: p.assignee || 'No especificado',
            inventor: p.inventor || 'No especificado',
            filing_date: p.filing_date || p.priority_date || null,
            publication_date: p.publication_date || p.grant_date || 'N/A',
            legal_status: status,
            thumbnail: p.thumbnail || null,
            figures: figures,
            patent_link: p.patent_link || (pubNum ? `https://patents.google.com/patent/${pubNum}/en` : null),
            pdf: p.pdf || null,
            classifications_cpc: assignedCpcs,
            classifications_ipc: []
          });
        }
      }

      if (data.search_information && data.search_information.total_results) {
        totalFound += parseInt(data.search_information.total_results, 10);
      } else {
        totalFound += combinedResults.length;
      }
    } catch (err) {
      console.warn("SerpApi error:", err);
    }
  }

  // 2. The Lens API
  if (source === 'all' || source === 'lens') {
    try {
      const lensUrl = 'https://api.lens.org/patent/search';
      const lensResp = await fetch(lensUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LENS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: { match: { title: q } },
          size: 10
        })
      });

      if (lensResp.status === 401 && source === 'lens') {
        sourceMessage = "La API de The Lens aún requiere validación administrativa de Trial en Lens.org para autorizar el token 'ProyectoCapstone'. Por favor use 'Todas las fuentes' o 'Google Patents' para obtener patentes activas de inmediato.";
      } else if (lensResp.ok) {
        const lData = await lensResp.json();
        for (const item of (lData.data || [])) {
          const biblio = item.biblio || {};
          const pubRef = biblio.publication_reference || {};
          const docKey = item.doc_key || pubRef.doc_number || 'N/A';
          const titleInfo = (biblio.invention_title || [])[0] || {};
          const abstractInfo = (item.abstract || [])[0] || {};
          const applicants = (biblio.parties?.applicants || []).map(a => a.extracted_name?.value).filter(Boolean);
          const inventors = (biblio.parties?.inventors || []).map(i => i.extracted_name?.value).filter(Boolean);
          const cpcs = (biblio.classifications_cpc || []).map(c => c.symbol).filter(Boolean);
          const ipcs = (biblio.classifications_ipcr || []).map(c => c.symbol).filter(Boolean);

          combinedResults.push({
            source: 'The Lens',
            source_badge: 'lens',
            publication_number: docKey,
            title: titleInfo.text || 'Sin título registrado',
            snippet: abstractInfo.text || '',
            assignee: applicants.join(', ') || 'No especificado',
            inventor: inventors.join(', ') || 'No especificado',
            filing_date: biblio.application_reference?.date || null,
            publication_date: pubRef.date || 'N/A',
            legal_status: item.legal_status?.patent_status || 'N/A',
            thumbnail: null,
            figures: [],
            patent_link: `https://www.lens.org/lens/patent/${item.lens_id}`,
            pdf: null,
            classifications_cpc: cpcs,
            classifications_ipc: ipcs
          });
        }
      }
    } catch (err) {
      if (source === 'lens') sourceMessage = `Error de conexión con The Lens: ${err.message}`;
    }
  }

  if (source === 'epo') {
    sourceMessage = "La API de EPO OPS se encuentra actualmente en validación por la Oficina Europea de Patentes (Referencia administrativa 46581). Seleccione 'Todas las fuentes' o 'Google Patents' para ver resultados.";
  }

  return res.status(200).json({
    query: q,
    source,
    total_found: totalFound || combinedResults.length,
    results_count: combinedResults.length,
    organic_results: combinedResults,
    cpc_summary: cpcSummaries,
    info_message: sourceMessage
  });
}
