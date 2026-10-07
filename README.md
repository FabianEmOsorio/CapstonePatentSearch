# Capstone Patent Search | Céntrika & Awake

Sistema de Vigilancia Tecnológica y Búsqueda de Patentes desarrollado para el proyecto Capstone (Universidad del Rosario & Awake).

Este módulo permite formular ecuaciones de búsqueda, consultar en vivo bases de datos de patentes a nivel mundial (Google Patents, The Lens API y EPO OPS), explorar clasificaciones CPC/IPC para refinamiento metodológico, visualizar láminas técnicas e inspeccionar el consumo de APIs en tiempo real.

---

## 1. Características Principales

* **Consulta Multi-fuente:**
  * **Google Patents (SerpApi):** Cobertura mundial completa con extracción de figuras técnicas y resumen de CPCs.
  * **The Lens API:** Agregador normalizado con token institucional configurado (`ProyectoCapstone`).
  * **EPO OPS:** Estándar oficial de la Oficina Europea de Patentes (en proceso de validación administrativa).
* **Medidor de Consumo de APIs en Vivo:** Visualización del porcentaje de cuota y valores numéricos consumidos/restantes por cada proveedor (`/api/usage`).
* **Inteligencia de Vigilancia Tecnológica (CPC/IPC):** Detección automática de las clasificaciones más frecuentes en cada búsqueda con refinamiento en 1 clic (segunda búsqueda por similitud de clase).
* **Previsualización de Láminas Técnicas (Fig. 1):** Extracción de dibujos y diagramas con visor ampliado (lightbox) para agilizar la revisión visual rápida.
* **Traducción Instantánea de Abstract:** Botón de traducción al español con alternador para ver el texto original en inglés al instante (`/api/translate`).
* **100% Responsivo para Celular:** Optimizado para smartphones y tablets sin necesidad de instalar aplicaciones nativas.

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

## 3. Despliegue en la Nube (Vercel)

El repositorio incluye la configuración de endpoints serverless (`api/patents.js`, `api/usage.js`, `api/translate.js` y `vercel.json`).

Para tener el sistema disponible en una URL pública (accesible desde cualquier computador, tablet o celular):

1. Ingrese a [vercel.com](https://vercel.com) e inicie sesión con su cuenta de GitHub.
2. Haga clic en **"Add New..."** &rarr; **"Project"**.
3. Seleccione el repositorio **`CapstonePatentSearch`** y haga clic en **"Deploy"**.
4. En 20 segundos obtendrá una URL pública segura lista para presentar en clase y a los directivos de Awake.

---

## 4. Estructura del Proyecto

```
CapstonePatentSearch/
├── index.html         # Interfaz web responsiva estilo Lens.org + medidor de consumo
├── server.py          # Servidor HTTP local en Python estándar con APIs
├── vercel.json        # Rutas y configuración de despliegue en Vercel
├── api/
│   ├── patents.js     # Endpoint unificado de búsqueda multi-fuente
│   ├── usage.js       # Medidor de cuota de APIs en vivo
│   └── translate.js   # Traductor instantáneo de abstracts
├── LICENSE            # Licencia del proyecto
└── README.md          # Documentación técnica
```
