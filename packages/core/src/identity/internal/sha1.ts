/**
 * Чистая реализация SHA-1 (RFC 3174), без внешних зависимостей и без
 * `node:crypto` — нужна синхронно и в браузере (`apps/web`, Vite-бандл), и
 * в Node/native-обёртках; `crypto.subtle.digest` (Web Crypto) есть в обоих
 * рантаймах, но асинхронна, что несовместимо с чистыми синхронными
 * доменными функциями. Единственный потребитель — `../uuid-v5.ts`: SHA-1
 * здесь не крипто-примитив для защиты данных, а фиксированная часть
 * алгоритма UUIDv5 из RFC 4122 §4.3, менять/усиливать его нельзя — это
 * сломает совместимость с другими генераторами UUIDv5.
 *
 * Корректность проверена в тестах против официальных тестовых векторов
 * RFC 3174 (`"abc"`, пустая строка, 56-байтная строка) и против
 * `node:crypto` — см. `test/identity/sha1.test.ts`.
 */
export function sha1(message: Uint8Array): Uint8Array {
  const messageLength = message.length;
  const bitLength = BigInt(messageLength) * 8n;

  // Паддинг по RFC 3174 §4: 0x80, нули, 64-битная длина в битах, кратно 64.
  const paddedLength = (messageLength + 9 + 63) & ~63;
  const padded = new Uint8Array(paddedLength);
  padded.set(message);
  padded[messageLength] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, Number(bitLength & 0xffffffffn), false);
  view.setUint32(padded.length - 8, Number((bitLength >> 32n) & 0xffffffffn), false);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  const w = new Uint32Array(80);

  for (let chunkStart = 0; chunkStart < padded.length; chunkStart += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(chunkStart + i * 4, false);
    }
    for (let i = 16; i < 80; i++) {
      const value = (w[i - 3] ?? 0) ^ (w[i - 8] ?? 0) ^ (w[i - 14] ?? 0) ^ (w[i - 16] ?? 0);
      w[i] = (value << 1) | (value >>> 31);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + (w[i] ?? 0)) >>> 0;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const digest = new Uint8Array(20);
  const digestView = new DataView(digest.buffer);
  digestView.setUint32(0, h0, false);
  digestView.setUint32(4, h1, false);
  digestView.setUint32(8, h2, false);
  digestView.setUint32(12, h3, false);
  digestView.setUint32(16, h4, false);
  return digest;
}
