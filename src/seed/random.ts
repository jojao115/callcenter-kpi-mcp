/**
 * Gerador pseudoaleatório com semente (mulberry32).
 * Mesma semente, mesma sequência: os dados de exemplo e os testes ficam reproduzíveis.
 */
export class Random {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Número em [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Inteiro em [min, max]. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick: lista vazia');
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /** Escolhe um índice com probabilidade proporcional ao peso. */
  weightedIndex(weights: readonly number[]): number {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i] as number;
      if (r < 0) return i;
    }
    return weights.length - 1;
  }

  /** Normal pelo método de Box-Muller. */
  normal(mean: number, sd: number): number {
    const u = 1 - this.next();
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Exponencial com a média dada. */
  exponential(mean: number): number {
    return -mean * Math.log(1 - this.next());
  }

  /** Log-normal com mediana e dispersão (sigma do log). */
  logNormal(median: number, sigma: number): number {
    return median * Math.exp(this.normal(0, sigma));
  }
}
