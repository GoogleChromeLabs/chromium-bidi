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
  Browser,
  BrowsingContext,
  Cdp,
  Input,
  Network,
  Script,
  Session,
  Storage,
  Permissions,
  Bluetooth,
  WebExtension,
} from '../protocol/protocol.js';

import type {BidiCommandParameterParser} from './BidiParser.js';

export class BidiNoOpParser implements BidiCommandParameterParser {
  // Bluetooth module
  // keep-sorted start block=yes
  parseHandleRequestDevicePromptParams(
    params: unknown,
  ): Bluetooth.HandleRequestDevicePromptParameters {
    return params as Bluetooth.HandleRequestDevicePromptParameters;
  }
  parseSimulateAdapterParameters(
    params: unknown,
  ): Bluetooth.SimulateAdapterParameters {
    return params as Bluetooth.SimulateAdapterParameters;
  }
  parseSimulateAdvertisementParameters(
    params: unknown,
  ): Bluetooth.SimulateAdvertisementParameters {
    return params as Bluetooth.SimulateAdvertisementParameters;
  }
  parseSimulatePreconnectedPeripheralParameters(
    params: unknown,
  ): Bluetooth.SimulatePreconnectedPeripheralParameters {
    return params as Bluetooth.SimulatePreconnectedPeripheralParameters;
  }
  // keep-sorted end

  // Browser module
  // keep-sorted start block=yes
  parseRemoveUserContextParams(
    params: unknown,
  ): Browser.RemoveUserContextParameters {
    return params as Browser.RemoveUserContextParameters;
  }
  // keep-sorted end

  // Browsing Context module
  // keep-sorted start block=yes
  parseActivateParams(params: unknown): BrowsingContext.ActivateParameters {
    return params as BrowsingContext.ActivateParameters;
  }
  parseCaptureScreenshotParams(
    params: unknown,
  ): BrowsingContext.CaptureScreenshotParameters {
    return params as BrowsingContext.CaptureScreenshotParameters;
  }
  parseCloseParams(params: unknown): BrowsingContext.CloseParameters {
    return params as BrowsingContext.CloseParameters;
  }
  parseCreateParams(params: unknown): BrowsingContext.CreateParameters {
    return params as BrowsingContext.CreateParameters;
  }
  parseGetTreeParams(params: unknown): BrowsingContext.GetTreeParameters {
    return params as BrowsingContext.GetTreeParameters;
  }
  parseHandleUserPromptParams(
    params: unknown,
  ): BrowsingContext.HandleUserPromptParameters {
    return params as BrowsingContext.HandleUserPromptParameters;
  }
  parseLocateNodesParams(
    params: unknown,
  ): BrowsingContext.LocateNodesParameters {
    return params as BrowsingContext.LocateNodesParameters;
  }
  parseNavigateParams(params: unknown): BrowsingContext.NavigateParameters {
    return params as BrowsingContext.NavigateParameters;
  }
  parsePrintParams(params: unknown): BrowsingContext.PrintParameters {
    return params as BrowsingContext.PrintParameters;
  }
  parseReloadParams(params: unknown): BrowsingContext.ReloadParameters {
    return params as BrowsingContext.ReloadParameters;
  }
  parseSetViewportParams(
    params: unknown,
  ): BrowsingContext.SetViewportParameters {
    return params as BrowsingContext.SetViewportParameters;
  }
  parseTraverseHistoryParams(
    params: unknown,
  ): BrowsingContext.TraverseHistoryParameters {
    return params as BrowsingContext.TraverseHistoryParameters;
  }
  // keep-sorted end

  // CDP module
  // keep-sorted start block=yes
  parseGetSessionParams(params: unknown): Cdp.GetSessionParameters {
    return params as Cdp.GetSessionParameters;
  }
  parseResolveRealmParams(params: unknown): Cdp.ResolveRealmParameters {
    return params as Cdp.ResolveRealmParameters;
  }
  parseSendCommandParams(params: unknown): Cdp.SendCommandParameters {
    return params as Cdp.SendCommandParameters;
  }
  // keep-sorted end

  // Script module
  // keep-sorted start block=yes
  parseAddPreloadScriptParams(
    params: unknown,
  ): Script.AddPreloadScriptParameters {
    return params as Script.AddPreloadScriptParameters;
  }
  parseCallFunctionParams(params: unknown): Script.CallFunctionParameters {
    return params as Script.CallFunctionParameters;
  }
  parseDisownParams(params: unknown): Script.DisownParameters {
    return params as Script.DisownParameters;
  }
  parseEvaluateParams(params: unknown): Script.EvaluateParameters {
    return params as Script.EvaluateParameters;
  }
  parseGetRealmsParams(params: unknown): Script.GetRealmsParameters {
    return params as Script.GetRealmsParameters;
  }
  parseRemovePreloadScriptParams(
    params: unknown,
  ): Script.RemovePreloadScriptParameters {
    return params as Script.RemovePreloadScriptParameters;
  }
  // keep-sorted end

  // Input module
  // keep-sorted start block=yes
  parsePerformActionsParams(params: unknown): Input.PerformActionsParameters {
    return params as Input.PerformActionsParameters;
  }
  parseReleaseActionsParams(params: unknown): Input.ReleaseActionsParameters {
    return params as Input.ReleaseActionsParameters;
  }
  parseSetFilesParams(params: unknown): Input.SetFilesParameters {
    return params as Input.SetFilesParameters;
  }
  // keep-sorted end

  // Network module
  // keep-sorted start block=yes
  parseAddInterceptParams(params: unknown): Network.AddInterceptParameters {
    return params as Network.AddInterceptParameters;
  }
  parseContinueRequestParams(
    params: unknown,
  ): Network.ContinueRequestParameters {
    return params as Network.ContinueRequestParameters;
  }
  parseContinueResponseParams(
    params: unknown,
  ): Network.ContinueResponseParameters {
    return params as Network.ContinueResponseParameters;
  }
  parseContinueWithAuthParams(
    params: unknown,
  ): Network.ContinueWithAuthParameters {
    return params as Network.ContinueWithAuthParameters;
  }
  parseFailRequestParams(params: unknown): Network.FailRequestParameters {
    return params as Network.FailRequestParameters;
  }
  parseProvideResponseParams(
    params: unknown,
  ): Network.ProvideResponseParameters {
    return params as Network.ProvideResponseParameters;
  }
  parseRemoveInterceptParams(
    params: unknown,
  ): Network.RemoveInterceptParameters {
    return params as Network.RemoveInterceptParameters;
  }
  parseSetCacheBehavior(params: unknown): Network.SetCacheBehaviorParameters {
    return params as Network.SetCacheBehaviorParameters;
  }
  // keep-sorted end

  // Permissions module
  // keep-sorted start block=yes
  parseSetPermissionsParams(
    params: unknown,
  ): Permissions.SetPermissionParameters {
    return params as Permissions.SetPermissionParameters;
  }
  // keep-sorted end

  // Session module
  // keep-sorted start block=yes
  parseSubscribeParams(params: unknown): Session.SubscriptionRequest {
    return params as Session.SubscriptionRequest;
  }
  parseUnsubscribeParams(
    params: unknown,
  ): Session.UnsubscribeByAttributesRequest | Session.UnsubscribeByIdRequest {
    return params as
      | Session.UnsubscribeByAttributesRequest
      | Session.UnsubscribeByIdRequest;
  }
  // keep-sorted end

  // Storage module
  // keep-sorted start block=yes
  parseDeleteCookiesParams(params: unknown): Storage.DeleteCookiesParameters {
    return params as Storage.DeleteCookiesParameters;
  }
  parseGetCookiesParams(params: unknown): Storage.GetCookiesParameters {
    return params as Storage.GetCookiesParameters;
  }
  parseSetCookieParams(params: unknown): Storage.SetCookieParameters {
    return params as Storage.SetCookieParameters;
  }
  // keep-sorted end

  // WebExtenstion module
  // keep-sorted start block=yes
  parseInstallParams(params: unknown): WebExtension.InstallParameters {
    return params as WebExtension.InstallParameters;
  }
  parseUninstallParams(params: unknown): WebExtension.UninstallParameters {
    return params as WebExtension.UninstallParameters;
  }
  // keep-sorted end
}
