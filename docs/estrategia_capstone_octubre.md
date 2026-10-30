# 🧭 Hoja de Ruta Estratégica: Capstone Patent & Literature Intelligence

**Fuentes**: Anotaciones de la sesión del sábado 24 de octubre de 2026 y grabación de pantalla del jueves 29 de octubre de 2026.  
**Equipo**: Fabián Osorio, Mariana Álvarez, Kevin Cruz, Lina Stefanía Peña &bull; **Tutor / Cliente**: José Ricardo Buitrago (Awake / Céntrika).

---

## 🔍 1. Radiografía: ¿Qué hace el sistema que José Ricardo mostró?

El flujo que José Ricardo maneja para sus consultorías (y que busca sistematizar en Capstone) se compone de **3 procesos interconectados**:

```
                  ┌────────────────────────────────────────────────────────┐
                  │          ENTRADA: Búsqueda en Bloque Multifuente        │
                  │   (Patentes: Google/EPO/PBrief  |  Literatura: OpenAlex)│
                  └───────────────────────────┬────────────────────────────┘
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      ▼                                               ▼
     ┌─────────────────────────────────┐             ┌─────────────────────────────────┐
     │  1. VIGILANCIA TECNOLÓGICA (VT) │             │  2. INTELIGENCIA DE NEGOCIO (BI)│
     │  - Análisis de patentabilidad    │             │  - Tendencias de mercado        │
     │  - Comparativa de antecedentes  │             │  - Competidores y alianzas      │
     │  - Identificar libre operación  │             │  - Nichos no explotados         │
     └────────────────┬────────────────┘             └────────────────┬────────────────┘
                      │                                               │
                      └───────────────────────┬───────────────────────┘
                                              │
                  ┌───────────────────────────▼────────────────────────────┐
                  │                 SALIDAS Y ENTREGABLES                 │
                  │ 1. Tablero HTML Interactivo (Offline + Visualizaciones)│
                  │ 2. Ficha de Traspaso y Borrador de Patente (Normas PCT)│
                  │ 3. Informe Ejecutivo en PPT / Word                     │
                  │ 4. Registro de Obra ante DNDA (Derechos de Autor)      │
                  └────────────────────────────────────────────────────────┘
```

---

## 📌 2. Los 7 Pilares Extraídos de tus Notas

### 1. Los Dos Motores HTML (Patentes vs. Literatura)
* **El malentendido resuelto**:
  * En la sesión anterior descartamos **OpenAlex** del buscador central de patentes porque OpenAlex *no indexa patentes oficiales*.
  * **Ahora todo cobra sentido**: José Ricardo maneja **DOS motores diferenciados**:
    1. **Motor de Patentes**: Para evaluar novedad e infracción legal (el que ya tenemos con Google Patents, Europe PMC y PatentBrief).
    2. **Motor de Literatura Científica**: Para artículos indexados, tesis y papers académicos de investigación (aquí es donde **SÍ entra OpenAlex**).
* **Acción para el proyecto**: Mantener la interfaz limpia con dos pestañas o selectores de contexto: `Patentes Tecnológicas` vs. `Literatura Científica (OpenAlex)`.

### 2. Proceso de Vigilancia Tecnológica (VT) y Antecedentes Cercanos
* Búsqueda en bloque de los documentos más relevantes.
* Identificación de qué invenciones afectan la novedad de la idea y cuáles permiten "libre operación" (patentes inactivas o vencidas).
* Comparativa sistemática de reivindicaciones y elementos técnicos (como la tabla de la sonda MEMS brasileña que mostró en pantalla).

### 3. Redacción de Patente Prototipo con Normas del Reglamento PCT (Reglas 11 a 13)
* **¿Qué son las Reglas 11 a 13 del PCT?**
  * **Regla 11**: Requisitos formales de los documentos (márgenes, formato de hoja, tipografía, figuras numeradas con trazo negro indeleble sin escalas de grises fotográficas).
  * **Regla 12**: Idioma de la solicitud internacional.
  * **Regla 13**: **Unidad de la invención** (la solicitud debe referirse a una sola invención o a un grupo de invenciones vinculadas entre sí).
* Con base en las patentes encontradas, el sistema asiste en redactar el documento borrador (título, campo técnico, antecedentes, descripción detallada y reivindicaciones preliminares).

### 4. Inteligencia de Negocios (BI) y Estudio de Mercado
* Analizar qué competidores están patentando (ej. alianzas Nike vs. Adidas vs. Skechers).
* Identificar en qué países NO están patentando para encontrar oportunidades de mercado local.

### 5. Generador de Preguntas de Autocrítica ("¿Qué fortalecer? ¿Qué corregir?")
* El sistema audita la invención del cliente contra los antecedentes encontrados y genera un cuestionario reflexivo:
  * *"La patente US... ya protege suelas con elastómero. ¿Cuál es su elemento diferenciador específico?"*

### 6. Modelos de IA: Perplexity, Claude y Gemini
* José Ricardo usa **Claude** y **Perplexity** para resumir y sintetizar las tablas.
* En nuestras notas se indica: *"se puede con Gemini"*.
* Podemos integrar **Gemini** (utilizando la API gratuita de Google o prompts estructurados) para automatizar la extracción de antecedentes y la generación de preguntas de patentabilidad.

### 7. Registro de Obra ante la Dirección Nacional de Derecho de Autor (DNDA)
* La empresa/universidad debe registrar el software y los entregables ante la **DNDA en Colombia**.
* **Requisito pendiente**: Idear y definir el nombre comercial/académico oficial del sistema para el formulario de registro de soporte lógico (software).

---

## 🚀 3. Matriz de Estado del Proyecto (Qué tenemos vs. Qué falta)

| Componente | Estado Actual en Capstone | Próximo Paso para Completar |
| :--- | :---: | :--- |
| **Buscador Central de Patentes** | ✅ **100% Funcional** (Google, Europe PMC, PatentBrief, filtros, shuffle, modo oscuro) | Desplegar en Vercel con el repo sincronizado. |
| **Visor y Ficha Técnica (Sidebar)** | ✅ **100% Funcional** (Dossier nativo + visor de PDF oficial) | Listo para demostración al tutor. |
| **Motor de Literatura Científica** | 🟡 **Pendiente** | Añadir conmutador para consultar **OpenAlex API** cuando el usuario quiera papers/artículos. |
| **Generador de Preguntas de Patentabilidad** | 🟡 **Pendiente** | Módulo que compare los 3 antecedentes más cercanos y genere el reporte "¿Qué corregir / reforzar?". |
| **Exportador de Informes (Word / PPT / HTML)** | 🟡 **Pendiente** | Botón para exportar el resumen ejecutivo de la búsqueda en formato amigable para el cliente. |
| **Nombre para Registro DNDA** | ⚪ **Por definir** | Proponer opciones al equipo y cliente. |
