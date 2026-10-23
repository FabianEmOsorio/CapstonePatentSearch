# 📖 Glosario Técnico del Proyecto Capstone: Vigilancia de Patentes

Este diccionario técnico explica de forma sencilla y didáctica los términos clave de la arquitectura de software, búsqueda de patentes y diseño visual del proyecto.

---

## 1. Conceptos de Propiedad Intelectual y Patentes

- **Patente**: Título legal otorgado por un estado que da derecho exclusivo de explotación comercial sobre una invención por un tiempo limitado (usualmente 20 años).
- **Publicación (Publication Number)**: Código alfanumérico único oficial de la patente (ej. `US11234567B2`, `EP3456789A1`, `WO2021131121A1`).
  - El prefijo de 2 letras indica la jurisdicción: `US` (Estados Unidos), `EP` (Oficina Europea de Patentes), `WO` (Organización Mundial de la Propiedad Intelectual - PCT).
  - El sufijo indica el tipo de documento: `A1/A2` (solicitud publicada), `B1/B2` (patente concedida).
- **CPC (Cooperative Patent Classification)**: Sistema de clasificación internacional conjunto (EPO + USPTO) que categoriza inventos con precisión jerárquica (ej. `A43B` calzado, `H01L` dispositivos semiconductores o piezoeléctricos).
- **IPC (International Patent Classification)**: Sistema global estándar administrado por la OMPI (WIPO) para categorizar patentes en 8 secciones de la A a la H.
- **Abstract**: Resumen técnico oficial que describe la novedad y utilidad técnica de la invención.
- **Reivindicaciones (Claims)**: La sección legal más importante de la patente, donde se delimitan los límites exactos de la exclusividad protegida.
- **Titular (Assignee)**: La empresa o institución que ostenta los derechos patrimoniales sobre la patente (ej. Nike, Apple, Universidad del Rosario).
- **Inventor**: La persona o grupo humano que concibió la invención técnica.
- **Citas hacia adelante (Forward Citations)**: Cuántas patentes posteriores han citado esta patente. Es el principal indicador de **impacto tecnológico y popularidad** en el ecosistema.

---

## 2. Conceptos de Arquitectura de Software y Frontend

- **Tokens de Color Semánticos (CSS Variables)**: Variables en el código que representan el significado de un color (ej. `--brand-primary`, `--status-success`) en lugar de colores fijos. Permite cambiar temas completos (modo oscuro / claro) sin tocar el HTML.
- **FOUC (Flash of Unstyled Content)**: Parpadeo visual que ocurre cuando una página carga con colores claros antes de que el script aplique el modo oscuro. Se previene inicializando el tema inmediatamente en el `<head>`.
- **Query Multihilo (Multi-threaded Search)**: Patrón de arquitectura donde una consulta del usuario se envía en paralelo a varias fuentes al mismo tiempo (`ThreadPoolExecutor` en Python / `Promise.allSettled` en JavaScript), acelerando la respuesta y evitando bloqueos si una fuente tarda más que las demás.
- **Uptime / Health Check**: Monitor de disponibilidad en tiempo real que mide si los servidores externos de patentes están respondiendo adecuadamente (100% de operatividad).
- **Graceful Fallback**: Principio de resiliencia donde si un conector secundario falla, el sistema no colapsa ni muestra una pantalla en blanco, sino que continúa con las fuentes restantes de forma transparente para el usuario.
