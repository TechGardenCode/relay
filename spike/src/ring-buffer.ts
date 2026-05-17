export class ByteRingBuffer {
  private chunks: Buffer[] = [];
  private size = 0;

  constructor(private readonly capacity: number) {}

  push(chunk: Buffer): void {
    if (chunk.length === 0) return;
    this.chunks.push(chunk);
    this.size += chunk.length;
    this.trim();
  }

  snapshot(): Buffer {
    return Buffer.concat(this.chunks, this.size);
  }

  private trim(): void {
    while (this.size > this.capacity && this.chunks.length > 0) {
      const head = this.chunks[0]!;
      const overflow = this.size - this.capacity;
      if (head.length <= overflow) {
        this.chunks.shift();
        this.size -= head.length;
      } else {
        this.chunks[0] = head.subarray(overflow);
        this.size -= overflow;
      }
    }
  }
}
