#!/usr/bin/env python3
"""Статический сервер для разработки: как `python3 -m http.server`, но без кеширования,
чтобы браузер не подхватывал старые версии ES-модулей после правок."""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json'}

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, fmt, *args):
        if '" 200 ' not in (fmt % args):  # тишина на успешных запросах
            super().log_message(fmt, *args)


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print(f'http://127.0.0.1:{port}  (Ctrl+C — остановить)')
    ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
