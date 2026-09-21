#!/usr/bin/env python3
"""
Local preview server for the site.

    python3 tools/serve.py [port]

Plain `python3 -m http.server` works too, but this one sends no-store so the
browser always picks up your latest edit instead of a cached copy — which
matters a lot when you are editing ES modules.
"""
import sys, os, functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        super().end_headers()

    def log_message(self, fmt, *args):
        if '200' not in (args[1] if len(args) > 1 else ''):
            super().log_message(fmt, *args)


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    os.chdir(ROOT)
    print(f'Serving {ROOT} at http://localhost:{port}/  (Ctrl-C to stop)')
    ThreadingHTTPServer(('127.0.0.1', port), functools.partial(Handler, directory=ROOT)).serve_forever()
