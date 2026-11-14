# Comportamiento Esperado: Plataforma de Inteligencia de Patentes y Literatura Científica (Capstone)

## 1. Objetivo y Contexto (Job to be Done - JTBD)
**JTBD Oficial**: *«Gestionar información tecnológica dispersa para realizar consultas eficientes, confiables y oportunas sobre desarrollos tecnológicos.»*

La plataforma centraliza la vigilancia tecnológica, inteligencia competitiva y estado del arte científico para **Universidad del Rosario**, **Céntrika** y **Awake**, eliminando la curva de aprendizaje hostil de los portales gubernamentales tradicionales mediante una interfaz unificada, limpia (cero emojis, iconografía vectorial monocromática) y asistida por IA pericial.

---

## 2. Flujos Paso a Paso

### 2.1. Inicio y Aislamiento por Usuario (Zero-State Hub & Cero Proyectos Fantasma)
1. **Qué hace el usuario**: Ingresa a la plataforma o recarga la página.
2. **Qué procesa el sistema**:
   - Genera una identidad única de usuario (`capstone_user_uuid`) almacenada en su navegador (`localStorage`), asegurando que sus proyectos, historial de chat y patentes guardadas sean 100% independientes y no visibles por otros usuarios.
   - Si es su primera visita, el sistema inicia sin proyectos prearmados (`workspaces = []`). Se purgan automáticamente proyectos heredados o accidentales (`principal`, `emergentes`, etc.).
   - **Cero Proyectos Fantasma**: Si el usuario realiza consultas o chatea sin haber creado un proyecto, el sistema opera limpiamente en **Modo Sesión Libre Temporal** sin auto-crear proyectos con el texto de sus preguntas. Los proyectos solo se crean mediante acción explícita del usuario (`+ Proyecto` o el botón del Onboarding).
3. **Qué se muestra en pantalla**:
   - Si no hay proyectos creados, el selector superior muestra `Sin Proyecto` y el centro exhibe la tarjeta de bienvenida para crear su primer proyecto de vigilancia.
   - En el menú de proyectos, el usuario puede cambiar de proyecto, exportar su memoria o **eliminar proyectos** con confirmación.

### 2.2. Búsqueda Multifuente, Responsividad Inmediata y Traza de Razonamiento
1. **Qué hace el usuario**: Escribe términos técnicos, ecuaciones booleanas o una consulta directa al Agente Pericial en la barra flotante inferior y presiona `Enter` (o usa `Shift+Enter` / `Alt+Enter` para insertar saltos de línea).
2. **Qué procesa el sistema**:
   - **Vaciado Inmediato**: El campo de texto (`#query-input`) se limpia al instante y desactiva el botón de búsqueda para sentirse responsivo. La consulta enviada se proyecta en el chip `#active-query-pill` (*Consulta: "..."*).
   - **Prioridad del Mensaje sobre los Botones**: Si el usuario escribe una directiva explícita (ej. *"busca solo patentes de EPO"*, *"solo vigentes"* o *"solo con PDF"*), el sistema actualiza de inmediato los filtros de la interfaz dando prioridad a la intención del usuario sobre el estado anterior de los botones.
   - **Traza Dinámica Real (`AgentActivityTree`)**: Estilo Antigravity minimalista (`Worked for Xs ›`). Registra en tiempo real la conexión con los registros oficiales, la cantidad exacta de documentos recuperados, el modelo de IA invocado (`gemini-3.5-flash-lite` por defecto) y los pasos emitidos por el servidor, desplegables con un clic sin cajas pesadas.
   - **Cálculo Estadístico (`statsSummary`)**: Calcula en tiempo real métricas clave del JSON (total de patentes, % vigentes vs. % dominio público, top titulares, top clasificaciones CPC y rango de años) y las remite al Agente Pericial para fundamentar su análisis con datos numéricos exactos.
3. **Qué se muestra en pantalla**:
   - El toggle de razonamiento minimalista.
   - Tarjetas de patentes o literatura científica con diseño limpio, respirable y sin bordes toscos.

### 2.3. Historial de Chat Pericial con Filosofía Antigravity (Limpio, Sin Bordes ni Cajas)
1. **Qué hace el usuario**: Formula preguntas sucesivas o solicita análisis de patentes al Agente Pericial.
2. **Qué procesa el sistema**: Almacena en el proyecto activo (o en memoria de sesión si no hay proyecto) cada turno conversacional, enmascarando cualquier token o clave sensible (`maskSensitiveTokens`).
3. **Qué se muestra en pantalla**:
   - **Traza de Razonamiento SIEMPRE Arriba**: En cada turno del agente, la traza de razonamiento (`Worked for Xs ›` / `Razonamiento y traza pericial completada`) se ubica estrictamente **arriba** de la respuesta textual, nunca al pie. En turnos anteriores se muestra como una píldora minimalista desplegable con un clic, mientras que en el turno activo expone el conteo y progreso de auditoría en vivo.
   - **Redacción Fluida Palabra por Palabra (Typewriter Effect)**: Las respuestas del asistente se mecanografían de forma progresiva token por token con cursor pulsante (`▍`), evitando apariciones instantáneas tipo "explosión" y brindando una experiencia conversacional moderna y orgánica.
   - **Sin Cajas ni Bordes Pesados**: Las respuestas del perito fluyen naturalmente sobre el fondo del lienzo (canvas) con tipografía amplia (`line-height: 1.75; font-size: 14.5px`), encabezados claros y espaciado generoso, eliminando marcos o cajas rectangulares apretadas.
   - **Mensajes del Usuario**: Se presentan como burbujas redondeadas flotantes (`border-radius: 18px`) alineadas a la derecha, con fondo suave y separación visual natural.
   - **Despliegue Superior Colapsable**: Por defecto se muestran los últimos 2 mensajes; si existen mensajes previos, el botón flotante `[ ▲ Desplegar historial anterior (N mensajes previos) ]` los expande ordenadamente por encima.
   - **Filosofía Extendida al Resto del Proyecto**: Modales estrictamente aislados en capa fija flotante (`display: none !important;`), tarjetas de patentes con bordes ultrafinos y fondos translúcidos suaves (`rgba(255,255,255,0.02)`), columna de inspección transparente y sin dobles marcos, creando un entorno de lectura descansado y profesional.

### 2.4. Gobierno de APIs y Modelos Exclusivo del Agente
1. **Qué hace el usuario**: Hace clic en el botón de configuración de APIs o le pide al Agente Pericial añadir, configurar o remover una fuente o modelo.
2. **Qué procesa el sistema**: La interfaz gráfica retira los formularios manuales vulnerables. El modal muestra el estado de salud de las APIs y delega al Agente Pericial la configuración y asignación de topes de cuota de forma segura y guiada.

### 2.5. Despliegue Autónomo de la Barra Lateral por el Agente (`AUTO_INSPECT`)
1. **Qué hace el usuario**: Formula preguntas como *"muéstrame la patente más prometedora sobre tecnología LED"*, *"cuál es la mejor patente"* o *"abre la ficha de US6195698"*.
2. **Qué procesa el sistema**:
   - Si no hay patentes previas cargadas, el sistema extrae el término técnico, ejecuta la búsqueda en los registros oficiales (`/api/patents`) y luego entrega los resultados al Agente Pericial.
   - El Agente analiza las invenciones, evalúa citas, novedad y estado FTO, redacta su dictamen y emite la acción `[ACTION:AUTO_INSPECT id="NUMERO_PUBLICACION"]`.
   - El frontend detecta la directiva e inmediatamente dispara `inspeccionarPatentePorId(pubNum)`, actualizando `#inspection-active-view` y desplegando la columna lateral derecha con animación de pulso (o abriendo el drawer en móviles) **sin requerir clics manuales del usuario**.
3. **Qué se muestra en pantalla**:
   - El chat muestra la respuesta estructurada y el banner informativo: `[↗ Desplegando en barra lateral: PUB_NUM]`.
   - La barra lateral derecha se abre automáticamente mostrando el título, láminas técnicas, resumen oficial traducible, titular, clasificación CPC y visor del PDF oficial.

### 2.6. Citas de Patentes Clicables e Interacción con el Panel de Inspección
1. **Qué hace el usuario**: Lee el dictamen pericial donde el agente cita números de publicación (ej. `[DOC:US6195698]` o menciones directas a patentes).
2. **Qué procesa el sistema**: Compila estas citas como chips de acción interactivos: `[↗ US6195698 · Ver Ficha]`.
3. **Qué se muestra en pantalla**: Al hacer clic en el chip de cita, se despliega y enfoca automáticamente la columna derecha de inspección (`#col-inspection` / `#patent-sidebar`) con la ficha completa y el visor de PDF de dicha patente.

### 2.7. Modos de Visualización, Menús Dropup y Botón de Restaurar Chat
1. **Modo Claro / Oscuro**: La barra flotante de búsqueda y chat adopta coherentemente la paleta luminosa en `[data-theme="light"]`.
2. **Menús Dropup**: Los menús desplegables de la barra inferior (`#source-popup-menu` y `#filter-popup-menu`) se despliegan **hacia arriba** (`bottom: calc(100% + 12px); top: auto;`) evitando desbordamientos inferiores.
3. **Restaurar Chat Oculto**: Al minimizar el panel del Agente Pericial con `X Ocultar`, se exhibe en la barra de pestañas el botón interactivo `#btn-restore-ai-panel` (`Mostrar Chat del Agente`), permitiendo reabrirlo con un solo clic.

### 2.8. Dictado por Voz Nativo (Web Speech API)
1. **Qué hace el usuario**: Presiona el botón flotante `[Voz]` con icono de micrófono en la barra de búsqueda.
2. **Qué procesa el sistema**: Activa la API nativa del navegador (`webkitSpeechRecognition`), capturando el dictado en español (`es-CO`), transcribiéndolo en tiempo real hacia `#query-input` con animación de pulso rojo (`.listening`). Al detenerse, activa de inmediato el botón de búsqueda.

### 2.9. Comparador Lado a Lado de Patentes (`[ACTION:COMPARE]`)
1. **Qué hace el usuario**: Solicita comparar dos patentes (ej. *"compara US6195698 con EP1234567"*) o hace clic en el chip pericial `[⚖ Comparar lado a lado: ID1 vs ID2]`.
2. **Qué procesa el sistema**: Abre el modal `#modal-comparador-patentes` renderizando en paralelo dos columnas con titular, fecha de prioridad, semáforo legal FTO (Vigente vs. Dominio Público), clasificaciones CPC y extracto técnico de reivindicaciones, con botón directo a inspección individual.

### 2.10. Enfoque Autónomo en Láminas Técnicas (`[ACTION:SHOW_FIGURE]`)
1. **Qué hace el usuario**: Solicita ver la figura técnica o hace clic en el chip `[Ver Lámina Técnica: Fig. X · PUB_NUM]`.
2. **Qué procesa el sistema**: Recupera la lámina técnica de los servidores oficiales de Google Cloud Storage y despliega el visor lightbox en alta definición.

### 2.11. Conmutador Rápido de Modelo de Razonamiento
1. **Qué hace el usuario**: Hace clic en la etiqueta del modelo en la cabecera (`#ai-active-model-tag`).
2. **Qué procesa el sistema**: Conmuta entre `gemini-2.5-flash` (alta velocidad, cuota de 1.500 req/día) y `gemini-2.5-pro` (máxima profundidad de análisis pericial y árbol de reivindicaciones, cuota de 50 req/día), persistiendo la preferencia en `localStorage`.

### 2.12. Métodos Avanzados de Búsqueda de Patentes (Snowballing & All Elements Rule)
1. **Topología de Citaciones en Cascada (Citation Snowballing / US10268731B2)**: El usuario o el agente (`[ACTION:SNOWBALL id="PUB_NUM"]`) puede disparar una búsqueda de citaciones sobre cualquier patente semilla para auditar qué invenciones y competidores derivaron de ella (`cites:PUB_NUM`).
2. **Auditoría de Nivel Inventivo (All Elements Rule / 35 U.S.C. 103)**: Desde la ficha de inspección técnica, se desglosa la reivindicación 1 en elementos $A + B + C$ para identificar cómo aplicar diseño alternativo (*Design Around*) suprimiendo o alterando componentes esenciales.
3. **Registro Gubernamental de Propiedad Intelectual**: Documentado el procedimiento oficial ante la DNDA (Dirección Nacional de Derecho de Autor) en `docs/guia_registro_propiedad_intelectual_dnda.md`.

---

### 2.13. Explicación Pedagógica de Metodologías Bajo Demanda (Explain-on-Demand)
1. **Qué hace el usuario**: Pregunta por chat "¿qué metodologías usas?", "¿cómo buscas patentes?", "¿qué es snowballing?", "¿qué es la regla de todos los elementos?" o "¿cómo registro los derechos de autor de mi software?".
2. **Qué procesa el sistema**: El Agente Pericial despliega una explicación estructurada utilizando analogías cotidianas, citas normativas y patentes reales de referencia (`US10268731B2`, `US11947605B2`, `US9201966B2`, `US9836805B2`, 35 U.S.C. 103, Decisión 351 Art. 23, Decisión 486 CAN Art. 15, Ley 23/1982 de DNDA) sin jerga incomprensible, orientando al usuario de forma didáctica y emitiendo las acciones de interfaz correspondientes si procede.

---

## 3. Reglas de Negocio y Seguridad (Security by Design)
1. **Cero Credenciales Hardcodeadas**: Todas las claves (`GEMINI_API_KEY`, `SERPAPI_KEY`, etc.) se leen de variables de entorno del servidor (`process.env` en Vercel o `.env` local).
2. **Enmascaramiento de Claves en Memoria**: Cualquier token o clave ingresada en el chat se sanitiza antes de guardarse en el historial visual.
3. **Sanitización Anti-XSS**: Escape estricto con `escapeHtml` y `escapeJsAttr` en toda interpolación dinámica.
4. **Independencia Multi-Usuario**: El almacenamiento local de proyectos se particiona por el identificador de sesión único del usuario.

---

## 4. Criterios de Aceptación
- [x] JTBD alineado a la definición oficial del proyecto.
- [x] Cada usuario tiene espacios de trabajo independientes sin proyectos prefabricados en su primera visita.
- [x] Cero proyectos fantasma creados por consultas de chat al recargar la página.
- [x] Los proyectos pueden crearse y eliminarse de forma persistente.
- [x] Al enviar una consulta con `Enter`, el campo de texto se vacía de inmediato y la consulta activa se muestra en un chip descriptivo.
- [x] El historial de chat aplica la filosofía Antigravity: sin marcos ni bordes visuales pesados, texto fluido con line-height 1.75 y burbuja de usuario redondeada a la derecha.
- [x] La traza de razonamiento pericial (`AgentActivityTree`) se posiciona **arriba** de la respuesta del perito (en vivo e historial).
- [x] Redacción progresiva palabra por palabra (typewriter effect) con cursor activo, eliminando la aparición súbita de bloques completos.
- [x] Sistema unificado de modales con Light-Dismiss (tecla Escape y clic en backdrop), backdrop-filter blur, overscroll-behavior contain y auto-enfoque accesible (Modern Web Guidance).
- [x] Corrección y vinculación de botones de acción en interfaz: creación de proyecto desde onboarding (`crearPrimerProyectoDesdeOnboarding`), copia de dictamen pericial (`copiarAnalisisIa`), limpieza de chat (`limpiarHistorialChatActual`), pantalla completa de expediente (`maximizarInspeccionModal`) y conector de APIs (`abrirAsistenteConectarApi`).
- [x] Modales estrictamente ocultos del flujo del documento con apertura normalizada (`openModal` / `closeModal`) y botones estilizados con tokens monocromáticos.
- [x] Barra de inteligencia CPC inicia oculta (`display: none;`) hasta que existan clasificaciones recuperadas.
- [x] Despliegue 100% autónomo de la barra lateral de inspección cuando el agente recomienda o analiza una patente.
- [x] Las citas periciales `[DOC:...]` son botones clicables que abren la ficha de inspección lateral.
- [x] El mensaje del usuario tiene prioridad sobre el estado previo de los botones de filtro.
- [x] Los menús de la barra de búsqueda se abren hacia arriba (dropup anti-desbordamiento).
- [x] La barra flotante soporta el Modo Claro (`[data-theme="light"]`).
- [x] El panel del agente cuenta con botón visible de restauración tras ser ocultado.
- [x] Dictado por voz nativo mediante Web Speech API (sin librerías pesadas ni costos).
- [x] Comparador lado a lado de patentes (`[ACTION:COMPARE]`) para análisis dual de reivindicaciones y FTO.
- [x] Enfoque autónomo en láminas técnicas con visor de imágenes (`[ACTION:SHOW_FIGURE]`).
- [x] Conmutador interactivo entre Gemini 2.5 Flash y Gemini 2.5 Pro con preservación de cuota.
- [x] Topología de citaciones en cascada (Citation Snowballing) ejecutable desde tarjeta o mediante `[ACTION:SNOWBALL]`.
- [x] Mapeo de la Regla de Todos los Elementos (All Elements Rule) para auditoría de novedad y nivel inventivo.
- [x] Guía exhaustiva de registro gubernamental ante la DNDA redactada en `docs/guia_registro_propiedad_intelectual_dnda.md`.
- [x] Cero errores de sintaxis (`verify_all.py` / `node --check` / `py_compile`) y cero secretos filtrados.
