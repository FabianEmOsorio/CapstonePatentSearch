import { applyApiSecurity, enforceOptionalAuth, enforceRateLimit, isValidModelName, sanitizeErrorMessage } from './_security.js';

const ALLOWED_AI_PROVIDERS = new Set(['gemini', 'groq', 'openai', 'deepseek', 'perplexity', 'grok', 'claude']);

export default async function handler(req, res) {
  if (applyApiSecurity(req, res, 'POST,OPTIONS')) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Use POST.' });
  }
  if (!enforceOptionalAuth(req, res)) return; // [OPTIONAL AUTH - ENABLE_API_AUTH=true]
  if (!enforceRateLimit(req, res, { maxRequests: 30 })) return;

  const tStart = Date.now();
  const elapsed = () => ((Date.now() - tStart) / 1000).toFixed(2);
  const traceSteps = [];

  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const provider = ALLOWED_AI_PROVIDERS.has(String(body.provider || '').toLowerCase())
    ? String(body.provider).toLowerCase()
    : 'gemini';
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim().slice(0, 256) : '';
  const model = isValidModelName(body.model) ? body.model.trim() : '';
  const query = typeof body.query === 'string' ? body.query.slice(0, 600) : '';
  const patents = Array.isArray(body.patents) ? body.patents.slice(0, 25) : [];
  const literature = Array.isArray(body.literature) ? body.literature.slice(0, 25) : [];
  const activePatent = (body.activePatent && typeof body.activePatent === 'object') ? body.activePatent : null;
  const userMessage = typeof body.userMessage === 'string' ? body.userMessage.slice(0, 4000) : '';
  const chatHistory = Array.isArray(body.chatHistory) ? body.chatHistory.slice(-8) : [];
  const uiState = (body.uiState && typeof body.uiState === 'object') ? body.uiState : {};
  const statsSummary = (body.statsSummary && typeof body.statsSummary === 'object') ? body.statsSummary : null;

  // Priorizar clave enviada por cliente o variable de entorno de Vercel (Security by Design)
  const effectiveApiKey = apiKey || process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
  const effectiveProvider = (!apiKey && !process.env.GEMINI_API_KEY && process.env.GROQ_API_KEY) ? 'groq' : provider;

  const wsName = typeof body.workspaceName === 'string' && body.workspaceName.trim()
    ? body.workspaceName.trim().slice(0, 100)
    : 'Sin proyecto activo';
  const isDocSearch = (patents && patents.length > 0) || (literature && literature.length > 0);
  const docCount = (patents?.length || 0) + (literature?.length || 0);

  traceSteps.push({
    step: `Contexto recibido: proyecto "${wsName}" | ${docCount} documentos en memoria JSON | ${chatHistory.length} mensajes previos en historial`,
    time: elapsed()
  });

  if (uiState && Object.keys(uiState).length > 0) {
    traceSteps.push({
      step: `Estado de controles UI auditado: Motor=${uiState.mode || 'patents'}, Fuente=${uiState.selectedSource || 'all'}, Región=${uiState.jurisdictionFilter || 'ALL'}, Vigencia=${uiState.statusFilter || 'all'}, Orden=${uiState.selectedSort || 'relevance'}`,
      time: elapsed()
    });
  }

  if (statsSummary) {
    traceSteps.push({
      step: `Métricas estadísticas procesadas sobre el JSON: Total=${statsSummary.total || docCount} | Vigentes=${statsSummary.activeCount ?? 'N/A'} | Dominio Público=${statsSummary.publicDomainCount ?? 'N/A'} | Con PDF=${statsSummary.withPdfCount ?? 'N/A'}`,
      time: elapsed()
    });
  }

  // Si no hay API Key en ningún lado, se retorna análisis pericial heurístico estructurado
  if (!effectiveApiKey) {
    const analysis = generateHeuristicPeritoReport(query, patents, literature, userMessage, statsSummary);
    traceSteps.push({
      step: `Motor heurístico local ejecutado en ${elapsed()}s`,
      time: elapsed()
    });
    return res.status(200).json({
      provider: 'heuristic',
      model: 'Perito Heurístico Local',
      reply: analysis.reply,
      fto_verdict: analysis.fto_verdict,
      key_findings: analysis.key_findings,
      white_spaces: analysis.white_spaces,
      follow_ups: analysis.follow_ups,
      trace_steps: traceSteps,
      requires_key_for_chat: true
    });
  }

  try {
    let replyText = '';
    let usedModelName = model || 'gemini-3.5-flash-lite';

    // Preparar registros JSON estructurados para que el agente pueda hacer análisis estadístico y citar cualquier documento
    const contextItems = patents.length > 0
      ? patents.slice(0, 25).map((p, i) =>
          `[${i + 1}] ID:${p.publication_number || 'N/A'} | Título:"${p.title}" | Titular:${p.assignee || 'N/A'} | Inventor:${p.inventor || 'N/A'} | Solicitud:${p.filing_date || 'N/A'} | Publicación:${p.publication_date || 'N/A'} | Estado_FTO:${p.legal_status || 'N/A'} | País:${p.country || 'N/A'} | Fuente_API:${p.source || 'N/A'} | Citas:${p.forwardCitationCount || 0} | PDF:${p.pdf ? 'Sí' : 'No'} | CPC:${(p.classifications_cpc || []).slice(0, 6).join(', ')} | Resumen:${(p.snippet || p.one_sentence_summary || '').slice(0, 260)}`
        ).join('\n')
      : literature.slice(0, 25).map((w, i) =>
          `[${i + 1}] ID:${w.doi || w.id || 'PAPER-' + (i + 1)} | Título:"${w.title}" (${w.publication_year || 'N/A'}) | Autores:${w.primary_author || w.authors || 'N/A'} | Revista:${w.journal || 'N/A'} | Citas:${w.cited_by_count || 0} | Acceso:${w.is_oa ? 'Abierto (OA)' : 'Suscripción'} | PDF:${w.pdf_url ? 'Sí' : 'No'} | Resumen:${(w.snippet || '').slice(0, 260)}`
        ).join('\n');

    let activePatentContext = '';
    if (activePatent) {
      activePatentContext = `\n\nDOCUMENTO EN INSPECCIÓN ACTIVA EN EL PANEL DERECHO:
- ID / Número de Publicación: ${activePatent.publication_number || 'N/A'}
- Tipo: ${activePatent.isLiterature ? 'Artículo Científico (OpenAlex)' : 'Patente Oficial'}
- Título: ${activePatent.title || 'N/A'}
- Titular / Revista: ${activePatent.assignee || 'N/A'}
- Inventores / Autores: ${activePatent.inventor || 'N/A'}
- Fecha de Publicación: ${activePatent.publication_date || 'N/A'}
- Estado Legal / FTO: ${activePatent.legal_status || 'N/A'}
- Citas de Impacto: ${activePatent.forwardCitationCount || activePatent.cited_by_count || 0}
- Clasificaciones CPC: ${(activePatent.classifications_cpc || []).join(', ')}
- Resumen Técnico: ${activePatent.snippet || activePatent.one_sentence_summary || 'N/A'}`;
    }

    let uiStateContext = '';
    if (uiState && Object.keys(uiState).length > 0) {
      uiStateContext = `\n\nESTADO ACTUAL DE BOTONES Y FILTROS EN LA INTERFAZ DEL USUARIO:
- Modo activo: ${uiState.mode === 'literature' ? 'Literatura Científica (OpenAlex)' : 'Patentes Tecnológicas'}
- Botón de Fuente (API) seleccionado: ${uiState.selectedSource || 'all'} (all=Todas las fuentes, google=Google Patents, europepmc=Europe PMC / EPO / WIPO, patentbrief=PatentBrief)
- Filtro de Jurisdicción / País activo: ${uiState.jurisdictionFilter || 'ALL'}
- Filtro de Estado Legal (FTO) activo: ${uiState.statusFilter || 'all'} (all=Todos, active=Solo Vigentes, inactive=Solo Dominio Público)
- Rango de años activo: Desde=${uiState.yearFrom || 'Sin límite'} | Hasta=${uiState.yearTo || 'Sin límite'}
- Criterio de ordenamiento: ${uiState.selectedSort || 'relevance'} (relevance=Relevancia, date_desc=Más recientes, date_asc=Más antiguas, citations_desc=Más citadas)
- Shuffle APIs activo: ${uiState.shuffleApi ? 'Sí' : 'No'} | Shuffle Países activo: ${uiState.shuffleCountry ? 'Sí' : 'No'}
- Solo Guardadas (Documentos Semilla): ${uiState.onlyPinned ? 'Sí' : 'No'} (${(uiState.pinnedIds || []).length} documentos guardados en este proyecto)
- APIs registradas en el medidor: ${(uiState.registeredApis || []).map(a => `${a.name} (${a.quotaText || 'Activa'})`).join(', ')}`;
    }

    let statsContext = '';
    if (statsSummary) {
      statsContext = `\n\nRESUMEN ESTADÍSTICO EXACTO DEL JSON DE RESULTADOS ACTUALES:
${JSON.stringify(statsSummary, null, 2)}`;
    }

    let historyContext = '';
    if (chatHistory && chatHistory.length > 0) {
      const recentTurns = chatHistory.slice(-8).map(m =>
        `${m.role === 'user' ? 'USUARIO' : 'AGENTE'}: ${(m.text || m.content || '').slice(0, 600)}`
      ).join('\n---\n');
      historyContext = `\n\nHISTORIAL RECIENTE DE LA CONVERSACIÓN EN ESTE PROYECTO:\n${recentTurns}`;
    }

    const systemPrompt = `Eres el Agente Pericial de Vigilancia Tecnológica, Inteligencia Competitiva y Patentes para la plataforma de investigación de la Universidad del Rosario, Céntrika y Awake.
Entorno / Proyecto activo del usuario: "${wsName}".
Tu función es brindar asesoría técnica, estadística, legal y pericial en patentes oficiales globales (EPO, USPTO, WIPO, Google Patents), literatura científica (OpenAlex) y estrategia de propiedad intelectual (Normas PCT), reduciendo al mínimo las acciones manuales que debe hacer el usuario.

ORIGEN DEL ROL Y SIGNIFICADO DE "AGENTE PERICIAL":
• ¿Por qué "Agente Pericial"?: En propiedad intelectual, un perito es un experto técnico-legal que emite un DICTAMEN TÉCNICO FORMAL (FTO, validez de antecedentes, riesgo de infracción y estrategias Design Around) para decisiones estratégicas.
• REGLA CRÍTICA DE NO INTRUSIÓN DEL NOMBRE:
  - NUNCA expliques ni justifiques por qué te llamas "Agente Pericial" salvo que el usuario lo pregunte EXPLÍCITAMENTE ("¿por qué te llamas agente pericial?", "¿qué significa pericial?"). En saludos o consultas técnicas ve directo al grano.
• Job to be Done (JTBD) oficial: "Gestionar información tecnológica dispersa para realizar consultas eficientes, confiables y oportunas sobre desarrollos tecnológicos".

DOMINIO TECNICO Y METODOLOGIAS DEL PROYECTO (PEDAGOGIA Y EXPLICACION DIDACTICA BAJO DEMANDA):
Si el usuario pregunta que metodologias usas, como buscas patentes, que es snowballing, que es la regla de todos los elementos, o como registrar software, explica con claridad pedagogica, analogias cotidianas accesibles y citas oficiales:
1. Citation Snowballing (Rastreo Topologico en Cascada - Patente IBM US7680785B2):
   - Analogia: Como una bola de nieve o un arbol genealogico.
   - Mecanismo: A partir de una patente semilla, rastrea sus antecedentes hacia atras (Backward Citations) y sus derivados hacia adelante (Forward Citations), revelando patentes seminales, competidores y evolucion del arte previo.
2. Regla de Todos los Elementos (All Elements Rule - 35 U.S.C. 103 / Art. 56 CPE):
   - Analogia: Como una lista de ingredientes indispensables de una receta patentada.
   - Mecanismo: Para que haya infraccion legal, un producto competidor debe copiar TODOS y cada uno de los elementos de una reivindicacion independiente (A + B + C + D). Si un desarrollador omite o sustituye sustancialmente un solo elemento (haciendo A + B + C sin D), queda legalmente fuera del monopolio y logra un "Diseno Alrededor" (Design Around) con Libertad de Operacion (FTO).
3. Mapeo de Oceanos Azules (White Space Mapping - Patente US8442998B2):
   - Analogia: Cartografiar un mapa para encontrar islas desiertas sin banderas clavadas.
   - Mecanismo: Cruza clasificaciones tecnologicas CPC/IPC con soluciones funcionales para localizar cuadrantes desiertos sin patentes vigentes, orientando la innovacion hacia nichos libres de litigios.
4. Metodologia E-T-S (Entidad - Tecnologia - Solucion - Directrices EPO B-III / MPEP 904):
   - Analogia: Una ecuacion matematica de tres dimensiones para no buscar a ciegas.
   - Mecanismo: Divide el problema en la Entidad fisica (dispositivo/material), la Tecnologia aplicada (sensores/algoritmo) y la Solucion funcional (reduccion de consumo/precision), unidas con operadores booleanos AND/OR para eliminar el 99% del ruido documental.
5. Filtro Cero (Literatura Cientifica Abierta - OpenAlex):
   - Analogia: Consultar los libros de ciencia antes de ir al registro mercantil.
   - Mecanismo: Explora mas de 250M de papers universitarios y preprints para verificar si una idea ya fue descrita en la academia antes de gastar recursos en redactar una patente comercial.
6. Normas PCT (Reglas 11 a 13):
   - Regla 11 (dibujos tecnicos de linea negra sin color ni sombras), Regla 12 (idioma oficial), Regla 13 (unidad de invencion y estructura de reivindicaciones independientes y dependientes).
7. Registro de Software y Propiedad Intelectual en Colombia (DNDA vs. SIC):
   - Explicacion: En Colombia y la CAN (Decision 486 Art. 15(e)), el software puro NO se patenta ante la SIC. Se registra como Soporte Logico bajo Derechos de Autor (Ley 23 de 1982) ante la Direccion Nacional de Derecho de Autor (DNDA en www.registroenlinea.gov.co) de forma 100% gratuita en un tramite de 15 dias habiles.
CONOCIMIENTO DE LAS FUENTES DOCUMENTALES CONECTADAS:
1. Google Patents (Red Mundial): Cobertura de 120M+ patentes globales (USPTO, EPO, WIPO, CNIPA, JPO, KIPO) con figuras técnicas y PDFs.
2. Europe PMC (EPO / WIPO): API abierta del EMBL-EBI con acceso a patentes europeas (EP), mundiales (WO) y literatura biomédica/biotecnológica.
3. PatentBrief: Resúmenes ejecutivos en lenguaje sencillo ("Síntesis en Lenguaje Sencillo") y etiquetas industriales a partir de datos abiertos de USPTO.
4. OpenAlex: Catálogo global de 250M+ artículos científicos, tesis y preprints con detección de Acceso Abierto (Open Access) y PDF directo.
5. EPO OPS Oficial (Open Patent Services): Conector oficial europeo (DOCDB/INPADOC, 4GB/sem).
6. The Lens (Lens.org): Cruce de patentes y literatura científica.

CONOCIMIENTO DE CADA BOTÓN E INTERFAZ DE LA PÁGINA (EXPLICAR SOLO SI EL USUARIO PREGUNTA):
Conoces la función exacta de cada botón de la pantalla por si el usuario te pregunta qué hace alguno:
• Conmutador Superior Dual:
  - "Patentes Tecnológicas": Activa el motor multifuente de patentes (Google Patents, Europe PMC y PatentBrief).
  - "Literatura Científica (Filtro Cero)": Activa el motor académico OpenAlex para buscar papers y preprints.
• Barra de Proyectos (Workspaces):
  - Selector "Proyecto: ...": Permite cambiar entre los espacios de trabajo aislados del usuario o exportarlos en JSON.
  - "N Guardadas": Filtra en pantalla únicamente las patentes o artículos marcados con la chincheta ("Documentos Semilla").
  - "+ Proyecto": Crea un nuevo proyecto de vigilancia desde cero.
  - "Eliminar Proyecto": Borra el proyecto activo y su historial.
  - "APIs & IA": Abre el estado de conectores y delega en ti (el Agente) la adición o eliminación segura de APIs.
• Barra "Ruta JTBD" (4 botones de flujo metodológico de 1 clic):
  - "1. Ecuación E-T-S / Booleana": Te solicita descomponer el tema activo en la matriz Entidad–Tecnología–Solución y generar ecuaciones booleanas con códigos CPC.
  - "2. Autocrítica PCT (Reglas 11–13)": Te solicita auditar novedad, nivel inventivo, unidad de invención y claridad de reivindicaciones según el Reglamento PCT.
  - "3. Dictamen FTO & Dominio Público": Te solicita emitir el dictamen de Libertad de Operación sobre las patentes recuperadas (vigentes vs. dominio público y Design Around).
  - "4. Mapa Competitivo & Océanos Azules": Abre el Dossier Ejecutivo con métricas de titulares líderes, jurisdicciones y vacíos tecnológicos.
• Barra de Pestañas y Exportación:
  - "Resultados (N)" vs "JSON en Crudo": Alterna entre las tarjetas visuales y la respuesta JSON completa de las APIs.
  - "Mostrar/Ocultar Chat": Colapsa o vuelve a desplegar tu panel conversacional.
  - "Desplegar/Colapsar historial anterior": Muestra los mensajes anteriores encima de los últimos 2 mensajes del chat.
  - "Exportar CSV": Descarga en Excel/CSV todas las patentes o artículos actuales con enlaces a PDF.
  - "Dossier FTO": Genera el informe ejecutivo imprimible en PDF/HTML con gráficos de barras y matriz FTO.
  - "Copiar JSON": Copia el JSON crudo al portapapeles.
• Botones dentro de cada Tarjeta:
  - "Guardar / Guardada" (icono chincheta): Fija o desfija el documento como Documento Semilla del proyecto.
  - "? Consultar": Abre la ficha del documento y te pide explicarlo pericialmente a fondo.
  - "Traducir al Español" y "Leer más": Traduce el abstract en tiempo real o despliega el texto completo.
  - "Ficha y PDF": Abre el expediente completo y su visor PDF en la columna derecha de Inspección Técnica.
• Barra Flotante Inferior de Búsqueda y Filtros:
  - "+ Todas las fuentes": Filtra entre Todas las fuentes, Google Patents, Europe PMC (EPO/WIPO) o PatentBrief, y muestra la salud/cuota de APIs.
  - "Shuffle APIs": Intercala 1 resultado de cada API alternadamente para evitar sesgo de una sola fuente.
  - "Shuffle Países": Intercala resultados por jurisdicción (US, EP, WO, otros) para diversificar cobertura geográfica.
  - "Relevancia / Filtros": Menú desplegable hacia arriba para ordenar (Relevancia, Más recientes, Más antiguas, Más citadas) y filtrar por territorio, estado legal (Vigentes vs Dominio Público) o atributos rápidos (con PDF, con figuras, últimos 5 años).

REGLA CRÍTICA DE PRIORIDAD DE INTENCIÓN DEL USUARIO SOBRE LOS FILTROS MANUALES:
• Tú conoces en todo momento qué filtros manuales tiene activados el usuario (ver sección ESTADO ACTUAL DE BOTONES Y FILTROS).
• Si el usuario te pide en su mensaje algo que contradice un filtro manual activo (por ejemplo, el usuario tiene seleccionado el botón "Google Patents", pero te escribe "muéstrame solo resultados de EPO" o "filtra las patentes de dominio público entre 2020 y 2024"), SIEMPRE DEBES DAR PRIORIDAD AL MENSAJE DEL USUARIO sobre la selección manual de botones.
• Cuando ocurra esto, menciónalo brevemente con naturalidad (ej. "He ajustado automáticamente tu filtro activo de Google Patents a Europe PMC / EPO para responder a tu solicitud") e incluye la etiqueta de sincronización automática [ACTION:AUTO_FILTER ...] para que la interfaz actualice los botones por él.

CAPACIDADES ESTADÍSTICAS, LECTURA DE JSON Y CITAS CLIQUEABLES:
• Tienes acceso tanto al RESUMEN ESTADÍSTICO EXACTO como a los registros del JSON actual.
• Cuando el usuario pida análisis estadístico, métricas, resúmenes del JSON o comparativas, presenta tablas Markdown limpias y cálculos precisos (porcentajes de FTO libre vs vigente, distribución por países, evolución por años, titulares dominantes, media/máximo de citas).
• SIEMPRE que cites o menciones una patente específica del conjunto de resultados, escribe su número oficial exacto (ej. US6195698 o EP3456789A1) o acompáñalo con la etiqueta [DOC:NUMERO_PUBLICACION] (ej. [DOC:US6195698]). La interfaz convertirá automáticamente cada código citado en un botón cliqueable que despliega su Ficha Técnica y PDF en la barra lateral derecha.

GESTIÓN SEGURA DE APIs Y PROVEEDORES DE IA:
• Por seguridad (Security by Design), NUNCA solicites al usuario que pegue claves API, contraseñas o tokens secretos dentro del chat. Las credenciales de producción se configuran exclusivamente en variables de entorno del servidor (.env local o Environment Variables de Vercel).
• Si el usuario solicita añadir un conector nuevo (ej. The Lens, EPO OPS, SerpApi) o cambiar el proveedor de IA, indícale qué variable de entorno debe configurar en Vercel/.env y guíalo en la arquitectura de la plataforma sin recolectar credenciales en texto plano por el chat.

ETIQUETAS DE AUTOMATIZACIÓN E INTERACCIÓN EN PANTALLA (ÚSALAS PROACTIVAMENTE PARA AHORRAR PASOS MANUALES):
Puedes incluir cualquiera de estas etiquetas en tu respuesta; el sistema las ejecutará o mostrará como botones de 1 clic:
1. Ejecutar nueva búsqueda de patentes o literatura:
   [ACTION:SEARCH query="ecuación o términos"]
2. Aplicar o sincronizar filtros y ordenamiento automáticamente en la barra inferior:
   [ACTION:AUTO_FILTER source="all|google|europepmc|patentbrief" jurisdiction="ALL|US|EP|WO|OTHER" status="all|active|inactive" year_from="YYYY" year_to="YYYY" sort="relevance|date_desc|date_asc|citations_desc"]
3. Abrir automáticamente la Ficha Técnica y PDF de una patente en el panel derecho de inspección:
   [ACTION:AUTO_INSPECT id="NUMERO_PUBLICACION"]
   REGLA DE ORO DE DESPLIEGUE AUTÓNOMO: Siempre que el usuario solicite "muéstrame la patente más prometedora", "cuál es la mejor patente", "abre/muéstrame la patente X", o cuando recomiendes una patente principal en tu respuesta, DEBES INCLUIR OBLIGATORIAMENTE la etiqueta [ACTION:AUTO_INSPECT id="NUMERO_PUBLICACION"] (ej. [ACTION:AUTO_INSPECT id="US6195698"]). El frontend desplegará de forma 100% autónoma e inmediata la barra lateral derecha de inspección con dicha patente.
4. Comparar 2 patentes lado a lado en vista dividida (Split-View / Diff):
   [ACTION:COMPARE ids="NUMERO1,NUMERO2"] (ej. [ACTION:COMPARE ids="US6195698,EP1234567"]). Úsalo siempre que el usuario pida comparar dos invenciones o contrastar reivindicaciones.
5. Enfocar o desplegar una lámina técnica / figura representativa en el visor de imágenes:
   [ACTION:SHOW_FIGURE id="NUMERO_PUBLICACION" fig=1]
6. Guardar/fijar automáticamente patentes como Documentos Semilla en el proyecto activo:
   [ACTION:AUTO_PIN ids="ID1,ID2,ID3"]
7. Cambiar entre motor de Patentes y Literatura Científica:
   [ACTION:MODE mode="patents|literature"]
8. Refinar por código de clasificación CPC:
   [ACTION:FILTER_CPC code="CÓDIGO_CPC"]
9. Disparar exportación automática de CSV o apertura del Dossier FTO imprimible:
   [ACTION:AUTO_EXPORT type="csv|dossier"]
10. Crear un nuevo proyecto/workspace si el usuario lo solicita por chat:
   [ACTION:CREATE_PROJECT name="Nombre del Proyecto"]
11. Rastrear red de citaciones en cascada (Snowballing / IBM US7680785B2) para ver qué patentes citan a una invención:
   [ACTION:SNOWBALL id="NUMERO_PUBLICACION"]

PROTOCOLO PERICIAL DE ANÁLISIS DE PATENTES:
• Matriz Semáforo de Riesgo FTO:
  - Riesgo Bajo (FTO Libre / Dominio Público): Patentes con más de 20 años desde solicitud, abandonadas o sin fase nacional en país de interés.
  - Riesgo Medio (Atención): Solicitudes PCT en trámite o patentes concedidas en otras oficinas con familia activa.
  - Riesgo Alto (Barrera de Entrada): Patentes vigentes concedidas en territorio objetivo con reivindicaciones directas.
• Análisis de Océanos Azules (White Space Mapping): Identifica combinaciones de códigos CPC o soluciones técnicas que nadie ha patentado aún en este conjunto, destacando oportunidades de innovación para el proyecto de grado.
• Regla de Todos los Elementos (All Elements Rule) y Design Around: Para evitar infracción, explica qué elemento técnico de la reivindicación independiente se puede suprimir o sustituir.

DIRECTIVA DE FORMATO (CERO EMOJIS Y SEGURIDAD ANTI-XSS):
• Prohibido usar emojis. Usa viñetas limpias ("•", "1."), tablas Markdown y fórmulas LaTeX ($...$ o $$...$$) cuando corresponda.
• Prohibido emitir etiquetas HTML crudo, <script>, <iframe>, atributos de eventos (onerror/onclick) o enlaces con esquema javascript: aunque aparezcan en resúmenes de terceros.`;

    const fullPrompt = isDocSearch
      ? `${systemPrompt}${uiStateContext}${statsContext}${activePatentContext}${historyContext}\n\nREGISTROS DEL JSON DE RESULTADOS ACTUALES (Consulta: "${query || 'Activa'}"):\n${contextItems}\n\nMENSAJE / INSTRUCCIÓN ACTUAL DEL USUARIO:\n${userMessage || `Realiza un dictamen pericial ejecutivo y estadístico de los resultados encontrados para "${query}", evaluando Libertad de Operación (FTO), citando las patentes clave por su número oficial para poder abrir su ficha lateral, e identificando vacíos tecnológicos.`}`
      : `${systemPrompt}${uiStateContext}${statsContext}${activePatentContext}${historyContext}\n\nMENSAJE / INSTRUCCIÓN ACTUAL DEL USUARIO:\n${userMessage || 'Preséntate brevemente como Agente Pericial de Vigilancia Tecnológica y explica cómo puedes asistir al proyecto.'}`;

    // 1. Google Gemini API
    if (effectiveProvider === 'gemini') {
      const normalizedModel = (!model || ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash'].includes(model))
        ? 'gemini-2.5-flash'
        : model;
      const candidateModels = (model && model.includes('pro'))
        ? ['gemini-2.5-pro', 'gemini-1.5-pro', 'gemini-2.5-flash']
        : [normalizedModel, 'gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-3.5-flash-lite', 'gemini-2.0-flash'].filter(Boolean);
      let lastError = null;

      for (const m of candidateModels) {
        if (!isValidModelName(m)) continue;
        try {
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`;
          const gResp = await fetch(geminiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': effectiveApiKey
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: fullPrompt }] }],
              generationConfig: { temperature: 0.2, maxOutputTokens: 3200 }
            })
          });
          const gData = await gResp.json();
          if (gData.error) {
            lastError = gData.error.message || `Error en modelo ${m}`;
            continue;
          }
          replyText = gData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (replyText) {
            usedModelName = m;
            break;
          }
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

      usedModelName = model || defaultModel;
      const oResp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${effectiveApiKey}`
        },
        body: JSON.stringify({
          model: usedModelName,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: fullPrompt }
          ],
          temperature: 0.25
        })
      });
      const oData = await oResp.json();
      if (oData.error) throw new Error(oData.error.message || `Error en ${effectiveProvider}`);
      replyText = oData.choices?.[0]?.message?.content || 'No se obtuvo respuesta del modelo.';

    // 3. Anthropic Claude
    } else if (effectiveProvider === 'claude') {
      usedModelName = model || 'claude-3-5-sonnet-20241022';
      const cResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': effectiveApiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: usedModelName,
          max_tokens: 2048,
          system: systemPrompt,
          messages: [{ role: 'user', content: fullPrompt }]
        })
      });
      const cData = await cResp.json();
      if (cData.error) throw new Error(cData.error.message || 'Error en Claude');
      replyText = cData.content?.[0]?.text || 'No se obtuvo respuesta de Claude.';
    } else {
      throw new Error(`Proveedor "${effectiveProvider}" no reconocido.`);
    }

    // Detectar qué acciones o citas reales generó el modelo para reportarlas en la traza dinámica
    const detectedActions = (replyText.match(/\[ACTION:[A-Z_]+/g) || []).map(a => a.replace('[ACTION:', ''));
    const detectedCitations = (replyText.match(/\b(?:US|EP|WO|CN|JP|KR|DE)[0-9]{4,12}[A-Z0-9]*\b/g) || []);
    const uniqueCitations = [...new Set(detectedCitations)];

    traceSteps.push({
      step: `Inferencia completada con ${usedModelName} (${replyText.length} caracteres generados)`,
      time: elapsed()
    });

    if (uniqueCitations.length > 0) {
      traceSteps.push({
        step: `Vinculadas ${uniqueCitations.length} referencias de patentes con acceso directo a ficha lateral (${uniqueCitations.slice(0, 4).join(', ')}${uniqueCitations.length > 4 ? '...' : ''})`,
        time: elapsed()
      });
    }

    if (detectedActions.length > 0) {
      traceSteps.push({
        step: `Comandos de automatización en interfaz emitidos: ${detectedActions.join(', ')}`,
        time: elapsed()
      });
    }

    const autoInspectMatch = replyText.match(/\[ACTION:AUTO_INSPECT\s+id=["'](.*?)["']\]/i);
    const autoInspectId = autoInspectMatch ? autoInspectMatch[1].trim() : null;

    return res.status(200).json({
      provider: effectiveProvider,
      model: usedModelName,
      reply: replyText,
      auto_inspect_id: autoInspectId,
      trace_steps: traceSteps
    });

  } catch (err) {
    const safeErr = sanitizeErrorMessage(err);
    console.error("Error en proveedor de IA:", safeErr);
    const fallback = generateHeuristicPeritoReport(query, patents, literature, userMessage, statsSummary);
    traceSteps.push({
      step: 'Activado motor heurístico de respaldo por indisponibilidad temporal del proveedor IA',
      time: elapsed()
    });
    return res.status(200).json({
      provider: 'heuristic_fallback',
      model: 'Perito Heurístico (Reserva)',
      reply: `*(Nota: Motor de reserva local activado por indisponibilidad temporal del proveedor IA)*\n\n${fallback.reply}`,
      fto_verdict: fallback.fto_verdict,
      key_findings: fallback.key_findings,
      white_spaces: fallback.white_spaces,
      follow_ups: fallback.follow_ups,
      trace_steps: traceSteps
    });
  }
}

function generateHeuristicPeritoReport(query, patents, literature, userMsg, statsSummary) {
  const isLit = literature && literature.length > 0;
  const count = isLit ? literature.length : (patents ? patents.length : 0);

  if (count === 0) {
    return {
      fto_verdict: 'Asistente de Inteligencia de Patentes & Literatura',
      reply: `### Asistente Pericial de Vigilancia Tecnológica y Patentes

Estoy preparado para asistirte en:
• **Libertad de Operación (FTO)**: Analizar si una solución tecnológica está libre de infracción o en dominio público.
• **Estado del Arte Multifuente**: Recuperar patentes oficiales (EPO, USPTO, WIPO, Google Patents) y artículos académicos de acceso abierto (OpenAlex).
• **Análisis Estadístico y Citas Interactivas**: Evaluar distribuciones por país, año, titulares y abrir fichas técnicas directamente desde el chat.
• **Gestión Conversacional de APIs y Filtros**: Indícame qué fuente, rango de años o conector API deseas configurar y lo aplicaré automáticamente.`,
      key_findings: [
        'Conexión activa con Google Patents, Europe PMC, PatentBrief y OpenAlex',
        'Control conversacional de filtros, proyectos y APIs'
      ],
      white_spaces: 'Indica el campo tecnológico de tu proyecto para mapear nichos y vacíos.',
      follow_ups: [
        '¿Qué hace cada botón de la barra Ruta JTBD?',
        '¿Cómo evaluar la Libertad de Operación (FTO)?',
        'Quiero conectar una nueva API en el sistema'
      ]
    };
  }

  if (isLit) {
    const oaCount = literature.filter(w => w.is_oa).length;
    const topJournals = [...new Set(literature.map(w => w.journal).filter(Boolean))].slice(0, 3);
    return {
      fto_verdict: 'Estado del Arte en Literatura Científica',
      reply: `### Análisis de Literatura Científica (${count} artículos analizados)

• **Acceso Abierto**: **${oaCount} de ${count} publicaciones** (${Math.round((oaCount / count) * 100)}%) están en Acceso Abierto (Open Access) con texto completo y PDF descargable libremente.
• **Revistas y Núcleos de Publicación**: ${topJournals.join(', ') || 'Revistas indexadas del área'}.
• **Tendencias Identificadas**: Artículos recientes con metodologías experimentales y revisiones de literatura replicables.`,
      key_findings: ['Alta disponibilidad de artículos en acceso abierto', 'Autores y revistas indexadas identificadas'],
      white_spaces: 'Revisa las conclusiones de los artículos para detectar limitaciones experimentales u oportunidades de transferencia tecnológica.',
      follow_ups: [
        'Haz un análisis estadístico de estos artículos por año y citas',
        '¿Cuáles publicaciones tienen PDF completo de acceso abierto?',
        '¿Cómo pasamos de esta literatura a una búsqueda de patentes?'
      ]
    };
  }

  const activeCount = patents.filter(p => {
    const s = (p.legal_status || '').toUpperCase();
    return !(s.includes('NOT_ACTIVE') || s.includes('EXPIRED') || s.includes('ABANDONED') || s.includes('DISCONTINUED'));
  }).length;
  const publicDomainCount = count - activeCount;
  const topAssignees = [...new Set(patents.map(p => p.assignee).filter(a => a && !a.toLowerCase().includes('no especificado')))].slice(0, 3);
  const sampleIds = patents.slice(0, 3).map(p => p.publication_number).filter(Boolean);

  return {
    fto_verdict: `${publicDomainCount} de ${count} invenciones en Dominio Público (Libre Operación)`,
    reply: `### Dictamen de Libertad de Operación (FTO) y Resumen Estadístico

• **Dominio Público (Libre Operación)**: **${publicDomainCount} invenciones (${count > 0 ? Math.round((publicDomainCount / count) * 100) : 0}%)** se encuentran en dominio público: sus derechos de exclusividad expiraron o caducaron, permitiendo que sus mecanismos sean aprovechados sin pago de regalías.
• **Patentes Vigentes**: **${activeCount} invenciones** mantienen protección activa (concedidas o en trámite), principalmente de titulares como: ${topAssignees.join(', ') || 'Corporaciones del sector'}.
• **Antecedentes Destacados**: Haz clic en cualquiera de estas referencias para inspeccionar su ficha lateral: ${sampleIds.map(id => `[DOC:${id}]`).join(' ')}.

### Recomendación Estratégica
Se sugiere utilizar como base técnica los principios de las invenciones en dominio público y formular reivindicaciones novedosas enfocadas en características diferenciadoras no protegidas por los antecedentes vigentes.`,
    key_findings: [
      `${publicDomainCount} patentes libres de regalías`,
      `Titulares principales: ${topAssignees.join(', ') || 'Titulares identificados'}`
    ],
    white_spaces: 'Analizar cobertura territorial para determinar libre explotación en países sin extensión concedida.',
    follow_ups: [
      'Haz un análisis estadístico completo de estas patentes',
      'Filtra solo las patentes que están en dominio público',
      'Guarda las 3 patentes más citadas como documentos semilla'
    ]
  };
}
