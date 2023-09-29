#  Copyright 2023 Google LLC.
#  Copyright (c) Microsoft Corporation.
#
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
#

import http.server
import itertools
import socketserver
import threading


class _BaseServer(http.server.HTTPServer):
    """Internal server that throws if timed out waiting for a request."""
    def __init__(self, on_request):
        """Starts the server."""
        class _Handler(http.server.BaseHTTPRequestHandler):
            """Internal handler that just asks the server to handle the request."""
            def do_GET(self):
                if self.path.endswith('favicon.ico'):
                    self.send_error(404)
                    return
                on_request(self)

            def do_POST(self):
                on_request(self)

            def handle(self):
                http.server.BaseHTTPRequestHandler.handle(self)

            def finish(self):
                http.server.BaseHTTPRequestHandler.finish(self)

            def log_message(self, *args, **kwargs):
                """Overrides base class method to disable logging."""
                pass

        http.server.HTTPServer.__init__(self, ('127.0.0.1', 0), _Handler)

        # TODO: implement HTTPS along with `ignoreHTTPSErrors` capability.
        # if server_cert_and_key_path is not None:
        #     self._is_https_enabled = True
        #     self.socket = ssl.wrap_socket(self.socket,
        #                                   certfile=server_cert_and_key_path,
        #                                   server_side=True)
        # else:
        self._is_https_enabled = False

    def handle_timeout(self):
        """Overridden from SocketServer."""
        raise RuntimeError('Timed out waiting for http request')

    def get_url(self, host=None):
        """Returns the base URL of the server."""
        postfix = '://{}:{}'.format(host or '127.0.0.1', self.server_port)
        if self._is_https_enabled:
            return 'https' + postfix
        return 'http' + postfix


class _ThreadingServer(socketserver.ThreadingMixIn, _BaseServer):
    """_BaseServer enhanced to handle multiple requests simultaneously"""
    pass


class StaticWebServer:
    """An HTTP or HTTPS server that serves on its own thread.
    """
    def __init__(self):
        """Starts the server"""
        self._server = _ThreadingServer(self._on_request)
        self._thread = threading.Thread(target=self._server.serve_forever)
        self._thread.daemon = True
        self._thread.start()
        self._path_data_map = {}
        self._path_maps_lock = threading.Lock()
        self._counter = itertools.count(1)
        self.requests = {}

    def _on_request(self, handler):
        path = handler.path.split('?')[0]

        self._path_maps_lock.acquire()
        try:
            print("path", path)
            if path in self._path_data_map:
                data = self._path_data_map[path]
                print("data", data)
                content = data["content"]
                handler.send_response(data["code"])

                if "headers" in data:
                    headers = data["headers"]
                else:
                    headers = {}

                print("headers", headers)
                print(headers.items())
                for field, value in headers.items():
                    print("qwe", field, value)
                    handler.send_header(field, value)

                if content is not None:
                    handler.send_header('Content-Length', len(content))
                handler.end_headers()

                if content is not None:
                    handler.wfile.write(content)
                return
            else:
                handler.send_error(404)
                return
        finally:
            self._path_maps_lock.release()

    def _get_url(self, host=None):
        """Returns the base URL of the server."""
        return self._server.get_url(host)

    def shutdown(self):
        """Shuts down the server synchronously."""
        self._server.shutdown()
        self._thread.join()

    def url_200(self, content="<html><body>some page</body></html>"):
        id = "/" + str(next(self._counter))
        self._path_data_map[id] = {
            "code": 200,
            "content": bytes(content, 'utf-8')
        }
        return self._get_url() + id

    def url_301(self, location=None):
        if location is None:
            location = self.url_200()
        id = "/" + str(next(self._counter))
        self._path_data_map[id] = {
            "code": 301,
            "content": bytes("some_content", 'utf-8'),
            "headers": {
                "Location": location
            }
        }
        return self._get_url() + id
