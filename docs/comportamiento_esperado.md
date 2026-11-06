# Comportamiento Esperado: Plataforma de Inteligencia de Patentes y Literatura Científica (Capstone)

## 1. Objetivo y Contexto (Job to be Done - JTBD)
**JTBD Oficial**: *«Gestionar información tecnológica dispersa para realizar consultas eficientes, confiables y oportunas sobre desarrollos tecnológicos.»*

La plataforma centraliza la vigilancia tecnológica, inteligencia competitiva y estado del arte científico para **Universidad del Rosario**, **Céntrika** y **Awake**, eliminando la curva de aprendizaje hostil de los portales gubernamentales tradicionales mediante una interfaz unificada, limpia (cero emojis, iconografía vectorial monocromática) y asistida por IA pericial.

---

## 2. Flujos Paso a Paso

### 2.1. Inicio y Aislamiento por Usuario (Zero-State Hub & Onboarding)
1. **Qué hace el usuario**: Ingresa por primera vez a la plataforma.
2. **Qué procesa el sistema**:
   - Genera una identidad única de usuario (`capstone_user_uuid`) almacenada en su navegador (`localStorage`), asegurando que sus proyectos, historial de chat y patentes guardadas sean 100% independientes y no visibles por otros usuarios.
   - Si es su primera visita, el sistema inicia sin proyectos prearmados (`workspaces = []`).
3. **Qué se muestra en pantalla**:
   - Una tarjeta de bienvenida intuitiva que solicita crear su primer **Proyecto de Vigilancia Tecnológica**.
   - Si el usuario decide escribir directamente en la barra inferior sin crear el proyecto manualmente, el sistema inicializa automáticamente su proyecto y procesa su consulta sin fricción.
   - En el menú de proyectos, el usuario puede cambiar de proyecto, exportar su memoria o **eliminar proyectos** con confirmación.

### 2.2. Búsqueda Multifuente, Responsividad Inmediata y Traza de Razonamiento
1. **Qué hace el usuario**: Escribe términos técnicos, ecuaciones booleanas o una consulta directa al Agente Pericial en la barra flotante inferior y presiona `Enter` (o usa `Shift+Enter` / `Alt+Enter` para insertar saltos de línea).
2. **Qué procesa el sistema**:
   - **Vaciado Inmediato**: El campo de texto (`#query-input`) se limpia al instante y desactiva el botón de búsqueda para sentirse responsivo. La consulta enviada se proyecta en el chip `#active-query-pill` (*Consulta: "..."*).
   - **Prioridad del Mensaje sobre los Botones**: Si el usuario escribe una directiva explícita (ej. *"busca solo patentes de EPO"*, *"solo vigentes"* o *"solo con PDF"*), el sistema actualiza de inmediato los filtros de la interfaz dando prioridad a la intención del usuario sobre el estado anterior de los botones.
   - **Traza Dinámica Real (`AgentActivityTree`)**: Elimina timers o textos simulados. Registra en tiempo real la conexión con los registros oficiales, la cantidad exacta de documentos recuperados, el modelo de IA invocado (`gemini-3.5-flash-lite` por defecto) y los pasos emitidos por el servidor.
   - **Cálculo Estadístico (`statsSummary`)**: Calcula en tiempo real métricas clave del JSON (total de patentes, % vigentes vs. % dominio público, top titulares, top clasificaciones CPC y rango de años) y las remite al Agente Pericial para fundamentar su análisis con datos numéricos exactos.
3. **Qué se muestra en pantalla**:
   - El árbol de razonamiento con cronómetro en vivo y pasos auditables.
   - Tarjetas de patentes o literatura científica con diseño compacto, resúmenes amigables, clasificaciones CPC y badges de estado FTO.

### 2.3. Historial de Chat Pericial por Proyecto (Últimos 2 Mensajes + Despliegue Superior)
1. **Qué hace el usuario**: Formula preguntas sucesivas o solicita análisis de patentes al Agente Pericial.
2. **Qué procesa el sistema**: Almacena en `ws.chatHistory` cada turno conversacional, enmascarando cualquier token o clave sensible (`maskSensitiveTokens`).
3. **Qué se muestra en pantalla**:
   - Por defecto se muestran en pantalla los **últimos 2 mensajes** (la última pregunta del investigador y la última respuesta del perito).
   - Si existen más de 2 mensajes, aparece arriba el botón desplegable:
     `[ ▲ Desplegar historial anterior (N mensajes previos) ]`
   - Al hacer clic, se expanden todos los mensajes anteriores ordenados cronológicamente por encima de los dos últimos (como en chats profesionales) y el botón cambia a `[ ▼ Colapsar historial anterior ]`.
   - Se dispone además del botón `Limpiar Chat` para resetear el historial del proyecto cuando sea necesario.

### 2.4. Gobierno de APIs y Modelos Exclusivo del Agente
1. **Qué hace el usuario**: Hace clic en el botón de configuración de APIs o le pide al Agente Pericial añadir, configurar o remover una fuente o modelo.
2. **Qué procesa el sistema**: La interfaz gráfica retira los formularios manuales vulnerables. El modal muestra el estado de salud de las APIs y delega al Agente Pericial la configuración y asignación de topes de cuota de forma segura y guiada.

### 2.5. Citas de Patentes Clicables e Interacción con el Panel de Inspección
1. **Qué hace el usuario**: Lee el dictamen pericial donde el agente cita números de publicación (ej. `[DOC:US6195698]` o menciones directas a patentes).
2. **Qué procesa el sistema**: Compila estas citas como chips de acción interactivos: `[↗ US6195698 · Ver Ficha]`.
3. **Qué se muestra en pantalla**: Al hacer clic en el chip de cita, se despliega y enfoca automáticamente la columna derecha de inspección (`#col-inspection` / `#patent-sidebar`) con la ficha completa y el visor de PDF de dicha patente.

### 2.6. Modos de Visualización, Menús Dropup y Botón de Restaurar Chat
1. **Modo Claro / Oscuro**: La barra flotante de búsqueda y chat adopta coherentemente la paleta luminosa en `[data-theme="light"]`.
2. **Menús Dropup**: Los menús desplegables de la barra inferior (`#source-popup-menu` y `#filter-popup-menu`) se despliegan **hacia arriba** (`bottom: calc(100% + 12px); top: auto;`) evitando desbordamientos inferiores.
3. **Restaurar Chat Oculto**: Al minimizar el panel del Agente Pericial con `X Ocultar`, se exhibe en la barra de pestañas el botón interactivo `#btn-restore-ai-panel` (`Mostrar Chat del Agente`), permitiendo reabrirlo con un solo clic.

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
- [x] Los proyectos pueden crearse y eliminarse de forma persistente.
- [x] Al enviar una consulta con `Enter`, el campo de texto se vacía de inmediato y la consulta activa se muestra en un chip descriptivo.
- [x] El historial de chat muestra los últimos 2 mensajes y despliega los mensajes anteriores arriba mediante un botón toggle.
- [x] La traza del razonamiento (`AgentActivityTree`) es dinámica y refleja la actividad y tiempos reales.
- [x] Las citas periciales `[DOC:...]` son botones clicables que abren la ficha de inspección lateral.
- [x] El mensaje del usuario tiene prioridad sobre el estado previo de los botones de filtro.
- [x] Los menús de la barra de búsqueda se abren hacia arriba (dropup anti-desbordamiento).
- [x] La barra flotante soporta el Modo Claro (`[data-theme="light"]`).
- [x] El panel del agente cuenta con botón visible de restauración tras ser ocultado.
- [x] Cero errores de sintaxis (`verify_all.py` / `node --check` / `py_compile`) y cero secretos filtrados.
