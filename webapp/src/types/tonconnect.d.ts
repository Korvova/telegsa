declare module '@tonconnect/ui' {
  export class TonConnectUI {
    constructor(opts: { manifestUrl: string });
    openModal(): Promise<void>;
    disconnect(): Promise<void>;
    onStatusChange(cb: (wallet: any) => void): () => void;
    readonly wallet?: any;
  }
}
