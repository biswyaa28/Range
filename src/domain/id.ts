export interface IdGen {
  uuid(): string;
}

export class CryptoIdGen implements IdGen {
  uuid(): string {
    try {
      if (typeof crypto === 'object' && crypto !== null && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
    } catch {
      // fallback
    }
    const b = new Uint8Array(16);
    try {
      crypto.getRandomValues(b);
    } catch {
      for (let i = 0; i < 16; i++) {
        b[i] = (Math.random() * 256) | 0;
      }
    }
    b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
    b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    return (
      h.slice(0, 8) +
      '-' +
      h.slice(8, 12) +
      '-' +
      h.slice(12, 16) +
      '-' +
      h.slice(16, 20) +
      '-' +
      h.slice(20)
    );
  }
}

export class SequenceIdGen implements IdGen {
  private counter = 0;
  private prefix: string;

  constructor(prefix = 'id') {
    this.prefix = prefix;
  }

  uuid(): string {
    this.counter++;
    return `${this.prefix}-${this.counter}`;
  }
}

export const defaultIdGen = new CryptoIdGen();
