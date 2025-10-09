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
import type {ErrorResponse} from './generated/webdriver-bidi.js';
import {ErrorCode} from './generated/webdriver-bidi.js';

export class Exception extends Error {
  constructor(
    public error: ErrorCode,
    public override message: string,
    public stacktrace?: string,
  ) {
    super();
  }

  toErrorResponse(commandId: number): ErrorResponse {
    return {
      type: 'error',
      id: commandId,
      error: this.error,
      message: this.message,
      stacktrace: this.stacktrace,
    };
  }
}

export class InvalidArgumentException extends Exception {
  constructor(message: string, stacktrace?: string) {
    super(ErrorCode.InvalidArgument, message, stacktrace);
  }
}

export class InvalidSelectorException extends Exception {
  constructor(message: string, stacktrace?: string) {
    super(ErrorCode.InvalidSelector, message, stacktrace);
  }
}

export class InvalidSessionIdException extends Exception {
  constructor(message: string, stacktrace?: string) {
    super(ErrorCode.InvalidSessionId, message, stacktrace);
  }
}

export class MoveTargetOutOfBoundsException extends Exception {
  constructor(message: string, stacktrace?: string) {
    super(ErrorCode.MoveTargetOutOfBounds, message, stacktrace);
  }
}

export class NoSuchAlertException extends Exception {
  constructor(message: string, stacktrace?: string) {
    super(ErrorCode.NoSuchAlert, message, stacktrace);
  }
}

export class NoSuchElementException extends Exception {
  constructor(message: string, stacktrace?: string) {
    super(ErrorCode.NoSuchElement, message, stacktrace);
  }
}

export class NoSuchFrameException extends Exception {
  constructor(message: string, stacktrace?: string) {
    super(ErrorCode.NoSuchFrame, message, stacktrace);
  }
}

export class NoSuchHandleException extends Exception {
  constructor(message: string, stacktrace?: string) {
    super(ErrorCode.NoSuchHandle, message, stacktrace);
  }
}

export class NoSuchHistoryEntryException extends Exception {
  constructor(message: string, stacktrace?: string) {
    super(ErrorCode.NoSuchHistoryEntry, message, stacktrace);
  }
}

export class NoSuchInterceptException extends Exception {
  constructor(message: string, stacktrace?: string) {
    super(ErrorCode.NoSuchIntercept, message, stacktrace);
  }
}

export class NoSuchNodeException extends Exception {
  constructor(message: string, stacktrace?: string) {
    super(ErrorCode.NoSuchNode, message, stacktrace);
  }
}

export class NoSuchRequestException extends Exception {
  constructor(message: string, stacktrace?: string) {
    super(ErrorCode.NoSuchRequest, message, stacktrace);
  }
}

export class NoSuchScriptException extends Exception {
  constructor(message: string, stacktrace?: string) {
    super(ErrorCode.NoSuchScript, message, stacktrace);
  }
}

export class NoSuchUserContextException extends Exception {
  constructor(message: string, stacktrace?: string) {
    super(ErrorCode.NoSuchUserContext, message, stacktrace);
  }
}

export class SessionNotCreatedException extends Exception {
  constructor(message: string, stacktrace?: string) {
    super(ErrorCode.SessionNotCreated, message, stacktrace);
  }
}

export class UnknownCommandException extends Exception {
  constructor(message: string, stacktrace?: string) {
    super(ErrorCode.UnknownCommand, message, stacktrace);
  }
}

export class UnknownErrorException extends Exception {
  constructor(message: string, stacktrace = new Error().stack) {
    super(ErrorCode.UnknownError, message, stacktrace);
  }
}

export class UnableToCaptureScreenException extends Exception {
  constructor(message: string, stacktrace?: string) {
    super(ErrorCode.UnableToCaptureScreen, message, stacktrace);
  }
}

export class UnableToCloseBrowserException extends Exception {
  constructor(message: string, stacktrace?: string) {
    super(ErrorCode.UnableToCloseBrowser, message, stacktrace);
  }
}

export class UnsupportedOperationException extends Exception {
  constructor(message: string, stacktrace?: string) {
    super(ErrorCode.UnsupportedOperation, message, stacktrace);
  }
}

export class NoSuchStoragePartitionException extends Exception {
  constructor(message: string, stacktrace?: string) {
    super(ErrorCode.NoSuchStoragePartition, message, stacktrace);
  }
}

export class UnableToSetCookieException extends Exception {
  constructor(message: string, stacktrace?: string) {
    super(ErrorCode.UnableToSetCookie, message, stacktrace);
  }
}

export class UnableToSetFileInputException extends Exception {
  constructor(message: string, stacktrace?: string) {
    super(ErrorCode.UnableToSetFileInput, message, stacktrace);
  }
}

export class UnderspecifiedStoragePartitionException extends Exception {
  constructor(message: string, stacktrace?: string) {
    super(ErrorCode.UnderspecifiedStoragePartition, message, stacktrace);
  }
}

export class InvalidWebExtensionException extends Exception {
  constructor(message: string, stacktrace?: string) {
    super(ErrorCode.InvalidWebExtension, message, stacktrace);
  }
}

export class NoSuchWebExtensionException extends Exception {
  constructor(message: string, stacktrace?: string) {
    super(ErrorCode.NoSuchWebExtension, message, stacktrace);
  }
}

export class NoSuchNetworkCollectorException extends Exception {
  constructor(message: string, stacktrace?: string) {
    super(ErrorCode.NoSuchNetworkCollector, message, stacktrace);
  }
}
export class NoSuchNetworkDataException extends Exception {
  constructor(message: string, stacktrace?: string) {
    super(ErrorCode.NoSuchNetworkData, message, stacktrace);
  }
}
export class UnavailableNetworkDataException extends Exception {
  constructor(message: string, stacktrace?: string) {
    super(ErrorCode.UnavailableNetworkData, message, stacktrace);
  }
}
