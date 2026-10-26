/** Browser entry point: install the editor bridge before webview.js executes. */
import { handleOAuthPopupCallbackIfPresent } from "./cloudDrive";
import { installBrowserBridge } from "./host/bridge";
import { mountWebAppChrome } from "./host/chrome";

installBrowserBridge();

if (!handleOAuthPopupCallbackIfPresent()) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountWebAppChrome);
  } else {
    mountWebAppChrome();
  }
}
