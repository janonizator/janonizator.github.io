// Compositor WebGL2: foto com zoom Ken Burns + texto com deformação esférica + legendas, numa única passada.
// Funciona tanto com OffscreenCanvas (worker) quanto com HTMLCanvasElement (thread principal).

const VS = `#version 300 es
in vec2 p;
out vec2 v_uv;
void main() {
  v_uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_foto;
uniform sampler2D u_texto;
uniform sampler2D u_legenda;
uniform float u_temLegenda;
uniform float u_faixaY;
uniform float u_escala;
uniform vec2 u_centro;
uniform vec2 u_raio;
uniform float u_k;
out vec4 cor;
void main() {
  vec3 foto = texture(u_foto, 0.5 + (v_uv - 0.5) / u_escala).rgb;

  // Lente esférica: amplia o centro da elipse e se anula suavemente na borda.
  vec2 d = v_uv - u_centro;
  vec2 q = d / u_raio;
  float r2 = dot(q, q);
  vec2 uvTexto = v_uv;
  if (r2 < 1.0) {
    float s = 1.0 - r2;
    uvTexto = u_centro + d * (1.0 - u_k * s * s);
  }
  vec4 t = texture(u_texto, uvTexto);
  vec3 c = mix(foto, t.rgb, t.a);

  // Legenda: faixa sem deformação na parte de baixo, a partir de u_faixaY.
  if (u_temLegenda > 0.5 && v_uv.y >= u_faixaY) {
    vec4 l = texture(u_legenda, vec2(v_uv.x, (v_uv.y - u_faixaY) / (1.0 - u_faixaY)));
    c = mix(c, l.rgb, l.a);
  }
  cor = vec4(c, 1.0);
}`;

function compilar(gl, tipo, fonte) {
  const s = gl.createShader(tipo);
  gl.shaderSource(s, fonte);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

function textura(gl, unidade, imagem) {
  const t = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unidade);
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imagem);
  return t;
}

// Zoom com velocidade percebida constante (exponencial) e entrada/saída suaves.
const suavizar = (x) => 0.5 - 0.5 * Math.cos(Math.PI * x);

export class Renderer {
  constructor(canvas, { foto, texto, elipse, zoomFinal, deformacao, legendas }) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 indisponível neste navegador.');
    this.gl = gl;
    this.logZoom = Math.log(zoomFinal);

    const prog = gl.createProgram();
    gl.attachShader(prog, compilar(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compilar(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);

    // Triângulo que cobre a tela inteira.
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const p = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(p);
    gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);

    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    this.texturas = [textura(gl, 0, foto), textura(gl, 1, texto)];
    foto.close?.();
    texto.close?.();
    this.trechos = (legendas?.trechos ?? []).map(({ inicio, fim, imagem }) => {
      const t = textura(gl, 2, imagem);
      imagem.close?.();
      return { inicio, fim, t };
    });
    this.trechoAtual = undefined;

    gl.uniform1i(gl.getUniformLocation(prog, 'u_foto'), 0);
    gl.uniform1i(gl.getUniformLocation(prog, 'u_texto'), 1);
    gl.uniform1i(gl.getUniformLocation(prog, 'u_legenda'), 2);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_faixaY'), 1 - (legendas?.alturaFaixa ?? 0));
    this.uTemLegenda = gl.getUniformLocation(prog, 'u_temLegenda');
    gl.uniform2f(gl.getUniformLocation(prog, 'u_centro'), elipse.cx, elipse.cy);
    gl.uniform2f(gl.getUniformLocation(prog, 'u_raio'), elipse.rx, elipse.ry);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_k'), deformacao);
    this.uEscala = gl.getUniformLocation(prog, 'u_escala');
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  // progresso: 0 (início) a 1 (fim do vídeo); t: tempo em segundos, para as legendas
  desenhar(progresso, t) {
    const gl = this.gl;
    gl.uniform1f(this.uEscala, Math.exp(this.logZoom * suavizar(progresso)));
    const trecho = this.trechos.find((tr) => t >= tr.inicio && t < tr.fim);
    if (trecho !== this.trechoAtual) {
      this.trechoAtual = trecho;
      gl.uniform1f(this.uTemLegenda, trecho ? 1 : 0);
      if (trecho) {
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, trecho.t);
      }
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  descartar() {
    this.texturas.forEach((t) => this.gl.deleteTexture(t));
    this.trechos.forEach(({ t }) => this.gl.deleteTexture(t));
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
