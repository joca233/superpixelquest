export type PlayerPalette = readonly [string, string, string];

const toHex = (value: number) => value.toString(16).padStart(2, "0");

const colorDistance = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export async function extractAmiiboPalette(file: File): Promise<PlayerPalette> {
  if (file.type !== "image/png" && !file.name.toLowerCase().endsWith(".png")) {
    throw new Error("Escolha uma imagem PNG.");
  }

  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = 48;
  canvas.height = 48;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    throw new Error("Não foi possível analisar essa imagem.");
  }

  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const buckets = new Map<string, { rgb: [number, number, number]; count: number }>();

  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 160) continue;
    const rgb: [number, number, number] = [pixels[i], pixels[i + 1], pixels[i + 2]];
    const lightness = (rgb[0] + rgb[1] + rgb[2]) / 3;
    if (lightness < 18 || lightness > 242) continue;
    const quantized = rgb.map((channel) => Math.min(224, Math.floor(channel / 32) * 32 + 16)) as [
      number,
      number,
      number,
    ];
    const key = quantized.join(",");
    const bucket = buckets.get(key);
    if (bucket) bucket.count += 1;
    else buckets.set(key, { rgb: quantized, count: 1 });
  }

  const ranked = [...buckets.values()].sort((a, b) => b.count - a.count);
  const selected: [number, number, number][] = [];
  for (const candidate of ranked) {
    if (selected.every((color) => colorDistance(color, candidate.rgb) >= 70)) selected.push(candidate.rgb);
    if (selected.length === 3) break;
  }

  const fallbacks: [number, number, number][] = [[230, 69, 57], [43, 72, 181], [255, 199, 154]];
  while (selected.length < 3) selected.push(fallbacks[selected.length]);
  const colors = selected.map((rgb) => `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(rgb[2])}`);
  return [colors[0], colors[1], colors[2]];
}

export function parseAmiiboCommand(text: string): PlayerPalette | null {
  const match = text.match(/^\/amiibo\s+(#[0-9a-f]{6}),(#[0-9a-f]{6}),(#[0-9a-f]{6})$/i);
  return match ? [match[1], match[2], match[3]] : null;
}