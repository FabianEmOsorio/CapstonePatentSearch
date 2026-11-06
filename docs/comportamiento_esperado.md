# Comportamiento Esperado: Plataforma de Inteligencia de Patentes y Literatura Científica (Capstone)

## 1. Objetivo y Contexto (Job to be Done - JTBD)
**JTBD Oficial**: *«Gestionar documentación técnica disponible a partir de fuentes documentales heterogéneas, transformándola en patrones de búsqueda estructurados sobre bases de patentes y repositorios académicos abiertos, para dar soporte a informes terminados sobre el estado de la tecnología y decisiones estratégicas.»*

La plataforma centraliza la vigilancia tecnológica, inteligencia competitiva y estado del arte científico para **Universidad del Rosario**, **Céntrika** y **Awake**, eliminando la curva de aprendizaje hostil de los portales gubernamentales tradicionales mediante una interfaz unificada, limpia (cero emojis, iconografía vectorial monocromática) y asistida por IA pericial.

---

## 2. Flujos Paso a Paso

### 2.1. Inicio en Estado Cero (Zero-State Hub)
1. **Qué hace el usuario**: Ingresa a la aplicación web.
2. **Qué procesa el sistema**: Carga el espacio de trabajo activo desde `localStorage` sin disparar búsquedas automáticas no solicitadas (cero consumo innecesario de cuota de APIs).
3. **Qué se muestra en pantalla**: El **Zero-State Hub** con tarjetas de exploración rápida, selector de motor dual (**Patentes Tecnológicas** vs. **Literatura Científica OpenAlex**), barra de ruta metodológica JTBD (4 asistentes de 1 clic) y la barra flotante inferior de búsqueda/consulta.

### 2.2. Búsqueda Multifuente y Traza de Razonamiento (`Enter` vs `Shift/Alt + Enter`)
1. **Qué hace el usuario**: Escribe términos técnicos, ecuaciones booleanas o una pregunta conceptual en la barra flotante inferior y presiona `Enter` (o usa `Shift+Enter` / `Alt+Enter` para insertar saltos de línea).
2. **Qué procesa el sistema**:
   - Distingue si la entrada es una consulta conversacional/metodológica o una búsqueda documental.
   - Despliega inmediatamente el árbol de actividad del agente (**`AgentActivityTree`**) con cronómetro en vivo y pasos verificables.
   - Si es búsqueda de **Patentes**, consulta en paralelo Google Patents, Europe PMC (EPO/WIPO) y PatentBrief (`/api/patents`).
   - Si es búsqueda de **Literatura Científica**, consulta OpenAlex (`/api/literature`) devolviendo artículos arbitrados, estado Open Access y enlaces DOI/PDF.
   - Invoca al Agente Pericial (`/api/agent` con `gemini-2.5-flash`) para emitir el dictamen de Libertad de Operación (FTO), análisis de antecedentes y preguntas de autocrítica.
3. **Qué se muestra en pantalla**:
   - Arriba del listado: el **Panel Unificado de Dictamen Pericial** compilado en Markdown y LaTeX (`Marked.js` + `KaTeX`) con botones de acción interactivos (`Ejecutar búsqueda`, `Refinar por CPC`, `Cambiar modo`).
   - Debajo: las tarjetas de resultados con **divulgación progresiva** (resúmenes truncados a 3 líneas con botón *"Leer más ▾"*, traducción 1-clic al español, botón de fijado de documento semilla y botón `[? Consultar]`).

### 2.3. Inspección Técnica de Ficha y Visor PDF (Tanto en Patentes como en Literatura)
1. **Qué hace el usuario**: Hace clic en el título de cualquier patente o artículo científico, en el botón `Ficha y PDF ->`, o en el botón `[? Consultar]`.
2. **Qué procesa el sistema**:
   - Carga todos los metadatos del documento en `currentActivePatentData` (tanto para patentes como para artículos de OpenAlex).
   - En pantallas de escritorio (`>= 1100px`), actualiza la columna derecha fija (`#col-inspection`); en pantallas portátiles compactas o móviles (`< 1100px`), despliega suavemente el cajón lateral (`#patent-sidebar`).
3. **Qué se muestra en pantalla**:
   - Pestaña **Ficha**: Título completo, estado jurídico FTO o Acceso Abierto, titular/revista, inventores/autores, galería completa de láminas técnicas con zoom Lightbox, clasificaciones CPC o tópicos clicables, resumen traducible y botón `Explicar con Agente`.
   - Pestaña **PDF Oficial**: Visor de PDF embebido de la gaceta oficial o enlace directo al expediente.

### 2.4. Curación de Documentos Semilla y Exportación de Dossier Ejecutivo FTO
1. **Qué hace el usuario**: Marca con el icono de chincheta (`Guardar`) las patentes o artículos clave de su investigación y presiona **Dossier FTO** o **Exportar CSV**.
2. **Qué procesa el sistema**: Calcula métricas de Libertad de Operación (% Vigentes vs. % Dominio Público), ranking de titulares dominantes (Top Assignees), cobertura territorial y tabla ejecutiva auditable.
3. **Qué se muestra en pantalla**: El **Dossier Ejecutivo de Vigilancia Tecnológica** listo para imprimir en PDF o descargar en HTML autónomo.

---

## 3. Reglas de Negocio y Seguridad (Security by Design)
1. **Cero Credenciales Hardcodeadas**: Todas las claves (`GEMINI_API_KEY`, `SERPAPI_KEY`, `EPO_KEY`, `EPO_SECRET`, `LENS_TOKEN`) se leen exclusivamente desde variables de entorno en el servidor (`process.env` en Vercel / `.env` en desarrollo local) o desde el almacenamiento local del navegador del usuario si las configura manualmente.
2. **Sanitización Anti-XSS e Integridad de Eventos**: Todo dato proveniente de APIs externas se escapa con `escapeHtml` / `escapeJsAttr`, y las traducciones se resuelven por índice en memoria sin inyectar textos crudos en atributos HTML.
3. **Neutralidad de Dominio**: El agente pericial adapta sus ejemplos y análisis dinámicamente al proyecto activo del usuario sin imponer ejemplos prefabricados.

---

## 4. Criterios de Aceptación
- [x] Al presionar `Enter` en la barra flotante se envía la consulta una sola vez; `Shift+Enter` y `Alt+Enter` insertan salto de línea.
- [x] El árbol de pensamiento (`AgentActivityTree`) muestra los pasos y el tiempo de ejecución en tiempo real.
- [x] Tanto el motor de **Patentes Tecnológicas** como el de **Literatura Científica (OpenAlex)** renderizan tarjetas completas y actualizan el panel derecho de **Inspección Técnica y PDF**.
- [x] Cada tarjeta cuenta con botón de chincheta (`Guardar` / `Guardada`) conectado al filtro `Guardadas` del espacio de trabajo.
- [x] Los modales `+ Proyecto` y `Ampliar ficha en pantalla completa` abren y cierran correctamente.
- [x] Cero errores de sintaxis JS (`node --check`) y cero credenciales hardcodeadas en el repositorio.
