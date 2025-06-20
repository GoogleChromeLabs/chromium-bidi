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

import sys
import time
from pathlib import Path

# Current directory is not a module, so to import `LocalHttpServer`, its path
# has to be added to `sys.path`. It is done relative to this file's directory.
# The `flake8` is disabled for this reason.
sys.path.append(str(Path(__file__).resolve().parent.parent / 'tests/tools/'))

from local_http_server import LocalHttpServer  # noqa: E402

local_http_server = LocalHttpServer()
local_server_bad_ssl = LocalHttpServer(protocol='https')

print(f"""Local http server started...
  - 200: {local_http_server.url_200()}
  - oopif: {local_http_server.url_200(content='<iframe src=' + local_http_server.url_200(host='127.0.0.1') + '></iframe>')}
  - 301 / permanent redirect: {local_http_server.url_permanent_redirect()}
  - 401 / basic auth: {local_http_server.url_basic_auth()}
  - hangs forever: {local_http_server.url_hang_forever()}
  - bad ssl: {local_server_bad_ssl.url_200()}
""")

# Run until user exists the process.
while True:
    time.sleep(1)
