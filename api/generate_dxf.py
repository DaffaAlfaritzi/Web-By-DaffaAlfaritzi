from http.server import BaseHTTPRequestHandler
import json
import os
import sys

# Tambahkan folder utama (root) agar bisa memanggil fungsi dari app.py dan membaca angelllll.dxf
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from app import auto_fit_data_to_template

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            payload = json.loads(post_data.decode('utf-8'))

            # Pastikan lokasi file angelllll.dxf terbaca di server cloud Vercel
            template_path = os.path.join(ROOT_DIR, 'angelllll.dxf')
            if not os.path.exists(template_path):
                template_path = 'angelllll.dxf'

            dxf_bytes = auto_fit_data_to_template(template_path, payload)

            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'application/dxf')
            self.send_header('Content-Disposition', 'attachment; filename="Hasil_Layout_Bersih.dxf"')
            self.end_headers()
            self.wfile.write(dxf_bytes)
        except Exception as e:
            self.send_response(500)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(f"Server Error: {str(e)}".encode('utf-8'))
