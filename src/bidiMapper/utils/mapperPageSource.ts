/**
 * Copyright 2022 Google LLC.
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// HTML source code for the user-facing Mapper tab. Manually minified from `mapper.html`.
export const mapperPageSource = `<div class="card"> <div class="item"> <div class="text_1"> BiDi mapper is controlling this tab <div class="right"> <a target="_blank" title="BiDi-CDP Mapper GitHub Repository" href="https://github.com/GoogleChromeLabs/chromium-bidi" >GoogleChromeLabs / chromium-bidi</a > </div></div><div class="text_2"> Closing or reloading it will stop the BiDi process. </div></div><div class="divider"></div><div class="item"> <div class="text_3"> Debug information <div class="right"> <a target="_blank" title="Show/hide debug info" href="#" onclick="document.getElementById('debug').style.display=(document.getElementById('debug').style.display==='none'?'block':'none'); return false;" >show / hide debug info</a> </div></div></div><div id="debug" style="display: none"> </div></div><style>body{font-family: Roboto, serif; font-size: 13px;}a{color: #202124;}.right{float: right;}.debug_log{padding: 12px; margin-top: 16px; font-family: Menlo, serif; font-size: 11px; line-height: 180%; color: #202124; background: #f1f3f4; border-radius: 4px; display: flex; flex-direction: column; gap: 10px;}.pre{overflow-wrap: break-word;}.card{margin: 60px auto; padding: 2px 0; max-width: 900px; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15), 0 1px 6px rgba(0, 0, 0, 0.2); border-radius: 8px;}.divider{height: 1px; background: #f0f0f0;}.item{padding: 16px 20px; display: flex; flex-direction: column; gap: 6px;}.text_1{font-size: 18px; color: #202124;}.text_2{line-height: 15px; color: #606367;}.text_3{color: #202124;}</style>`;
