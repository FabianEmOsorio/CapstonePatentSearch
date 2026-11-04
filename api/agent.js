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

    const systemPrompt = `Eres el Agente Pericial de Vigilancia Tecnológica, Inteligencia Competitiva y Patentes para la plataforma de investigación académica y empresarial de la Universidad del Rosario, Céntrika y Awake.
Entorno / Proyecto activo: "${wsName}".
Tu función es brindar asesoría técnica, legal y pericial en patentes oficiales globales (EPO, USPTO, WIPO, Google Patents), literatura científica (OpenAlex) y estrategia de propiedad intelectual (Normas PCT).

CAPACIDADES Y REGLAS DE RESPUESTA:
1. DIÁLOGO Y PEDAGOGÍA:
   • Si el usuario te hace una pregunta general, conceptual o de diálogo (ej. qué es FTO, cómo redactar reivindicaciones conforme al Reglamento del Tratado PCT Reglas 11 a 13, diferencias entre novedad y actividad inventiva, o cómo conectar APIs), responde de forma didáctica, rigurosa y adaptada al proyecto activo, sin asumir de manera forzada un tema que el usuario no preguntó.
2. AUDITORÍA PERICIAL DE DOCUMENTOS (Si se adjuntan patentes o literatura recuperada):
   • ⚖️ Libertad de Operación (FTO): Distingue con precisión qué tecnologías están en dominio público (expiradas/inactivas) y cuáles están vigentes.
   • 🔬 Análisis Técnico y Antecedentes Cercanos: Cita documentos específicos por su número (ej. US11304827B2) o autores, comparando elementos reivindicados.
   • 🌐 Océanos Azules y Nichos de Mercado: Detecta qué aspectos no están protegidos o en qué países no hay cobertura.
   • ❓ Preguntas de Autocrítica ("¿Qué fortalecer? ¿Qué corregir?"): Formula 2 o 3 preguntas reflexivas para que el equipo diferencie técnicamente su desarrollo.
3. INTERACCIÓN Y ACCIÓN SOBRE LA PANTALLA:
   • Si recomiendas o el usuario te pide ejecutar una búsqueda, incluye el comando: [ACTION:SEARCH query="término"]
   • Si recomiendas una clase técnica CPC: [ACTION:FILTER_CPC code="código CPC"]
   • Si recomiendas pasar a literatura científica: [ACTION:MODE mode="literature"]
4. GESTIÓN CONVERSACIONAL DE APIs:
   • Si el usuario te pide añadir o conectar una API (ej. The Lens, SerpApi, EPO OPS, Groq, DeepSeek, Claude), guíalo paso a paso solicitando los datos necesarios y explicando cómo el sistema la integrará.
5. Formato: Markdown estructurado, limpio, con viñetas y emojis técnicos profesionales.`;

    const fullPrompt = isDocSearch
      ? `${systemPrompt}\n\nDocumentos recuperados para la consulta "${query}":\n${contextItems}\n\nPregunta / Instrucción del usuario:\n${userMessage || 'Realiza un dictamen pericial ejecutivo de los resultados encontrados, evaluando riesgo de infracción FTO, análisis de antecedentes y oportunidades tecnológicas.'}`
      : `${systemPrompt}\n\nPregunta o mensaje del usuario:\n${userMessage || 'Preséntate como Agente Pericial de Vigilancia Tecnológica y explica brevemente cómo puedes asistir al proyecto.'}`;

    // 1. Google Gemini API
    if (effectiveProvider === 'gemini') {
      const candidateModels = [model, 'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-flash-latest'].filter(Boolean);
      let lastError = null;

      for (const m of candidateModels) {
        try {
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${effectiveApiKey}`;
          const gResp = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: fullPrompt }] }],
              generationConfig: { temperature: 0.3, maxOutputTokens: 1200 }
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
      reply: `⚠️ *(Nota: Motor de reserva local activado - ${err.message})*\n\n${fallback.reply}`,
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
      reply: `👋 **¡Hola! Soy tu Agente Autónomo de Vigilancia Tecnológica, Inteligencia de Patentes & Literatura Científica.**

Estoy preparado para asistirte en:
• ⚖️ **Libertad de Operación (FTO)**: Analizar si una solución tecnológica está libre de infracción o en dominio público.
• 🔬 **Estado del Arte Multifuente**: Recuperar patentes oficiales (EPO, USPTO, WIPO, Google Patents) y artículos académicos de acceso abierto (OpenAlex).
• 📜 **Alineación Normativa PCT (Reglas 11 a 13)**: Evaluación de novedad, actividad inventiva y redacción técnica de reivindicaciones.
• 🔌 **Gestión Conversacional de APIs**: Guiarte para conectar y validar nuevas fuentes como The Lens, EPO OPS, SerpApi, o modelos LLM adicionales.

Ingresa términos técnicos en la barra superior o hazme una consulta pericial directa.`,
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
      reply: `He analizado **${count} artículos académicos** en OpenAlex para *"**${query || 'la consulta'}**"*.

📚 **Hallazgos del Estado del Arte:**
• **${oaCount} de ${count} publicaciones** (${Math.round((oaCount/count)*100)}%) están en **Acceso Abierto (Open Access)** con texto completo y PDF descargable libremente.
• Los núcleos de investigación dominantes están concentrados en: *${topJournals.join(', ') || 'Revistas indexadas del área'}*.
• Se observan desarrollos recientes con alta citación académica y metodologías experimentales replicables.

💡 *Para activar el razonamiento pericial continuo con modelos avanzados (Gemini, Groq, Claude, DeepSeek), puedes configurar tu API Key en el menú de ajustes ⚙️.*`,
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
    reply: `He auditado pericialmente las **${count} patentes oficiales** recuperadas para *"**${query || 'la consulta'}**"*.

⚖️ **Dictamen de Libertad de Operación (FTO):**
• **${publicDomainCount} invenciones (${count > 0 ? Math.round((publicDomainCount/count)*100) : 0}%)** se encuentran en **Dominio Público (FTO Libre)**: sus derechos de exclusividad expiraron o no están vigentes, permitiendo que sus mecanismos sean fabricados o adaptados sin pago de regalías.
• **${activeCount} invenciones** mantienen protección activa (concedidas o en trámite), principalmente de titulares como: *${topAssignees.join(', ') || 'Corporaciones del sector'}*.

🛡️ **Estrategia Recomendada:**
Se sugiere tomar como base los principios mecánicos de las patentes en dominio público y formular reivindicaciones novedosas enfocadas en características diferenciadoras no reivindicadas en los antecedentes.

💡 *Conecta tu API Key de Gemini o Groq en el botón ⚙️ superior para profundizar en cualquier patente o chatear libremente.*`,
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
