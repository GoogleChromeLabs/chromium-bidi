import { BrowsingContext, Script } from '../protocol/bidiProtocolTypes';

export interface IContext {
  getSessionId(): string;

  get id(): string;

  serializeToBidiValue(): BrowsingContext.Info;

  navigate(
    url: string,
    wait: BrowsingContext.ReadinessState
  ): Promise<BrowsingContext.NavigateResult>;

  callFunction(
    functionDeclaration: string,
    _this: Script.ArgumentValue,
    _arguments: Script.ArgumentValue[],
    awaitPromise: boolean
  ): Promise<Script.CallFunctionResult>;

  scriptEvaluate(
    expression: string,
    awaitPromise: boolean
  ): Promise<Script.EvaluateResult>;

  findElement(
    selector: string
  ): Promise<BrowsingContext.PROTO.FindElementResult>;
}
