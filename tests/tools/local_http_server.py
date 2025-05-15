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

import base64
import http.client
import socket
import ssl
import time
import uuid
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from threading import Event, Thread
from typing import Any, Literal

from flask import Flask
from flask import Response as FlaskResponse
from flask import redirect, request


# Helper to find a free port
def find_free_port() -> int:
    """Finds and returns an available port number."""
    with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
        s.bind(('', 0))
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        return s.getsockname()[1]


class LocalHttpServer:
    """
    A Flask-based local HTTP/S server to simplify the usage. Sets up
    common use cases and provides url for them.
    """

    # Path constants
    __path_base = "/"
    __path_favicon = "/favicon.ico"
    __path_200_default = "/200"
    __path_permanent_redirect = "/301"
    __path_basic_auth = "/401"
    __path_hang_forever = "/hang_forever"
    __path_cacheable = "/cacheable"
    __path_shutdown = f"/shutdown_server_please_{uuid.uuid4().hex}"

    content_200: str = 'default 200 page'

    app: Flask
    host: str
    port: int
    protocol: Literal['http', 'https']
    # For Flask's ssl_context: tuple (certfile, keyfile) or None
    ssl_context_config: tuple[str, str] | None

    __start_time: datetime
    _dynamic_responses: dict[str, Any]
    hang_forever_stop_flag: Event
    _server_thread: Thread | None

    def __html_doc(self, content: str) -> str:
        """Wraps content in a basic HTML document structure."""
        return f"<!DOCTYPE html><html><head><link rel='shortcut icon' href='data:image/x-icon;,' type='image/x-icon'></head><body>{content}</body></html>"

    def __init__(self,
                 host: str = 'localhost',
                 protocol: Literal['http', 'https'] = 'http') -> None:
        self.app = Flask(__name__)
        self.app.testing = True  # Important for some Flask behaviors in a test context
        self.host = host
        self.protocol = protocol
        self.port = find_free_port()
        self.ssl_context_config = None

        if protocol == 'https':
            current_dir = Path(__file__).parent
            cert_file = current_dir / "cert.pem"
            key_file = current_dir / "key.pem"
            if not cert_file.exists() or not key_file.exists():
                raise FileNotFoundError(
                    f"SSL certificate or key file not found. Expected cert.pem and key.pem in {current_dir}"
                )
            self.ssl_context_config = (str(cert_file), str(key_file))
        elif protocol != 'http':
            raise ValueError(f"Unsupported protocol: {protocol}")

        self.__start_time = datetime.now(timezone.utc)
        self._dynamic_responses = {}
        self.hang_forever_stop_flag = Event()
        self._server_thread = None

        self._setup_routes()
        self._start_server()

    def _setup_routes(self) -> None:
        """Defines all the Flask routes for the server."""
        @self.app.route(self.__path_base)
        def base_route():
            return FlaskResponse(self.__html_doc("I prevent CORS"),
                                 mimetype="text/html")

        @self.app.route(self.__path_favicon)
        def favicon_route():
            return FlaskResponse("", mimetype="image/x-icon")

        @self.app.route(self.__path_200_default)
        def route_200_default():
            return FlaskResponse(self.__html_doc(self.content_200),
                                 mimetype="text/html")

        @self.app.route(f"{self.__path_200_default}/<string:response_id>")
        def route_200_dynamic(response_id: str):
            data = self._dynamic_responses.get(response_id)
            if data:
                return FlaskResponse(data["content"],
                                     mimetype=data["content_type"],
                                     headers=data["headers"])
            return FlaskResponse("Not Found", status=404)

        @self.app.route(self.__path_permanent_redirect)
        def route_permanent_redirect():
            return redirect(self.url_200(), code=301)

        @self.app.route(self.__path_basic_auth)
        def route_basic_auth():
            authorization = request.headers.get("Authorization")
            if authorization is not None:
                # Mimic original: case-sensitive "Basic ", split once.
                parts = authorization.split(" ", 1)
                if parts[0] == "Basic" and len(parts) == 2:
                    try:
                        decoded_creds_bytes = base64.b64decode(parts[1])
                        return FlaskResponse(decoded_creds_bytes.decode(
                            'utf-8', 'replace'),
                                             status=200,
                                             mimetype="text/html")
                    except (base64.binascii.Error, UnicodeDecodeError):
                        # Malformed base64 or not valid UTF-8, treat as "other auth"
                        return FlaskResponse(authorization,
                                             status=500,
                                             mimetype="text/html")
                else:  # Other auth type or malformed "Basic" header
                    return FlaskResponse(authorization,
                                         status=500,
                                         mimetype="text/html")

            # No Authorization header
            response = FlaskResponse(
                'HTTP Error 401 Unauthorized: Access is denied',
                status=401,
                mimetype="text/html")
            response.headers[
                "WWW-Authenticate"] = 'Basic realm="Access to staging site"'
            return response

        @self.app.route(self.__path_hang_forever)
        def route_hang_forever():
            self.hang_forever_stop_flag.clear(
            )  # Reset if called multiple times
            self.hang_forever_stop_flag.wait()
            return FlaskResponse("Request unblocked.",
                                 status=200,
                                 mimetype="text/html")

        @self.app.route(self.__path_cacheable)
        def route_cacheable():
            content = self.__html_doc(self.content_200)
            if_modified_since = request.headers.get("If-Modified-Since")

            if if_modified_since is not None:
                # HTTP 304 responses must not contain a message-body
                return FlaskResponse("", status=304)
            else:
                headers = {
                    "Cache-Control": 'public, max-age=31536000',
                    # HTTP spec prefers RFC 1123 date format (GMT)
                    'Last-Modified':
                        self.__start_time.strftime("%a, %d %b %Y %H:%M:%S GMT")
                }
                return FlaskResponse(content,
                                     status=200,
                                     mimetype="text/html",
                                     headers=headers)

        @self.app.route(self.__path_shutdown, methods=['POST'])
        def shutdown_route():
            func = request.environ.get('werkzeug.server.shutdown')
            if func is None:
                # This might happen if not running with Werkzeug dev server
                # or if called multiple times.
                pass  # Silently ignore if shutdown func is not available
            else:
                func()
            return "Server shutting down..."

    def _check_server_readiness(self, timeout_s: float = 0.1) -> bool:
        """Checks if the server is up and responding to a basic request."""
        try:
            conn: http.client.HTTPConnection | http.client.HTTPSConnection
            if self.protocol == 'https':
                context = ssl.create_default_context()
                context.check_hostname = False
                context.verify_mode = ssl.CERT_NONE  # For self-signed certs
                conn = http.client.HTTPSConnection(self.host,
                                                   self.port,
                                                   timeout=timeout_s,
                                                   context=context)
            else:
                conn = http.client.HTTPConnection(self.host,
                                                  self.port,
                                                  timeout=timeout_s)

            conn.request("GET", self.__path_base)
            response = conn.getresponse()
            response.read()  # Important to consume the response
            conn.close()
            return 200 <= response.status < 300  # Check for any 2xx success
        except (ConnectionRefusedError, TimeoutError, OSError,
                http.client.HTTPException, ssl.SSLError):
            return False
        except Exception:  # Catch any other unexpected errors during check
            return False

    def _wait_for_server_startup(self, max_wait_s: int = 5) -> None:
        """Waits for the Flask server to start by polling a readiness check."""
        start_time_monotonic = time.monotonic()
        while time.monotonic() - start_time_monotonic < max_wait_s:
            if self._check_server_readiness():
                return
            time.sleep(0.05)  # Short sleep before retrying
        raise RuntimeError(
            f"Flask server failed to start on {self.protocol}://{self.host}:{self.port} within {max_wait_s}s."
        )

    def _start_server(self) -> None:
        """Starts the Flask development server in a separate thread."""
        if self.is_running():  # Check if already running
            return

        kwargs = {
            'host': self.host,
            'port': self.port,
            'debug': False,  # Should be False for stability and threaded mode
            'use_reloader': False  # Reloader must be False when running in a thread
        }
        if self.protocol == 'https':
            kwargs['ssl_context'] = self.ssl_context_config

        def run_server_thread():
            try:
                self.app.run(**kwargs)
            except Exception as e:
                # This might catch errors like "address already in use" if find_free_port failed,
                # though it's unlikely.
                print(f"Error running Flask server thread: {e}")

        self._server_thread = Thread(target=run_server_thread, daemon=True)
        self._server_thread.start()
        self._wait_for_server_startup()

    def clear(self) -> None:
        """
        Clears dynamically added responses. Static routes defined at startup remain.
        This differs from pytest-httpserver's clear which removes all expectations.
        """
        self._dynamic_responses.clear()

    def is_running(self) -> bool:
        """Checks if the server thread is alive and the server is responsive."""
        if self._server_thread is not None and self._server_thread.is_alive():
            # Perform a quick check to ensure the server is still responding
            return self._check_server_readiness(timeout_s=0.05)
        return False

    def stop(self) -> None:
        """Stops the Flask server."""
        if not self._server_thread or not self._server_thread.is_alive():
            self._server_thread = None  # Ensure it's cleaned up if already dead
            return

        self.hang_forever_stop_flag.set()  # Release any hanging requests

        # Attempt to trigger the Werkzeug shutdown function
        try:
            conn: http.client.HTTPConnection | http.client.HTTPSConnection
            if self.protocol == 'https':
                context = ssl.create_default_context()
                context.check_hostname = False
                context.verify_mode = ssl.CERT_NONE
                conn = http.client.HTTPSConnection(self.host,
                                                   self.port,
                                                   context=context)
            else:
                conn = http.client.HTTPConnection(self.host, self.port)

            conn.request("POST", self.__path_shutdown)
            response = conn.getresponse()
            response.read()  # Consume response fully
            conn.close()
        except Exception as e:
            print(
                f"Error sending shutdown signal to Flask server: {e}. Server thread might not stop cleanly."
            )

        if self._server_thread:
            self._server_thread.join(
                timeout=5)  # Wait for the thread to terminate
            if self._server_thread.is_alive():
                print(
                    f"Warning: Flask server thread for {self.origin()} did not shut down cleanly after 5s."
                )
            self._server_thread = None

    def _build_url(self, path: str) -> str:
        """Constructs a full URL for a given path on this server."""
        return f"{self.protocol}://{self.host}:{self.port}{path}"

    def origin(self) -> str:
        """Returns the origin (scheme://host:port) of the server."""
        return f"{self.protocol}://{self.host}:{self.port}"

    def url_base(self) -> str:
        """Returns the URL for the base page (used to prevent CORS issues)."""
        return self._build_url(self.__path_base)

    def url_200(self,
                content: str | None = None,
                content_type: str = "text/html",
                headers: dict[str, str] | None = None) -> str:
        """
        Returns a URL that serves a 200 response.
        If 'content' is provided, a unique URL is generated for that specific content.
        Otherwise, returns the URL for the default 200 page.
        """
        if headers is None:
            headers = {}

        if content is not None:
            response_id = str(uuid.uuid4())

            final_content = content
            if content_type == "text/html":
                # Wrap in basic HTML structure if serving HTML, as per original logic
                final_content = self.__html_doc(content)

            self._dynamic_responses[response_id] = {
                "content": final_content,
                "content_type": content_type,
                "headers": headers  # User-provided headers
            }
            path = f"{self.__path_200_default}/{response_id}"
            return self._build_url(path)

        return self._build_url(self.__path_200_default)

    def url_permanent_redirect(self) -> str:
        """Returns the URL for a page that permanently redirects to the default 200 page."""
        return self._build_url(self.__path_permanent_redirect)

    def url_basic_auth(self) -> str:
        """Returns the URL for a page protected by Basic authentication."""
        return self._build_url(self.__path_basic_auth)

    def url_hang_forever(self) -> str:
        """Returns the URL for a page that will hang until `hang_forever_stop()` is called."""
        return self._build_url(self.__path_hang_forever)

    def url_cacheable(self) -> str:
        """Returns the URL for a cacheable page (using Last-Modified and If-Modified-Since)."""
        return self._build_url(self.__path_cacheable)
