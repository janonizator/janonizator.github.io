// Decodifica HEIC/HEIF com libheif (wasm) fora da thread da interface.
// Worker clássico porque o build do libheif é UMD. Só é carregado quando chega uma foto HEIC
// num navegador que não a decodifica nativamente.

const BASE = new URL('../vendor/libheif/', self.location.href).href;
importScripts(`${BASE}libheif.js`);

const pronto = new Promise((resolve) => {
  const lib = libheif({
    locateFile: (arquivo) => BASE + arquivo,
    onRuntimeInitialized: () => queueMicrotask(() => resolve(lib)),
  });
});

self.onmessage = async ({ data }) => {
  let imagens = [];
  try {
    const lib = await pronto;
    imagens = new lib.HeifDecoder().decode(new Uint8Array(data));
    const img = imagens.find((i) => i.is_primary()) ?? imagens[0];
    if (!img) throw new Error('Arquivo HEIC sem imagem.');
    // libheif já aplica a rotação/espelhamento (irot/imir) gravados no arquivo.
    const pixels = new ImageData(img.get_width(), img.get_height());
    await new Promise((resolve, reject) =>
      img.display(pixels, (r) => (r ? resolve() : reject(new Error('Falha ao decodificar o HEIC.')))),
    );
    const bitmap = await createImageBitmap(pixels);
    self.postMessage({ bitmap }, [bitmap]);
  } catch (e) {
    self.postMessage({ erro: e?.message || String(e) });
  } finally {
    imagens.forEach((i) => i.free());
  }
};
