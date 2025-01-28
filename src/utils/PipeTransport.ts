
import type WebSocket from 'ws';


import {assert} from './assert.js';
import debug from 'debug';
import type {Transport} from './transport.js';

const debugInternal = debug('bidi:mapper:internal');

export class PipeTransport implements Transport {
    #pipeWrite: NodeJS.WritableStream;
    #onMessage:  ((message: string) => void) | null = null;

    //#subscriptions = new DisposableStack();

    #isClosed = false;
    #pendingMessage = '';

    constructor(
      pipeWrite: NodeJS.WritableStream,
      pipeRead: NodeJS.ReadableStream,
    ) {
      this.#pipeWrite = pipeWrite;

      pipeRead.on('data', (chunk) => {
        return this.#dispatch(chunk);
      });
      pipeRead.on('close', () => {
        this.close();
      });
      pipeRead.on('error', (error) => {
        debugInternal('Pipe read error: ', error);
        this.close();
      });
      pipeWrite.on('error', (error) => {
        debugInternal('Pipe read error: ', error);
        this.close();
      });
    }

    setOnMessage(onMessage: (message: string) => void) {
      this.#onMessage = onMessage;
    }
    sendMessage(message: string) {
      assert(!this.#isClosed, '`PipeTransport` is closed.');

      this.#pipeWrite.write(message);
      this.#pipeWrite.write('\0');
    }

    #dispatch(buffer: Buffer): void {
      assert(!this.#isClosed, '`PipeTransport` is closed.');

      let end = buffer.indexOf('\0');
      if (end === -1) {
        this.#pendingMessage += buffer.toString();
        return;
      }
      const message = this.#pendingMessage + buffer.toString(undefined, 0, end);
      if (this.#onMessage) {
        this.#onMessage.call(null, message);
      }

      let start = end + 1;
      end = buffer.indexOf('\0', start);
      while (end !== -1) {
        if (this.#onMessage) {
          this.#onMessage.call(null, buffer.toString(undefined, start, end));
        }
        start = end + 1;
        end = buffer.indexOf('\0', start);
      }
      this.#pendingMessage = buffer.toString(undefined, start);
    }

    close(): void {
      debugInternal('Closing pipe');
      this.#isClosed = true;
    }
  }