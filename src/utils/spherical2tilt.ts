/**
 * Copyright 2023 Google LLC.
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

/* Converting between tiltX/tiltY and altitudeAngle/azimuthAngle */

const RAD_TO_DEG = 180 / Math.PI;

export function spherical2tilt(
  altitudeAngle: number,
  azimuthAngle: number
): {tiltX: number; tiltY: number} {
  let tiltXrad = 0;
  let tiltYrad = 0;

  if (altitudeAngle === 0) {
    // the pen is in the X-Y plane
    if (azimuthAngle === 0 || azimuthAngle === 2 * Math.PI) {
      // pen is on positive X axis
      tiltXrad = Math.PI / 2;
    }
    if (azimuthAngle === Math.PI / 2) {
      // pen is on positive Y axis
      tiltYrad = Math.PI / 2;
    }
    if (azimuthAngle === Math.PI) {
      // pen is on negative X axis
      tiltXrad = -Math.PI / 2;
    }
    if (azimuthAngle === (3 * Math.PI) / 2) {
      // pen is on negative Y axis
      tiltYrad = -Math.PI / 2;
    }
    if (azimuthAngle > 0 && azimuthAngle < Math.PI / 2) {
      tiltXrad = Math.PI / 2;
      tiltYrad = Math.PI / 2;
    }
    if (azimuthAngle > Math.PI / 2 && azimuthAngle < Math.PI) {
      tiltXrad = -Math.PI / 2;
      tiltYrad = Math.PI / 2;
    }
    if (azimuthAngle > Math.PI && azimuthAngle < (3 * Math.PI) / 2) {
      tiltXrad = -Math.PI / 2;
      tiltYrad = -Math.PI / 2;
    }
    if (azimuthAngle > (3 * Math.PI) / 2 && azimuthAngle < 2 * Math.PI) {
      tiltXrad = Math.PI / 2;
      tiltYrad = -Math.PI / 2;
    }
  } else {
    const tanAlt = Math.tan(altitudeAngle);

    tiltXrad = Math.atan(Math.cos(azimuthAngle) / tanAlt);
    tiltYrad = Math.atan(Math.sin(azimuthAngle) / tanAlt);
  }

  return {
    tiltX: Math.round(tiltXrad * RAD_TO_DEG),
    tiltY: Math.round(tiltYrad * RAD_TO_DEG),
  };
}
