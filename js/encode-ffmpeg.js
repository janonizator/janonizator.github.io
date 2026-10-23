// Modo de compatibilidade: para navegadores sem encoder H.264 no WebCodecs.
// Renderiza os quadros com o mesmo compositor WebGL2 e codifica com ffmpeg.wasm (lento, ~31 MB).

import { ALL_FORMATS, BufferSource, Input } from '../vendor/mediabunny.min.mjs';
import { Renderer } from './renderer.js';

const BASE = new URL('../vendor/ffmpeg/', import.meta.url).href;

export async function codificarComFfmpeg({ foto, texto, elipse, legendas, audio, W, H, video, deformacao, aoProgredir }) {
  const entrada = new Input({ source: new BufferSource(audio), formats: ALL_FORMATS });
  const duracao = await (await entrada.getPrimaryAudioTrack()).computeDuration();
  entrada.dispose?.();

  aoProgredir(0, 'Baixando o modo de compatibilidade (~31 MB)…');
  const { FFmpeg } = await import('../vendor/ffmpeg/index.js');
  const ff = new FFmpeg();
  await ff.load({ coreURL: `${BASE}ffmpeg-core.js`, wasmURL: `${BASE}ffmpeg-core.wasm` });

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const renderer = new Renderer(canvas, { foto, texto, elipse, legendas, zoomFinal: video.zoomFinal, deformacao });

  const total = Math.max(1, Math.round(duracao * video.fps));
  for (let i = 0; i < total; i++) {
    renderer.desenhar(total > 1 ? i / (total - 1) : 1, i / video.fps);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
    await ff.writeFile(`f${String(i).padStart(4, '0')}.jpg`, new Uint8Array(await blob.arrayBuffer()));
    aoProgredir((0.3 * (i + 1)) / total, 'Preparando quadros…');
  }
  renderer.descartar();

  await ff.writeFile('audio.m4a', new Uint8Array(audio));
  ff.on('progress', ({ progress }) => aoProgredir(0.3 + 0.7 * Math.min(1, Math.max(0, progress)), 'Codificando vídeo…'));
  // prettier-ignore
  await ff.exec([
    '-framerate', String(video.fps), '-i', 'f%04d.jpg', '-i', 'audio.m4a',
    '-map', '0:v', '-map', '1:a',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-g', String(video.fps), '-r', String(video.fps),
    '-c:a', 'copy', '-t', duracao.toFixed(3), '-movflags', '+faststart', 'saida.mp4',
  ]);
  const dados = await ff.readFile('saida.mp4');
  ff.terminate();
  return dados.buffer;
}
