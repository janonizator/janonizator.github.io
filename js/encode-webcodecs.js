// Caminho rápido: WebCodecs (encoder H.264 do hardware) + Mediabunny para o MP4.
// O áudio AAC é copiado pacote a pacote, sem recodificar.

import {
  ALL_FORMATS,
  BufferSource,
  BufferTarget,
  CanvasSource,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  canEncodeVideo,
} from '../vendor/mediabunny.min.mjs';
import { Renderer } from './renderer.js';

export async function podeCodificar(W, H, bitrate) {
  if (typeof VideoEncoder === 'undefined') return false;
  try {
    return await canEncodeVideo('avc', { width: W, height: H, quality: new Quality({ bitrate }) });
  } catch {
    return false;
  }
}

export async function codificar({ canvas, foto, texto, elipse, legendas, audio, video, deformacao, aoProgredir }) {
  const entrada = new Input({ source: new BufferSource(audio), formats: ALL_FORMATS });
  const faixa = await entrada.getPrimaryAudioTrack();
  if (!faixa) throw new Error('O arquivo de áudio não tem faixa de áudio.');
  const duracao = await faixa.computeDuration();
  const decoderConfig = await faixa.getDecoderConfig();
  const pacotes = [];
  for await (const p of new EncodedPacketSink(faixa).packets()) pacotes.push(p);

  const renderer = new Renderer(canvas, { foto, texto, elipse, legendas, zoomFinal: video.zoomFinal, deformacao });
  const saida = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const fonteVideo = new CanvasSource(canvas, {
    codec: 'avc',
    quality: new Quality({ bitrate: video.bitrate }),
    keyFrameInterval: 1,
    latencyMode: 'quality',
  });
  const fonteAudio = new EncodedAudioPacketSource(faixa.codec);
  saida.addVideoTrack(fonteVideo, { frameRate: video.fps });
  saida.addAudioTrack(fonteAudio);
  await saida.start();

  let a = 0;
  const adicionarAudioAte = async (t) => {
    for (; a < pacotes.length && pacotes[a].timestamp <= t; a++) {
      await fonteAudio.add(pacotes[a], a === 0 ? { decoderConfig } : undefined);
    }
  };

  const total = Math.max(1, Math.round(duracao * video.fps));
  for (let i = 0; i < total; i++) {
    const t = i / video.fps;
    await adicionarAudioAte(t);
    renderer.desenhar(total > 1 ? i / (total - 1) : 1, t);
    await fonteVideo.add(t, 1 / video.fps);
    aoProgredir?.((i + 1) / total);
  }
  await adicionarAudioAte(Infinity);

  await saida.finalize();
  renderer.descartar();
  entrada.dispose?.();
  return saida.target.buffer;
}
