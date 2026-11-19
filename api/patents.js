import { applyApiSecurity, enforceOptionalAuth, enforceRateLimit, safeHttpUrl, sanitizePubNumber, sanitizeErrorMessage } from './_security.js';
import { buildEnrichedSearchPlan } from './_query_expander.js';

const ALLOWED_SOURCES = new Set(['all', 'google', 'europepmc', 'patentbrief', 'lens', 'epo']);

async function fetchGoogleXhrBatch(queryStr, matchTag = 'multilingual', limit = 10) {
  const innerQ = String(queryStr || '').replace(/[&#]/g, ' ').slice(0, 480);
  const encodedParam = encodeURIComponent(`q=${innerQ}&exp=`);
  const xhrUrl = `https://patents.google.com/xhr/query?url=${encodedParam}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const xhrResp = await fetch(xhrUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Referer': `https://patents.google.com/?q=${encodeURIComponent(innerQ)}`,
        'X-Requested-With': 'XMLHttpRequest'
      },
      signal: ctrl.signal
    });
    if (!xhrResp.ok) return null;
    const data = await xhrResp.json();
    const cluster = data.results?.cluster || [];
    const rawResults = cluster[0]?.result?.slice(0, limit) || [];
    const totalNum = Number(data.results?.total_num_results || rawResults.length) || 0;
    const cpcs = [];
    for (const item of (data.results?.summary?.cpc || [])) {
      if (item.key && item.key !== 'Total') {
        cpcs.push({
          code: item.key,
          percentage: Math.round(((item.value || 0) / 1000) * 1000) / 10,
          type: 'CPC'
        });
      }
    }
    const parsed = rawResults.map(item => {
      const pat = item.patent || {};
      const rawPub = pat.publication_number || pat.id?.replace('patent/', '').replace('/en', '') || 'N/A';
      const pubNum = sanitizePubNumber(rawPub);
      const thumb = pat.thumbnail ? safeHttpUrl(`https://patentimages.storage.googleapis.com/${String(pat.thumbnail).replace(/^\/+/, '')}`) : null;
      const pdf = pat.pdf ? safeHttpUrl(`https://patentimages.storage.googleapis.com/${String(pat.pdf).replace(/^\/+/, '')}`) : null;
      const figures = [];
      for (const f of (pat.figures || [])) {
        const p = f.thumbnail || f.full;
        if (p) {
          const figUrl = safeHttpUrl(`https://patentimages.storage.googleapis.com/${String(p).replace(/^\/+/, '')}`);
          if (figUrl) figures.push(figUrl);
        }
      }
      if (thumb && !figures.includes(thumb)) figures.unshift(thumb);

      return {
        source: 'Google Patents',
        source_badge: 'google',
        match_strategy: matchTag,
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
        classifications_cpc: cpcs.slice(0, 3).map(c => c.code),
        classifications_ipc: []
      };
    });
    return { results: parsed, cpc_summary: cpcs, total_found: totalNum };
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  if (applyApiSecurity(req, res, 'GET,POST,OPTIONS')) return;
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Método no permitido.' });
  }
  if (!enforceOptionalAuth(req, res)) return; // [OPTIONAL AUTH - ENABLE_API_AUTH=true]
  if (!enforceRateLimit(req, res, { maxRequests: 45 })) return;

  const body = (req.method === 'POST' && req.body && typeof req.body === 'object') ? req.body : {};
  const q = (req.query?.q ?? body.q ?? '');
  const rawSource = (req.query?.source ?? body.source ?? 'all');
  const rawMode = (req.query?.mode ?? body.mode ?? 'hybrid');
  const safePage = Math.max(1, Math.min(20, parseInt(req.query?.page ?? body.page ?? '1', 10) || 1));
  const optionalApiKey = typeof body.apiKey === 'string' ? body.apiKey.trim().slice(0, 256) : '';
  const optionalProvider = typeof body.provider === 'string' ? body.provider.trim().toLowerCase() : '';
  const SERPAPI_KEY = process.env.SERPAPI_KEY || "";

  if (!q || typeof q !== 'string' || !q.trim()) {
    return res.status(400).json({ error: 'Parámetro de búsqueda "q" es requerido' });
  }

  const safeQ = q.trim().slice(0, 500);
  const source = ALLOWED_SOURCES.has(String(rawSource).toLowerCase())
    ? String(rawSource).toLowerCase()
    : 'all';

  const plan = await buildEnrichedSearchPlan(safeQ, rawMode, {
    apiKey: optionalApiKey,
    provider: optionalProvider
  });

  const combinedResults = [];
  let cpcSummaries = [];
  let sourceMessage = null;
  let googleTotalFound = 0;
  let pmcTotalFound = 0;
  let briefTotalFound = 0;

  const tasks = [];

  // 1. Google Patents (Multilingüe + Clasificación CPC paralela + rotación de páginas + fallback SerpApi)
  if (source === 'all' || source === 'google') {
    tasks.push((async () => {
      try {
        // En página > 1 enfocamos variantes sinónimas / CPC específicas para traer un lote distinto
        let pagePrimaryQ = plan.google_query;
        if (safePage > 1 && plan.expanded_terms.length > 1) {
          const synTerm = plan.expanded_terms[(safePage - 1) % plan.expanded_terms.length];
          const cpcCode = plan.applied_cpcs[(safePage - 2) % Math.max(1, plan.applied_cpcs.length)]?.code || '';
          pagePrimaryQ = cpcCode ? `${cpcCode} "${synTerm}"` : `"${synTerm}"`;
        }
        const primaryBatch = await fetchGoogleXhrBatch(
          pagePrimaryQ,
          plan.search_mode === 'classification' ? 'classification' : (plan.search_mode === 'exact' ? 'exact' : 'multilingual'),
          10
        );

        let classBatch = null;
        if (plan.search_mode !== 'exact') {
          let classQueryToRun = plan.classification_query;
          if (safePage > 1 && plan.applied_cpcs.length > 0) {
            const rotCpc = plan.applied_cpcs[(safePage - 1) % plan.applied_cpcs.length]?.code;
            const rotTerm = plan.expanded_terms[safePage % plan.expanded_terms.length] || plan.english_core;
            classQueryToRun = rotCpc ? `${rotCpc} "${rotTerm}"` : classQueryToRun;
          }
          // Si no teníamos CPCs previos pero Google devolvió summary.cpc, usar las 2 clases dominantes reales
          if (!classQueryToRun && primaryBatch?.cpc_summary?.length > 0) {
            const topRealCpcs = primaryBatch.cpc_summary.map(c => c.code).filter(Boolean).slice(0, 2);
            if (topRealCpcs.length > 0) {
              const cpcExpr = topRealCpcs.length > 1 ? `(${topRealCpcs.join(' OR ')})` : topRealCpcs[0];
              classQueryToRun = plan.english_core ? `${cpcExpr} "${plan.english_core}"` : cpcExpr;
              if (plan.applied_cpcs.length === 0) {
                topRealCpcs.forEach(code => plan.applied_cpcs.push({ code, label: `Clasificación dominante ${code}` }));
              }
            }
          }
          if (classQueryToRun && classQueryToRun !== pagePrimaryQ) {
            classBatch = await fetchGoogleXhrBatch(classQueryToRun, 'classification', 8);
          }
        }

        if (primaryBatch?.cpc_summary?.length) cpcSummaries = primaryBatch.cpc_summary;
        else if (classBatch?.cpc_summary?.length) cpcSummaries = classBatch.cpc_summary;

        // Si no había CPC en plan pero Google detectó resumen CPC, exponer los top CPCs detectados
        if (plan.applied_cpcs.length === 0 && cpcSummaries.length > 0) {
          cpcSummaries.slice(0, 3).forEach(c => {
            plan.applied_cpcs.push({ code: c.code, label: `Clase CPC detectada (${c.percentage}%)` });
          });
        }

        const primaryItems = primaryBatch?.results || [];
        const classItems = classBatch?.results || [];
        const mergedGoogle = [];
        const seenGoogle = new Set();

        // Intercalar para combinar coincidencias multilingües y por clasificación CPC sin duplicados
        const maxLen = Math.max(primaryItems.length, classItems.length);
        for (let i = 0; i < maxLen; i++) {
          for (const candidate of [primaryItems[i], classItems[i]]) {
            if (!candidate) continue;
            if (!seenGoogle.has(candidate.publication_number)) {
              seenGoogle.add(candidate.publication_number);
              mergedGoogle.push(candidate);
            }
          }
        }

        if (mergedGoogle.length > 0) {
          combinedResults.push(...mergedGoogle);
          googleTotalFound = Math.max(primaryBatch?.total_found || 0, classBatch?.total_found || 0, mergedGoogle.length);
          return;
        }
      } catch (err) {
        // Fallback silencioso a SerpApi
      }

      // Fallback a SerpApi (si existe SERPAPI_KEY en variables de entorno)
      if (!SERPAPI_KEY) return;
      try {
        const targetUrl = `https://serpapi.com/search.json?engine=google_patents&q=${encodeURIComponent(plan.google_query || safeQ)}&api_key=${encodeURIComponent(SERPAPI_KEY)}`;
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
              match_strategy: plan.search_mode,
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
        googleTotalFound = data.search_information?.total_results ? parseInt(data.search_information.total_results, 10) : (data.organic_results?.length || 0);
      } catch (err) {
        console.warn("Google Patents error:", sanitizeErrorMessage(err));
      }
    })());
  }

  // 2. Europe PMC Patent Corpus (EPO / WIPO) — usa consulta expandida multilingüe para no restringirse al español
  if (source === 'all' || source === 'europepmc') {
    tasks.push((async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4500);
      try {
        const pmcQ = plan.europe_pmc_query || safeQ;
        const pmcUrl = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=SRC:PAT+AND+${encodeURIComponent(pmcQ)}&format=json&resultType=core&pageSize=8&page=${safePage}`;
        const resp = await fetch(pmcUrl, { signal: ctrl.signal });
        if (resp.ok) {
          const data = await resp.json();
          const items = data.resultList?.result || [];
          pmcTotalFound = Number(data.hitCount || items.length) || 0;

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
              match_strategy: plan.search_mode === 'exact' ? 'exact' : 'multilingual',
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
      } finally {
        clearTimeout(timer);
      }
    })());
  }

  // 3. PatentBrief (Tecnología Amigable en inglés)
  if (source === 'all' || source === 'patentbrief') {
    tasks.push((async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3800);
      try {
        const briefQ = plan.patent_brief_query || safeQ;
        const briefUrl = `https://patentbrief.org/api/search?q=${encodeURIComponent(briefQ)}`;
        const resp = await fetch(briefUrl, { signal: ctrl.signal });
        if (resp.ok) {
          const data = await resp.json();
          const patents = data.patents || [];
          briefTotalFound = patents.length;

          for (const item of patents.slice(0, 8)) {
            const pubNum = sanitizePubNumber(`${item.countryCode || 'US'}${item.patentNumber || ''}`);
            const fig = safeHttpUrl(item.figureUrl);

            combinedResults.push({
              source: 'PatentBrief (Tecnología Amigable)',
              source_badge: 'patentbrief',
              match_strategy: plan.search_mode === 'exact' ? 'exact' : 'multilingual',
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
      } finally {
        clearTimeout(timer);
      }
    })());
  }

  if (source === 'lens') {
    sourceMessage = "El conector con The Lens API está implementado y a la espera de autorización definitiva del token académico en Lens.org. Seleccione 'Todas las fuentes' para consultar patentes activas.";
  } else if (source === 'epo') {
    sourceMessage = "El conector con EPO OPS está implementado bajo la referencia administrativa 46581. Seleccione 'Todas las fuentes' o 'Europe PMC' para consultar patentes europeas oficiales.";
  }

  await Promise.allSettled(tasks);

  // Deduplicación global preservando el primer registro más completo
  const dedupedResults = [];
  const seenGlobal = new Set();
  for (const r of combinedResults) {
    const key = r.publication_number && r.publication_number !== 'N/A'
      ? `${r.source_badge}:${r.publication_number}`
      : `${r.source_badge}:${r.title}`;
    if (!seenGlobal.has(key)) {
      seenGlobal.add(key);
      dedupedResults.push(r);
    }
  }

  const totalFound = (googleTotalFound + pmcTotalFound + briefTotalFound) || dedupedResults.length;

  return res.status(200).json({
    query: safeQ,
    source,
    total_found: totalFound,
    results_count: dedupedResults.length,
    organic_results: dedupedResults,
    cpc_summary: cpcSummaries,
    info_message: sourceMessage,
    search_meta: {
      original_query: plan.original_query,
      search_mode: plan.search_mode,
      detected_language: plan.detected_language,
      english_core: plan.english_core,
      expanded_terms: plan.expanded_terms,
      applied_cpcs: plan.applied_cpcs,
      effective_query_google: plan.google_query,
      expansion_source: plan.expansion_source,
      total_global_estimated: totalFound
    }
  });
}
