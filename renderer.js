// ───────── Configuración ─────────
const MODEL_MODES = {
  catsdogs: ['upload', 'camera'],
  mnist: ['upload', 'camera', 'canvas']
};

const MAX_BYTES = 5 * 1024 * 1024; // 5MB (igual que main.js)
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/bmp'];

// ───────── Estado ─────────
const state = {
  model: 'catsdogs',
  mode: 'upload',
  stream: null,
  previewUrl: null,
  drawn: false,
  requestId: 0
};

// ───────── Elementos ─────────
const $ = (sel) => document.querySelector(sel);

const modelItems = {
  catsdogs: $('#catsdogs'),
  mnist: $('#mnist')
};

const modeItems = [...document.querySelectorAll('.in_main_options li')];
const inputBox = $('.in_main_input');
const inputBtn = $('#inputBtn');
const preview = $('#preview');
const video = $('#video');
const draw = $('#draw');
const fileInput = $('#fileInput');
const actionMain = $('#actionMain');
const actionAlt = $('#actionAlt');
const actions = $('.in_main_actions');
const resultBox = $('.out_result');

// ───────── Utilidades ─────────
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const clamp = (n) => Math.max(0, Math.min(100, Number(n) || 0));
const pct = (n) => `${Math.round(clamp(n))}%`;

function cleanError(err) {
  return String(err?.message || err)
    .replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

// ───────── Render de resultados ─────────
function showState(text, extraClass = '') {
  resultBox.replaceChildren(el('p', `result_state ${extraClass}`.trim(), text));
}

function animateBar(fill, value) {
  fill.style.width = '0%';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fill.style.width = `${clamp(value)}%`;
    });
  });
}

function buildBar(value, className = '') {
  const track = el('div', 'bar');
  const fill = el('div', `bar_fill ${className}`.trim());
  track.appendChild(fill);
  animateBar(fill, value);
  return track;
}

function renderCatsDogs(data) {
  const cat = clamp(data.cat_percent);
  const dog = clamp(data.dog_percent);
  const catWins = cat >= dog;

  const wrapper = el('div', 'result_cards');

  [
    { label: 'Gato', value: cat, top: catWins },
    { label: 'Perro', value: dog, top: !catWins }
  ].forEach(({ label, value, top }) => {
    const card = el('div', `result_card${top ? ' top' : ''}`);

    const head = el('div', 'result_card_head');
    head.appendChild(el('span', 'result_card_label', label));
    if (top) head.appendChild(el('span', 'result_card_tag', 'Mayor match'));

    card.appendChild(head);
    card.appendChild(el('strong', 'result_card_value', pct(value)));
    card.appendChild(buildBar(value));

    wrapper.appendChild(card);
  });

  resultBox.replaceChildren(wrapper);
}

function renderMnist(data) {
  const confidence = clamp(Number(data.confidence) * 100);

  const card = el('div', 'digit_card');

  const label = el('div', 'digit_label');
  label.appendChild(el('span', 'model-dot violet'));
  label.appendChild(el('span', '', 'Número detectado'));

  const match = el('div', 'digit_match');
  const row = el('div', 'digit_match_row');
  row.appendChild(el('span', '', 'Match'));
  row.appendChild(el('strong', '', pct(confidence)));
  match.appendChild(row);
  match.appendChild(buildBar(confidence, 'pink'));

  card.appendChild(label);
  card.appendChild(el('div', 'digit_value', String(data.digit)));
  card.appendChild(match);

  resultBox.replaceChildren(card);
}

function renderResult(data) {
  if (state.model === 'mnist') {
    if (data.digit === undefined) throw new Error('Respuesta inesperada del servicio.');
    renderMnist(data);
  } else {
    if (data.cat_percent === undefined || data.dog_percent === undefined) {
      throw new Error('Respuesta inesperada del servicio.');
    }
    renderCatsDogs(data);
  }
}

// ───────── Llamada a la API ─────────
async function analyze(blob, name) {
  if (!ALLOWED_TYPES.includes(blob.type)) {
    showState('Formato no admitido. Usa PNG, JPG, WEBP o BMP.', 'error');
    return;
  }

  if (blob.size > MAX_BYTES) {
    showState('La imagen supera los 5 MB.', 'error');
    return;
  }

  const id = ++state.requestId;
  showState('Analizando…', 'loading');

  try {
    const bytes = await blob.arrayBuffer();
    const data = await window.api.predict({
      endpoint: state.model,
      name,
      type: blob.type,
      bytes
    });

    if (id !== state.requestId) return; // llegó una respuesta vieja
    renderResult(data);
  } catch (err) {
    if (id !== state.requestId) return;
    showState(cleanError(err), 'error');
  }
}

// ───────── Cámara ─────────
async function startCamera() {
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false
    });
    video.srcObject = state.stream;
    await video.play();
    updateUI();
  } catch {
    stopCamera();
    showState('No se pudo acceder a la cámara.', 'error');
  }
}

function stopCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach((t) => t.stop());
    state.stream = null;
  }
  video.srcObject = null;
  updateUI();
}

function captureFrame() {
  if (!state.stream || !video.videoWidth) return;

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);

  canvas.toBlob(
    (blob) => blob && analyze(blob, 'camera.jpg'),
    'image/jpeg',
    0.92
  );
}

// ───────── Subir imagen ─────────
function clearPreview() {
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = null;
  preview.removeAttribute('src');
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  fileInput.value = '';
  if (!file) return;

  if (!ALLOWED_TYPES.includes(file.type)) {
    showState('Formato no admitido. Usa PNG, JPG, WEBP o BMP.', 'error');
    return;
  }

  if (file.size > MAX_BYTES) {
    showState('La imagen supera los 5 MB.', 'error');
    return;
  }

  clearPreview();
  state.previewUrl = URL.createObjectURL(file);
  preview.src = state.previewUrl;
  updateUI();

  analyze(file, file.name);
});

// ───────── Canvas de dibujo (MNIST) ─────────
const ctx = draw.getContext('2d');
let drawing = false;

function resetCanvas() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, draw.width, draw.height);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 20;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  state.drawn = false;
}

function pointerPos(e) {
  const rect = draw.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * draw.width,
    y: ((e.clientY - rect.top) / rect.height) * draw.height
  };
}

draw.addEventListener('pointerdown', (e) => {
  drawing = true;
  draw.setPointerCapture(e.pointerId);
  const { x, y } = pointerPos(e);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 0.01, y + 0.01); // permite dibujar un punto
  ctx.stroke();
  state.drawn = true;
});

draw.addEventListener('pointermove', (e) => {
  if (!drawing) return;
  const { x, y } = pointerPos(e);
  ctx.lineTo(x, y);
  ctx.stroke();
});

['pointerup', 'pointercancel'].forEach((evt) =>
  draw.addEventListener(evt, () => {
    drawing = false;
  })
);

function sendCanvas() {
  if (!state.drawn) {
    showState('Dibuja un número primero.', 'error');
    return;
  }
  draw.toBlob((blob) => blob && analyze(blob, 'drawing.png'), 'image/png');
}

// ───────── UI según modelo / modo ─────────
function setHidden(node, hidden) {
  node.hidden = hidden;
}

function updateUI() {
  const { mode } = state;
  const hasStream = !!state.stream;
  const hasPreview = !!state.previewUrl;

  // opciones de modo
  modeItems.forEach((li) => {
    const m = li.dataset.mode;
    const allowed = MODEL_MODES[state.model].includes(m);
    li.classList.toggle('active', m === mode);
    li.classList.toggle('disabled', !allowed);
  });

  // modelos
  Object.entries(modelItems).forEach(([key, li]) =>
    li.classList.toggle('active', key === state.model)
  );

  // reset de visibilidad
  setHidden(inputBtn, true);
  setHidden(preview, true);
  setHidden(video, true);
  setHidden(draw, true);
  setHidden(actions, true);
  setHidden(actionAlt, true);

  if (mode === 'upload') {
    if (hasPreview) {
      setHidden(preview, false);
      setHidden(actions, false);
      actionMain.textContent = 'Cargar otra imagen';
    } else {
      setHidden(inputBtn, false);
      inputBtn.textContent = 'Cargar imagen';
    }
  }

  if (mode === 'camera') {
    if (hasStream) {
      setHidden(video, false);
      setHidden(actions, false);
      setHidden(actionAlt, false);
      actionMain.textContent = 'Capturar y analizar';
      actionAlt.textContent = 'Detener cámara';
    } else {
      setHidden(inputBtn, false);
      inputBtn.textContent = 'Activar cámara';
    }
  }

  if (mode === 'canvas') {
    setHidden(draw, false);
    setHidden(actions, false);
    setHidden(actionAlt, false);
    actionMain.textContent = 'Cargar imagen';
    actionAlt.textContent = 'Limpiar';
  }
}

function setMode(mode) {
  if (!MODEL_MODES[state.model].includes(mode) || mode === state.mode) return;

  if (state.stream) {
    state.stream.getTracks().forEach((t) => t.stop());
    state.stream = null;
    video.srcObject = null;
  }

  clearPreview();
  state.mode = mode;
  if (mode === 'canvas') resetCanvas();
  updateUI();
}

function setModel(model) {
  if (model === state.model) return;

  state.requestId++; // descarta respuestas en vuelo
  state.model = model;

  if (!MODEL_MODES[model].includes(state.mode)) {
    // el modo actual no existe en este modelo (canvas en Perros & Gatos)
    if (state.stream) {
      state.stream.getTracks().forEach((t) => t.stop());
      state.stream = null;
      video.srcObject = null;
    }
    state.mode = 'upload';
  }

  clearPreview();
  showState('Aún no hay resultados.');
  updateUI();
}

// ───────── Eventos ─────────
Object.entries(modelItems).forEach(([key, li]) =>
  li.addEventListener('click', () => setModel(key))
);

modeItems.forEach((li) =>
  li.addEventListener('click', () => setMode(li.dataset.mode))
);

inputBtn.addEventListener('click', () => {
  if (state.mode === 'upload') fileInput.click();
  if (state.mode === 'camera') startCamera();
});

actionMain.addEventListener('click', () => {
  if (state.mode === 'upload') fileInput.click();
  if (state.mode === 'camera') captureFrame();
  if (state.mode === 'canvas') sendCanvas();
});

actionAlt.addEventListener('click', () => {
  if (state.mode === 'camera') stopCamera();
  if (state.mode === 'canvas') {
    resetCanvas();
    showState('Aún no hay resultados.');
  }
});

window.addEventListener('beforeunload', () => {
  if (state.stream) state.stream.getTracks().forEach((t) => t.stop());
});

// ───────── Init ─────────
resetCanvas();
showState('Aún no hay resultados.');
updateUI();