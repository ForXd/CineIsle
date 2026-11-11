import {
  AppendOnlyStreamTarget,
  Conversion,
  Input,
  MPEG_TS,
  Mp4OutputFormat,
  Output,
  ReadableStreamSource,
} from 'mediabunny';

type Writer = {
  write(data: Uint8Array): Promise<void>;
  close?(): Promise<void>;
  abort?(): Promise<void>;
};

/** Bounded, backpressured MPEG-TS → fragmented MP4 pipeline; no decoding or whole-file buffering. */
export class StreamingTransmuxer {
  private readonly input: Input;
  private readonly sourceWriter: WritableStreamDefaultWriter<Uint8Array>;
  private readonly completion: Promise<void>;
  private failure: unknown;
  private finished = false;

  constructor(private readonly writer: Writer) {
    const stream = new TransformStream<Uint8Array, Uint8Array>();
    this.sourceWriter = stream.writable.getWriter();
    const input = new Input({
      source: new ReadableStreamSource(stream.readable, { maxCacheSize: 16 * 1024 * 1024 }),
      formats: [MPEG_TS],
    });
    this.input = input;
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: 'fragmented' }),
      target: new AppendOnlyStreamTarget(
        new WritableStream<Uint8Array>({
          write: (data) => writer.write(data),
        })
      ),
    });
    this.completion = (async () => {
      try {
        const conversion = await Conversion.init({
          input,
          output,
          copy: { mode: 'forced' },
          showWarnings: false,
        });
        if (!conversion.isValid || conversion.discardedTracks.length > 0) {
          throw new Error('该视频编码无法无损封装为 MP4，请选择 TS 格式下载');
        }
        await conversion.execute();
      } catch (err) {
        this.failure = err;
        await output.cancel().catch(() => {});
      } finally {
        input.dispose();
      }
    })();
  }

  async pushAndTransmux(data: Uint8Array): Promise<void> {
    if (this.finished) throw new Error('转封装任务已结束');
    if (this.failure) throw this.failure;
    await this.sourceWriter.write(data);
    if (this.failure) throw this.failure;
  }

  async finish(): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    await this.sourceWriter.close();
    await this.completion;
    if (this.failure) throw this.failure;
    await this.writer.close?.();
  }

  async abort(): Promise<void> {
    this.finished = true;
    this.input.dispose();
    await this.sourceWriter.abort().catch(() => {});
    await this.completion;
    await this.writer.abort?.();
  }
}
