/**
 * Copyright 2026 Google LLC.
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

export interface ClassicRequest {
  readonly id: string;
  readonly method: string;
  readonly path: string;
  readonly body?: unknown;
}

export interface ClassicResponse {
  readonly id?: string;
  readonly status: number;
  readonly body: {
    value: unknown;
  };
}

export interface ClassicTransport {
  setOnMessage(onMessage: (request: ClassicRequest) => void): void;
  sendMessage(response: ClassicResponse): Promise<void> | void;
  close(): void;
}

export class ClassicException extends Error {
  constructor(
    public error: string,
    public override message: string,
    public stacktrace: string = '',
  ) {
    super(message);
  }

  toErrorResponse(id: string, status = 500): ClassicResponse {
    return {
      id,
      status,
      body: {
        value: {
          error: this.error,
          message: this.message,
          stacktrace: this.stacktrace,
        },
      },
    };
  }
}
