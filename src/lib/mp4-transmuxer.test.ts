import { describe, expect, it, vi } from 'vitest';
import {
  BufferSource,
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacket,
  EncodedPacketSink,
  Input,
  MP4,
  MpegTsOutputFormat,
  Output,
} from 'mediabunny';
import { StreamingTransmuxer } from './mp4-transmuxer';

// Generate a real MPEG-TS container with AAC packets and a nonzero broadcast timestamp.
async function transportStream(): Promise<Uint8Array> {
  const output = new Output({ format: new MpegTsOutputFormat(), target: new BufferTarget() });
  const source = new EncodedAudioPacketSource('aac');
  output.addAudioTrack(source);
  await output.start();
  const frame = new Uint8Array([0x21, 0x10, 0x04, 0x60, 0x8c, 0x1c]);
  for (let i = 0; i < 48; i++) {
    await source.add(new EncodedPacket(frame, 'key', 10 + (i * 1024) / 48000, 1024 / 48000), {
      decoderConfig: {
        codec: 'mp4a.40.2',
        sampleRate: 48000,
        numberOfChannels: 2,
        description: new Uint8Array([0x11, 0x90]),
      },
    });
  }
  await output.finalize();
  if (!output.target.buffer) throw new Error('Missing generated transport stream');
  return new Uint8Array(output.target.buffer);
}

describe('streaming MP4 conversion', () => {
  it('preserves AAC packets and real duration across arbitrary chunk boundaries', async () => {
    const chunks: Uint8Array[] = [];
    const close = vi.fn(async () => {});
    const converter = new StreamingTransmuxer({
      write: async (data) => {
        chunks.push(data.slice());
      },
      close,
    });
    const ts = await transportStream();
    for (let offset = 0; offset < ts.length; offset += 1024) {
      await converter.pushAndTransmux(ts.subarray(offset, offset + 1024));
    }
    await converter.finish();
    expect(close).toHaveBeenCalledOnce();
    const bytes = new Uint8Array(await new Blob(chunks as BlobPart[]).arrayBuffer());
    const result = new Input({ source: new BufferSource(bytes), formats: [MP4] });
    try {
      expect(await result.computeDuration()).toBeCloseTo(1.024, 2);
      const audio = await result.getPrimaryAudioTrack();
      expect(audio?.codec).toBe('aac');
      if (!audio) throw new Error('Missing audio track');
      let count = 0;
      for await (const packet of new EncodedPacketSink(audio).packets()) {
        expect(packet.data).toEqual(new Uint8Array([0x21, 0x10, 0x04, 0x60, 0x8c, 0x1c]));
        count++;
      }
      expect(count).toBe(48);
    } finally {
      result.dispose();
    }
  });

  it('rejects invalid input instead of successfully saving an empty file', async () => {
    const close = vi.fn(async () => {});
    const converter = new StreamingTransmuxer({ write: async () => {}, close });
    await expect(
      (async () => {
        await converter.pushAndTransmux(new Uint8Array([1, 2, 3]));
        await converter.finish();
      })()
    ).rejects.toBeDefined();
    expect(close).not.toHaveBeenCalled();
  });

  it('aborts an unfinished stream without publishing a partial download', async () => {
    const close = vi.fn(async () => {});
    const abort = vi.fn(async () => {});
    const converter = new StreamingTransmuxer({ write: async () => {}, close, abort });
    await converter.abort();
    expect(abort).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
  });
});
