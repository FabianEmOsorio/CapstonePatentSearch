# Capstone Patent Search | Céntrika & Awake

Sistema de Vigilancia Tecnológica y Búsqueda de Patentes desarrollado para el proyecto Capstone (Universidad del Rosario & Awake).

Este módulo permite formular ecuaciones de búsqueda y consultar en vivo bases de datos de patentes a nivel mundial, extrayendo metadatos oficiales, números de publicación, titulares, resúmenes y documentos PDF.

---

## 1. Análisis de Viabilidad de APIs de Patentes

A continuación se presenta el dictamen técnico de viabilidad sobre las fuentes de patentes identificadas:

| Fuente / API | Cobertura | Viabilidad Técnica | Observaciones y Requisitos |
| :--- | :--- | :--- | :--- |
| **Google Patents (vía SerpApi)** | **Global (100+ países)** | **100% Inmediata (Implementada)** | Absorbe el corpus completo de Google Patents (USPTO, EPO, WIPO, China, Japón, Colombia). Resuelve el bypass de captchas perimetrales y entrega un JSON estructurado listo para producción. |
| **EPO OPS (Open Patent Services)** | Global (Oficina Europea) | **Media (Sprint 3)** | Es el estándar oficial más riguroso a nivel legal. Requiere registro en el portal de desarrolladores de la EPO y autenticación OAuth 2.0 con rotación de tokens cada 20 minutos. |
| **Lens.org API** | Global (140M+ patentes) | **Media** | Excelente agregador normalizado. Aunque ofrece acceso de investigación gratuito, la solicitud manual de API token toma entre 3 a 7 días hábiles de aprobación. |
| **USPTO Open Data Portal** | Estados Unidos | **Media** | Exclusivo de patentes estadounidenses. Requiere registro y generación de API Key en `data.uspto.gov`. |
| **Google Patents en BigQuery** | Global | **Baja para consultas ágiles** | Almacén masivo SQL. Requiere proyecto en Google Cloud (GCP) con tarjeta de crédito vinculada y consultas analíticas en SQL, no apto para búsquedas interactivas en tiempo real. |

---

## 2. Ejecución Local (Desarrollo)

El proyecto está diseñado bajo una arquitectura limpia con cero dependencias externas de Python (utiliza exclusivamente la librería estándar).

```bash
# 1. Clonar el repositorio
git clone https://github.com/FabianEmOsorio/CapstonePatentSearch.git
cd CapstonePatentSearch

# 2. Iniciar el servidor local
python server.py
```

Abra su navegador en: **`http://localhost:8080`**

---

## 3. Despliegue Rápido en la Nube (Vercel)

El repositorio incluye la configuración de servidor serverless (`api/patents.js` y `vercel.json`).

Para tener el sistema disponible en una URL pública (accesible desde cualquier computador, tablet o celular sin descargar archivos ni activar alertas de Windows Defender):

1. Ingrese a [vercel.com](https://vercel.com) e inicie sesión con su cuenta de GitHub.
2. Haga clic en **"Add New..."** &rarr; **"Project"**.
3. Seleccione el repositorio **`CapstonePatentSearch`** y haga clic en **"Deploy"**.
4. En 20 segundos obtendrá una URL pública segura (ej: `https://capstone-patent-search.vercel.app`) lista para presentar en vivo.

---

## 4. Estructura del Proyecto

```
CapstonePatentSearch/
├── index.html         # Interfaz web responsiva (Listado de tarjetas y Raw JSON)
├── server.py          # Servidor HTTP local en Python estándar
├── vercel.json        # Configuración de despliegue serverless
├── api/
│   └── patents.js     # Endpoint serverless para Vercel
├── LICENSE            # Licencia del proyecto
└── README.md          # Documentación técnica
```
