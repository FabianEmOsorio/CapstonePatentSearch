import { applyApiSecurity, enforceOptionalAuth, enforceRateLimit, safeHttpUrl, sanitizeErrorMessage } from './_security.js';

export default async function handler(req, res) {
  if (applyApiSecurity(req, res, 'GET,OPTIONS')) return;
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido. Use GET.' });
  }
  if (!enforceOptionalAuth(req, res)) return; // [OPTIONAL AUTH - ENABLE_API_AUTH=true]
  if (!enforceRateLimit(req, res, { maxRequests: 45 })) return;

  const { q, page = '1' } = req.query || {};

  if (!q || typeof q !== 'string' || !q.trim()) {
    return res.status(400).json({ error: 'Parámetro de búsqueda "q" es requerido' });
  }

  const safeQuery = q.trim().slice(0, 500);
  const safePage = Math.max(1, Math.min(100, parseInt(page, 10) || 1));

  try {
    const encodedQ = encodeURIComponent(safeQuery);
    const url = `https://api.openalex.org/works?search=${encodedQ}&per_page=15&page=${safePage}&mailto=fabianem.osorio@gmail.com`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'CapstonePatentSearch/1.0 (mailto:fabianem.osorio@gmail.com)'
      }
    });

    if (!response.ok) {
      throw new Error(`OpenAlex respondió con código HTTP ${response.status}`);
    }

    const data = await response.json();
    const rawResults = data.results || [];
    const totalCount = data.meta?.count || 0;

    const works = rawResults.map(item => {
      // Autores y filiaciones
      const authors = (item.authorships || []).map(a => {
        const name = a.author?.display_name || '';
        const inst = (a.institutions || []).map(i => i.display_name).join(', ');
        return inst ? `${name} (${inst})` : name;
      }).filter(Boolean);

      // Abstract reconstruido si está en inverted index
      let abstract = '';
      if (item.abstract_inverted_index) {
        const positions = [];
        for (const [word, posList] of Object.entries(item.abstract_inverted_index)) {
          for (const pos of posList) {
            positions.push({ word, pos });
          }
        }
        positions.sort((a, b) => a.pos - b.pos);
        abstract = positions.map(p => p.word).join(' ');
      }

      // Conceptos clave / tags temáticos
      const concepts = (item.concepts || [])
        .filter(c => (c.score || 0) > 0.4)
        .slice(0, 5)
        .map(c => ({
          name: c.display_name,
          level: c.level,
          score: Math.round((c.score || 0) * 100)
        }));

      // Acceso abierto
      const oa = item.open_access || {};
      const isOA = oa.is_oa || false;
      const oaStatus = oa.oa_status || 'closed';
      const pdfUrl = safeHttpUrl(oa.oa_url);

      // Fuente / Journal
      const hostVenue = item.primary_location?.source || {};
      const journal = hostVenue.display_name || 'Publicación / Repositorio Académico';
      const venueType = hostVenue.type || item.type || 'Artículo científico';
      const doiUrl = safeHttpUrl(item.doi) || (item.ids?.doi ? safeHttpUrl(`https://doi.org/${encodeURIComponent(String(item.ids.doi).replace(/^https?:\/\/doi\.org\//i, ''))}`) : null);

      return {
        id: item.id,
        doi: item.doi,
        doi_url: doiUrl,
        title: item.title || 'Sin título registrado',
        publication_year: item.publication_year || 'N/A',
        publication_date: item.publication_date || String(item.publication_year || 'N/A'),
        authors: authors.slice(0, 5).join('; ') || 'No especificados',
        primary_author: authors[0] || 'No especificado',
        journal: journal,
        type: venueType,
        cited_by_count: item.cited_by_count || 0,
        is_oa: isOA,
        oa_status: oaStatus,
        pdf_url: pdfUrl,
        landing_url: safeHttpUrl(item.primary_location?.landing_page_url) || doiUrl,
        concepts: concepts,
        snippet: abstract || 'Resumen en texto completo en el enlace oficial de la publicación.',
        source: 'OpenAlex (Literatura Científica)',
        source_badge: 'openalex'
      };
    });

    return res.status(200).json({
      query: safeQuery,
      total_found: totalCount,
      results_count: works.length,
      organic_results: works,
      works: works
    });

  } catch (err) {
    return res.status(500).json({
      error: `Error al consultar OpenAlex: ${sanitizeErrorMessage(err)}`
    });
  }
}
