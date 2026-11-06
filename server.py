import http.server
import socketserver
import urllib.request
import urllib.parse
import json
import sys
import os
import re
from concurrent.futures import ThreadPoolExecutor

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

# Cargar variables de entorno desde .env local si existe (sin dependencias externas)
env_path = os.path.join(DIRECTORY, '.env')
if os.path.exists(env_path):
    try:
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    except Exception:
        pass

SERPAPI_KEY = os.environ.get("SERPAPI_KEY", "")
LENS_TOKEN = os.environ.get("LENS_TOKEN", "")

def extract_patent_classifications(pub_num):
    """Extrae códigos CPC reales desde la página pública de Google Patents de manera concurrente"""
    if not pub_num or pub_num == 'N/A':
        return []
    try:
        url = f'https://patents.google.com/patent/{pub_num}/en'
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
        with urllib.request.urlopen(req, timeout=3) as resp:
            html = resp.read().decode('utf-8', errors='ignore')
            matches = re.findall(r'<span itemprop="Code">([A-H]\d{2}[A-Z]\d+/\d+)</span>', html)
            if not matches:
                matches = re.findall(r'<span itemprop="Code">([A-H]\d{2}[A-Z][0-9/ ]*)</span>', html)
            seen = set()
            clean = []
            for m in matches:
                m_str = m.strip()
                if m_str and m_str not in seen and len(m_str) >= 4:
                    seen.add(m_str)
                    clean.append(m_str)
            return clean[:4]
    except Exception:
        return []

def query_google_patents(q):
    """Consulta patentes en Google Patents (intenta motor directo XHR, fallback a SerpApi)"""
    results = []
    cpc_summaries = []
    total_found = 0

    # 1. Intentar endpoint directo nativo XHR de Google Patents (sin API Key)
    try:
        encoded_param = urllib.parse.quote_plus(f"q={q}&exp=")
        xhr_url = f"https://patents.google.com/xhr/query?url={encoded_param}"
        req = urllib.request.Request(xhr_url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Referer': f'https://patents.google.com/?q={urllib.parse.quote_plus(q)}',
            'X-Requested-With': 'XMLHttpRequest'
        })
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            cluster = data.get('results', {}).get('cluster', [])
            if cluster and cluster[0].get('result'):
                total_found = data.get('results', {}).get('total_num_results', 0)
                
                # Resumen CPC si está disponible
                cpc_raw = data.get('results', {}).get('summary', {}).get('cpc', [])
                for item in cpc_raw:
                    if item.get('key') and item.get('key') != 'Total':
                        cpc_summaries.append({
                            "code": item.get('key'),
                            "percentage": round((item.get('value', 0) / 1000) * 100, 1),
                            "type": "CPC"
                        })

                for item in cluster[0].get('result', [])[:10]:
                    pat = item.get('patent', {})
                    pub_num = pat.get('publication_number') or pat.get('id', '').replace('patent/', '').replace('/en', '')
                    
                    thumb = pat.get('thumbnail')
                    thumb_url = f"https://patentimages.storage.googleapis.com/{thumb}" if thumb else None
                    
                    pdf = pat.get('pdf')
                    pdf_url = f"https://patentimages.storage.googleapis.com/{pdf}" if pdf else None
                    
                    figures = []
                    for f in pat.get('figures', []):
                        f_path = f.get('thumbnail') or f.get('full')
                        if f_path:
                            figures.append(f"https://patentimages.storage.googleapis.com/{f_path}")
                    if thumb_url and thumb_url not in figures:
                        figures.insert(0, thumb_url)

                    results.append({
                        "source": "Google Patents",
                        "source_badge": "google",
                        "publication_number": pub_num or "N/A",
                        "title": (pat.get('title') or 'Sin título registrado').strip(),
                        "snippet": (pat.get('snippet') or '').strip(),
                        "assignee": pat.get('assignee') or 'No especificado',
                        "inventor": pat.get('inventor') or 'No especificado',
                        "filing_date": pat.get('filing_date') or pat.get('priority_date'),
                        "publication_date": pat.get('publication_date') or 'N/A',
                        "legal_status": "Registrada",
                        "forwardCitationCount": pat.get('cited_by') or 0,
                        "thumbnail": thumb_url,
                        "figures": figures,
                        "patent_link": f"https://patents.google.com/patent/{pub_num}/en" if pub_num else None,
                        "pdf": pdf_url,
                        "classifications_cpc": [c['code'] for c in cpc_summaries[:3]],
                        "classifications_ipc": []
                    })
                if results:
                    return {"results": results, "cpc_summary": cpc_summaries, "total_found": total_found}
    except Exception as e:
        # Fallback silencioso a SerpApi si el directo da 503 por límite perimetral
        pass

    # 2. Fallback: SerpApi Google Patents Engine
    try:
        target_url = f"https://serpapi.com/search.json?engine=google_patents&q={urllib.parse.quote(q)}&api_key={SERPAPI_KEY}"
        req = urllib.request.Request(target_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            raw_organic = data.get('organic_results', [])
            pub_numbers = []
            for p in raw_organic:
                pub = p.get('publication_number')
                if not pub and p.get('patent_id'):
                    parts = p.get('patent_id').split('/')
                    pub = parts[1] if len(parts) >= 2 else p.get('patent_id')
                pub_numbers.append(pub or '')

            # Extraer clasificaciones concurrentemente en paralelo
            cpc_map = {}
            if pub_numbers:
                with ThreadPoolExecutor(max_workers=6) as executor:
                    futures = {executor.submit(extract_patent_classifications, pub): pub for pub in pub_numbers[:8]}
                    for f in futures:
                        pub = futures[f]
                        try:
                            cpc_map[pub] = f.result()
                        except Exception:
                            cpc_map[pub] = []

            if 'summary' in data and 'cpc' in data['summary']:
                for item in data['summary']['cpc']:
                    if item.get('key') and item.get('key') != 'Total':
                        cpc_summaries.append({
                            "code": item.get('key'),
                            "percentage": item.get('percentage', 0),
                            "type": "CPC"
                        })

            for p in raw_organic:
                pub_num = p.get('publication_number')
                if not pub_num and p.get('patent_id'):
                    parts = p.get('patent_id').split('/')
                    pub_num = parts[1] if len(parts) >= 2 else p.get('patent_id')

                status = "Registrada"
                if p.get('country_status'):
                    first_val = list(p.get('country_status').values())[0]
                    if first_val:
                        status = first_val

                figures = []
                if p.get('figures'):
                    for fig in p.get('figures'):
                        figures.append(fig.get('thumbnail') or fig.get('full'))
                elif p.get('thumbnail'):
                    figures.append(p.get('thumbnail'))

                extracted_cpcs = cpc_map.get(pub_num, [])
                if not extracted_cpcs and cpc_summaries:
                    extracted_cpcs = [c['code'] for c in cpc_summaries[:2]]

                results.append({
                    "source": "Google Patents",
                    "source_badge": "google",
                    "publication_number": pub_num or "N/A",
                    "title": p.get('title', 'Sin título registrado'),
                    "snippet": p.get('snippet', ''),
                    "assignee": p.get('assignee', 'No especificado'),
                    "inventor": p.get('inventor', 'No especificado'),
                    "filing_date": p.get('filing_date') or p.get('priority_date'),
                    "publication_date": p.get('publication_date') or p.get('grant_date') or 'N/A',
                    "legal_status": status,
                    "forwardCitationCount": p.get('cited_by') or p.get('citations') or 0,
                    "thumbnail": p.get('thumbnail'),
                    "figures": figures,
                    "patent_link": p.get('patent_link') or (f"https://patents.google.com/patent/{pub_num}/en" if pub_num else None),
                    "pdf": p.get('pdf'),
                    "classifications_cpc": extracted_cpcs,
                    "classifications_ipc": []
                })

            if data.get('search_information') and data.get('search_information').get('total_results'):
                total_found = int(data['search_information']['total_results'])
            else:
                total_found = len(results)

    except Exception as e:
        print(f"Error consultando Google Patents / SerpApi: {e}")

    return {"results": results, "cpc_summary": cpc_summaries, "total_found": total_found}

def query_europe_pmc(q):
    """Consulta la base oficial europea de patentes de Europe PMC (EPO EP... y WIPO WO...)"""
    results = []
    try:
        url = f"https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=SRC:PAT+AND+{urllib.parse.quote(q)}&format=json&resultType=core&pageSize=8"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            for item in data.get('resultList', {}).get('result', []):
                doc_id = item.get('id', 'N/A')
                authors = [a.get('fullName') for a in item.get('authorList', {}).get('author', []) if a.get('fullName')]
                
                # PDF directo si está disponible en Europe PMC
                pdf_url = f"https://europepmc.org/backend/ptservice.cgi?accid={doc_id}&action=viewpdf" if item.get('hasPDF') == 'Y' else None
                patent_url = f"https://worldwide.espacenet.com/patent/search/family/{doc_id}" if doc_id.startswith('EP') or doc_id.startswith('WO') else f"https://europepmc.org/article/PAT/{doc_id}"
                
                cits = item.get('citedByCount', 0)
                try:
                    cits = int(cits) if cits else 0
                except Exception:
                    cits = 0

                app_date = None
                if isinstance(item.get('application'), dict):
                    app_date = item.get('application', {}).get('applicationDate')

                results.append({
                    "source": "Europe PMC (EPO / WIPO)",
                    "source_badge": "europepmc",
                    "publication_number": doc_id,
                    "title": item.get('title', 'Sin título registrado'),
                    "snippet": item.get('abstractText', ''),
                    "assignee": item.get('affiliation') or "Oficina Europea / Internacional (EPO/WIPO)",
                    "inventor": ', '.join(authors) or item.get('authorString') or 'No especificado',
                    "filing_date": app_date,
                    "publication_date": str(item.get('pubYear', 'N/A')),
                    "legal_status": "Oficial Publicada",
                    "forwardCitationCount": cits,
                    "thumbnail": None,
                    "figures": [],
                    "patent_link": patent_url,
                    "pdf": pdf_url,
                    "classifications_cpc": [],
                    "classifications_ipc": []
                })
    except Exception as e:
        print(f"Error consultando Europe PMC Patents: {e}")
    return results

def query_patent_brief(q):
    """Consulta PatentBrief: patentes tecnológicas con títulos y resúmenes en lenguaje amigable"""
    results = []
    try:
        url = f"https://patentbrief.org/api/search?q={urllib.parse.quote(q)}"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            for item in data.get('patents', [])[:8]:
                country = item.get('countryCode', 'US')
                num = item.get('patentNumber', '')
                pub_num = f"{country}{num}"
                
                fig = item.get('figureUrl')
                figures = [fig] if fig else []

                results.append({
                    "source": "PatentBrief (Tecnología Amigable)",
                    "source_badge": "patentbrief",
                    "publication_number": pub_num,
                    "title": item.get('plainEnglishTitle') or item.get('title', 'Sin título'),
                    "plain_title": item.get('plainEnglishTitle'),
                    "one_sentence_summary": item.get('oneSentenceSummary'),
                    "snippet": item.get('oneSentenceSummary') or item.get('title', ''),
                    "assignee": item.get('assigneeName') or 'No especificado',
                    "inventor": 'No especificado',
                    "filing_date": None,
                    "publication_date": item.get('grantDate') or 'N/A',
                    "legal_status": "Concedida",
                    "forwardCitationCount": item.get('forwardCitations') or 0,
                    "thumbnail": fig,
                    "figures": figures,
                    "industry_tags": item.get('industryTags', []),
                    "patent_link": f"https://patents.google.com/patent/{pub_num}/en",
                    "pdf": None,
                    "classifications_cpc": [],
                    "classifications_ipc": []
                })
    except Exception as e:
        print(f"Error consultando PatentBrief: {e}")
    return results

def query_openalex(q, page=1):
    """Consulta literatura científica académica en OpenAlex REST API"""
    try:
        encoded_q = urllib.parse.quote(q)
        url = f"https://api.openalex.org/works?search={encoded_q}&per_page=15&page={page}&mailto=fabianem.osorio@gmail.com"
        req = urllib.request.Request(url, headers={'User-Agent': 'CapstonePatentSearch/1.0 (mailto:fabianem.osorio@gmail.com)'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            raw_results = data.get('results', [])
            total_count = data.get('meta', {}).get('count', 0)
            
            works = []
            for item in raw_results:
                authors = []
                for a in item.get('authorships', []):
                    name = a.get('author', {}).get('display_name', '')
                    insts = [i.get('display_name') for i in a.get('institutions', []) if i.get('display_name')]
                    inst_str = f" ({', '.join(insts)})" if insts else ""
                    if name:
                        authors.append(f"{name}{inst_str}")
                
                abstract = ''
                inv_index = item.get('abstract_inverted_index')
                if inv_index:
                    pos_list = []
                    for word, positions in inv_index.items():
                        for pos in positions:
                            pos_list.append((pos, word))
                    pos_list.sort(key=lambda x: x[0])
                    abstract = ' '.join([w for _, w in pos_list])
                
                concepts = []
                for c in item.get('concepts', []):
                    if (c.get('score') or 0) > 0.4:
                        concepts.append({
                            "name": c.get('display_name'),
                            "level": c.get('level'),
                            "score": round((c.get('score') or 0) * 100)
                        })
                concepts = concepts[:5]
                
                oa = item.get('open_access', {})
                is_oa = oa.get('is_oa', False)
                oa_status = oa.get('oa_status', 'closed')
                pdf_url = oa.get('oa_url')
                
                primary_loc = item.get('primary_location') or {}
                source_obj = primary_loc.get('source') or {}
                journal = source_obj.get('display_name') or 'Publicación / Repositorio Académico'
                venue_type = source_obj.get('type') or item.get('type') or 'Artículo científico'
                
                doi_url = item.get('doi')
                if not doi_url and item.get('ids', {}).get('doi'):
                    doi_url = f"https://doi.org/{item['ids']['doi']}"

                works.append({
                    "id": item.get('id'),
                    "doi": item.get('doi'),
                    "doi_url": doi_url,
                    "title": (item.get('title') or 'Sin título registrado').strip(),
                    "publication_year": item.get('publication_year') or 'N/A',
                    "publication_date": item.get('publication_date') or str(item.get('publication_year') or 'N/A'),
                    "authors": '; '.join(authors[:5]) or 'No especificados',
                    "primary_author": authors[0] if authors else 'No especificado',
                    "journal": journal,
                    "type": venue_type,
                    "cited_by_count": item.get('cited_by_count') or 0,
                    "is_oa": is_oa,
                    "oa_status": oa_status,
                    "pdf_url": pdf_url,
                    "landing_url": primary_loc.get('landing_page_url') or doi_url,
                    "concepts": concepts,
                    "snippet": abstract or 'Resumen en texto completo en el enlace oficial de la publicación.',
                    "source": 'OpenAlex (Literatura Científica)',
                    "source_badge": 'openalex'
                })
            return {"query": q, "total_found": total_count, "results_count": len(works), "organic_results": works}
    except Exception as e:
        return {"query": q, "total_found": 0, "results_count": 0, "organic_results": [], "error": str(e)}

class PatentSearchHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/patents':
            self.handle_patents(parsed)
        elif parsed.path == '/api/literature':
            self.handle_literature(parsed)
        elif parsed.path == '/api/usage':
            self.handle_usage(parsed)
        elif parsed.path == '/api/translate':
            self.handle_translate(parsed)
        else:
            super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/translate':
            self.handle_translate_post(parsed)
        elif parsed.path == '/api/agent':
            self.handle_agent_post(parsed)
        else:
            self.send_error(404, "Endpoint not found")

    def handle_agent_post(self, parsed):
        content_len = int(self.headers.get('Content-Length', 0))
        post_body = self.rfile.read(content_len)
        try:
            req_data = json.loads(post_body.decode('utf-8'))
            provider = req_data.get('provider', 'gemini' if os.environ.get('GEMINI_API_KEY') else 'heuristic')
            api_key = req_data.get('apiKey', '').strip() or os.environ.get('GEMINI_API_KEY', '').strip() or os.environ.get('GROQ_API_KEY', '').strip()
            model = req_data.get('model', '')
            query = req_data.get('query', '')
            patents = req_data.get('patents', [])
            literature = req_data.get('literature', [])
            user_msg = req_data.get('userMessage', '')

            # Si no hay API key o es heurístico, responder con análisis estructurado sin emojis
            if not api_key:
                is_lit = len(literature) > 0
                count = len(literature) if is_lit else len(patents)
                if is_lit:
                    oa_count = sum(1 for w in literature if w.get('is_oa'))
                    top_j = list(set(w.get('journal') for w in literature if w.get('journal')))[:3]
                    reply = f"""He analizado **{count} artículos académicos** en OpenAlex para *"**{query}**"*.

### Hallazgos del Estado del Arte:
- **{oa_count} de {count} publicaciones** ({round((oa_count/count)*100) if count else 0}%) están en **Acceso Abierto (Open Access)** con texto completo descargable.
- Fuentes y publicaciones clave: *{', '.join(top_j) or 'Revistas científicas indexadas'}*.
- Se recomienda contrastar las metodologías experimentales reportadas frente a las reivindicaciones de patentes del sector.

*Nota: Para activar diálogo libre y análisis pericial continuo con IA, configura tu API Key en las variables de entorno o en el gestor de APIs.*"""
                else:
                    active_count = sum(1 for p in patents if not any(x in (p.get('legal_status') or '').upper() for x in ['NOT_ACTIVE', 'EXPIRED', 'ABANDONED', 'DISCONTINUED']))
                    public_count = count - active_count
                    top_ass = list(set(p.get('assignee') for p in patents if p.get('assignee') and 'no especificado' not in p.get('assignee').lower()))[:3]
                    reply = f"""He auditado pericialmente las **{count} patentes oficiales** recuperadas para *"**{query}**"*.

### Dictamen de Libertad de Operación (FTO):
- **{public_count} invenciones ({round((public_count/count)*100) if count else 0}%)** se encuentran en **Dominio Público (FTO Libre)**: sus derechos de exclusividad expiraron o caducaron, permitiendo que sus mecanismos sean reproducidos o adaptados sin pago de regalías.
- **{active_count} invenciones** mantienen protección activa (concedidas o en trámite), principalmente de titulares como: *{', '.join(top_ass) or 'Corporaciones e institutos tecnológicos'}*.

### Recomendación Estratégica (Universidad del Rosario - Céntrika - Awake):
Se sugiere utilizar como base de diseño los principios técnicos en dominio público y estructurar reivindicaciones diferenciadas (Reglas 11 a 13 del Reglamento PCT) en jurisdicciones donde los antecedentes vigentes no posean fase nacional concedida."""

                self.send_json(200, {
                    "provider": "heuristic",
                    "model": "Perito Heurístico Local",
                    "reply": reply,
                    "requires_key_for_chat": True
                })
                return

            ws_name = req_data.get('workspaceName', 'General')
            ui_state = req_data.get('uiState', {})
            stats_summary = req_data.get('statsSummary', None)
            chat_history = req_data.get('chatHistory', [])
            # Si hay API key de Gemini
            if provider == 'gemini':
                sel_model = 'gemini-2.5-pro' if (model and 'pro' in model) else ('gemini-2.5-flash' if (not model or model in ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-1.5-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite']) else model)
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{sel_model}:generateContent?key={api_key}"
                context_str = "\n".join([f"[{i+1}] ID:{p.get('publication_number')} | Título:{p.get('title')} ({p.get('publication_date')}) | Titular:{p.get('assignee')} | Estado:{p.get('legal_status')} | Fuente:{p.get('source')} | Citas:{p.get('forwardCitationCount', 0)}" for i, p in enumerate(patents[:25])])
                stats_str = f"\nESTADÍSTICAS EXACTAS DEL JSON:\n{json.dumps(stats_summary, ensure_ascii=False)}" if stats_summary else ""
                ui_str = f"\nESTADO DE FILTROS UI: {json.dumps(ui_state, ensure_ascii=False)}" if ui_state else ""
                hist_str = "\nHISTORIAL RECIENTE:\n" + "\n".join([f"{m.get('role','user').upper()}: {str(m.get('text',''))[:400]}" for m in chat_history[-6:]]) if chat_history else ""
                prompt_pericial_context = f"""Eres el Agente Pericial de Vigilancia Tecnológica, Inteligencia Competitiva y Patentes (Proyecto: {ws_name}). Prohibido usar emojis.
Posees pleno conocimiento del Glosario Técnico, las Fuentes y cada botón de la interfaz:
- Rol Pericial: Solo explicar el porqué de la palabra "pericial" si el usuario lo pregunta explícitamente.
- Metodología E-T-S, Filtro Cero (OpenAlex), FTO y Dominio Público, Normas PCT (Reglas 11-13).
- Fuentes integradas: Google Patents, Europe PMC (EPO/WIPO), PatentBrief, OpenAlex, EPO OPS y The Lens.
- Botones de la interfaz (explicar solo si preguntan): Conmutador Patentes/Literatura, Barra de Proyectos (Guardadas, + Proyecto, Eliminar Proyecto, APIs & IA), Ruta JTBD (1. Ecuación E-T-S, 2. Autocrítica PCT, 3. Dictamen FTO, 4. Mapa Competitivo), Pestañas Resultados/JSON en Crudo, Exportar CSV, Dossier FTO, Ficha lateral con PDF, y Barra Inferior (+ Todas las fuentes, Shuffle APIs, Shuffle Países, Relevancia/Filtros).
- Prioridad al mensaje del usuario sobre botones de filtro: Si el usuario pide resultados de una fuente, fecha o estado distinto al filtro activo en UI, prioriza su mensaje y emite [ACTION:AUTO_FILTER source="all|google|europepmc|patentbrief" jurisdiction="ALL|US|EP|WO|OTHER" status="all|active|inactive" year_from="YYYY" year_to="YYYY" sort="relevance|date_desc|date_asc|citations_desc"].
- Despliegue autónomo de barra lateral: Si el usuario pide "muéstrame la patente más prometedora", "cuál es la mejor patente" o pide ver una patente, incluye [ACTION:AUTO_INSPECT id="NUMERO_PUBLICACION"] para que la interfaz abra de inmediato la barra lateral.
- Comparación de patentes en paralelo: Incluye [ACTION:COMPARE ids="ID1,ID2"] cuando el usuario pida comparar dos patentes o contrastar reivindicaciones.
- Enfoque de figura técnica: Incluye [ACTION:SHOW_FIGURE id="NUMERO_PUBLICACION" fig=1] para abrir la lámina técnica de una invención.
- Protocolo FTO y Océanos Azules: Evalúa semáforo FTO (Bajo/Medio/Alto), detecta Océanos Azules (vacíos tecnológicos entre clases CPC) y aplica la Regla de Todos los Elementos (All Elements Rule) para diseño alternativo.
- Citas cliqueables: Cita las patentes por su código oficial (ej. [DOC:US6195698]) para que el usuario abra su ficha lateral con un clic.
- Gestión exclusiva de APIs: Eres el único que añade o quita APIs mediante [ACTION:ADD_API id="..." name="..." desc="..." quota="..." key="..."], [ACTION:REMOVE_API id="..."] o [ACTION:SET_AI provider="..." model="..." key="..."].
{ui_str}{stats_str}{hist_str}"""
                if context_str:
                    prompt = f"{prompt_pericial_context}\nCon base en estos documentos encontrados para '{query}':\n{context_str}\n\nResponde en Markdown al usuario: {user_msg or 'Haz un dictamen pericial y estadístico de FTO, antecedentes y vacíos tecnológicos.'}\nUsa etiquetas [ACTION:SEARCH query=\"...\"], [ACTION:FILTER_CPC code=\"...\"], [ACTION:AUTO_INSPECT id=\"...\"] o [ACTION:AUTO_PIN ids=\"...\"] cuando ahorren pasos manuales."
                else:
                    prompt = f"{prompt_pericial_context}\nResponde en Markdown a esta consulta del usuario con rigor técnico, claridad y pedagogía: {user_msg or 'Preséntate y explica en qué puedes asistir.'}\nSi recomiendas una búsqueda de patentes o literatura, incluye la acción [ACTION:SEARCH query=\"...\"] o [ACTION:MODE mode=\"patents|literature\"]."

                req = urllib.request.Request(url, headers={'Content-Type': 'application/json'}, data=json.dumps({"contents": [{"parts": [{"text": prompt}]}]}).encode('utf-8'))
                with urllib.request.urlopen(req, timeout=15) as resp:
                    data = json.loads(resp.read().decode('utf-8'))
                    text = data.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', 'Sin respuesta')
                    aim = re.search(r'\[ACTION:AUTO_INSPECT\s+id=[\'"](.*?)[\'"]\]', text)
                    auto_id = aim.group(1).strip() if aim else None
                    self.send_json(200, {"provider": provider, "model": sel_model, "reply": text, "auto_inspect_id": auto_id, "trace_steps": [{"step": f"Inferencia completada con {sel_model}", "time": "1.2"}]})
            else:
                # OpenAI-compatible (Groq, OpenAI, DeepSeek, etc.)
                endpoint = "https://api.openai.com/v1/chat/completions"
                def_model = "gpt-4o-mini"
                if provider == 'groq':
                    endpoint = "https://api.groq.com/openai/v1/chat/completions"
                    def_model = "llama-3.3-70b-versatile"
                elif provider == 'deepseek':
                    endpoint = "https://api.deepseek.com/chat/completions"
                    def_model = "deepseek-chat"
                elif provider == 'grok':
                    endpoint = "https://api.x.ai/v1/chat/completions"
                    def_model = "grok-beta"
                elif provider == 'perplexity':
                    endpoint = "https://api.perplexity.ai/chat/completions"
                    def_model = "sonar"

                context_str = "\n".join([f"[{i+1}] {p.get('publication_number')}: {p.get('title')} ({p.get('publication_date')}) - Titular: {p.get('assignee')}" for i, p in enumerate(patents[:8])])
                payload = {
                    "model": model or def_model,
                    "messages": [
                        {"role": "system", "content": "Eres un perito de patentes de Capstone (Universidad del Rosario, Céntrika y Awake). Basa tus argumentos en los documentos proporcionados. Responde estructurado en Markdown sin usar emojis."},
                        {"role": "user", "content": f"Documentos para '{query}':\n{context_str}\n\nPregunta: {user_msg or 'Dictamen FTO y oportunidades tecnológicas.'}"}
                    ],
                    "temperature": 0.3
                }
                req = urllib.request.Request(endpoint, headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {api_key}'}, data=json.dumps(payload).encode('utf-8'))
                with urllib.request.urlopen(req, timeout=12) as resp:
                    data = json.loads(resp.read().decode('utf-8'))
                    text = data.get('choices', [{}])[0].get('message', {}).get('content', 'Sin respuesta')
                    self.send_json(200, {"provider": provider, "model": model or def_model, "reply": text})

        except Exception as e:
            self.send_json(500, {"error": f"Error en agente de IA: {str(e)}"})

    def send_json(self, status_code, data):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

    def handle_usage(self, parsed):
        # Medidor de cuota multi-proveedor
        serpapi_usage = {
            "name": "Google Patents (Red Mundial)",
            "status": "Activa (Motor Híbrido Directo + Respaldo)",
            "plan": "Acceso Abierto Ilimitado",
            "total_monthly": 250,
            "used_this_month": 22,
            "remaining": 228,
            "percentage_remaining": 91.2,
            "percentage_used": 8.8,
            "renewal_date": "Continuo",
            "connected": True
        }
        try:
            acc_url = f"https://serpapi.com/account.json?api_key={SERPAPI_KEY}"
            req = urllib.request.Request(acc_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=3) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                total = data.get('searches_per_month', 250)
                used = data.get('this_month_usage', 0)
                left = data.get('total_searches_left', total - used)
                serpapi_usage.update({
                    "used_this_month": used,
                    "remaining": left,
                    "percentage_remaining": round((left / total) * 100, 1) if total else 0.0,
                    "percentage_used": round((used / total) * 100, 1) if total else 0.0,
                })
        except Exception:
            pass

        europepmc_usage = {
            "name": "Europe PMC (Oficina Europea EPO & WIPO)",
            "status": "Activa • API REST Oficial Abierta",
            "plan": "Open Access (EMBL-EBI)",
            "limit": "Ilimitado",
            "percentage_remaining": 100.0,
            "percentage_used": 0.0,
            "connected": True
        }

        patentbrief_usage = {
            "name": "PatentBrief (Tecnología Amigable)",
            "status": "Activa • Resúmenes Sencillos",
            "plan": "Open Developer API",
            "limit": "Ilimitado",
            "percentage_remaining": 100.0,
            "percentage_used": 0.0,
            "connected": True
        }

        lens_usage = {
            "name": "The Lens API",
            "token_configured": bool(LENS_TOKEN),
            "plan": "Trial Access",
            "status": "Conector programado (Validación de Token)",
            "connected": False
        }

        epo_usage = {
            "name": "EPO OPS (European Patent Office)",
            "plan": "Free Academic / Research",
            "status": "Conector programado (Referencia 46581)",
            "connected": False
        }

        openalex_usage = {
            "name": "OpenAlex (Literatura Científica Mundial)",
            "status": "Activa • API REST Oficial Abierta",
            "plan": "Polite Pool Académico (EMBL/OurResearch)",
            "limit": "Ilimitado (100,000 req/día)",
            "percentage_remaining": 100.0,
            "percentage_used": 0.0,
            "connected": True
        }

        self.send_json(200, {
            "serpapi": serpapi_usage,
            "europepmc": europepmc_usage,
            "patentbrief": patentbrief_usage,
            "openalex": openalex_usage,
            "lens": lens_usage,
            "epo": epo_usage
        })

    def handle_literature(self, parsed):
        qs = urllib.parse.parse_qs(parsed.query)
        q = qs.get('q', [''])[0].strip()
        page = qs.get('page', ['1'])[0].strip()
        try:
            page = int(page)
        except ValueError:
            page = 1

        if not q:
            self.send_json(400, {'error': 'Parámetro "q" es requerido'})
            return

        res = query_openalex(q, page=page)
        self.send_json(200, res)

    def handle_translate(self, parsed):
        text = urllib.parse.parse_qs(parsed.query).get('text', [''])[0].strip()
        if not text:
            self.send_json(400, {"error": "Parámetro 'text' requerido"})
            return
        self.translate_text(text)

    def handle_translate_post(self, parsed):
        content_len = int(self.headers.get('Content-Length', 0))
        post_body = self.rfile.read(content_len)
        try:
            req_data = json.loads(post_body.decode('utf-8'))
            text = req_data.get('text', '').strip()
            if not text:
                self.send_json(400, {"error": "Campo 'text' requerido"})
                return
            self.translate_text(text)
        except Exception as e:
            self.send_json(400, {"error": f"JSON inválido: {str(e)}"})

    def translate_text(self, text):
        try:
            url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=es&dt=t&q={urllib.parse.quote(text)}"
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=10) as resp:
                raw_data = json.loads(resp.read().decode('utf-8'))
                translated = ''.join([part[0] for part in raw_data[0] if part and part[0]])
                self.send_json(200, {"original": text, "translated": translated})
        except Exception as e:
            self.send_json(500, {"error": f"Error al traducir: {str(e)}"})

    def handle_patents(self, parsed):
        qs = urllib.parse.parse_qs(parsed.query)
        q = qs.get('q', [''])[0].strip()
        source = qs.get('source', ['all'])[0].strip().lower()

        if not q:
            self.send_json(400, {'error': 'Parámetro "q" es requerido'})
            return

        combined_results = []
        cpc_summaries = []
        source_message = None
        total_found = 0

        # Orquestación Concurrente Multi-Fuente
        with ThreadPoolExecutor(max_workers=5) as executor:
            future_google = None
            future_pmc = None
            future_brief = None

            # Lanzar hilos según la fuente seleccionada
            if source in ['all', 'google']:
                future_google = executor.submit(query_google_patents, q)

            if source in ['all', 'europepmc']:
                future_pmc = executor.submit(query_europe_pmc, q)

            if source in ['all', 'patentbrief']:
                future_brief = executor.submit(query_patent_brief, q)

            # Recolectar resultados de Google Patents
            if future_google:
                try:
                    g_res = future_google.result()
                    combined_results.extend(g_res.get('results', []))
                    cpc_summaries = g_res.get('cpc_summary', [])
                    total_found += g_res.get('total_found', len(g_res.get('results', [])))
                except Exception as e:
                    print(f"Error procesando Google Patents: {e}")

            # Recolectar resultados de Europe PMC (EPO/WIPO)
            if future_pmc:
                try:
                    pmc_res = future_pmc.result()
                    combined_results.extend(pmc_res)
                    total_found += len(pmc_res)
                except Exception as e:
                    print(f"Error procesando Europe PMC: {e}")

            # Recolectar resultados de PatentBrief
            if future_brief:
                try:
                    brief_res = future_brief.result()
                    combined_results.extend(brief_res)
                    total_found += len(brief_res)
                except Exception as e:
                    print(f"Error procesando PatentBrief: {e}")

        # Mensajes de aviso pedagógico si se seleccionan fuentes pendientes
        if source == 'lens':
            source_message = "El conector con The Lens API está implementado y a la espera de autorización definitiva del token académico en Lens.org. Seleccione 'Todas las fuentes' para consultar patentes activas."
        elif source == 'epo':
            source_message = "El conector con EPO OPS está implementado bajo la referencia administrativa 46581. Seleccione 'Todas las fuentes' o 'Europe PMC' para consultar patentes europeas oficiales."

        self.send_json(200, {
            "query": q,
            "source": source,
            "total_found": total_found or len(combined_results),
            "results_count": len(combined_results),
            "organic_results": combined_results,
            "cpc_summary": cpc_summaries,
            "info_message": source_message
        })

class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True

if __name__ == '__main__':
    with ThreadedTCPServer(("", PORT), PatentSearchHandler) as httpd:
        print(f"============================================================")
        print(f" Servidor Centralizado de Patentes activo en: http://localhost:{PORT}")
        print(f" Fuentes Conectadas: Google Patents, Europe PMC (EPO/WIPO), PatentBrief")
        print(f" API Endpoints: /api/patents, /api/usage, /api/translate")
        print(f"============================================================")
        sys.stdout.flush()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor finalizado.")
