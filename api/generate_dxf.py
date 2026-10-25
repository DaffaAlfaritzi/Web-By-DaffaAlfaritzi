import json
import os
import sys

# Tambahkan direktori root ke system path agar bisa mengimport app.py
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from app import auto_fit_data_to_template

def handler(request, response):
    try:
        # Menangani Vercel serverless request body
        body = request.body if hasattr(request, 'body') else {}
        if isinstance(body, bytes):
            payload = json.loads(body.decode('utf-8'))
        else:
            payload = body if isinstance(body, dict) else json.loads(request.get('body', '{}'))

        template_path = os.path.join(ROOT_DIR, 'angelllll.dxf')
        if not os.path.exists(template_path):
            template_path = 'angelllll.dxf'

        dxf_bytes = auto_fit_data_to_template(template_path, payload)

        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/dxf",
                "Content-Disposition": 'attachment; filename="Hasil_Layout_Bersih.dxf"',
                "Access-Control-Allow-Origin": "*"
            },
            "body": dxf_bytes.decode('latin1'),
            "isBase64Encoded": False
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": f"Error: {str(e)}"
        }
