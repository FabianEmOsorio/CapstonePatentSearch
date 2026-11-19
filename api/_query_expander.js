/**
 * Shared multilingual, lexical & CPC/IPC classification query expansion helper.
 * Prefixed with '_' so Vercel treats it as an internal helper rather than a public route.
 */

const ALLOWED_MODES = new Set(['hybrid', 'classification', 'exact']);

const TECHNICAL_CPC_SEEDS = [
  { re: /\b(pumps?|bombas?|pumping|impellers?|centrifugal|hydraulic|hidr[aá]ulic[oa]s?|suction|succi[oó]n)\b/i, cpcs: [{ code: 'F04D', label: 'Bombas rotodinámicas / flujo continuo' }, { code: 'F04B', label: 'Bombas de desplazamiento positivo' }], syn: ['centrifugal pump', 'liquid pump', 'hydraulic pump', 'submersible pump'] },
  { re: /\b(batter(?:y|ies)|electrolytes?|lithium|anodes?|cathodes?|bater[ií]as?|acumuladores?)\b/i, cpcs: [{ code: 'H01M10/05', label: 'Baterías recargables / iones de litio' }, { code: 'H01M4/00', label: 'Electrodos electroquímicos' }], syn: ['solid state battery', 'electrochemical cell', 'lithium ion battery', 'secondary battery'] },
  { re: /\b(solares?|solar|photovoltaics?|fotovoltaic[oa]s?|perovskites?)\b/i, cpcs: [{ code: 'H02S', label: 'Generación de energía fotovoltaica' }, { code: 'H10K30/00', label: 'Dispositivos fotovoltaicos orgánicos/perovskita' }], syn: ['photovoltaic module', 'solar cell', 'solar energy collector'] },
  { re: /\b(robots?|grippers?|actuators?|actuadores?|rob[oó]tica|brazos?|manipulators?|haptic)\b/i, cpcs: [{ code: 'B25J', label: 'Manipuladores y sistemas robóticos' }, { code: 'B25J15/00', label: 'Cabezales y pinzas de agarre' }], syn: ['robotic manipulator', 'soft actuator', 'end effector', 'robotic gripper'] },
  { re: /\b(water filters?|purifiers?|desalination|filtros? de agua|purificadores?|osmosis|tratamiento de agua)\b/i, cpcs: [{ code: 'C02F', label: 'Tratamiento de agua y aguas residuales' }, { code: 'B01D', label: 'Separación y filtración de fluidos' }], syn: ['water filtration', 'water purification', 'membrane filtration'] },
  { re: /\b(sensors?|biosensors?|detection|medidores?|detectores?|sensores?)\b/i, cpcs: [{ code: 'G01N', label: 'Análisis e investigación de materiales' }, { code: 'G01D', label: 'Medición y transductores generales' }], syn: ['optical sensor', 'electrochemical sensor', 'sensing device'] },
  { re: /\b(drones?|uavs?|quadcopters?|aeronaves? no tripuladas?)\b/i, cpcs: [{ code: 'B64U', label: 'Vehículos aéreos no tripulados (UAV)' }, { code: 'B64C', label: 'Aeronaves y sistemas de control de vuelo' }], syn: ['unmanned aerial vehicle', 'autonomous drone', 'aerial rotorcraft'] },
  { re: /\b(wind turbines?|aerogeneradores?|e[oó]lic[oa]s?)\b/i, cpcs: [{ code: 'F03D', label: 'Motores eólicos y turbinas de viento' }], syn: ['wind turbine', 'wind power generator', 'rotor blade'] },
  { re: /\b(prosthetics?|pr[oó]tesis|implants?|implantes?|medical|quir[uú]rgic[oa]s?|catheters?|stents?)\b/i, cpcs: [{ code: 'A61F', label: 'Prótesis e implantes médicos' }, { code: 'A61B', label: 'Diagnóstico y cirugía médica' }], syn: ['medical prosthesis', 'surgical device', 'biomedical implant'] },
  { re: /\b(motors?|motores?|electric motors?|inverters?)\b/i, cpcs: [{ code: 'H02K', label: 'Máquinas dinamoeléctricas y motores' }, { code: 'H02P', label: 'Control de motores eléctricos' }], syn: ['electric motor', 'brushless motor', 'stator rotor assembly'] },
  { re: /\b(neural networks?|deep learning|artificial intelligence|inteligencia artificial|machine learning|redes? neuronales?)\b/i, cpcs: [{ code: 'G06N3/08', label: 'Redes neuronales y aprendizaje profundo' }, { code: 'G06F', label: 'Procesamiento digital de datos' }], syn: ['machine learning model', 'neural network architecture', 'deep learning inference'] }
];

export function normalizeSearchMode(rawMode) {
  const m = String(rawMode || 'hybrid').toLowerCase().trim();
  return ALLOWED_MODES.has(m) ? m : 'hybrid';
}

export function isDirectPatentIdentifier(q) {
  return /^(?:US|EP|WO|CN|JP|KR|DE|ES|GB|FR|BR|CO)[0-9]{4,12}[A-Z0-9]*$/i.test(String(q || '').trim());
}

export function hasExplicitBooleanOrCpc(q) {
  const s = String(q || '').trim();
  return /\b(?:AND|OR|NOT)\b|(?:CPC:|IPC:|TI=|AB=|CL=)/i.test(s);
}

function cleanQuoteTerm(term) {
  return String(term || '').replace(/["<>\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function buildEnglishMorphVariants(englishCore) {
  const clean = cleanQuoteTerm(englishCore);
  if (!clean) return [];
  const words = clean.split(' ').filter(Boolean);
  const variants = new Set();
  if (words.length >= 2) {
    const last = words[words.length - 1];
    const singularLast = (last.endsWith('s') && !last.endsWith('ss') && last.length > 3) ? last.slice(0, -1) : last;
    const singularForm = [...words.slice(0, -1), singularLast].join(' ');
    variants.add(singularForm);
    variants.add(clean);
    if (!last.endsWith('s')) {
      variants.add([...words.slice(0, -1), `${last}s`].join(' '));
    }
  } else {
    variants.add(clean);
  }
  return Array.from(variants).slice(0, 3);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 2000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

async function translateFreeGoogle(query) {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(query)}`;
    const resp = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, 1600);
    if (!resp.ok) return null;
    const data = await resp.json();
    const translated = Array.isArray(data?.[0])
      ? data[0].map(seg => (Array.isArray(seg) ? seg[0] : '')).filter(Boolean).join('')
      : '';
    const srcLang = typeof data?.[2] === 'string' ? data[2] : 'auto';
    if (!translated.trim()) return null;
    return {
      detected_language: srcLang,
      english_core: cleanQuoteTerm(translated)
    };
  } catch (e) {
    return null;
  }
}

async function expandWithGemini(query, apiKey) {
  const prompt = `Translate and expand this patent/technology search query into structured JSON ONLY (no markdown).
Input query: "${query}"

Return exact JSON schema:
{
  "detected_language": "es|en|pt|fr|de|auto",
  "english_core": "concise English canonical technical term (2-4 words)",
  "synonyms": ["3 to 5 concise English patent synonyms or broader functional equivalents"],
  "cpc_codes": [{"code": "4-to-9 char CPC group or subgroup like F04D or F04D13/06", "label": "short Spanish description max 48 chars"}]
}
Only include real standard CPC codes.`;

  const resp = await fetchWithTimeout(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 360 }
      })
    },
    2500 + 700
  );
  if (!resp.ok) return null;
  const data = await resp.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const cleaned = rawText.replace(/```json|```/gi, '').trim();
  const s = cleaned.indexOf('{');
  const e = cleaned.lastIndexOf('}');
  if (s === -1 || e === -1) return null;
  return JSON.parse(cleaned.slice(s, e + 1));
}

export async function buildEnrichedSearchPlan(rawQuery, rawMode = 'hybrid', options = {}) {
  const original = String(rawQuery || '').trim().slice(0, 500);
  const mode = normalizeSearchMode(rawMode);

  if (!original || mode === 'exact' || isDirectPatentIdentifier(original)) {
    return {
      original_query: original,
      search_mode: mode,
      detected_language: 'direct',
      english_core: original,
      expanded_terms: [original],
      applied_cpcs: [],
      google_query: original,
      classification_query: null,
      europe_pmc_query: original,
      patent_brief_query: original,
      openalex_query: original,
      expansion_source: isDirectPatentIdentifier(original) ? 'direct-id' : 'exact'
    };
  }

  // Extraer tokens explícitos CPC:/IPC: (ej. "bomba de agua CPC:F04D") para no traducir el código como palabra
  const explicitCpcs = [];
  const queryWithoutCpcTokens = original.replace(/\b(?:CPC|IPC):([A-H]\d{2}[A-Z](?:[0-9/]+)?)\b/gi, (_, c) => {
    explicitCpcs.push(c.toUpperCase());
    return ' ';
  }).replace(/\s+/g, ' ').trim();

  // Si el usuario escribió una ecuación booleana compleja explícita en inglés (AND/OR con paréntesis), respetarla
  if (hasExplicitBooleanOrCpc(queryWithoutCpcTokens) && !/[áéíóúñ¿¡]/i.test(queryWithoutCpcTokens)) {
    return {
      original_query: original,
      search_mode: mode,
      detected_language: 'boolean',
      english_core: queryWithoutCpcTokens || original,
      expanded_terms: [queryWithoutCpcTokens || original],
      applied_cpcs: explicitCpcs.map(code => ({ code, label: `Clasificación explícita ${code}` })),
      google_query: original,
      classification_query: explicitCpcs.length ? explicitCpcs.join(' OR ') : null,
      europe_pmc_query: queryWithoutCpcTokens || original,
      patent_brief_query: (queryWithoutCpcTokens || original).replace(/[()"]/g, ' ').replace(/\b(?:AND|OR|NOT)\b/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80),
      openalex_query: queryWithoutCpcTokens || original,
      expansion_source: 'boolean-explicit'
    };
  }

  const expansionInput = queryWithoutCpcTokens || original;
  let detectedLang = 'auto';
  let englishCore = '';
  const synSet = new Set();
  const cpcMap = new Map();
  explicitCpcs.forEach(code => cpcMap.set(code, `Clasificación aplicada ${code}`));
  let expansionSource = 'heuristic';

  const geminiKey = String(options.apiKey || process.env.GEMINI_API_KEY || '').trim();
  if (geminiKey && (!options.provider || options.provider === 'gemini')) {
    try {
      const aiPlan = await expandWithGemini(expansionInput, geminiKey);
      if (aiPlan && aiPlan.english_core) {
        detectedLang = String(aiPlan.detected_language || 'auto').slice(0, 12);
        englishCore = cleanQuoteTerm(aiPlan.english_core);
        if (Array.isArray(aiPlan.synonyms)) {
          aiPlan.synonyms.forEach(s => {
            const ct = cleanQuoteTerm(s);
            if (ct && ct.length >= 3) synSet.add(ct);
          });
        }
        if (Array.isArray(aiPlan.cpc_codes)) {
          aiPlan.cpc_codes.forEach(c => {
            const code = String(c?.code || c || '').trim().toUpperCase().replace(/[^A-Z0-9/]/g, '').slice(0, 14);
            if (/^[A-H]\d{2}[A-Z](?:\d+(?:\/\d+)?)?$/.test(code)) {
              if (!cpcMap.has(code)) cpcMap.set(code, String(c?.label || `Clase CPC ${code}`).slice(0, 60));
            }
          });
        }
        expansionSource = 'gemini+cpc';
      }
    } catch (e) {
      // Fallback silencioso
    }
  }

  // Fallback rápido gratuito cuando no hay LLM o falló
  if (!englishCore) {
    const tr = await translateFreeGoogle(expansionInput);
    if (tr && tr.english_core) {
      detectedLang = tr.detected_language || 'auto';
      englishCore = tr.english_core;
      expansionSource = cpcMap.size > 0 ? 'translate+cpc' : 'translate+heuristic';
    } else {
      englishCore = cleanQuoteTerm(expansionInput);
      detectedLang = /[áéíóúñ¿¡]/i.test(expansionInput) ? 'es' : 'en';
    }
  }

  // Enriquecer siempre con variantes morfológicas y semillas CPC conocidas
  buildEnglishMorphVariants(englishCore).forEach(v => synSet.add(v));
  const combinedTextForSeeds = `${expansionInput} ${englishCore}`;
  for (const seed of TECHNICAL_CPC_SEEDS) {
    if (seed.re.test(combinedTextForSeeds)) {
      seed.syn.forEach(s => synSet.add(s));
      seed.cpcs.forEach(c => {
        if (!cpcMap.has(c.code)) cpcMap.set(c.code, c.label);
      });
    }
  }

  const orderedTerms = [];
  if (englishCore) orderedTerms.push(englishCore);
  for (const s of synSet) {
    if (s.toLowerCase() !== englishCore.toLowerCase() && orderedTerms.length < 5) {
      orderedTerms.push(s);
    }
  }
  const origClean = cleanQuoteTerm(expansionInput);
  if (origClean && !orderedTerms.some(t => t.toLowerCase() === origClean.toLowerCase())) {
    orderedTerms.push(origClean);
  }

  const cpcList = Array.from(cpcMap.entries()).slice(0, 4).map(([code, label]) => ({ code, label }));
  const quotedOrTerms = orderedTerms.map(t => (t.includes(' ') ? `"${t}"` : t));
  const multilingualOrExpr = quotedOrTerms.length > 1 ? `(${quotedOrTerms.join(' OR ')})` : (quotedOrTerms[0] || origClean);
  const cpcCodesOnly = cpcList.map(c => c.code);
  const cpcOrExpr = cpcCodesOnly.length > 1 ? `(${cpcCodesOnly.join(' OR ')})` : (cpcCodesOnly[0] || '');

  // Si el usuario eligió un CPC explícito, priorizar filtro conjunto; sino ampliar combinando ambos
  let googleQuery = multilingualOrExpr;
  let classificationQuery = null;
  if (explicitCpcs.length > 0) {
    googleQuery = `${multilingualOrExpr} (${explicitCpcs.join(' OR ')})`;
    classificationQuery = explicitCpcs.join(' OR ');
  } else if (mode === 'classification' && cpcOrExpr) {
    googleQuery = englishCore
      ? `(${cpcOrExpr}) (${englishCore.includes(' ') ? `"${englishCore}"` : englishCore} OR ${orderedTerms[1] ? `"${orderedTerms[1]}"` : englishCore})`
      : cpcOrExpr;
    classificationQuery = cpcOrExpr;
  } else if (cpcOrExpr) {
    googleQuery = multilingualOrExpr;
    classificationQuery = englishCore
      ? `(${cpcOrExpr}) ${englishCore.includes(' ') ? `"${englishCore}"` : englishCore}`
      : cpcOrExpr;
  }

  const europePmcQuery = multilingualOrExpr;
  const patentBriefQuery = englishCore || origClean;
  const openAlexQuery = englishCore || origClean;

  return {
    original_query: original,
    search_mode: mode,
    detected_language: detectedLang,
    english_core: englishCore || origClean,
    expanded_terms: orderedTerms,
    applied_cpcs: cpcList,
    google_query: googleQuery,
    classification_query: classificationQuery,
    europe_pmc_query: europePmcQuery,
    patent_brief_query: patentBriefQuery,
    openalex_query: openAlexQuery,
    expansion_source: expansionSource
  };
}
