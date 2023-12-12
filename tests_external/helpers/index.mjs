import {execSync} from 'child_process';
import {join} from 'path';

export function installAndGetChromePath() {
  let BROWSER_BIN = process.env.BROWSER_BIN;
  if (!BROWSER_BIN) {
    BROWSER_BIN = execSync(
      ['node', join('tools', 'install-browser.mjs')].join(' ')
    )
      .toString()
      .trim();
  }
  return BROWSER_BIN;
}

export function installAndGetChromeDriverPath() {
  let CHROMEDRIVER_BIN = process.env.CHROMEDRIVER_BIN;
  if (!CHROMEDRIVER_BIN) {
    CHROMEDRIVER_BIN = execSync(
      ['node', join('tools', 'install-browser.mjs'), '--chromedriver'].join(' ')
    )
      .toString()
      .trim();
  }
  return CHROMEDRIVER_BIN;
}
