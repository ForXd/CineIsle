declare module 'mux.js' {
  interface Segment {
    data: Uint8Array;
    initSegment: Uint8Array;
  }
  class Transmuxer {
    constructor(options?: { keepOriginalTimestamps?: boolean });
    on(event: 'data', callback: (segment: Segment) => void): void;
    push(data: Uint8Array): void;
    flush(): void;
  }
  const muxjs: { mp4: { Transmuxer: typeof Transmuxer } };
  export default muxjs;
}
