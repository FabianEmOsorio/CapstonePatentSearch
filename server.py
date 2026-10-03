import http.server
import socketserver
import urllib.request
import urllib.parse
import json
import sys
import os

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
DEFAULT_API_KEY = "95dbb01b74ac677ffca277c162bb09294c58b2795b8ff4bc9374c718e5299e00"

class PatentSearchHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/patents':
            self.handle_patents(parsed)
        else:
            super().do_GET()

    def handle_patents(self, parsed):
        q = urllib.parse.parse_qs(parsed.query).get('q', [''])[0].strip()
        api_key = urllib.parse.parse_qs(parsed.query).get('api_key', [DEFAULT_API_KEY])[0].strip() or DEFAULT_API_KEY

        if not q:
            self.send_response(400)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'Parámetro "q" es requerido'}).encode('utf-8'))
            return

        try:
            target_url = f"https://serpapi.com/search.json?engine=google_patents&q={urllib.parse.quote(q)}&api_key={api_key}"
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) CapstonePatentSearch/1.0',
                'Accept': 'application/json'
            }
            req = urllib.request.Request(target_url, headers=headers)
            with urllib.request.urlopen(req, timeout=15) as resp:
                status_code = resp.status
                raw = resp.read()

            self.send_response(status_code)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(raw)

        except urllib.error.HTTPError as he:
            self.send_response(he.code)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(he.read())

        except Exception as e:
            self.send_response(502)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            err_data = {'error': f'Fallo al consultar la API de patentes: {str(e)}', 'query': q}
            self.wfile.write(json.dumps(err_data).encode('utf-8'))

if __name__ == '__main__':
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), PatentSearchHandler) as httpd:
        print(f"============================================================")
        print(f" Servidor de Búsqueda de Patentes activo en: http://localhost:{PORT}")
        print(f" Presione Ctrl+C para detener el servidor.")
        print(f"============================================================")
        sys.stdout.flush()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor finalizado.")
