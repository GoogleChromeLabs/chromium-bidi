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

import { BrowsingContext, Script } from '../protocol/bidiProtocolTypes';

export interface IContext {
  get contextId(): string;

  get url(): string;

  get parentId(): string | null;

  get cdpSessionId(): string;

  get children(): IContext[];

  addChild(child: IContext): void;

  serializeToBidiValue(maxDepth: number, isRoot: boolean): BrowsingContext.Info;

  navigate(
    url: string,
    wait: BrowsingContext.ReadinessState
  ): Promise<BrowsingContext.NavigateResult>;

  callFunction(
    functionDeclaration: string,
    _this: Script.ArgumentValue,
    _arguments: Script.ArgumentValue[],
    awaitPromise: boolean,
    resultOwnership: Script.OwnershipModel
  ): Promise<Script.CallFunctionResult>;

  scriptEvaluate(
    expression: string,
    awaitPromise: boolean,
    resultOwnership: Script.OwnershipModel
  ): Promise<Script.EvaluateResult>;

  findElement(
    selector: string
  ): Promise<BrowsingContext.PROTO.FindElementResult>;
}
