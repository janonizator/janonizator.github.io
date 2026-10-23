// Worker de codificação: WebGL2 em OffscreenCanvas + WebCodecs, fora da thread da interface.

import { codificar, podeCodificar } from './encode-webcodecs.js';

self.onmessage = async ({ data }) => {
  const { id } = data;
  try {
    if (data.tipo === 'sondar') {
      let ok = typeof OffscreenCanvas !== 'undefined' && !!new OffscreenCanvas(1, 1).getContext('webgl2');
      ok = ok && (await podeCodificar(data.W, data.H, data.bitrate));
      self.postMessage({ id, tipo: 'sondagem', ok });
    } else if (data.tipo === 'gerar') {
      const canvas = new OffscreenCanvas(data.W, data.H);
      const buffer = await codificar({
        ...data,
        canvas,
        aoProgredir: (p) => self.postMessage({ id, tipo: 'progresso', p }),
      });
      self.postMessage({ id, tipo: 'pronto', buffer }, [buffer]);
    }
  } catch (e) {
    self.postMessage({ id, tipo: 'erro', mensagem: e?.message || String(e) });
  }
};
