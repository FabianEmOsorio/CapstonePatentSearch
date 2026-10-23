# 📋 Comportamiento Esperado: Buscador y Vigilancia de Patentes

**Proyecto**: Capstone Patent Search (Grupo 6 &bull; Céntrika &bull; Awake &bull; Universidad del Rosario)  
**Cliente / Tutor**: José Ricardo Buitrago  

---

## 1. Objetivo y Contexto

Resolver la dispersión y complejidad en la búsqueda de patentes tecnológicas, centralizando en una única interfaz amigable y ergonómica (inspirada en Google Antigravity) consultas a múltiples bases de datos de propiedad intelectual (Google Patents, Europe PMC / EPO / WIPO y PatentBrief).

---

## 2. Flujo Paso a Paso de la Interfaz

1. **Carga Inicial**:
   - La aplicación detecta el tema preferido (`dark` u `light`) desde `localStorage` y lo aplica sin parpadeos.
   - Realiza una búsqueda automática de prueba (`piezoelectric footwear`) para que el evaluador no reciba una pantalla vacía.
   - El monitor de salud muestra `Fuentes 100% Online` con el pulso verde.
2. **Entrada de Consulta (Prompt Box)**:
   - El usuario ingresa términos técnicos o palabras clave en el área de texto de 2 líneas.
   - El botón circular `(→)` a la derecha se ilumina en azul eléctrico `--brand-primary` al detectar texto.
   - Al presionar `Enter` o hacer clic en el botón circular, se dispara la consulta multihilo.
3. **Selección de Fuente y Filtros**:
   - Píldora `+ Fuente`: Permite alternar entre *Todas las fuentes*, *Google Patents*, *Europe PMC* o *PatentBrief*.
   - Píldora `⚙️ Orden / Filtros`: Permite ordenar por *Relevancia*, *Más Recientes* o *Más Citadas / Impacto*, y filtrar por *Solo con Lámina Técnica* o *Últimos 5 años*.
4. **Presentación de Resultados**:
   - Cada tarjeta muestra la insignia de la fuente con su color distintivo (Cyan, Ámbar o Verde Esmeralda).
   - Incluye el número de patente, titular, inventor, fechas y, si está disponible en PatentBrief, un *Resumen en Lenguaje Sencillo* con etiquetas de industria.
   - Las clasificaciones CPC permiten refinamiento instantáneo con un solo clic.
   - Botón de traducción para pasar el abstract del inglés al español de forma instantánea.
5. **Alternancia de Tema**:
   - Al pulsar el botón `🌙 Modo Oscuro` / `☀️ Modo Claro` en el encabezado, toda la interfaz conmuta entre la paleta Obsidian Antigravity y la paleta Slate Tecnológica.

---

## 3. Reglas de Negocio

- **Cero audio y cero almacenamiento masivo**: No se guarda información privada en disco ni se transmiten grabaciones.
- **100% Patentes Tecnológicas**: Exclusión de tesis, artículos académicos genéricos o literatura no patentaria en la búsqueda central.
- **Resiliencia Operativa**: Si una fuente remota presenta timeout o latencia, las demás fuentes entregan sus resultados sin interrumpir la experiencia.

---

## 4. Criterios de Aceptación

- [x] Conexión activa a 3 motores de patentes en paralelo (Google Patents XHR, Europe PMC, PatentBrief).
- [x] Prompt Box estilo Google Antigravity con textarea, barra de herramientas y botón circular azul.
- [x] Monitor de salud y disponibilidad con anillo verde al 100%.
- [x] Paleta de colores formalizada y aplicada a todos los componentes.
- [x] Conmutador de tema oscuro / claro persistente en `localStorage`.
- [x] Visualizador de láminas técnicas en ventana emergente (modal).
- [x] Desplegable de inteligencia CPC para refinamiento de ecuaciones.
