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
            html = resp.read().decode('utf-8')
            matches = re.findall(r'<span itemprop="Code">([A-H]\d{2}[A-Z]\d+/\d+)</span>', html)
            if not matches:
                matches = re.findall(r'<span itemprop="Code">([A-H]\d{2}[A-Z][0-9/ ]*)</span>', html)
            # Retornar únicos, hasta 4 clasificaciones
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

class PatentSearchHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/patents':
            self.handle_patents(parsed)
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
        # 1. Quota de SerpApi (Google Patents)
        serpapi_usage = {
            "name": "Google Patents (SerpApi)",
            "status": "Activa",
            "plan": "Free Plan",
            "total_monthly": 250,
            "used_this_month": 22,
            "remaining": 228,
            "percentage_remaining": 91.2,
            "percentage_used": 8.8,
            "renewal_date": "2026-10-30",
            "connected": True
        }
        try:
            acc_url = f"https://serpapi.com/account.json?api_key={SERPAPI_KEY}"
            req = urllib.request.Request(acc_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                total = data.get('searches_per_month', 250)
                used = data.get('this_month_usage', 0)
                left = data.get('total_searches_left', total - used)
                pct_used = round((used / total) * 100, 1) if total else 0.0
                pct_rem = round((left / total) * 100, 1) if total else 0.0
                serpapi_usage.update({
                    "connected": True,
                    "plan": data.get('plan_name', 'Free Plan'),
                    "total_monthly": total,
                    "used_this_month": used,
                    "remaining": left,
                    "percentage_remaining": pct_rem,
                    "percentage_used": pct_used,
                    "renewal_date": data.get('plan_renewal_date', '2026-10-30')
                })
        except Exception as e:
            serpapi_usage["error"] = str(e)

        # 2. Quota de The Lens API
        lens_usage = {
            "name": "The Lens API",
            "token_configured": bool(LENS_TOKEN),
            "plan": "Trial Access (14 días)",
            "limit_total": 1000,
            "rate_limit": "10 req/min",
            "status": "En espera de activación de Trial",
            "remaining": 1000,
            "percentage_remaining": 100.0,
            "percentage_used": 0.0
        }

        # 3. Quota de EPO OPS
        epo_usage = {
            "name": "EPO OPS (European Patent Office)",
            "plan": "Free Academic / Research",
            "limit": "2.5 GB / semana",
            "status": "Validación administrativa (Ref: 46581)",
            "percentage_remaining": 100.0,
            "connected": False
        }

        self.send_json(200, {
            "serpapi": serpapi_usage,
            "lens": lens_usage,
            "epo": epo_usage
        })

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
            with urllib.request.urlopen(req, timeout=12) as resp:
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

        # 1. Consulta a Google Patents via SerpApi
        if source in ['all', 'google']:
            try:
                target_url = f"https://serpapi.com/search.json?engine=google_patents&q={urllib.parse.quote(q)}&api_key={SERPAPI_KEY}"
                req = urllib.request.Request(target_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=15) as resp:
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
                        with ThreadPoolExecutor(max_workers=8) as executor:
                            futures = {executor.submit(extract_patent_classifications, pub): pub for pub in pub_numbers[:10]}
                            for f in futures:
                                pub = futures[f]
                                try:
                                    cpc_map[pub] = f.result()
                                except Exception:
                                    cpc_map[pub] = []

                    # Resumen global de CPC si existe
                    if 'summary' in data and 'cpc' in data['summary']:
                        for item in data['summary']['cpc']:
                            if item.get('key') and item.get('key') != 'Total':
                                cpc_summaries.append({
                                    "code": item.get('key'),
                                    "percentage": item.get('percentage', 0),
                                    "type": "CPC"
                                })

                    # Armar resultados
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

                        # Clasificaciones extraídas
                        extracted_cpcs = cpc_map.get(pub_num, [])
                        if not extracted_cpcs and cpc_summaries:
                            # Fallback con las top CPC detectadas
                            extracted_cpcs = [c['code'] for c in cpc_summaries[:2]]

                        combined_results.append({
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
                            "thumbnail": p.get('thumbnail'),
                            "figures": figures,
                            # Enlace ÚNICAMENTE de la fuente activa (Google Patents)
                            "patent_link": p.get('patent_link') or (f"https://patents.google.com/patent/{pub_num}/en" if pub_num else None),
                            "pdf": p.get('pdf'),
                            "classifications_cpc": extracted_cpcs,
                            "classifications_ipc": []
                        })

                    if data.get('search_information') and data.get('search_information').get('total_results'):
                        total_found += int(data['search_information']['total_results'])
                    else:
                        total_found += len(combined_results)

            except Exception as e:
                print(f"Error consultando SerpApi: {e}")

        # 2. Consulta a The Lens API
        if source in ['all', 'lens']:
            try:
                lens_url = "https://api.lens.org/patent/search"
                lens_body = json.dumps({
                    "query": {
                        "match": {
                            "title": q
                        }
                    },
                    "size": 10
                }).encode('utf-8')
                lens_req = urllib.request.Request(
                    lens_url,
                    data=lens_body,
                    headers={
                        "Authorization": f"Bearer {LENS_TOKEN}",
                        "Content-Type": "application/json"
                    },
                    method="POST"
                )
                with urllib.request.urlopen(lens_req, timeout=8) as l_resp:
                    l_data = json.loads(l_resp.read().decode('utf-8'))
                    for item in l_data.get('data', []):
                        biblio = item.get('biblio', {})
                        pub_ref = biblio.get('publication_reference', {})
                        doc_key = item.get('doc_key') or pub_ref.get('doc_number', 'N/A')
                        title_info = biblio.get('invention_title', [{}])[0]
                        abstract_info = item.get('abstract', [{}])[0]
                        applicants = [a.get('extracted_name', {}).get('value') for a in biblio.get('parties', {}).get('applicants', []) if a.get('extracted_name')]
                        inventors = [inv.get('extracted_name', {}).get('value') for inv in biblio.get('parties', {}).get('inventors', []) if inv.get('extracted_name')]
                        
                        cpcs = [c.get('symbol') for c in biblio.get('classifications_cpc', []) if c.get('symbol')]
                        ipcs = [c.get('symbol') for c in biblio.get('classifications_ipcr', []) if c.get('symbol')]

                        combined_results.append({
                            "source": "The Lens",
                            "source_badge": "lens",
                            "publication_number": doc_key,
                            "title": title_info.get('text', 'Sin título registrado'),
                            "snippet": abstract_info.get('text', ''),
                            "assignee": ', '.join(applicants) or 'No especificado',
                            "inventor": ', '.join(inventors) or 'No especificado',
                            "filing_date": biblio.get('application_reference', {}).get('date'),
                            "publication_date": pub_ref.get('date', 'N/A'),
                            "legal_status": item.get('legal_status', {}).get('patent_status', 'N/A'),
                            "thumbnail": None,
                            "figures": [],
                            # Enlace ÚNICAMENTE de la fuente activa (The Lens)
                            "patent_link": f"https://www.lens.org/lens/patent/{item.get('lens_id')}",
                            "pdf": None,
                            "classifications_cpc": cpcs,
                            "classifications_ipc": ipcs
                        })
            except urllib.error.HTTPError as he:
                if he.code == 401 and source == 'lens':
                    source_message = "La API de The Lens aún requiere validación administrativa de Trial en Lens.org para autorizar el token 'ProyectoCapstone'. Por favor use 'Todas las fuentes' o 'Google Patents' para obtener patentes activas de inmediato."
            except Exception as e:
                if source == 'lens':
                    source_message = f"Error al consultar The Lens: {str(e)}"

        # 3. Aviso para EPO OPS si se selecciona directamente
        if source == 'epo':
            source_message = "La API de EPO OPS se encuentra actualmente en validación por la Oficina Europea de Patentes (Referencia administrativa 46581). Seleccione 'Todas las fuentes' o 'Google Patents' para ver resultados."

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
        print(f" Servidor de Búsqueda de Patentes activo en: http://localhost:{PORT}")
        print(f" API Endpoints: /api/patents, /api/usage, /api/translate")
        print(f" Presione Ctrl+C para detener el servidor.")
        print(f"============================================================")
        sys.stdout.flush()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor finalizado.")
