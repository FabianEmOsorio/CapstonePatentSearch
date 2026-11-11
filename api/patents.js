import { applyApiSecurity, enforceOptionalAuth, enforceRateLimit, safeHttpUrl, sanitizePubNumber, sanitizeErrorMessage } from './_security.js';

const ALLOWED_SOURCES = new Set(['all', 'google', 'europepmc', 'patentbrief', 'lens', 'epo']);

export default async function handler(req, res) {
  if (applyApiSecurity(req, res, 'GET,POST,OPTIONS')) return;
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Método no permitido.' });
  }
  if (!enforceOptionalAuth(req, res)) return; // [OPTIONAL AUTH - ENABLE_API_AUTH=true]
  if (!enforceRateLimit(req, res, { maxRequests: 45 })) return;

  const { q, source: rawSource = 'all' } = req.query || {};
  const SERPAPI_KEY = process.env.SERPAPI_KEY || "";

  if (!q || typeof q !== 'string' || !q.trim()) {
    return res.status(400).json({ error: 'Parámetro de búsqueda "q" es requerido' });
  }

  const safeQ = q.trim().slice(0, 500);
  const source = ALLOWED_SOURCES.has(String(rawSource).toLowerCase())
    ? String(rawSource).toLowerCase()
    : 'all';

  const combinedResults = [];
  let cpcSummaries = [];
  let sourceMessage = null;
  let totalFound = 0;

  const tasks = [];

  // 1. Google Patents (Direct XHR con fallback a SerpApi)
  if (source === 'all' || source === 'google') {
    tasks.push((async () => {
      // Intentar directo primero
      try {
        const innerQ = safeQ.replace(/[&#]/g, ' ');
        const encodedParam = encodeURIComponent(`q=${innerQ}&exp=`);
        const xhrUrl = `https://patents.google.com/xhr/query?url=${encodedParam}`;
        const xhrResp = await fetch(xhrUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Referer': `https://patents.google.com/?q=${encodeURIComponent(safeQ)}`,
            'X-Requested-With': 'XMLHttpRequest'
          }
        });
        if (xhrResp.ok) {
          const data = await xhrResp.json();
          const cluster = data.results?.cluster || [];
          if (cluster[0]?.result?.length) {
            const rawResults = cluster[0].result.slice(0, 10);
            totalFound += data.results.total_num_results || rawResults.length;
            
            const cpcRaw = data.results.summary?.cpc || [];
            for (const item of cpcRaw) {
              if (item.key && item.key !== 'Total') {
                cpcSummaries.push({
                  code: item.key,
                  percentage: Math.round(((item.value || 0) / 1000) * 1000) / 10,
                  type: 'CPC'
                });
              }
            }

            for (const item of rawResults) {
              const pat = item.patent || {};
              const rawPub = pat.publication_number || pat.id?.replace('patent/', '').replace('/en', '') || 'N/A';
              const pubNum = sanitizePubNumber(rawPub);
              const thumb = pat.thumbnail ? safeHttpUrl(`https://patentimages.storage.googleapis.com/${String(pat.thumbnail).replace(/^\/+/, '')}`) : null;
              const pdf = pat.pdf ? safeHttpUrl(`https://patentimages.storage.googleapis.com/${String(pat.pdf).replace(/^\/+/, '')}`) : null;
              
              const figures = [];
              for (const f of (pat.figures || [])) {
                const path = f.thumbnail || f.full;
                if (path) {
                  const figUrl = safeHttpUrl(`https://patentimages.storage.googleapis.com/${String(path).replace(/^\/+/, '')}`);
                  if (figUrl) figures.push(figUrl);
                }
              }
              if (thumb && !figures.includes(thumb)) figures.unshift(thumb);

              combinedResults.push({
                source: 'Google Patents',
                source_badge: 'google',
                publication_number: pubNum,
                title: pat.title?.trim() || 'Sin título registrado',
                snippet: pat.snippet?.trim() || '',
                assignee: pat.assignee || 'No especificado',
                inventor: pat.inventor || 'No especificado',
                filing_date: pat.filing_date || pat.priority_date || null,
                publication_date: pat.publication_date || 'N/A',
                legal_status: 'Registrada',
                forwardCitationCount: pat.cited_by || 0,
                thumbnail: thumb,
                figures,
                patent_link: pubNum !== 'N/A' ? `https://patents.google.com/patent/${encodeURIComponent(pubNum)}/en` : null,
                pdf,
                classifications_cpc: cpcSummaries.slice(0, 3).map(c => c.code),
                classifications_ipc: []
              });
            }
            return;
          }
        }
      } catch (err) {
        // Fallback silencioso a SerpApi
      }

      // Fallback a SerpApi (si existe SERPAPI_KEY en variables de entorno)
      if (!SERPAPI_KEY) return;
      try {
        const targetUrl = `https://serpapi.com/search.json?engine=google_patents&q=${encodeURIComponent(safeQ)}&api_key=${encodeURIComponent(SERPAPI_KEY)}`;
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
            pubNum = sanitizePubNumber(pubNum);

            const figures = [];
            if (p.figures) {
              for (const fig of p.figures) {
                const safeFig = safeHttpUrl(fig.thumbnail || fig.full);
                if (safeFig) figures.push(safeFig);
              }
            } else if (p.thumbnail) {
              const safeThumb = safeHttpUrl(p.thumbnail);
              if (safeThumb) figures.push(safeThumb);
            }

            combinedResults.push({
              source: 'Google Patents',
              source_badge: 'google',
              publication_number: pubNum,
              title: p.title || 'Sin título registrado',
              snippet: p.snippet || '',
              assignee: p.assignee || 'No especificado',
              inventor: p.inventor || 'No especificado',
              filing_date: p.filing_date || p.priority_date || null,
              publication_date: p.publication_date || p.grant_date || 'N/A',
              legal_status: p.country_status ? Object.values(p.country_status)[0] || 'Registrada' : 'Registrada',
              forwardCitationCount: p.cited_by || p.citations || 0,
              thumbnail: safeHttpUrl(p.thumbnail),
              figures,
              patent_link: safeHttpUrl(p.patent_link) || (pubNum !== 'N/A' ? `https://patents.google.com/patent/${encodeURIComponent(pubNum)}/en` : null),
              pdf: safeHttpUrl(p.pdf),
              classifications_cpc: cpcSummaries.slice(0, 3).map(c => c.code),
              classifications_ipc: []
            });
          }
        }
        totalFound += data.search_information?.total_results ? parseInt(data.search_information.total_results, 10) : (data.organic_results?.length || 0);
      } catch (err) {
        console.warn("Google Patents error:", sanitizeErrorMessage(err));
      }
    })());
  }

  // 2. Europe PMC Patent Corpus (EPO / WIPO)
  if (source === 'all' || source === 'europepmc') {
    tasks.push((async () => {
      try {
        const pmcUrl = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=SRC:PAT+AND+${encodeURIComponent(safeQ)}&format=json&resultType=core&pageSize=8`;
        const resp = await fetch(pmcUrl);
        if (resp.ok) {
          const data = await resp.json();
          const items = data.resultList?.result || [];
          totalFound += data.hitCount || items.length;

          for (const item of items) {
            const docId = sanitizePubNumber(item.id || 'N/A');
            const authors = (item.authorList?.author || []).map(a => a.fullName).filter(Boolean);
            const pdfUrl = (item.hasPDF === 'Y' && docId !== 'N/A') ? `https://europepmc.org/backend/ptservice.cgi?accid=${encodeURIComponent(docId)}&action=viewpdf` : null;
            const patentUrl = (docId.startsWith('EP') || docId.startsWith('WO'))
              ? `https://worldwide.espacenet.com/patent/search/family/${encodeURIComponent(docId)}`
              : `https://europepmc.org/article/PAT/${encodeURIComponent(docId)}`;
            const cits = parseInt(item.citedByCount || 0, 10) || 0;
            const appDate = item.application?.applicationDate || null;

            combinedResults.push({
              source: 'Europe PMC (EPO / WIPO)',
              source_badge: 'europepmc',
              publication_number: docId,
              title: item.title || 'Sin título registrado',
              snippet: item.abstractText || '',
              assignee: item.affiliation || 'Oficina Europea / Internacional (EPO/WIPO)',
              inventor: authors.join(', ') || item.authorString || 'No especificado',
              filing_date: appDate,
              publication_date: String(item.pubYear || 'N/A'),
              legal_status: 'Oficial Publicada',
              forwardCitationCount: cits,
              thumbnail: null,
              figures: [],
              patent_link: patentUrl,
              pdf: pdfUrl,
              classifications_cpc: [],
              classifications_ipc: []
            });
          }
        }
      } catch (err) {
        console.warn("Europe PMC error:", sanitizeErrorMessage(err));
      }
    })());
  }

  // 3. PatentBrief (Tecnología Amigable)
  if (source === 'all' || source === 'patentbrief') {
    tasks.push((async () => {
      try {
        const briefUrl = `https://patentbrief.org/api/search?q=${encodeURIComponent(safeQ)}`;
        const resp = await fetch(briefUrl);
        if (resp.ok) {
          const data = await resp.json();
          const patents = data.patents || [];
          totalFound += patents.length;

          for (const item of patents.slice(0, 8)) {
            const pubNum = sanitizePubNumber(`${item.countryCode || 'US'}${item.patentNumber || ''}`);
            const fig = safeHttpUrl(item.figureUrl);

            combinedResults.push({
              source: 'PatentBrief (Tecnología Amigable)',
              source_badge: 'patentbrief',
              publication_number: pubNum,
              title: item.plainEnglishTitle || item.title || 'Sin título',
              plain_title: item.plainEnglishTitle,
              one_sentence_summary: item.oneSentenceSummary,
              snippet: item.oneSentenceSummary || item.title || '',
              assignee: item.assigneeName || 'No especificado',
              inventor: 'No especificado',
              filing_date: null,
              publication_date: item.grantDate || 'N/A',
              legal_status: 'Concedida',
              thumbnail: fig,
              figures: fig ? [fig] : [],
              industry_tags: item.industryTags || [],
              patent_link: pubNum !== 'N/A' ? `https://patents.google.com/patent/${encodeURIComponent(pubNum)}/en` : null,
              pdf: null,
              classifications_cpc: [],
              classifications_ipc: []
            });
          }
        }
      } catch (err) {
        console.warn("PatentBrief error:", sanitizeErrorMessage(err));
      }
    })());
  }

  if (source === 'lens') {
    sourceMessage = "El conector con The Lens API está implementado y a la espera de autorización definitiva del token académico en Lens.org. Seleccione 'Todas las fuentes' para consultar patentes activas.";
  } else if (source === 'epo') {
    sourceMessage = "El conector con EPO OPS está implementado bajo la referencia administrativa 46581. Seleccione 'Todas las fuentes' o 'Europe PMC' para consultar patentes europeas oficiales.";
  }

  await Promise.allSettled(tasks);

  return res.status(200).json({
    query: safeQ,
    source,
    total_found: totalFound || combinedResults.length,
    results_count: combinedResults.length,
    organic_results: combinedResults,
    cpc_summary: cpcSummaries,
    info_message: sourceMessage
  });
}
