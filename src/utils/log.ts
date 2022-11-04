/**
 * Copyright 2021 Google LLC.
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

export function log(name: string): (...message: any[]) => void {
  return (...messages: any[]) => {
    // If run in browser, add debug message to the page.
    if (globalThis.document?.documentElement) {
      console.log(name, ...messages);

      const typeLogContainer = findOrCreateTypeLogContainer(name);

      // This piece of HTML should be added:
      /*
        <div class="pre">...log message...</div>
      */
      const lineElement = document.createElement('div');
      lineElement.className = 'pre';
      lineElement.textContent = messages.join(', ');
      typeLogContainer.appendChild(lineElement);
    }
  };
}

// This piece of HTML should be added:
/*
 <div class="divider debug-shown"></div>
 <div class="item debug-shown">
   <div class="text_3">System</div>
   <div id="system_log" class="debug_log"></div>
 </div>
*/
function findOrCreateTypeLogContainer(name: string) {
  const typeLogContainerId = name + '_log';

  const existingContainer = document.getElementById(typeLogContainerId);
  if (existingContainer) {
    return existingContainer;
  }

  const debugContainer = document.getElementById('debug')!;

  const divider = document.createElement('div');
  divider.className = 'divider debug-shown';
  debugContainer.appendChild(divider);

  const htmlItem = document.createElement('div');
  htmlItem.className = 'item';
  htmlItem.innerHTML = `<div class="text_3">${name}</div><div id="${typeLogContainerId}" class="debug_log"></div>`;
  debugContainer.appendChild(htmlItem);

  return document.getElementById(typeLogContainerId)!;
}
