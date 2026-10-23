// Desenha a camada de texto (fundo transparente) no tamanho final do vídeo.
// Retorna a elipse da deformação esférica em coordenadas normalizadas (0..1).

function quebrarLinhas(ctx, texto, larguraMax) {
  const linhas = [];
  for (const paragrafo of texto.split('\n')) {
    const palavras = paragrafo.split(/\s+/).filter(Boolean);
    let linha = '';
    for (const palavra of palavras) {
      const teste = linha ? `${linha} ${palavra}` : palavra;
      if (!linha || ctx.measureText(teste).width <= larguraMax) linha = teste;
      else {
        linhas.push(linha);
        linha = palavra;
      }
    }
    linhas.push(linha);
  }
  return linhas;
}

export function desenharTexto(canvas, texto, W, H, cfg) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const larguraMax = W * cfg.larguraMax;
  const alturaMax = H * cfg.alturaMax;
  let tamanho = Math.round(W * cfg.tamanhoInicial);
  let linhas, maiorLinha, entrelinha, borda;

  for (;;) {
    ctx.font = `${tamanho}px ${cfg.fonte}`;
    borda = tamanho * cfg.borda;
    entrelinha = tamanho * cfg.entrelinha;
    linhas = quebrarLinhas(ctx, texto, larguraMax - borda);
    maiorLinha = Math.max(...linhas.map((l) => ctx.measureText(l).width));
    const cabe = maiorLinha + borda <= larguraMax && linhas.length * entrelinha <= alturaMax;
    if (cabe || tamanho <= cfg.tamanhoMinimo) break;
    tamanho = Math.floor(tamanho * 0.94);
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.lineWidth = borda;
  ctx.strokeStyle = cfg.corBorda;
  ctx.fillStyle = cfg.cor;

  const y0 = H / 2 - ((linhas.length - 1) * entrelinha) / 2;
  linhas.forEach((linha, i) => {
    const y = y0 + i * entrelinha;
    ctx.strokeText(linha, W / 2, y);
    ctx.fillText(linha, W / 2, y);
  });

  // Elipse que circunscreve o bloco de texto (fator √2 cobre os cantos do retângulo).
  const blocoL = maiorLinha + borda;
  const blocoA = linhas.length * entrelinha + borda;
  return {
    cx: 0.5,
    cy: 0.5,
    rx: Math.min(0.5, (blocoL / 2) * Math.SQRT2 / W),
    ry: Math.min(0.5, (blocoA / 2) * Math.SQRT2 / H),
  };
}

// Pré-desenha as legendas como faixas na parte de baixo do vídeo, uma por trecho de tempo
// em que o conjunto de legendas visíveis não muda.
// Retorna { trechos: [{ inicio, fim, imagem }], alturaFaixa } com alturaFaixa relativa a H (0..1).
export async function prepararLegendas(legendas, W, H, cfg) {
  const tamanho = Math.round(W * cfg.tamanho);
  const borda = tamanho * cfg.borda;
  const entrelinha = tamanho * cfg.entrelinha;
  const fimDe = (l) => l.fim ?? Infinity;

  const marcas = [...new Set(legendas.flatMap((l) => [l.inicio, fimDe(l)]))].sort((a, b) => a - b);
  const grupos = [];
  for (let i = 0; i < marcas.length - 1; i++) {
    const [inicio, fim] = [marcas[i], marcas[i + 1]];
    const ativas = legendas.filter((l) => l.inicio <= inicio && fimDe(l) > inicio);
    if (ativas.length) grupos.push({ inicio, fim, ativas });
  }

  const maxAtivas = Math.max(0, ...grupos.map((g) => g.ativas.length));
  const alturaFaixa = Math.min(H, Math.ceil(H * cfg.margemInferior + (maxAtivas - 0.5) * entrelinha + tamanho + borda));
  const baseY = alturaFaixa - H * cfg.margemInferior; // centro da última linha, dentro da faixa

  const linha = document.createElement('canvas');
  linha.width = W;
  linha.height = Math.ceil(entrelinha + borda * 2);
  const lctx = linha.getContext('2d');

  const trechos = [];
  for (const { inicio, fim, ativas } of grupos) {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = alturaFaixa;
    const ctx = canvas.getContext('2d');
    ativas.forEach((l, i) => {
      // Cada linha é desenhada opaca e depois aplicada com a opacidade, para a borda não aparecer sob o preenchimento.
      lctx.clearRect(0, 0, linha.width, linha.height);
      lctx.font = `${cfg.peso} ${tamanho}px ${cfg.fonte}`;
      lctx.textAlign = 'center';
      lctx.textBaseline = 'middle';
      lctx.lineJoin = 'round';
      lctx.lineWidth = borda;
      lctx.strokeStyle = cfg.corBorda;
      lctx.fillStyle = cfg.cor;
      lctx.strokeText(l.texto, W / 2, linha.height / 2);
      lctx.fillText(l.texto, W / 2, linha.height / 2);
      ctx.globalAlpha = l.opacidade ?? 1;
      const y = baseY - (ativas.length - 1 - i) * entrelinha;
      ctx.drawImage(linha, 0, Math.round(y - linha.height / 2));
    });
    trechos.push({ inicio, fim, imagem: await createImageBitmap(canvas, { premultiplyAlpha: 'none' }) });
  }
  return { trechos, alturaFaixa: alturaFaixa / H };
}
