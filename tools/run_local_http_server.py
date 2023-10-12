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

import os
import sys

from pytest_httpserver import HTTPServer

# Current directory is noit a module, so to import `LocalHttpServer`, it's path
# has to be added to `sys.path`. It is done relative to this file's directory.
sys.path.append(os.path.dirname(__file__) + '/../tests/tools/')
import local_http_server


httpserver = HTTPServer()
httpserver.start()
local_http_server = local_http_server.LocalHttpServer(httpserver)
print("qweqwe Local http server started...")
print("200: ", local_http_server.url_200())
print("permanent redirect: ", local_http_server.url_permanent_redirect())
