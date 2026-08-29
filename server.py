import http.server
import socketserver

class ThreadedHTTPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        super().end_headers()

httpd = ThreadedHTTPServer(("", 8080), NoCacheHandler)
print("Serving on port 8080 (Threaded)")
httpd.serve_forever()
