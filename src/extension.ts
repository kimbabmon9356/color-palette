import * as vscode from 'vscode';

const SAVED_COLORS_KEY = 'colorPalette.savedColors';
const MAX_SAVED_COLORS = 24;

interface SavedColor {
  hex: string;
}

class ColorPaletteViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true
    };

    webviewView.webview.html = getWebviewHtml();

    webviewView.webview.onDidReceiveMessage(async (message: unknown) => {
      if (!isRecord(message) || typeof message.type !== 'string') {
        return;
      }

      if (message.type === 'ready') {
        void this.postSavedColors('init', getSavedColors(this.context));
        return;
      }

      if (message.type === 'addColor' && typeof message.hex === 'string') {
        const normalizedHex = normalizeHex(message.hex);
        if (!normalizedHex) {
          return;
        }

        const nextColor: SavedColor = {
          hex: normalizedHex
        };

        const savedColors = getSavedColors(this.context);
        const withoutDuplicate = savedColors.filter((color) => color.hex.toLowerCase() !== nextColor.hex.toLowerCase());
        const updated = [nextColor, ...withoutDuplicate].slice(0, MAX_SAVED_COLORS);

        await this.context.globalState.update(SAVED_COLORS_KEY, updated);
        void this.postSavedColors('savedColors', updated);
        return;
      }

      if (message.type === 'deleteColor' && typeof message.hex === 'string') {
        const normalizedHex = normalizeHex(message.hex);
        if (!normalizedHex) {
          return;
        }

        const savedColors = getSavedColors(this.context);
        const updated = savedColors.filter((color) => color.hex.toLowerCase() !== normalizedHex.toLowerCase());

        await this.context.globalState.update(SAVED_COLORS_KEY, updated);
        void this.postSavedColors('savedColors', updated);
      }
    });
  }

  private async postSavedColors(type: 'init' | 'savedColors', savedColors: SavedColor[]): Promise<void> {
    if (!this.view) {
      return;
    }

    await this.view.webview.postMessage({
      type,
      savedColors
    });
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new ColorPaletteViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('colorPaletteExplorerView', provider, {
      webviewOptions: {
        retainContextWhenHidden: true
      }
    })
  );
}

function getSavedColors(context: vscode.ExtensionContext): SavedColor[] {
  const raw = context.globalState.get<unknown>(SAVED_COLORS_KEY, []);
  if (!Array.isArray(raw)) {
    return [];
  }

  const parsed: SavedColor[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string') {
      const maybeHex = normalizeHex(entry);
      if (maybeHex) {
        parsed.push({ hex: maybeHex });
      }
      continue;
    }

    if (!isRecord(entry)) {
      continue;
    }

    const maybeHex = typeof entry.hex === 'string' ? normalizeHex(entry.hex) : undefined;
    if (!maybeHex) {
      continue;
    }

    parsed.push({ hex: maybeHex });
  }

  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeHex(hex: string): string | undefined {
  const cleaned = hex.trim().replace(/^#/, '').toUpperCase();
  if (!/^([0-9A-F]{3}|[0-9A-F]{6})$/.test(cleaned)) {
    return undefined;
  }

  if (cleaned.length === 3) {
    return '#' + cleaned[0] + cleaned[0] + cleaned[1] + cleaned[1] + cleaned[2] + cleaned[2];
  }

  return '#' + cleaned;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getWebviewHtml(): string {
  const nonce = getNonce();
  const csp = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-" + nonce + "';";

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Color Palette</title>
  <style>
    :root {
      --bg: var(--vscode-sideBar-background);
      --panel: var(--vscode-editorWidget-background);
      --text: var(--vscode-foreground);
      --muted: var(--vscode-descriptionForeground);
      --line: var(--vscode-panel-border);
      --input-bg: var(--vscode-input-background);
      --input-fg: var(--vscode-input-foreground);
      --input-border: var(--vscode-input-border);
      --button-bg: var(--vscode-button-secondaryBackground);
      --button-fg: var(--vscode-button-secondaryForeground);
      --focus: var(--vscode-focusBorder);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: "Segoe UI", "Pretendard", sans-serif;
      color: var(--text);
      background: var(--bg);
      padding: 8px;
    }

    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px;
    }

    .preview {
      width: 100%;
      height: 60px;
      border-radius: 6px;
      border: 1px solid var(--line);
      margin-bottom: 10px;
      background: #7FB4C4;
    }

    .row {
      display: grid;
      grid-template-columns: 24px 1fr;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .sv-wrap {
      position: relative;
      width: 100%;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid var(--line);
      margin-bottom: 8px;
      touch-action: none;
      background: #fff;
    }

    .sv-canvas {
      display: block;
      width: 100%;
      height: auto;
    }

    .sv-pointer {
      position: absolute;
      width: 12px;
      height: 12px;
      border: 2px solid #fff;
      border-radius: 50%;
      box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.45);
      transform: translate(-50%, -50%);
      pointer-events: none;
    }

    .label {
      font-size: 12px;
      color: var(--muted);
      letter-spacing: 0.3px;
    }

    .range {
      appearance: none;
      width: 100%;
      height: 8px;
      border-radius: 999px;
      border: 1px solid var(--input-border);
      outline: none;
      background: #666;
    }

    .range::-webkit-slider-thumb {
      appearance: none;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 2px solid #111;
      background: #0f0f0f;
      cursor: pointer;
    }

    .range::-moz-range-thumb {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 2px solid #111;
      background: #0f0f0f;
      cursor: pointer;
    }

    .field-row {
      display: grid;
      grid-template-columns: 40px 1fr;
      align-items: center;
      gap: 8px;
      margin-top: 10px;
    }

    .rgb-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 4px;
    }

    input[type="number"],
    input[type="text"] {
      height: 34px;
      border-radius: 4px;
      border: 1px solid var(--input-border);
      background: var(--input-bg);
      color: var(--input-fg);
      padding: 0 8px;
      font-size: 14px;
      width: 100%;
    }

    input:focus,
    .range:focus {
      border-color: var(--focus);
      outline: 1px solid var(--focus);
      outline-offset: 1px;
    }

    .saved-head {
      margin-top: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      color: var(--muted);
    }

    .add-btn {
      height: 28px;
      border-radius: 4px;
      border: 1px solid var(--input-border);
      background: var(--button-bg);
      color: var(--button-fg);
      padding: 0 8px;
      cursor: pointer;
    }

    .saved-list {
      margin-top: 8px;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .saved-chip {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: 1px solid var(--input-border);
      cursor: pointer;
      padding: 0;
    }

    .saved-chip.active {
      outline: 2px solid var(--focus);
      outline-offset: 1px;
    }

    .context-menu {
      position: fixed;
      z-index: 1000;
      min-width: 100px;
      border-radius: 6px;
      border: 1px solid var(--input-border);
      background: var(--input-bg);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.28);
      padding: 4px;
      display: none;
    }

    .context-menu.open {
      display: block;
    }

    .context-menu button {
      width: 100%;
      height: 30px;
      text-align: left;
      border: 0;
      border-radius: 4px;
      background: transparent;
      color: var(--text);
      cursor: pointer;
      padding: 0 8px;
      font-size: 12px;
    }

    .context-menu button:hover {
      background: var(--button-bg);
      color: var(--button-fg);
    }
  </style>
</head>
<body>
  <section class="panel">
    <div id="preview" class="preview"></div>

    <div id="svWrap" class="sv-wrap">
      <canvas id="svCanvas" class="sv-canvas" width="600" height="380"></canvas>
      <div id="svPointer" class="sv-pointer"></div>
    </div>

    <div class="row">
      <span class="label">H</span>
      <input id="hSlider" class="range" type="range" min="0" max="360" step="1">
    </div>

    <div class="field-row">
      <span class="label">RGB</span>
      <div class="rgb-grid">
        <input id="rgbR" type="number" min="0" max="255" aria-label="R">
        <input id="rgbG" type="number" min="0" max="255" aria-label="G">
        <input id="rgbB" type="number" min="0" max="255" aria-label="B">
      </div>
    </div>

    <div class="field-row">
      <span class="label">HEX</span>
      <input id="hexInput" type="text" value="7FB4C4" spellcheck="false">
    </div>

    <div class="saved-head">
      <span>Saved colors</span>
      <button id="addBtn" class="add-btn">+ Add</button>
    </div>
    <div id="savedList" class="saved-list"></div>
  </section>

  <div id="contextMenu" class="context-menu">
    <button id="deleteColorBtn" type="button">Delete</button>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    const state = {
      h: 196,
      s: 35,
      v: 77,
      savedColors: []
    };

    const els = {
      preview: document.getElementById('preview'),
      svWrap: document.getElementById('svWrap'),
      svCanvas: document.getElementById('svCanvas'),
      svPointer: document.getElementById('svPointer'),
      hSlider: document.getElementById('hSlider'),
      rgbR: document.getElementById('rgbR'),
      rgbG: document.getElementById('rgbG'),
      rgbB: document.getElementById('rgbB'),
      hexInput: document.getElementById('hexInput'),
      addBtn: document.getElementById('addBtn'),
      savedList: document.getElementById('savedList'),
      contextMenu: document.getElementById('contextMenu'),
      deleteColorBtn: document.getElementById('deleteColorBtn')
    };

    let contextMenuHex = null;
  const svCtx = els.svCanvas.getContext('2d');
  let draggingSv = false;

    function clamp(num, min, max) {
      return Math.min(max, Math.max(min, num));
    }

    function hsvToRgb(h, s, v) {
      const sat = s / 100;
      const val = v / 100;
      const c = val * sat;
      const x = c * (1 - Math.abs((h / 60) % 2 - 1));
      const m = val - c;
      let r = 0;
      let g = 0;
      let b = 0;

      if (h >= 0 && h < 60) {
        r = c;
        g = x;
      } else if (h < 120) {
        r = x;
        g = c;
      } else if (h < 180) {
        g = c;
        b = x;
      } else if (h < 240) {
        g = x;
        b = c;
      } else if (h < 300) {
        r = x;
        b = c;
      } else {
        r = c;
        b = x;
      }

      return {
        r: Math.round((r + m) * 255),
        g: Math.round((g + m) * 255),
        b: Math.round((b + m) * 255)
      };
    }

    function rgbToHsv(r, g, b) {
      const rn = r / 255;
      const gn = g / 255;
      const bn = b / 255;
      const max = Math.max(rn, gn, bn);
      const min = Math.min(rn, gn, bn);
      const d = max - min;
      let h = 0;

      if (d !== 0) {
        if (max === rn) {
          h = 60 * (((gn - bn) / d + 6) % 6);
        } else if (max === gn) {
          h = 60 * ((bn - rn) / d + 2);
        } else {
          h = 60 * ((rn - gn) / d + 4);
        }
      }

      const s = max === 0 ? 0 : (d / max) * 100;
      const v = max * 100;
      return {
        h: Math.round(h),
        s: Math.round(s),
        v: Math.round(v)
      };
    }

    function rgbToHex(r, g, b) {
      const toHex = (n) => n.toString(16).padStart(2, '0').toUpperCase();
      return toHex(r) + toHex(g) + toHex(b);
    }

    function hexToRgb(hex) {
      const cleaned = hex.replace(/^#/, '').trim();
      if (!/^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(cleaned)) {
        return null;
      }

      const full = cleaned.length === 3
        ? cleaned.split('').map((c) => c + c).join('')
        : cleaned;

      const value = parseInt(full, 16);
      return {
        r: (value >> 16) & 255,
        g: (value >> 8) & 255,
        b: value & 255
      };
    }

    function updateSliderBackgrounds() {
      els.hSlider.style.background = 'linear-gradient(90deg, #ff5f6d 0%, #f9d423 17%, #82ff5e 33%, #16d4ff 50%, #3b82f6 67%, #8b5cf6 83%, #ff5f6d 100%)';
    }

    function drawSvCanvas() {
      const width = els.svCanvas.width;
      const height = els.svCanvas.height;
      svCtx.clearRect(0, 0, width, height);

      const pure = hsvToRgb(state.h, 100, 100);
      svCtx.fillStyle = 'rgb(' + pure.r + ', ' + pure.g + ', ' + pure.b + ')';
      svCtx.fillRect(0, 0, width, height);

      const whiteGradient = svCtx.createLinearGradient(0, 0, width, 0);
      whiteGradient.addColorStop(0, '#ffffff');
      whiteGradient.addColorStop(1, 'rgba(255,255,255,0)');
      svCtx.fillStyle = whiteGradient;
      svCtx.fillRect(0, 0, width, height);

      const blackGradient = svCtx.createLinearGradient(0, 0, 0, height);
      blackGradient.addColorStop(0, 'rgba(0,0,0,0)');
      blackGradient.addColorStop(1, '#000000');
      svCtx.fillStyle = blackGradient;
      svCtx.fillRect(0, 0, width, height);
    }

    function updateSvPointer() {
      const width = els.svCanvas.clientWidth;
      const height = els.svCanvas.clientHeight;
      const x = (state.s / 100) * width;
      const y = ((100 - state.v) / 100) * height;
      els.svPointer.style.left = String(x) + 'px';
      els.svPointer.style.top = String(y) + 'px';
    }

    function updateSvFromPointer(clientX, clientY) {
      const rect = els.svCanvas.getBoundingClientRect();
      const x = clamp(clientX - rect.left, 0, rect.width);
      const y = clamp(clientY - rect.top, 0, rect.height);
      state.s = Math.round((x / rect.width) * 100);
      state.v = Math.round(100 - (y / rect.height) * 100);
      updateUi();
    }

    function updateUi() {
      const rgb = hsvToRgb(state.h, state.s, state.v);
      const hex = rgbToHex(rgb.r, rgb.g, rgb.b);

      els.preview.style.background = 'rgb(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ')';
      els.hSlider.value = String(state.h);

      els.rgbR.value = String(rgb.r);
      els.rgbG.value = String(rgb.g);
      els.rgbB.value = String(rgb.b);
      els.hexInput.value = hex;

      updateSliderBackgrounds();
      drawSvCanvas();
      updateSvPointer();
      renderSavedColors();
    }

    function setFromRgb(r, g, b) {
      const hsv = rgbToHsv(clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255));
      state.h = hsv.h;
      state.s = hsv.s;
      state.v = hsv.v;
      updateUi();
    }

    function hideContextMenu() {
      els.contextMenu.classList.remove('open');
      contextMenuHex = null;
    }

    function showContextMenu(x, y, hex) {
      contextMenuHex = hex;
      els.contextMenu.classList.add('open');

      const menuWidth = 108;
      const menuHeight = 38;
      const maxX = Math.max(8, window.innerWidth - menuWidth - 8);
      const maxY = Math.max(8, window.innerHeight - menuHeight - 8);

      const left = clamp(x, 8, maxX);
      const top = clamp(y, 8, maxY);
      els.contextMenu.style.left = String(left) + 'px';
      els.contextMenu.style.top = String(top) + 'px';
    }

    function renderSavedColors() {
      els.savedList.innerHTML = '';
      const rgb = hsvToRgb(state.h, state.s, state.v);
      const currentHex = '#' + rgbToHex(rgb.r, rgb.g, rgb.b);

      for (const item of state.savedColors) {
        const chip = document.createElement('button');
        chip.className = 'saved-chip';
        chip.style.background = item.hex;
        chip.title = item.hex;

        if (item.hex.toUpperCase() === currentHex.toUpperCase()) {
          chip.classList.add('active');
        }

        chip.addEventListener('click', () => {
          hideContextMenu();
          const rgbValue = hexToRgb(item.hex);
          if (!rgbValue) {
            return;
          }
          setFromRgb(rgbValue.r, rgbValue.g, rgbValue.b);
        });

        chip.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          showContextMenu(event.clientX, event.clientY, item.hex);
        });

        els.savedList.appendChild(chip);
      }
    }

    els.hSlider.addEventListener('input', () => {
      state.h = clamp(Number(els.hSlider.value), 0, 360);
      updateUi();
    });

    els.svWrap.addEventListener('pointerdown', (event) => {
      draggingSv = true;
      els.svWrap.setPointerCapture(event.pointerId);
      updateSvFromPointer(event.clientX, event.clientY);
    });

    els.svWrap.addEventListener('pointermove', (event) => {
      if (!draggingSv) {
        return;
      }
      updateSvFromPointer(event.clientX, event.clientY);
    });

    els.svWrap.addEventListener('pointerup', () => {
      draggingSv = false;
    });

    for (const rgbInput of [els.rgbR, els.rgbG, els.rgbB]) {
      rgbInput.addEventListener('change', () => {
        const r = Number(els.rgbR.value);
        const g = Number(els.rgbG.value);
        const b = Number(els.rgbB.value);
        if (![r, g, b].every((n) => Number.isFinite(n))) {
          updateUi();
          return;
        }

        setFromRgb(r, g, b);
      });
    }

    els.hexInput.addEventListener('change', () => {
      const rgbValue = hexToRgb(els.hexInput.value);
      if (!rgbValue) {
        updateUi();
        return;
      }

      setFromRgb(rgbValue.r, rgbValue.g, rgbValue.b);
    });

    els.addBtn.addEventListener('click', () => {
      hideContextMenu();
      const rgb = hsvToRgb(state.h, state.s, state.v);
      vscode.postMessage({
        type: 'addColor',
        hex: '#' + rgbToHex(rgb.r, rgb.g, rgb.b)
      });
    });

    els.deleteColorBtn.addEventListener('click', () => {
      if (!contextMenuHex) {
        hideContextMenu();
        return;
      }

      vscode.postMessage({
        type: 'deleteColor',
        hex: contextMenuHex
      });
      hideContextMenu();
    });

    document.addEventListener('click', (event) => {
      if (els.contextMenu.contains(event.target)) {
        return;
      }
      hideContextMenu();
    });

    document.addEventListener('contextmenu', (event) => {
      if (event.target.closest('.saved-chip')) {
        return;
      }
      hideContextMenu();
    });

    window.addEventListener('blur', hideContextMenu);
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        hideContextMenu();
      }
    });

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (!message || typeof message.type !== 'string') {
        return;
      }

      if ((message.type === 'init' || message.type === 'savedColors') && Array.isArray(message.savedColors)) {
        state.savedColors = message.savedColors
          .filter((item) => item && typeof item.hex === 'string')
          .map((item) => ({ hex: item.hex.toUpperCase() }));
        hideContextMenu();
        renderSavedColors();
      }
    });

    updateUi();
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}

function getNonce(): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i += 1) {
    result += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return result;
}

export function deactivate(): void {
  // no-op
}
