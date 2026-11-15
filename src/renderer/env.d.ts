import type { HostApi } from '../preload/host-preload';

declare global {
  interface Window {
    gdocsApi: HostApi;
  }
}

export {};
