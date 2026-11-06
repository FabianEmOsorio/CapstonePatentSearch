# Guía Oficial de Registro de Propiedad Intelectual para Software en Colombia (DNDA)

## Proyecto Capstone: Sistema de Vigilancia Tecnológica y Búsqueda de Patentes
**Universidad del Rosario &bull; Céntrika &bull; Awake &bull; Grupo 6 de Ingeniería**

---

## 1. Marco Jurídico: ¿Patente (SIC) o Derecho de Autor (DNDA)?

Existe una confusión común en el ámbito universitario e industrial: **asumir que el software se patenta**. En Colombia y la región andina, el marco legal funciona de la siguiente manera:

### A. ¿Por qué NO es una Patente ante la SIC?
* **Normativa**: **Decisión 486 de la Comunidad Andina de Naciones (CAN)** (Régimen Común sobre Propiedad Industrial aplicable a Colombia, Perú, Ecuador y Bolivia).
* **Artículo 15, literal e**: Establece expresamente que:
  > *«No se considerarán invenciones: [...] e) Los programas de ordenadores o el soporte lógico, en tanto que tales.»*
* **Excepción única**: Solo se puede patentar una invención implementada por computador (CII) si está ligada indisolublemente a un aparato físico o máquina y genera un **efecto técnico tangible en el mundo físico** (ej. un algoritmo embebido que controla los frenos ABS de un vehículo o la dosificación de un marcapasos).
* Para una plataforma web, motor de búsqueda, sistema de recomendación o aplicación de software como **CapstonePatentSearch**, la Superintendencia de Industria y Comercio (SIC) rechaza de plano solicitudes de patente por materia excluida.

### B. El Mecanismo Legal Correcto: Registro de Soporte Lógico ante la DNDA
* **Normativa**:
  * **Ley 23 de 1982** (Ley de Derechos de Autor de Colombia).
  * **Decisión 351 de la CAN** (Régimen Común sobre Derecho de Autor y Derechos Conexos).
  * **Decreto 1360 de 1989** (Reglamentario de la inscripción de soporte lógico / software).
* **Naturaleza**: En Colombia, el software se protege bajo el régimen de **Derecho de Autor**, asimilado a una **obra literaria**.
* **Entidad Gubernamental Oficial**: **Dirección Nacional de Derecho de Autor (DNDA)**, Unidad Administrativa Especial adscrita al Ministerio del Interior de Colombia.
* **Costo**: **100% GRATUITO**.
* **Tiempo de Respuesta**: **15 días hábiles** tras la radicación virtual, expidiendo el Certificado de Registro Oficial con número de partida y tomo.

---

## 2. Diferencia entre Derechos Morales y Derechos Patrimoniales

En el contexto de un proyecto de grado en la Universidad del Rosario:

| Tipo de Derecho | ¿Qué protege? | ¿A quién pertenece? | ¿Es transferible? |
|---|---|---|---|
| **Derecho Moral** | Paternidad de la obra (reconocimiento como autores o creadores intelectuales) e integridad. | **Estudiantes** (Fabián Osorio, Mariana Álvarez, Kevin Cruz, Lina Peña). | **NO**. Es inalienable, irrenunciable y perpetuo (Art. 30 Ley 23/1982). |
| **Derecho Patrimonial** | Facultad de explotar económicamente, licenciar, vender o comercializar el software. | Depende del reglamento de PI de la Universidad (generalmente la titularidad patrimonial pertenece a la Universidad del Rosario o se comparte si hubo financiación/convenio con Céntrika/Awake). | **SÍ**. Se puede ceder o licenciar mediante contrato. |

---

## 3. Elementos Necesarios para la Radicación Virtual

Para diligenciar el trámite en la plataforma oficial, el grupo debe tener listos los siguientes 3 archivos digitales:

1. **Código Fuente del Software (Programa de Computador)**:
   * Archivo comprimido `.zip` con el repositorio limpio (sin `node_modules`, sin claves privadas `.env`, sin archivos temporales).
   * Contiene `index.html`, `server.py`, `api/agent.js`, `api/patents.js`, `api/literature.js`.
2. **Descripción del Software y Arquitectura Técnica**:
   * Documento PDF que explique:
     * Título de la obra: *«Sistema de Vigilancia Tecnológica, Búsqueda de Patentes y Asesoría Pericial con Inteligencia Artificial (CapstonePatentSearch)»*.
     * Versión: `1.0.0`.
     * Año de creación: `2026`.
     * Lenguajes utilizados: JavaScript (ES6+ / Node.js), Python 3, HTML5, CSS3.
     * Funcionalidades principales: Conexión concurrente a Google Patents, Europe PMC (EPO), PatentBrief y OpenAlex; dictamen pericial automatizado FTO y descomposición E-T-S.
3. **Manual de Usuario / Material Auxiliar**:
   * Archivo PDF derivado de `docs/comportamiento_esperado.md`, detallando los flujos paso a paso, los botones de la interfaz, el comparador de patentes y las reglas de negocio.

---

## 4. Paso a Paso en la Plataforma Virtual de la DNDA

1. **Acceso al Portal Oficial**:
   * Ingresar a **[www.registroenlinea.gov.co](https://www.registroenlinea.gov.co)**.
2. **Registro de Usuario**:
   * Si no tienen cuenta, hacer clic en *"Regístrese"* como Persona Natural con los datos del líder del proyecto (ej. Fabián Osorio).
3. **Selección del Trámite**:
   * En el menú principal, seleccionar: **"Inscripción de Obras"** &rarr; **"Soporte Lógico (Software)"**.
4. **Paso 1: Datos del Solicitante**:
   * Datos de la persona que radica el formulario (nombre, cédula, dirección, teléfono y correo electrónico).
   * Indicar si actúa en nombre propio o como representante.
5. **Paso 2: Datos del Autor o Coautores**:
   * Agregar a cada uno de los integrantes del equipo como **Coautores**:
     * Fabián Esteban Osorio
     * Mariana Álvarez
     * Kevin Cruz
     * Lina Peña
   * Especificar documento de identidad y nacionalidad colombiana de cada uno.
6. **Paso 3: Datos de la Obra**:
   * **Título**: *Sistema de Vigilancia Tecnológica y Búsqueda de Patentes (Capstone)*.
   * **Año de Creación**: *2026*.
   * **¿Obra Inédita o Publicada?**: Inédita (o publicada si ya se encuentra en producción accesible en la web).
   * **País de Origen**: Colombia.
7. **Paso 4: Transferencia de Derechos y Archivos Adjuntos**:
   * Si la Universidad del Rosario figura como titular patrimonial, se adjunta el formato de cesión o se declara conforme a los estatutos académicos.
   * Adjuntar el archivo `.zip` con el código fuente y el PDF con la descripción técnica y manual.
8. **Radicación y Constancia**:
   * Enviar la solicitud. El sistema genera un **Número de Radicado oficial** (ej. `1-2026-XXXXX`).
   * Guardar el comprobante PDF para entregarlo al profesor como evidencia de cumplimiento.
9. **Expedición del Certificado**:
   * Transcurridos 15 días hábiles, la DNDA emite el certificado digital firmado con validez jurídica nacional e internacional (Convenio de Berna).

---

## 5. Resumen para Responder al Profesor

> *"Profesor, de acuerdo con la **Decisión 486 de la Comunidad Andina (Art. 15 literal e)**, el software puro no es patentable en Colombia ante la SIC, sino que se protege formalmente como **Soporte Lógico (Software) bajo el régimen de Derechos de Autor ante la Dirección Nacional de Derecho de Autor (DNDA)** mediante la plataforma estatal gratuita `registroenlinea.gov.co` (Ley 23 de 1982 y Decreto 1360 de 1989).*
>
> *Ya tenemos preparados los 3 componentes exigidos por la DNDA: 1) el paquete de código fuente comprimido, 2) el documento de arquitectura técnica y 3) el manual de usuario y comportamiento esperado, listos para radicar el formulario en línea reconociendo los derechos morales del equipo y patrimoniales de la Universidad."*
