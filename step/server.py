"""Local-only configurator + STEP exporter. Run with the STEP virtual environment."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import io
import json
import subprocess
import sys
import tempfile
import threading
import zipfile

ROOT = Path(__file__).resolve().parent.parent
LOCK = threading.Lock()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_POST(self):
        if self.path != '/api/step':
            self.send_error(404)
            return
        # No cross-origin access, including DNS rebinding to a foreign hostname.
        host = self.headers.get('Host', '')
        if host not in ('localhost:8123', '127.0.0.1:8123') or self.headers.get('Origin', f'http://{host}') != f'http://{host}':
            self.send_error(403)
            return
        if not LOCK.acquire(blocking=False):
            self.send_error(503, 'Another STEP export is running')
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 20_000_000:
                raise ValueError('Construction request must be between 1 byte and 20 MB')
            job = json.loads(self.rfile.read(length))
            with tempfile.TemporaryDirectory(prefix='pedalboard-step-') as tmp:
                tmp = Path(tmp)
                source = tmp / 'job.json'
                source.write_text(json.dumps(job), encoding='utf-8')
                done = subprocess.run([sys.executable, str(ROOT / 'step/export_step.py'), str(source), str(tmp / 'out')], capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=300)
                if done.returncode:
                    raise ValueError(done.stderr.strip().splitlines()[-1] if done.stderr.strip() else 'CAD export failed')
                files = list((tmp / 'out').glob('*.step'))
                if len(files) == 1:
                    body = files[0].read_bytes()
                    filename, content_type = files[0].name, 'application/step'
                else:
                    data = io.BytesIO()
                    with zipfile.ZipFile(data, 'w', zipfile.ZIP_DEFLATED) as archive:
                        for file in (tmp / 'out').iterdir():
                            archive.write(file, file.name)
                    body = data.getvalue()
                    filename, content_type = 'Pedalboard-parts-STEP.zip', 'application/zip'
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Disposition', f'attachment; filename="{filename}"')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            body = json.dumps({'error': str(e)}).encode()
            self.send_response(422)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        finally:
            LOCK.release()


if __name__ == '__main__':
    print('STEP configurator: http://127.0.0.1:8123/?lang=en', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 8123), Handler).serve_forever()
