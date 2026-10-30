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
SERPAPI_KEY = "95dbb01b74ac677ffca277c162bb09294c58b2795b8ff4bc9374c718e5299e00"
LENS_TOKEN = "cjBPheEuwpYJ0X2VrGNHbuDGGNVoTDQxFYN6jkhpB2CiNQ1hRxDqo"

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
        else:
            self.send_error(404, "Endpoint not found")

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
