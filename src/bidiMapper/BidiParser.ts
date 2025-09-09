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
  Autofill,
  Bluetooth,
  Browser,
  BrowsingContext,
  Cdp,
  Emulation,
  Input,
  Network,
  Permissions,
  Script,
  Session,
  Storage,
  WebExtension,
} from '../protocol/protocol.js';

export interface BidiCommandParameterParser {
  // Autofill module
  // keep-sorted start block=yes
  parseAutofillTriggerParams(params: unknown): Autofill.TriggerParameters;
  // keep-sorted end

  // Bluetooth module
  // keep-sorted start block=yes
  parseDisableSimulationParameters(
    params: unknown,
  ): Bluetooth.DisableSimulationParameters;
  parseHandleRequestDevicePromptParams(
    params: unknown,
  ): Bluetooth.HandleRequestDevicePromptParameters;
  parseSimulateAdapterParameters(
    params: unknown,
  ): Bluetooth.SimulateAdapterParameters;
  parseSimulateAdvertisementParameters(
    params: unknown,
  ): Bluetooth.SimulateAdvertisementParameters;
  parseSimulateCharacteristicParameters(
    params: unknown,
  ): Bluetooth.SimulateCharacteristicParameters;
  parseSimulateCharacteristicResponseParameters(
    params: unknown,
  ): Bluetooth.SimulateCharacteristicResponseParameters;
  parseSimulateDescriptorParameters(
    params: unknown,
  ): Bluetooth.SimulateDescriptorParameters;
  parseSimulateDescriptorResponseParameters(
    params: unknown,
  ): Bluetooth.SimulateDescriptorResponseParameters;
  parseSimulateGattConnectionResponseParameters(
    params: unknown,
  ): Bluetooth.SimulateGattConnectionResponseParameters;
  parseSimulateGattDisconnectionParameters(
    params: unknown,
  ): Bluetooth.SimulateGattDisconnectionParameters;
  parseSimulatePreconnectedPeripheralParameters(
    params: unknown,
  ): Bluetooth.SimulatePreconnectedPeripheralParameters;
  parseSimulateServiceParameters(
    params: unknown,
  ): Bluetooth.SimulateServiceParameters;
  // keep-sorted end

  // Browser module
  // keep-sorted start block=yes
  parseCreateUserContextParameters(
    params: unknown,
  ): Browser.CreateUserContextParameters;
  parseRemoveUserContextParameters(
    params: unknown,
  ): Browser.RemoveUserContextParameters;
  parseSetClientWindowStateParameters(
    params: unknown,
  ): Browser.SetClientWindowStateParameters;
  // keep-sorted end

  // Browsing Context module
  // keep-sorted start block=yes
  parseActivateParams(params: unknown): BrowsingContext.ActivateParameters;
  parseCaptureScreenshotParams(
    params: unknown,
  ): BrowsingContext.CaptureScreenshotParameters;
  parseCloseParams(params: unknown): BrowsingContext.CloseParameters;
  parseCreateParams(params: unknown): BrowsingContext.CreateParameters;
  parseGetTreeParams(params: unknown): BrowsingContext.GetTreeParameters;
  parseHandleUserPromptParams(
    params: unknown,
  ): BrowsingContext.HandleUserPromptParameters;
  parseLocateNodesParams(
    params: unknown,
  ): BrowsingContext.LocateNodesParameters;
  parseNavigateParams(params: unknown): BrowsingContext.NavigateParameters;
  parsePrintParams(params: unknown): BrowsingContext.PrintParameters;
  parseReloadParams(params: unknown): BrowsingContext.ReloadParameters;
  parseSetViewportParams(
    params: unknown,
  ): BrowsingContext.SetViewportParameters;
  parseTraverseHistoryParams(
    params: unknown,
  ): BrowsingContext.TraverseHistoryParameters;
  // keep-sorted end

  // CDP module
  // keep-sorted start block=yes
  parseGetSessionParams(params: unknown): Cdp.GetSessionParameters;
  parseResolveRealmParams(params: unknown): Cdp.ResolveRealmParameters;
  parseSendCommandParams(params: unknown): Cdp.SendCommandParameters;
  // keep-sorted end

  // Emulation module
  // keep-sorted start block=yes
  parseSetForcedColorsModeThemeOverrideParams(
    params: unknown,
  ): Emulation.SetForcedColorsModeThemeOverrideParameters;
  parseSetGeolocationOverrideParams(
    params: unknown,
  ): Emulation.SetGeolocationOverrideParameters;
  parseSetLocaleOverrideParams(
    params: unknown,
  ): Emulation.SetLocaleOverrideParameters;
  parseSetScreenOrientationOverrideParams(
    params: unknown,
  ): Emulation.SetScreenOrientationOverrideParameters;
  parseSetScriptingEnabledParams(
    params: unknown,
  ): Emulation.SetScriptingEnabledParameters;
  parseSetTimezoneOverrideParams(
    params: unknown,
  ): Emulation.SetTimezoneOverrideParameters;
  // keep-sorted end

  // Input module
  // keep-sorted start block=yes
  parsePerformActionsParams(params: unknown): Input.PerformActionsParameters;
  parseReleaseActionsParams(params: unknown): Input.ReleaseActionsParameters;
  parseSetFilesParams(params: unknown): Input.SetFilesParameters;
  // keep-sorted end

  // Permissions module
  // keep-sorted start block=yes
  parseSetPermissionsParams(
    params: unknown,
  ): Permissions.SetPermissionParameters;
  // keep-sorted end block=yes

  // Network module
  // keep-sorted start block=yes
  parseAddDataCollectorParams(
    params: unknown,
  ): Network.AddDataCollectorParameters;
  parseAddInterceptParams(params: unknown): Network.AddInterceptParameters;
  parseContinueRequestParams(
    params: unknown,
  ): Network.ContinueRequestParameters;
  parseContinueResponseParams(
    params: unknown,
  ): Network.ContinueResponseParameters;
  parseContinueWithAuthParams(
    params: unknown,
  ): Network.ContinueWithAuthParameters;
  parseDisownDataParams(params: unknown): Network.DisownDataParameters;
  parseFailRequestParams(params: unknown): Network.FailRequestParameters;
  parseGetDataParams(params: unknown): Network.GetDataParameters;
  parseProvideResponseParams(
    params: unknown,
  ): Network.ProvideResponseParameters;
  parseRemoveDataCollectorParams(
    params: unknown,
  ): Network.RemoveDataCollectorParameters;
  parseRemoveInterceptParams(
    params: unknown,
  ): Network.RemoveInterceptParameters;
  parseSetCacheBehaviorParams(
    params: unknown,
  ): Network.SetCacheBehaviorParameters;
  parseSetExtraHeadersParams(
    params: unknown,
  ): Network.SetExtraHeadersParameters;
  // keep-sorted end block=yes

  // Script module
  // keep-sorted start block=yes
  parseAddPreloadScriptParams(
    params: unknown,
  ): Script.AddPreloadScriptParameters;
  parseCallFunctionParams(params: unknown): Script.CallFunctionParameters;
  parseDisownParams(params: unknown): Script.DisownParameters;
  parseEvaluateParams(params: unknown): Script.EvaluateParameters;
  parseGetRealmsParams(params: unknown): Script.GetRealmsParameters;
  parseRemovePreloadScriptParams(
    params: unknown,
  ): Script.RemovePreloadScriptParameters;
  // keep-sorted end

  // Session module
  // keep-sorted start block=yes
  parseSubscribeParams(params: unknown): Session.SubscriptionRequest;
  parseUnsubscribeParams(params: unknown): Session.UnsubscribeParameters;
  // keep-sorted end

  // Storage module
  // keep-sorted start block=yes
  parseDeleteCookiesParams(params: unknown): Storage.DeleteCookiesParameters;
  parseGetCookiesParams(params: unknown): Storage.GetCookiesParameters;
  parseSetCookieParams(params: unknown): Storage.SetCookieParameters;
  // keep-sorted end

  // WebExtenstion module
  // keep-sorted start block=yes
  parseInstallParams(params: unknown): WebExtension.InstallParameters;
  parseUninstallParams(params: unknown): WebExtension.UninstallParameters;
  // keep-sorted end
}
