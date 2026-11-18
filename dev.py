"""
Test server for making changes (not used by the online app).

    python dev.py            -> http://localhost:8811

- never lets the browser keep an old copy of a file
- the page reloads by itself whenever a file in this folder is saved
- the offline app copy (service worker) is switched off here, so changes always show
"""
import http.server
import os
import socketserver
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8811
WATCH = ('.html', '.js', '.css', '.webmanifest', '.png')

RELOADER = b"""<script>window.M2P_DEV = true;
(function () {
  var last = null;
  setInterval(function () {
    fetch('/__version', { cache: 'no-store' }).then(function (r) { return r.text(); }).then(function (v) {
      if (last && v !== last) location.reload();
      last = v;
    }).catch(function () {});
  }, 1000);
})();</script>"""


def version():
    newest = 0
    for dirpath, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        for f in files:
            if f.endswith(WATCH):
                newest = max(newest, os.path.getmtime(os.path.join(dirpath, f)))
    return str(newest)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self):
        path = self.path.split('?')[0].split('#')[0]
        if path == '/__version':
            body = version().encode()
        elif path in ('/', '/index.html'):
            with open(os.path.join(ROOT, 'index.html'), 'rb') as fh:
                body = fh.read().replace(b'<head>', b'<head>' + RELOADER, 1)
        elif path == '/sw.js':
            # no offline copy while testing: this one removes itself
            body = b"self.addEventListener('install',()=>self.skipWaiting());" \
                   b"self.addEventListener('activate',()=>self.registration.unregister());"
            self.send_response(200)
            self.send_header('Content-Type', 'text/javascript')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        else:
            return super().do_GET()
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain' if path == '/__version' else 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == '__main__':
    print(f'Test server: http://localhost:{PORT}  (reloads by itself on every saved change)')
    Server(('0.0.0.0', PORT), Handler).serve_forever()
