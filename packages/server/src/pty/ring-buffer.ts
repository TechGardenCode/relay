// Per ND-03: 32 KB circular byte buffer per session, used only for on-attach
// replay. Bytes-only — no line awareness, no message boundaries. The buffer is
// allocated once at construction; pushes are zero-allocation (single
// Buffer.copy), and snapshot() is one allocation bounded by capacity.

export interface RingBuffer {
  push(chunk: Buffer): void;
  /** Fresh Buffer copy of current contents in chronological order. */
  snapshot(): Buffer;
  readonly capacity: number;
}

export function createRingBuffer(capacity: number): RingBuffer {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError(`ring-buffer: capacity must be a positive integer, got ${capacity}`);
  }

  const buf = Buffer.allocUnsafe(capacity);
  let writeIdx = 0;
  let filled = false;

  function push(chunk: Buffer): void {
    const len = chunk.length;
    if (len === 0) return;

    if (len >= capacity) {
      // Chunk alone overflows the buffer — keep only the trailing `capacity`
      // bytes and reset cursors.
      chunk.copy(buf, 0, len - capacity);
      writeIdx = 0;
      filled = true;
      return;
    }

    const tail = capacity - writeIdx;
    if (len <= tail) {
      chunk.copy(buf, writeIdx);
      writeIdx += len;
      if (writeIdx === capacity) {
        writeIdx = 0;
        filled = true;
      }
    } else {
      chunk.copy(buf, writeIdx, 0, tail);
      chunk.copy(buf, 0, tail);
      writeIdx = len - tail;
      filled = true;
    }
  }

  function snapshot(): Buffer {
    if (!filled) {
      // Haven't wrapped yet — content is in [0, writeIdx).
      const out = Buffer.allocUnsafe(writeIdx);
      buf.copy(out, 0, 0, writeIdx);
      return out;
    }
    // Wrapped: chronological order is [writeIdx, capacity) ++ [0, writeIdx).
    const out = Buffer.allocUnsafe(capacity);
    buf.copy(out, 0, writeIdx);
    buf.copy(out, capacity - writeIdx, 0, writeIdx);
    return out;
  }

  return {
    push,
    snapshot,
    get capacity() {
      return capacity;
    },
  };
}
