/**
 * Минимальный PNG-декодер для тестов иконок — только то, что реально нужно
 * (8-бит RGBA, без interlace, ровно то, что кладёт `rsvg-convert`/`convert`
 * при генерации иконок этого пакета работ). Не библиотека общего назначения:
 * любой другой формат — явная ошибка, а не молчаливо неверный пиксель.
 *
 * Специально БЕЗ внешней зависимости (sharp/pngjs и т.п.) и без вызова
 * системных утилит (imagemagick) — тест обязан быть переносимым туда, где
 * этих инструментов нет (они нужны только для генерации, не для проверки
 * результата, см. `scripts/gen-icons.sh`). Zlib — единственная зависимость,
 * это встроенный модуль Node.
 */
import { inflateSync } from 'node:zlib';

export interface DecodedPng {
  readonly width: number;
  readonly height: number;
  /** RGBA, 4 байта на пиксель, построчно сверху вниз — уже расфильтровано. */
  readonly pixels: Buffer;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** Разфильтровка одной PNG-сканлинии на месте (RFC 2083 §6). */
function unfilterInPlace(
  current: Buffer,
  previous: Buffer | null,
  filterType: number,
  bpp: number,
): void {
  const zero = previous === null;
  for (let i = 0; i < current.length; i++) {
    const a = i >= bpp ? current[i - bpp]! : 0;
    const b = zero ? 0 : previous![i]!;
    const c = i >= bpp && !zero ? previous![i - bpp]! : 0;
    const raw = current[i]!;
    let value: number;
    switch (filterType) {
      case 0:
        value = raw;
        break;
      case 1:
        value = raw + a;
        break;
      case 2:
        value = raw + b;
        break;
      case 3:
        value = raw + Math.floor((a + b) / 2);
        break;
      case 4:
        value = raw + paeth(a, b, c);
        break;
      default:
        throw new Error(`png.ts: неизвестный тип фильтра сканлинии ${filterType}`);
    }
    current[i] = value & 0xff;
  }
}

/**
 * Декодирует PNG в RGBA. Поддерживает ровно тот профиль, который производят
 * `rsvg-convert`/`convert -type TrueColorAlpha` в этом репозитории:
 * bitDepth=8, colorType=6 (truecolor+alpha), interlace=0. Любой другой
 * профиль — явная ошибка (см. заголовок файла).
 */
export function decodePng(buffer: Buffer): DecodedPng {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('png.ts: не PNG (нет сигнатуры)');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idatChunks: Buffer[] = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const data = buffer.subarray(dataStart, dataStart + length);

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
      interlace = data.readUInt8(12);
    } else if (type === 'IDAT') {
      idatChunks.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }

    offset = dataStart + length + 4; // + CRC
  }

  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(
      `png.ts: неподдерживаемый профиль PNG (bitDepth=${bitDepth}, colorType=${colorType}, interlace=${interlace}) — ожидался 8-бит RGBA без interlace`,
    );
  }

  const raw = inflateSync(Buffer.concat(idatChunks));
  const bpp = 4; // RGBA, 8 бит на канал
  const stride = width * bpp;
  const pixels = Buffer.alloc(width * height * bpp);

  let previous: Buffer | null = null;
  let rawOffset = 0;
  for (let y = 0; y < height; y++) {
    const filterType = raw[rawOffset]!;
    rawOffset += 1;
    const scanline = raw.subarray(rawOffset, rawOffset + stride);
    rawOffset += stride;
    const current = Buffer.from(scanline); // копия — unfilterInPlace её меняет
    unfilterInPlace(current, previous, filterType, bpp);
    current.copy(pixels, y * stride);
    previous = current;
  }

  return { width, height, pixels };
}

/** Пиксель (r,g,b,a) в позиции (x,y). */
export function pixelAt(
  png: DecodedPng,
  x: number,
  y: number,
): readonly [number, number, number, number] {
  const offset = (y * png.width + x) * 4;
  return [
    png.pixels[offset]!,
    png.pixels[offset + 1]!,
    png.pixels[offset + 2]!,
    png.pixels[offset + 3]!,
  ];
}
