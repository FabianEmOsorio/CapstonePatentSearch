# 🎨 Sistema de Diseño y Paleta de Colores: "Céntrika Spectrum & Antigravity Obsidian"

Este documento formaliza el sistema de color y diseño visual implementado en la plataforma de vigilancia y búsqueda de patentes **Capstone Awake - Céntrika** (Universidad del Rosario).

La paleta fue diseñada tomando como referencia la interfaz de **Google Antigravity (AGY)** y las mejores prácticas de ergonomía visual para investigadores de patentes que pasan horas analizando textos técnicos densos y láminas mecánicas.

---

## 1. Principios del Sistema de Color

1. **Ergonomía Visual y Fatiga Cero**: Fondo oscuro obsidiana (`#0d1117` / `#161b22`) que reduce el brillo estresante del monitor, permitiendo lectura prolongada de reivindicaciones y abstracts.
2. **Jerarquía Semántica Inconfundible**: Cada fuente de patentes (Google, Europe PMC, PatentBrief) tiene una identidad cromática única para que el investigador reconozca de inmediato el origen del documento.
3. **Contraste Accesible (WCAG AA / AAA)**: Ratios de contraste superiores a 7:1 en textos principales y 4.5:1 en elementos secundarios sobre sus fondos correspondientes.
4. **Dualidad Dinámica (Dark / Light)**: Soporte nativo para alternancia de tema persistente en `localStorage`. Quien prefiera fondo blanco para auditoría o impresión puede alternar a *Modo Claro (Crisp Slate)* con un solo clic.

---

## 2. Tokens de Color Semánticos (CSS Variables)

### 2.1 Marca y Acentos Principales
| Token CSS | Color | HEX | Rol en la Interfaz |
| :--- | :---: | :---: | :--- |
| `--brand-primary` | 🟦 | `#0091ff` | Botón circular de envío (Antigravity Send), foco activo y enlaces principales. |
| `--brand-primary-hover` | 🟦 | `#0077d6` | Estado hover de botones y elementos interactivos primarios. |
| `--brand-glow` | 💠 | `rgba(0,145,255,0.35)` | Resplandor perimetral de búsqueda activa en el prompt box. |
| `--intel-purple` | 🟪 | `#a855f7` | Clasificaciones CPC/IPC, insignias de vigilancia tecnológica y chips de clase. |
| `--intel-purple-bg` | 🟪 | `rgba(168,85,247,0.12)` | Fondo del desplegable de inteligencia de patentes. |

### 2.2 Identidad Cromática por Fuente de Patentes
| Fuente | Token CSS | HEX / Valor | Propósito |
| :--- | :--- | :---: | :--- |
| **Google Patents** | `--src-google`<br>`--src-google-bg` | `#38bdf8`<br>`rgba(56,189,248,0.14)` | **Sky Cyan**: Identifica las patentes de la red mundial oficial (120M+ documentos). |
| **Europe PMC (EPO/WIPO)** | `--src-europepmc`<br>`--src-europepmc-bg` | `#fbbf24`<br>`rgba(251,191,36,0.14)` | **Amber Gold**: Identifica patentes europeas (EP) y del tratado PCT (WO). |
| **PatentBrief** | `--src-patentbrief`<br>`--src-patentbrief-bg` | `#34d399`<br>`rgba(52,211,153,0.14)` | **Emerald Mint**: Identifica resúmenes amigables y etiquetas industriales. |

### 2.3 Estados del Sistema
| Token CSS | Color | HEX | Significado |
| :--- | :---: | :---: | :--- |
| `--status-success` | 🟢 | `#22c55e` | Disponibilidad 100% Online, anillo de salud y patentes concedidas/activas. |
| `--status-warning` | 🟡 | `#f59e0b` | Conectores en validación (EPO OPS) y patentes en trámite/pendientes. |
| `--status-danger` | 🔴 | `#ef4444` | Descarga de PDF oficial, errores de red y patentes descontinuadas. |

---

## 3. Comparativa entre Modos (Dark vs. Light)

```
+------------------------+--------------------------+--------------------------+
| Token                  | Modo Oscuro (Obsidian)   | Modo Claro (Slate)       |
+------------------------+--------------------------+--------------------------+
| --bg-canvas            | #0d1117 (Negro Obsidiana)| #f8fafc (Gris Pizarra)   |
| --bg-surface           | #161b22 (Gris Carbón)    | #ffffff (Blanco Puro)    |
| --bg-elevated          | #1e242e (Superficie Pop) | #ffffff (Blanco Sombra)  |
| --bg-subtle            | #21262d (Insignias/Tags) | #f1f5f9 (Gris Claro)     |
| --border-color         | #30363d (Borde Sutil)    | #e2e8f0 (Línea Divisoria)|
| --text-high            | #f0f6fc (Blanco Hielo)   | #0f172a (Azul Muy Oscuro)|
| --text-medium          | #cbd5e1 (Gris Plata)     | #334155 (Gris Carbón)    |
| --text-muted           | #8b949e (Gris Neutro)    | #64748b (Gris Medio)     |
+------------------------+--------------------------+--------------------------+
```

---

## 4. Implementación Técnica

- **Persistencia**: La preferencia del usuario se almacena en `localStorage.getItem('capstone-theme')`.
- **Renderizado sin parpadeo (FOUC)**: El tema se inicializa en una función IIFE autoejecutable antes del montaje de los componentes.
- **Transiciones fluidas**: Suavizado global de `transition: background-color 0.2s ease, border-color 0.2s ease` para que el cambio de tema no sea abrupto para el usuario.
