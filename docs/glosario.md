# Glosario Técnico del Proyecto Capstone: Vigilancia de Patentes y Literatura Científica

Este diccionario técnico explica de forma sencilla y didáctica los términos clave de propiedad intelectual, metodología de vigilancia tecnológica (JTBD) y arquitectura de software del proyecto.

---

## 1. Conceptos de Propiedad Intelectual, Vigilancia Tecnológica y JTBD

- **JTBD (Job to be Done)**: Marco metodológico que define la tarea central del usuario: *«Gestionar documentación técnica disponible a partir de fuentes documentales heterogéneas, transformándola en patrones de búsqueda estructurados sobre bases de patentes y repositorios académicos abiertos, para dar soporte a informes terminados sobre el estado de la tecnología y decisiones estratégicas»*.
- **Metodología E-T-S (Entidad - Tecnología - Solución)**: Patrón de descomposición de un problema técnico en tres bloques de sinónimos en inglés unidos por operadores booleanos (`(Sin1 OR Sin2) AND (Tec1 OR Tec2) AND CPC`) para recuperar patentes sin ruido documental.
- **Filtro Cero (Literatura Científica - OpenAlex)**: Fase preliminar de exploración en artículos científicos arbitrados y preprints (250M+ obras en OpenAlex) para comprender el estado de la ciencia antes de auditar patentes comerciales.
- **FTO (Freedom to Operate / Libertad de Operación)**: Evaluación jurídica y técnica que determina si un producto o proceso puede fabricarse y comercializarse en un país sin infringir patentes vigentes de terceros.
- **Dominio Público (FTO Libre)**: Estado en el que una patente expiró (tras 20 años), fue abandonada o caducó por falta de pago de tasas. Su tecnología puede ser utilizada, reproducida y comercializada libremente sin pagar regalías.
- **Diseño Alrededor (Design Around)**: Estrategia de ingeniería para modificar la arquitectura de un producto de modo que resuelva el mismo problema técnico sin caer dentro del alcance de las reivindicaciones de una patente vigente.
- **Reglas 11 a 13 del Reglamento PCT**: Normativa internacional que regula los requisitos formales de las solicitudes de patente (márgenes, dibujos técnicos de línea negra sin color, unidad de invención y estructura de reivindicaciones independientes y dependientes).
- **Documentos Semilla (Pinned Patents)**: Patentes o artículos clave que el investigador fija (guarda con chincheta) dentro de su Espacio de Trabajo porque representan el antecedente más cercano o la base de su informe ejecutivo.
- **Patente**: Título legal otorgado por un Estado que confiere el derecho exclusivo de explotación comercial sobre una invención por un tiempo determinado (usualmente 20 años) dentro de ese territorio.
- **Publicación (Publication Number)**: Código alfanumérico oficial de una patente (ej. `US11234567B2`, `EP3456789A1`, `WO2021131121A1`). El prefijo indica la oficina (`US`, `EP`, `WO`) y el sufijo el tipo de publicación (`A1` solicitud publicada, `B2` patente concedida).
- **CPC (Cooperative Patent Classification)**: Clasificación jerárquica conjunta (EPO + USPTO) que categoriza el problema técnico específico de una invención (ej. `H01M` baterías y celdas electroquímicas, `A61B` diagnóstico médico).
- **Principio de Territorialidad**: Las patentes solo protegen en los países donde fueron solicitadas y concedidas. Una patente concedida únicamente en EE.UU. (`US`) no impide su uso comercial en Colombia a menos que tenga extensión nacional vigente ante la SIC.

---

## 2. Conceptos de Arquitectura de Software, Seguridad y Experiencia de Usuario (UI/UX)

- **Divulgación Progresiva (Progressive Disclosure)**: Patrón de diseño UI/UX que presenta inicialmente los datos esenciales de alta señal en cada tarjeta (estado FTO, titular, clasificación CPC y resumen truncado a 3 líneas con botón *"Leer más"*) y despliega el expediente exhaustivo (galería de figuras, metadatos completos y visor PDF) en el panel derecho de inspección bajo demanda, evitando abrumar visualmente al investigador.
- **Traza de Razonamiento del Agente (`AgentActivityTree`)**: Componente interactivo que muestra paso a paso qué está ejecutando y analizando el agente de IA en tiempo real con cronómetro en vivo y desglose colapsable, brindando transparencia del estado del sistema (*Visibility of System Status*).
- **Compilación Híbrida Markdown + LaTeX (`Marked.js` + `KaTeX`)**: Pipeline de renderizado en el navegador que transforma texto estructurado y fórmulas matemáticas (`$...$` y `$$...$$`) del agente en tipografía científica limpia y legible.
- **Sanitización contra XSS y Resolución por Índice**: Buenas prácticas de seguridad (*Security by Design*) donde las entradas externas se escapan mediante entidades HTML seguras (`escapeHtml` / `escapeJsAttr`) y los botones de traducción consultan el estado en memoria por su índice (`idx`) en lugar de inyectar cadenas largas en atributos `onclick`.
- **Variables de Entorno (`.env` / Vercel Secrets)**: Separación estricta entre el código fuente y las credenciales privadas (`GEMINI_API_KEY`, `SERPAPI_KEY`, `EPO_KEY`, `LENS_TOKEN`), garantizando cero secretos hardcodeados en el repositorio Git.
