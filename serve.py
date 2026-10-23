#!/usr/bin/env python3
"""Servidor local do Janonizator: http://localhost:1313

Uso: python3 serve.py [porta]

Serve a pasta do projeto com os tipos MIME corretos (.mjs, .wasm, .m4a, .woff2)
e sem cache, para que edições no config.js e no áudio apareçam ao recarregar.
"""

import http.server
import os
import sys

PORTA = int(sys.argv[1]) if len(sys.argv) > 1 else 1313
RAIZ = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.wasm': 'application/wasm',
        '.m4a': 'audio/mp4',
        '.woff2': 'font/woff2',
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=RAIZ, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    # Só localhost: WebCodecs exige contexto seguro, e http://localhost conta como seguro.
    with http.server.ThreadingHTTPServer(('localhost', PORTA), Handler) as servidor:
        print(f'Janonizator em http://localhost:{PORTA}  (Ctrl+C para parar)')
        try:
            servidor.serve_forever()
        except KeyboardInterrupt:
            pass
