import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { writeSseChunk } from '../../src/modules/gateway/sse.js';

class FakeWritable extends EventEmitter {
  writes: Array<string | Buffer> = [];

  write(chunk: string | Buffer) {
    this.writes.push(chunk);
    return false;
  }
}

describe('gateway sse helpers', () => {
  it('waits for drain when the writable stream applies backpressure', async () => {
    const writable = new FakeWritable();
    let resolved = false;

    const pending = writeSseChunk(writable, 'data: hello\n\n').then(() => {
      resolved = true;
    });

    await new Promise((resolve) => setImmediate(resolve));

    expect(resolved).toBe(false);
    expect(writable.writes).toEqual(['data: hello\n\n']);

    writable.emit('drain');
    await pending;

    expect(resolved).toBe(true);
  });

  it('rejects when the writable closes before drain instead of hanging', async () => {
    const writable = new FakeWritable();
    let settled = false;

    const pending = writeSseChunk(writable, 'data: hello\n\n').finally(() => {
      settled = true;
    });

    await new Promise((resolve) => setImmediate(resolve));

    expect(settled).toBe(false);

    writable.emit('close');

    await expect(pending).rejects.toThrow('Client stream closed before drain');
    expect(settled).toBe(true);
  });
});
