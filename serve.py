#!/usr/bin/env python3
import argparse
import http.server
import socketserver
import ssl
import webbrowser
from pathlib import Path

PORT = 8000
MAX_PORT = 8010
CERT_FILE = "cert.pem"
KEY_FILE = "key.pem"

class NoCacheRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description="Local dev server")
    parser.add_argument("--https", action="store_true", help="Serve over HTTPS")
    args = parser.parse_args()

    root = Path(__file__).resolve().parent
    handler = NoCacheRequestHandler
    handler.directory = str(root)

    for port in range(PORT, MAX_PORT + 1):
        try:
            with socketserver.TCPServer(("", port), handler) as httpd:
                scheme = "https" if args.https else "http"
                if args.https:
                    cert_path = root / CERT_FILE
                    key_path = root / KEY_FILE
                    if not cert_path.exists() or not key_path.exists():
                        raise FileNotFoundError(
                            f"Missing {CERT_FILE}/{KEY_FILE}. Generate a self-signed cert first."
                        )
                    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
                    context.load_cert_chain(certfile=str(cert_path), keyfile=str(key_path))
                    httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
                url = f"{scheme}://localhost:{port}/"
                print(f"Serving {root} at {url}")
                try:
                    webbrowser.open(url)
                except Exception:
                    pass
                httpd.serve_forever()
                return
        except OSError:
            continue
    raise OSError(f"No available port in range {PORT}-{MAX_PORT}")


if __name__ == "__main__":
    main()
