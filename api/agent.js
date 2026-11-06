export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Use POST.' });
  }

  const {
    provider = 'gemini',
    apiKey,
    model,
    query,
    patents = [],
    literature = [],
    activePatent = null,
    userMessage,
    chatHistory = []
  } = req.body;

  // Priorizar clave enviada por cliente o variable de entorno de Vercel (Security by Design)
  const effectiveApiKey = apiKey || process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
  const effectiveProvider = (!apiKey && !process.env.GEMINI_API_KEY && process.env.GROQ_API_KEY) ? 'groq' : provider;

  // Si no hay API Key en ningún lado, se retorna análisis pericial heurístico estructurado
  if (!effectiveApiKey) {
    const analysis = generateHeuristicPeritoReport(query, patents, literature, userMessage);
    return res.status(200).json({
      provider: 'heuristic',
      model: 'Perito Heurístico Local',
      reply: analysis.reply,
      fto_verdict: analysis.fto_verdict,
      key_findings: analysis.key_findings,
      white_spaces: analysis.white_spaces,
      follow_ups: analysis.follow_ups,
      requires_key_for_chat: true
    });
  }

  try {
    let replyText = '';

    // Preparar contexto sintetizado para inyectar al LLM (RAG in-memory)
    const contextItems = patents.length > 0 ? patents.slice(0, 8).map((p, i) => 
      `[${i+1}] ${p.publication_number || 'N/A'}: "${p.title}" | Titular: ${p.assignee || 'N/A'} | Fecha: ${p.publication_date || 'N/A'} | Estado: ${p.legal_status || 'N/A'} | Citas: ${p.forwardCitationCount || 0} | CPC: ${(p.classifications_cpc || []).join(', ')} | Resumen: ${(p.snippet || p.one_sentence_summary || '').slice(0, 280)}`
    ).join('\n') : literature.slice(0, 8).map((w, i) =>
      `[${i+1}] "${w.title}" (${w.publication_year || 'N/A'}) | Autores: ${w.primary_author || 'N/A'} | Revista: ${w.journal || 'N/A'} | Citas: ${w.cited_by_count || 0} | Acceso: ${w.is_oa ? 'Abierto' : 'Suscripción'} | Resumen: ${(w.snippet || '').slice(0, 280)}`
    ).join('\n');

    const wsName = req.body.workspaceName || 'Vigilancia Tecnológica';
    const isDocSearch = (patents && patents.length > 0) || (literature && literature.length > 0);

    let activePatentContext = '';
    if (activePatent) {
      activePatentContext = `\n\nDOCUMENTO EN INSPECCIÓN ACTIVA POR EL USUARIO:
- Número de Publicación: ${activePatent.publication_number || 'N/A'}
- Título: ${activePatent.title || 'N/A'}
- Titular / Solicitante: ${activePatent.assignee || 'N/A'}
- Fecha de Publicación: ${activePatent.publication_date || 'N/A'}
- Estado Legal / FTO: ${activePatent.legal_status || 'N/A'}
- Clasificaciones CPC: ${(activePatent.classifications_cpc || []).join(', ')}
- Resumen Técnico: ${activePatent.snippet || activePatent.one_sentence_summary || 'N/A'}`;
    }

    const systemPrompt = `Eres el Agente Pericial de Vigilancia Tecnológica, Inteligencia Competitiva y Patentes para la plataforma de investigación de la Universidad del Rosario, Céntrika y Awake.
Entorno / Proyecto activo: "${wsName}".
Tu función es brindar asesoría técnica, legal y pericial en patentes oficiales globales (EPO, USPTO, WIPO, Google Patents), literatura científica (OpenAlex) y estrategia de propiedad intelectual (Normas PCT).

ORIGEN DEL ROL Y SIGNIFICADO DE "AGENTE PERICIAL":
• ¿Por qué "Agente Pericial"?: En propiedad intelectual, un perito es un experto técnico-legal que no se limita a recuperar listas de documentos, sino que emite un DICTAMEN TÉCNICO FORMAL para la toma de decisiones estratégicas. Evalúa Libertad de Operación (FTO), riesgo de infracción, validez de antecedentes y redacta recomendaciones de diseño alternativo (Design Around). Si el usuario o evaluador pregunta por qué te llamas agente pericial, explica esto con claridad y pedagogía.
• Job to be Done (JTBD) de la plataforma: "Gestionar documentación técnica disponible a partir de fuentes documentales heterogéneas, transformándola en patrones de búsqueda estructurados sobre bases de patentes y repositorios académicos abiertos, para dar soporte a informes terminados sobre el estado de la tecnología y decisiones estratégicas".

DOMINIO TÉCNICO Y GLOSARIO DEL PROYECTO:
Posees pleno conocimiento y aplicas los conceptos del Glosario Técnico de la plataforma:
• E-T-S (Entidad - Tecnología - Solución): Metodología de búsqueda que descompone un problema técnico en sinónimos de la entidad física, la tecnología aplicada y la solución funcional, combinados con operadores booleanos (AND, OR, NOT) y códigos CPC para eliminar ruido.
• Filtro Cero (Literatura Abierta): Exploración previa en literatura científica (OpenAlex) para entender la frontera del conocimiento científico antes de auditar patentes comerciales.
• FTO (Freedom to Operate / Libertad de Operación): Análisis para determinar si una solución técnica puede explotarse comercialmente sin riesgo de infringir patentes vigentes de terceros.
• Dominio Público: Invenciones cuyas patentes expiraron (20 años), fueron abandonadas o caducaron; son de libre explotación sin regalías.
• Design Around (Diseño Alrededor): Modificación ingenieril de una arquitectura técnica para resolver el mismo problema sin caer en las reivindicaciones de patentes activas.
• Normas PCT (Reglas 11 a 13): Requisitos formales de solicitudes internacionales (Regla 11: formalidades de dibujos/texto; Regla 12: idioma; Regla 13: unidad de invención e interdependencia de reivindicaciones).
• Principio de Territorialidad: Las patentes solo confieren exclusividad en los países donde fueron concedidas y mantenidas vigentes.
• Clasificación CPC (Cooperative Patent Classification): Sistema jerárquico conjunto EPO-USPTO que categoriza soluciones técnicas específicas.

CONOCIMIENTO EXHAUSTIVO DE LAS FUENTES Y CONECTORES DEL SISTEMA:
Conoces en profundidad la naturaleza, alcance y estado de cada fuente documental integrada en la plataforma:
1. Google Patents (Red Mundial):
   • Cobertura: Cobertura global masiva indexando USPTO, EPO, WIPO (PCT), CNIPA (China), JPO (Japón), KIPO (Corea) y decenas de oficinas nacionales.
   • Arquitectura: Motor Híbrido Directo + Respaldo vía SerpApi. Permite extraer números de publicación oficiales, resúmenes, titulares, inventores, clasificaciones CPC y figuras técnicas asociadas.
2. Europe PMC (EPO / WIPO):
   • Cobertura: API Abierta del Instituto Europeo de Bioinformática (EMBL-EBI) con enlace a literatura biomédica, biotecnológica y patentes europeas/mundiales integradas.
   • Características: 100% gratuita y abierta, sin cuota mensual restrictiva.
3. PatentBrief:
   • Cobertura: Base de datos tecnológica enfocada en lenguaje amigable y patentes clave de vanguardia.
   • Características: Provee resúmenes ejecutivos simplificados que facilitan la comprensión para no abogados y equipos multidisciplinarios.
4. OpenAlex (Literatura Científica y Filtro Cero):
   • Cobertura: Catálogo científico abierto con más de 250 millones de obras académicas globales, artículos revisados por pares, conferencias y preprints.
   • Utilidad: Permite auditar el estado del arte científico antes de evaluar exclusividad de patentes, identificando si existen publicaciones de Acceso Abierto (Open Access) con PDF completo descargable.
5. EPO OPS Oficial (European Patent Office - Open Patent Services):
   • Cobertura: Servicio web oficial de la Oficina Europea de Patentes para consulta directa de expedientes, estatus legal, familias de patentes (INPADOC) y publicaciones europeas.
   • Conector: Configurable con credenciales OAuth (Consumer Key y Consumer Secret) en el Gestor de Conectores.
6. The Lens (Lens.org):
   • Cobertura: Plataforma abierta líder en mapeo de secuencias biológicas y patentes vinculadas con literatura científica.
   • Conector: Integrable mediante Token de API Académico en los ajustes del sistema.

DIRECTIVAS ESTRICTAS DE ESTILO Y RIGOR:
1. TONO PROFESIONAL Y LIMPIO (SIN EMOJIS):
   • Está terminantemente prohibido el uso de emojis en tus respuestas. Utiliza caracteres tipográficos limpios, elegantes y formales (viñetas como "•", guiones "—", numerales "1.", encabezados markdown "### ").
   • Formatea las respuestas en Markdown limpio y estructurado. Si requieres formular expresiones matemáticas, físicas o químicas, utiliza notación LaTeX estándar (inline con $...$ y display con $$...$$).
2. ANÁLISIS DE PATENTE ACTIVA / EN INSPECCIÓN:
   • Si el usuario te pide "explícame esta patente", "analiza esta patente" o hace preguntas relativas al documento abierto:
     - Si existe un documento en inspección activa (ver sección de abajo), analízalo en detalle: qué reivindica, cuál es su novedad técnica, titulares, inventores y su situación de Libertad de Operación (FTO).
     - Si NO hay ninguna patente en inspección activa (no se especificó ninguna), NO inventes ni asumas una patente arbitraria. Pregunta cortésmente cuál patente desea analizar e invítalo a pulsar el botón de consulta pericial en cualquier tarjeta o a suministrar el número de publicación.
3. AUDITORÍA PERICIAL DE BÚSQUEDAS:
   • Si se proporcionan documentos recuperados para una búsqueda técnica:
     - Libertad de Operación (FTO): Evalúa con precisión qué antecedentes están en dominio público (expirados/inactivos) y cuáles tienen derechos vigentes.
     - Análisis de Antecedentes Cercanos: Cita documentos específicos por su número (ej. US11304827B2) o autores, contrastando sus elementos técnicos.
     - Océanos Azules y Nichos: Identifica qué características técnicas no están protegidas en las reivindicaciones o qué jurisdicciones no tienen extensión concedida.
     - Preguntas de Autocrítica: Formula 2 o 3 preguntas técnicas de autocrítica para robustecer la memoria técnica.
4. ACCIONES INTERACTIVAS EN PANTALLA:
   • Si recomiendas una búsqueda de patentes: [ACTION:SEARCH query="término"]
   • Si recomiendas refinar por una clase CPC: [ACTION:FILTER_CPC code="código CPC"]
   • Si recomiendas consultar literatura científica: [ACTION:MODE mode="literature"]
5. GESTIÓN CONVERSACIONAL DE APIs:
   • Si el usuario desea conectar una API (The Lens, SerpApi, EPO OPS, modelos LLM), guíalo paso a paso pidiéndole los datos de autenticación necesarios de forma clara.`;

    const fullPrompt = isDocSearch
      ? `${systemPrompt}${activePatentContext}\n\nDocumentos recuperados para la consulta "${query}":\n${contextItems}\n\nPregunta / Instrucción del usuario:\n${userMessage || 'Realiza un dictamen pericial ejecutivo de los resultados encontrados, evaluando riesgo de infracción FTO, análisis de antecedentes y oportunidades tecnológicas.'}`
      : `${systemPrompt}${activePatentContext}\n\nPregunta o mensaje del usuario:\n${userMessage || 'Preséntate como Agente Pericial de Vigilancia Tecnológica y explica cómo puedes asistir al proyecto.'}`;

    // 1. Google Gemini API
    if (effectiveProvider === 'gemini') {
      const normalizedModel = (!model || ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash'].includes(model))
        ? 'gemini-3.5-flash-lite'
        : model;
      const candidateModels = [...new Set([normalizedModel, 'gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-flash-lite-latest'])].filter(Boolean);
      let lastError = null;

      for (const m of candidateModels) {
        try {
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${effectiveApiKey}`;
          const gResp = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: fullPrompt }] }],
              generationConfig: { temperature: 0.2, maxOutputTokens: 3000 }
            })
          });
          const gData = await gResp.json();
          if (gData.error) {
            lastError = gData.error.message || `Error en modelo ${m}`;
            continue;
          }
          replyText = gData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (replyText) break;
        } catch (e) {
          lastError = e.message;
        }
      }

      if (!replyText) throw new Error(lastError || 'No se pudo obtener respuesta de Gemini.');

    // 2. Proveedores con protocolo OpenAI-Compatible (Groq, DeepSeek, OpenAI, Perplexity, xAI Grok)
    } else if (['groq', 'openai', 'deepseek', 'perplexity', 'grok'].includes(effectiveProvider)) {
      let endpoint = 'https://api.openai.com/v1/chat/completions';
      let defaultModel = 'gpt-4o-mini';

      if (effectiveProvider === 'groq') {
        endpoint = 'https://api.groq.com/openai/v1/chat/completions';
        defaultModel = 'llama-3.3-70b-versatile';
      } else if (effectiveProvider === 'deepseek') {
        endpoint = 'https://api.deepseek.com/chat/completions';
        defaultModel = 'deepseek-chat';
      } else if (effectiveProvider === 'perplexity') {
        endpoint = 'https://api.perplexity.ai/chat/completions';
        defaultModel = 'sonar';
      } else if (effectiveProvider === 'grok') {
        endpoint = 'https://api.x.ai/v1/chat/completions';
        defaultModel = 'grok-beta';
      }

      const oResp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${effectiveApiKey}`
        },
        body: JSON.stringify({
          model: model || defaultModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Documentos analizados:\n${contextItems}\n\nInstrucción: ${userMessage || 'Genera el dictamen pericial de FTO y oportunidades.'}` }
          ],
          temperature: 0.3
        })
      });
      const oData = await oResp.json();
      if (oData.error) throw new Error(oData.error.message || `Error en ${effectiveProvider}`);
      replyText = oData.choices?.[0]?.message?.content || 'No se obtuvo respuesta del modelo.';

    // 3. Anthropic Claude
    } else if (effectiveProvider === 'claude') {
      const cResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': effectiveApiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: model || 'claude-3-5-sonnet-20241022',
          max_tokens: 1200,
          system: systemPrompt,
          messages: [{ role: 'user', content: `Documentos analizados:\n${contextItems}\n\nInstrucción: ${userMessage || 'Genera dictamen pericial.'}` }]
        })
      });
      const cData = await cResp.json();
      if (cData.error) throw new Error(cData.error.message || 'Error en Claude');
      replyText = cData.content?.[0]?.text || 'No se obtuvo respuesta de Claude.';
    } else {
      throw new Error(`Proveedor "${effectiveProvider}" no reconocido.`);
    }

    return res.status(200).json({
      provider,
      model: model || 'default',
      reply: replyText
    });

  } catch (err) {
    console.error("Error en proveedor de IA:", err.message);
    const fallback = generateHeuristicPeritoReport(query, patents, literature, userMessage);
    return res.status(200).json({
      provider: 'heuristic_fallback',
      model: 'Perito Heurístico (Reserva)',
      reply: `*(Nota: Motor de reserva local activado - ${err.message})*\n\n${fallback.reply}`,
      fto_verdict: fallback.fto_verdict,
      key_findings: fallback.key_findings,
      white_spaces: fallback.white_spaces,
      follow_ups: fallback.follow_ups
    });
  }
}

function generateHeuristicPeritoReport(query, patents, literature, userMsg) {
  const isLit = literature && literature.length > 0;
  const count = isLit ? literature.length : (patents ? patents.length : 0);

  if (count === 0) {
    return {
      fto_verdict: 'Asistente de Inteligencia de Patentes & Literatura',
      reply: `### Asistente de Vigilancia Tecnológica y Patentes

Estoy preparado para asistirte en:
• **Libertad de Operación (FTO)**: Analizar si una solución tecnológica está libre de infracción o en dominio público.
• **Estado del Arte Multifuente**: Recuperar patentes oficiales (EPO, USPTO, WIPO, Google Patents) y artículos académicos de acceso abierto (OpenAlex).
• **Alineación Normativa PCT (Reglas 11 a 13)**: Evaluación de novedad, actividad inventiva y redacción técnica de reivindicaciones.
• **Gestión Conversacional de APIs**: Guiarte para conectar y validar nuevas fuentes como The Lens, EPO OPS, SerpApi, o modelos LLM adicionales.

Ingresa términos técnicos en la barra de consulta o haz una pregunta directa.`,
      key_findings: [
        'Conexión activa con Google Patents, Europe PMC, PatentBrief y OpenAlex',
        'Soporte multi-modelo de IA (Gemini, Groq, DeepSeek, OpenAI, Claude)'
      ],
      white_spaces: 'Indica el campo tecnológico de tu proyecto para mapear nichos y vacíos.',
      follow_ups: [
        '¿Cómo evaluar la Libertad de Operación (FTO)?',
        '¿Qué requisitos exige la Regla 11 del PCT?',
        '¿Cómo conectar una nueva API en el sistema?'
      ]
    };
  }

  if (isLit) {
    const oaCount = literature.filter(w => w.is_oa).length;
    const topJournals = [...new Set(literature.map(w => w.journal).filter(Boolean))].slice(0, 3);
    return {
      fto_verdict: 'Estado del Arte en Literatura Científica',
      reply: `### Análisis de Literatura Científica (${count} artículos analizados)

• **Acceso Abierto**: **${oaCount} de ${count} publicaciones** (${Math.round((oaCount/count)*100)}%) están en Acceso Abierto (Open Access) con texto completo y PDF descargable libremente.
• **Revistas y Núcleos de Publicación**: ${topJournals.join(', ') || 'Revistas indexadas del área'}.
• **Tendencias Identificadas**: Artículos recientes con metodologías experimentales y revisiones de literatura replicables.

*Para activar razonamiento continuo con modelos avanzados, configura tu API Key en Ajustes.*`,
      key_findings: ['Alta disponibilidad de artículos en acceso abierto', 'Autores y revistas indexadas identificadas'],
      white_spaces: 'Revisa las conclusiones de los artículos para detectar limitaciones experimentales u oportunidades de transferencia tecnológica.',
      follow_ups: [
        '¿Cuáles publicaciones tienen PDF completo de acceso abierto?',
        '¿Qué autores lideran este campo de investigación?',
        '¿Cómo podemos citar estos antecedentes en la memoria técnica?'
      ]
    };
  }

  // Patentes
  const activeCount = patents.filter(p => {
    const s = (p.legal_status || '').toUpperCase();
    return !(s.includes('NOT_ACTIVE') || s.includes('EXPIRED') || s.includes('ABANDONED') || s.includes('DISCONTINUED'));
  }).length;
  const publicDomainCount = count - activeCount;
  const topAssignees = [...new Set(patents.map(p => p.assignee).filter(a => a && !a.toLowerCase().includes('no especificado')))].slice(0, 3);

  return {
    fto_verdict: `${publicDomainCount} de ${count} invenciones en Dominio Público (Libre Operación)`,
    reply: `### Dictamen de Libertad de Operación (FTO)

• **Dominio Público (Libre Operación)**: **${publicDomainCount} invenciones (${count > 0 ? Math.round((publicDomainCount/count)*100) : 0}%)** se encuentran en dominio público: sus derechos de exclusividad expiraron o caducaron, permitiendo que sus mecanismos sean aprovechados sin pago de regalías.
• **Patentes Vigentes**: **${activeCount} invenciones** mantienen protección activa (concedidas o en trámite), principalmente de titulares como: ${topAssignees.join(', ') || 'Corporaciones del sector'}.

### Recomendación Estratégica
Se sugiere utilizar como base técnica los principios de las invenciones en dominio público y formular reivindicaciones novedosas enfocadas en características diferenciadoras no protegidas por los antecedentes vigentes.

*Conecta tu API Key en Ajustes para profundizar en cualquier patente o dialogar libremente.*`,
    key_findings: [
      `${publicDomainCount} patentes libres de regalías`,
      `Titulares principales: ${topAssignees.join(', ') || 'Titulares identificados'}`
    ],
    white_spaces: 'Analizar cobertura territorial para determinar libre explotación en países sin extensión concedida.',
    follow_ups: [
      '¿Cuáles patentes están en dominio público y se pueden fabricar libremente?',
      '¿Qué patentes mantienen protección activa?',
      '¿Cómo diseño un mecanismo alternativo (Design Around)?'
    ]
  };
}
