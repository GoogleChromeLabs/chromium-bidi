import { Message } from './bidiProtocolTypes';

export class ErrorResponseClass implements Message.ErrorResult {
  protected constructor(
    error: Message.ErrorCode,
    message: string,
    stacktrace?: string
  ) {
    this.error = error;
    this.message = message;
    this.stacktrace = stacktrace;
  }

  readonly error: Message.ErrorCode;
  readonly message: string;
  readonly stacktrace?: string;

  toErrorResponse(commandId: number): Message.CommandResponse {
    return {
      id: commandId,
      error: this.error,
      message: this.message,
      stacktrace: this.stacktrace,
    };
  }
}

export class UnknownErrorResponse extends ErrorResponseClass {
  constructor(message: string, stacktrace?: string) {
    super('unknown error', message, stacktrace);
  }
}

export class UnknownCommandErrorResponse extends ErrorResponseClass {
  constructor(message: string, stacktrace?: string) {
    super('unknown command', message, stacktrace);
  }
}

export class InvalidArgumentErrorResponse extends ErrorResponseClass {
  constructor(message: string, stacktrace?: string) {
    super('invalid argument', message, stacktrace);
  }
}
