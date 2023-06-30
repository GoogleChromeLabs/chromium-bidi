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

import type {
  BrowsingContext,
  Cdp,
  Input,
  Network,
  Script,
  Session,
} from '../protocol/protocol.js';

export class BidiNoOpParser implements BidiParser {
  // Browsing Context domain
  parseCaptureScreenshotParams(
    params: object
  ): BrowsingContext.CaptureScreenshotParameters {
    return params as BrowsingContext.CaptureScreenshotParameters;
  }
  parseCloseParams(params: object): BrowsingContext.CloseParameters {
    return params as BrowsingContext.CloseParameters;
  }
  parseCreateParams(params: object): BrowsingContext.CreateParameters {
    return params as BrowsingContext.CreateParameters;
  }
  parseGetTreeParams(params: object): BrowsingContext.GetTreeParameters {
    return params as BrowsingContext.GetTreeParameters;
  }
  parseNavigateParams(params: object): BrowsingContext.NavigateParameters {
    return params as BrowsingContext.NavigateParameters;
  }
  parsePrintParams(params: object): BrowsingContext.PrintParameters {
    return params as BrowsingContext.PrintParameters;
  }
  parseReloadParams(params: object): BrowsingContext.ReloadParameters {
    return params as BrowsingContext.ReloadParameters;
  }
  parseSetViewportParams(
    params: object
  ): BrowsingContext.SetViewportParameters {
    return params as BrowsingContext.SetViewportParameters;
  }

  // CDP domain
  parseGetSessionParams(params: object): Cdp.GetSessionParams {
    return params as Cdp.GetSessionParams;
  }
  parseSendCommandParams(params: object): Cdp.SendCommandParams {
    return params as Cdp.SendCommandParams;
  }

  // Script domain
  parseAddPreloadScriptParams(
    params: object
  ): Script.AddPreloadScriptParameters {
    return params as Script.AddPreloadScriptParameters;
  }
  parseCallFunctionParams(params: object): Script.CallFunctionParameters {
    return params as Script.CallFunctionParameters;
  }
  parseDisownParams(params: object): Script.DisownParameters {
    return params as Script.DisownParameters;
  }
  parseEvaluateParams(params: object): Script.EvaluateParameters {
    return params as Script.EvaluateParameters;
  }
  parseGetRealmsParams(params: object): Script.GetRealmsParameters {
    return params as Script.GetRealmsParameters;
  }
  parseRemovePreloadScriptParams(
    params: object
  ): Script.RemovePreloadScriptParameters {
    return params as Script.RemovePreloadScriptParameters;
  }

  // Input domain
  parsePerformActionsParams(params: object): Input.PerformActionsParameters {
    return params as Input.PerformActionsParameters;
  }
  parseReleaseActionsParams(params: object): Input.ReleaseActionsParameters {
    return params as Input.ReleaseActionsParameters;
  }

  // Network domain
  parseAddInterceptParams(params: object): Network.AddInterceptParameters {
    return params as Network.AddInterceptParameters;
  }
  parseContinueRequestParams(
    params: object
  ): Network.ContinueRequestParameters {
    return params as Network.ContinueRequestParameters;
  }
  parseContinueResponseParams(
    params: object
  ): Network.ContinueResponseParameters {
    return params as Network.ContinueResponseParameters;
  }
  parseRemoveInterceptParams(
    params: object
  ): Network.RemoveInterceptParameters {
    return params as Network.RemoveInterceptParameters;
  }

  // Session domain
  parseSubscribeParams(params: object): Session.SubscriptionRequest {
    return params as Session.SubscriptionRequest;
  }
}

export interface BidiParser {
  // Browsing Context domain
  parseCaptureScreenshotParams(
    params: object
  ): BrowsingContext.CaptureScreenshotParameters;
  parseCloseParams(params: object): BrowsingContext.CloseParameters;
  parseCreateParams(params: object): BrowsingContext.CreateParameters;
  parseGetTreeParams(params: object): BrowsingContext.GetTreeParameters;
  parseNavigateParams(params: object): BrowsingContext.NavigateParameters;
  parsePrintParams(params: object): BrowsingContext.PrintParameters;
  parseReloadParams(params: object): BrowsingContext.ReloadParameters;
  parseSetViewportParams(params: object): BrowsingContext.SetViewportParameters;

  // CDP domain
  parseSendCommandParams(params: object): Cdp.SendCommandParams;
  parseGetSessionParams(params: object): Cdp.GetSessionParams;

  // Input domain
  parsePerformActionsParams(params: object): Input.PerformActionsParameters;
  parseReleaseActionsParams(params: object): Input.ReleaseActionsParameters;

  // Network domain
  parseAddInterceptParams(params: object): Network.AddInterceptParameters;
  parseContinueRequestParams(params: object): Network.ContinueRequestParameters;
  parseContinueResponseParams(
    params: object
  ): Network.ContinueResponseParameters;
  parseRemoveInterceptParams(params: object): Network.RemoveInterceptParameters;

  // Script domain
  parseAddPreloadScriptParams(
    params: object
  ): Script.AddPreloadScriptParameters;
  parseCallFunctionParams(params: object): Script.CallFunctionParameters;
  parseDisownParams(params: object): Script.DisownParameters;
  parseEvaluateParams(params: object): Script.EvaluateParameters;
  parseGetRealmsParams(params: object): Script.GetRealmsParameters;
  parseRemovePreloadScriptParams(
    params: object
  ): Script.RemovePreloadScriptParameters;

  // Session domain
  parseSubscribeParams(params: object): Session.SubscriptionRequest;
}
