/**
 * Copyright 2021 Google Inc. All rights reserved.
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
// Copied form Puppeteer

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import * as childProcess from 'child_process';
import * as https from 'https';
import * as http from 'http';
import pkgDir from 'pkg-dir';

import extractZip from 'extract-zip';
import { promisify } from 'util';
import removeRecursive from 'rimraf';
import * as URL from 'url';
import createHttpsProxyAgent, {
  HttpsProxyAgent,
  HttpsProxyAgentOptions,
} from 'https-proxy-agent';
import { getProxyForUrl } from 'proxy-from-env';

import debug from 'debug';
const debugFetcher = debug(`chromium:fetcher`);

const CHROMIUM_REVISION: string = '884014';

const downloadURLs: Map<string, string> = new Map([
  ['linux', '%s/chromium-browser-snapshots/Linux_x64/%d/%s.zip'],
  ['mac', '%s/chromium-browser-snapshots/Mac/%d/%s.zip'],
  ['win32', '%s/chromium-browser-snapshots/Win/%d/%s.zip'],
  ['win64', '%s/chromium-browser-snapshots/Win_x64/%d/%s.zip'],
]);

const browserConfig = {
  host: 'https://storage.googleapis.com',
  destination: '.local-chromium',
} as const;

type Platform = 'linux' | 'mac' | 'win32' | 'win64';

const readdirAsync = promisify(fs.readdir.bind(fs));
const mkdirAsync = promisify(fs.mkdir.bind(fs));
const unlinkAsync = promisify(fs.unlink.bind(fs));
const chmodAsync = promisify(fs.chmod.bind(fs));

/**
 * @public
 */
export interface BrowserFetcherRevisionInfo {
  folderPath: string;
  executablePath: string;
  url: string;
  local: boolean;
  revision: string;
}
/**
 * BrowserFetcher can download and manage different versions of Chromium.
 *
 * @remarks
 * BrowserFetcher operates on revision strings that specify a precise version of
 *  Chromium, e.g. `"533271"`. Revision strings can be obtained from
 * {@link http://omahaproxy.appspot.com/ | omahaproxy.appspot.com}.
 *
 * @example
 * An example of using BrowserFetcher to download a specific version of
 * Chromium:
 *
 * ```js
 * const browserFetcher = puppeteer.createBrowserFetcher();
 * const revisionInfo = await browserFetcher.download('533271');
 * const browserExecutablePath = revisionInfo.executablePath;
 * ```
 *
 * **NOTE** BrowserFetcher is not designed to work concurrently with other
 * instances of BrowserFetcher that share the same downloads directory.
 *
 * @public
 */

/**
 * Asserts that the given value is truthy.
 * @param value
 * @param message - the error message to throw if the value is not truthy.
 */
const assert = (value: unknown, message?: string): void => {
  if (!value) throw new Error(message);
};

export class BrowserFetcher {
  private _downloadsFolder: string;
  private _downloadHost: string;
  private _platform: Platform;

  constructor() {
    const projectRoot = pkgDir.sync(__dirname);
    this._downloadsFolder = path.join(projectRoot, browserConfig.destination);
    this._downloadHost = browserConfig.host;
    this.setPlatform();
    assert(
      downloadURLs.get(this._platform),
      'Unsupported platform: ' + this._platform
    );
  }

  /**
   * Initiates a GET request to download the revision from the host.
   * @param revision - The revision to download.
   * @param progressCallback - A function that will be called with two arguments:
   * How many bytes have been downloaded and the total number of bytes of the download.
   * @returns A promise with revision information when the revision is downloaded
   * and extracted.
   */
  async download(
    revision: string,
    progressCallback: (x: number, y: number) => void = (): void => {}
  ): Promise<BrowserFetcherRevisionInfo> {
    const url = this.getDownloadURL(
      this._platform,
      this._downloadHost,
      revision
    );
    const fileName = url.split('/').pop();
    const archivePath = path.join(this._downloadsFolder, fileName);
    const outputPath = this.getFolderPath(revision);
    if (await this.isFileExistsAsync(outputPath)) return this.revisionInfo();
    if (!(await this.isFileExistsAsync(this._downloadsFolder)))
      await mkdirAsync(this._downloadsFolder);

    // Use Intel x86 builds on Apple M1 until native macOS arm64
    // Chromium builds are available.
    if (os.platform() !== 'darwin' && os.arch() === 'arm64') {
      this.handleArm64();
      return;
    }
    try {
      await this.downloadFile(url, archivePath, progressCallback);
      await this.install(archivePath, outputPath);
    } finally {
      if (await this.isFileExistsAsync(archivePath))
        await unlinkAsync(archivePath);
    }

    const revisionInfo = this.revisionInfo();
    if (revisionInfo) await chmodAsync(revisionInfo.executablePath, 0o755);

    return revisionInfo;
  }

  /**
   * @returns A promise with a list of all revision strings available locally
   * on disk.
   */
  async localRevisions(): Promise<string[]> {
    if (!(await this.isFileExistsAsync(this._downloadsFolder))) return [];
    const fileNames: string[] = await readdirAsync(this._downloadsFolder);
    return fileNames
      .map((fileName) => this.parseFolderPath(fileName))
      .filter((entry) => entry && entry.platform === this._platform)
      .map((entry) => entry.revision);
  }

  /**
   * @param revision - A revision to remove.
   * @returns A promise that resolves when the revision has been removed or
   * throws if the revision has not been downloaded.
   */
  async remove(revision: string): Promise<void> {
    const folderPath = this.getFolderPath(revision);
    assert(
      await this.isFileExistsAsync(folderPath),
      `Failed to remove: revision ${revision} is not downloaded`
    );
    await new Promise((fulfill) => removeRecursive(folderPath, fulfill));
  }

  /**
   * @param revision - The revision to get info for.
   * @returns The revision info for the given revision.
   */
  revisionInfo(): BrowserFetcherRevisionInfo {
    const folderPath = this.getFolderPath(CHROMIUM_REVISION);
    let executablePath = '';
    if (this._platform === 'mac')
      executablePath = path.join(
        folderPath,
        this.getArchiveName(this._platform, CHROMIUM_REVISION),
        'Chromium.app',
        'Contents',
        'MacOS',
        'Chromium'
      );
    else if (this._platform === 'linux')
      executablePath = path.join(
        folderPath,
        this.getArchiveName(this._platform, CHROMIUM_REVISION),
        'chrome'
      );
    else if (this._platform === 'win32' || this._platform === 'win64')
      executablePath = path.join(
        folderPath,
        this.getArchiveName(this._platform, CHROMIUM_REVISION),
        'chrome.exe'
      );
    else throw new Error('Unsupported platform: ' + this._platform);
    const url = this.getDownloadURL(
      this._platform,
      this._downloadHost,
      CHROMIUM_REVISION
    );
    const local = fs.existsSync(folderPath);
    debugFetcher({
      revision: CHROMIUM_REVISION,
      executablePath,
      folderPath,
      local,
      url,
    });
    return {
      revision: CHROMIUM_REVISION,
      executablePath,
      folderPath,
      local,
      url,
    };
  }

  private setPlatform(platformFromOptions?: Platform): void {
    if (platformFromOptions) {
      this._platform = platformFromOptions;
      return;
    }

    const platform = os.platform();
    if (platform === 'darwin') this._platform = 'mac';
    else if (platform === 'linux') this._platform = 'linux';
    else if (platform === 'win32')
      this._platform = os.arch() === 'x64' ? 'win64' : 'win32';
    else assert(this._platform, 'Unsupported platform: ' + os.platform());
  }

  private getFolderPath(revision: string): string {
    return path.join(this._downloadsFolder, this._platform + '-' + revision);
  }

  private parseFolderPath(
    folderPath: string
  ): { platform: string; revision: string } | null {
    const name = path.basename(folderPath);
    const splits: string[] = name.split('-');
    if (splits.length !== 2) return null;
    const [platform, revision] = splits;
    if (!downloadURLs.get(platform)) return null;
    return { platform, revision };
  }

  private downloadFile(
    url: string,
    destinationPath: string,
    progressCallback: (x: number, y: number) => void
  ): Promise<void> {
    debugFetcher(`Downloading binary from ${url}`);
    let fulfill: (value?: void | PromiseLike<void>) => void;
    let reject: (reason?: any) => void;
    let downloadedBytes = 0;
    let totalBytes = 0;

    const promise = new Promise<void>((x, y) => {
      fulfill = x;
      reject = y;
    });

    const request = this.httpRequest(url, 'GET', (response) => {
      if (response.statusCode !== 200) {
        const error = new Error(
          `Download failed: server returned code ${response.statusCode}. URL: ${url}`
        );
        // consume response data to free up memory
        response.resume();
        reject(error);
        return;
      }
      const file = fs.createWriteStream(destinationPath);
      file.on('finish', () => fulfill());
      file.on('error', (error) => reject(error));
      response.pipe(file);
      totalBytes = parseInt(
        /** @type {string} */ response.headers['content-length'],
        10
      );
      if (progressCallback) response.on('data', onData);
    });
    request.on('error', (error) => reject(error));
    return promise;

    function onData(chunk: string): void {
      downloadedBytes += chunk.length;
      progressCallback(downloadedBytes, totalBytes);
    }
  }

  private install(archivePath: string, folderPath: string): Promise<unknown> {
    debugFetcher(`Installing ${archivePath} to ${folderPath}`);
    if (archivePath.endsWith('.zip'))
      return extractZip(archivePath, { dir: folderPath });
    else if (archivePath.endsWith('.tar.bz2'))
      return this.extractTar(archivePath, folderPath);
    else if (archivePath.endsWith('.dmg'))
      return mkdirAsync(folderPath).then(() =>
        this.installDMG(archivePath, folderPath)
      );
    else throw new Error(`Unsupported archive format: ${archivePath}`);
  }

  private extractTar(tarPath: string, folderPath: string): Promise<unknown> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const tar = require('tar-fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const bzip = require('unbzip2-stream');
    return new Promise((fulfill, reject) => {
      const tarStream = tar.extract(folderPath);
      tarStream.on('error', reject);
      tarStream.on('finish', fulfill);
      const readStream = fs.createReadStream(tarPath);
      readStream.pipe(bzip()).pipe(tarStream);
    });
  }

  private installDMG(dmgPath: string, folderPath: string): Promise<void> {
    let mountPath: string;

    function mountAndCopy(
      fulfill: () => void,
      reject: (error: Error) => void
    ): void {
      const mountCommand = `hdiutil attach -nobrowse -noautoopen "${dmgPath}"`;
      childProcess.exec(mountCommand, (err, stdout) => {
        if (err) return reject(err);
        const volumes = stdout.match(/\/Volumes\/(.*)/m);
        if (!volumes)
          return reject(new Error(`Could not find volume path in ${stdout}`));
        mountPath = volumes[0];
        readdirAsync(mountPath)
          .then((fileNames: string[]) => {
            const appName = fileNames.filter(
              (item) => typeof item === 'string' && item.endsWith('.app')
            )[0];
            if (!appName)
              return reject(new Error(`Cannot find app in ${mountPath}`));
            const copyPath = path.join(mountPath, appName);
            debugFetcher(`Copying ${copyPath} to ${folderPath}`);
            childProcess.exec(`cp -R "${copyPath}" "${folderPath}"`, (err) => {
              if (err) reject(err);
              else fulfill();
            });
          })
          .catch(reject);
      });
    }

    function unmount(): void {
      if (!mountPath) return;
      const unmountCommand = `hdiutil detach "${mountPath}" -quiet`;
      debugFetcher(`Unmounting ${mountPath}`);
      childProcess.exec(unmountCommand, (err) => {
        if (err) console.error(`Error unmounting dmg: ${err}`);
      });
    }

    return new Promise<void>(mountAndCopy)
      .catch((error) => {
        console.error(error);
      })
      .finally(unmount);
  }

  private httpRequest(
    url: string,
    method: string,
    response: (x: http.IncomingMessage) => void
  ): http.ClientRequest {
    const urlParsed = URL.parse(url);

    type Options = Partial<URL.UrlWithStringQuery> & {
      method?: string;
      agent?: HttpsProxyAgent;
      rejectUnauthorized?: boolean;
    };

    let options: Options = {
      ...urlParsed,
      method,
    };

    const proxyURL = getProxyForUrl(url);
    if (proxyURL) {
      if (url.startsWith('http:')) {
        const proxy = URL.parse(proxyURL);
        options = {
          path: options.href,
          host: proxy.hostname,
          port: proxy.port,
        };
      } else {
        const parsedProxyURL = URL.parse(proxyURL);

        const proxyOptions = {
          ...parsedProxyURL,
          secureProxy: parsedProxyURL.protocol === 'https:',
        } as HttpsProxyAgentOptions;

        options.agent = createHttpsProxyAgent(proxyOptions);
        options.rejectUnauthorized = false;
      }
    }

    const requestCallback = (res: http.IncomingMessage): void => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
        this.httpRequest(res.headers.location, method, response);
      else response(res);
    };
    const request =
      options.protocol === 'https:'
        ? https.request(options, requestCallback)
        : http.request(options, requestCallback);
    request.end();
    return request;
  }

  private getArchiveName(platform: Platform, revision: string): string {
    if (platform === 'linux') return 'chrome-linux';
    if (platform === 'mac') return 'chrome-mac';
    if (platform === 'win32' || platform === 'win64') return 'chrome-win32';
  }

  private getDownloadURL(
    platform: Platform,
    host: string,
    revision: string
  ): string {
    const url = util.format(
      downloadURLs.get(platform),
      host,
      revision,
      this.getArchiveName(platform, revision)
    );
    return url;
  }

  private handleArm64(): void {
    fs.stat('/usr/bin/chromium-browser', function (err, stats) {
      if (stats === undefined) {
        fs.stat('/usr/bin/chromium', function (err, stats) {
          if (stats === undefined) {
            console.error(`The chromium binary is not available for arm64.`);
            console.error(`If you are on Ubuntu, you can install with: `);
            console.error(`\n sudo apt install chromium\n`);
            console.error(`\n sudo apt install chromium-browser\n`);
            throw new Error();
          }
        });
      }
    });
  }

  private isFileExistsAsync(filePath: string): Promise<boolean> {
    return new Promise((resolve) => {
      fs.access(filePath, (err) => resolve(!err));
    });
  }
}
