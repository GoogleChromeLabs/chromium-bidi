export namespace CommonDataTypes {
  // TODO sadym: declare `RemoteValue` properly according to
  // https://w3c.github.io/webdriver-bidi/#type-common-RemoteValue.
  export type RemoteValue = any;

  export type ExceptionDetails = {
    columnNumber: number;
    exception: CommonDataTypes.RemoteValue;
    lineNumber: number;
    stackTrace: StackTrace;
    text: string;
  };
  export type StackTrace = {
    callFrames: StackFrame[];
  };
  export type StackFrame = {
    url: string;
    functionName: string;
    lineNumber: number;
    columnNumber: number;
  };
}
export namespace Script {
  export type RealTarget = {
    // TODO sadym: implement.
  };
  export type ContextTarget = {
    context: BrowsingContext.BrowsingContext;
  };
  export type Target = ContextTarget | RealTarget;

  export type ScriptExceptionResult = {
    exceptionDetails: CommonDataTypes.ExceptionDetails;
  };

  export type ScriptEvaluateResult =
    | ScriptEvaluateSuccessResult
    | ScriptExceptionResult;

  export type ScriptEvaluateSuccessResult = {
    result: CommonDataTypes.RemoteValue;
  };

  export type ScriptEvaluateParameters = {
    expression: string;
    awaitPromise?: boolean;
    target: Target;
  };

  export namespace PROTO {
    export type ScriptInvokeParameters = {
      functionDeclaration: string;
      args: InvokeArgument[];
      awaitPromise?: boolean;
      target: Target;
    };

    export type ScriptInvokeResult =
      | ScriptInvokeSuccessResult
      | ScriptExceptionResult;

    export type ScriptInvokeSuccessResult = {
      result: CommonDataTypes.RemoteValue;
    };

    export type InvokeArgument = RemoteValueArgument | LocalValueArgument;

    export type RemoteValueArgument = {
      objectId: string;
    };

    export type LocalValueArgument = {
      type: string;
      value: any;
    };
  }

  // https://w3c.github.io/webdriver-bidi/#module-browsingContext
  export namespace BrowsingContext {
    export type BrowsingContext = string;
  }
}
