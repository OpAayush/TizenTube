import { configRead } from '../config.js';

const THEME_BLOCK_PREFIX = '/* ytaf-theme-start */';
const THEME_BLOCK_SUFFIX = '/* ytaf-theme-end */';

const style = document.createElement('style');
let css = '';

const TEXT_THEMES = {
  default: null,
  white: ['#ffffff', '#e0e0e0', '#c0c0c0'],
  gray: ['#d0d0d0', '#9a9a9a', '#7f7f7f'],
  red: ['#ff7a7a', '#e06a6a', '#c25b5b'],
  blue: ['#8ab4ff', '#6f96e8', '#5a79c9'],
  green: ['#81c995', '#68a87a', '#538c64'],
  purple: ['#d7aefb', '#b28fd8', '#8f70b5'],
  yellow: ['#fdd663', '#d9b34d', '#b5913c'],
};

function luminance(color) {
  const m = /rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/.exec(color);
  if (!m) return null;
  const r = Number(m[1]);
  const g = Number(m[2]);
  const b = Number(m[3]);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function elementSelector(el) {
  const classes = String(el.className || '')
    .split(/\s+/)
    .filter(Boolean)
    .map(function (c) {
      return '.' + c;
    })
    .join('');
  return el.tagName.toLowerCase() + classes;
}

function textThemeCss(theme) {
  const palette = TEXT_THEMES[theme];
  const container = document.getElementById('container');
  if (!palette || !container) return '';
  const groups = [[], [], []];
  const seen = {};
  const els = container.querySelectorAll('*');
  for (let i = 0; i < els.length; i++) {
    const color = els[i].style.color;
    if (!color) continue;
    const lum = luminance(color);
    if (lum === null || lum < 0.3) continue;
    const tier = lum > 0.8 ? 0 : lum > 0.55 ? 1 : 2;
    const sel = elementSelector(els[i]);
    if (!sel || seen[sel]) continue;
    seen[sel] = true;
    groups[tier].push(sel);
  }
  let css = '';
  for (let t = 0; t < 3; t++) {
    if (!groups[t].length) continue;
    css += groups[t].join(',\n') + ' {\n    color: ' + palette[t] + ' !important;\n  }\n';
  }
  return css;
}

function updateStyle() {
  const bgUrl = configRead('routeBackgroundUrl');
  const bg = bgUrl
    ? `
        background-image: url("${bgUrl}") !important;
        background-size: cover !important;
        background-position: center !important;
        background-repeat: no-repeat !important;`
    : `
        background-color: ${configRead('routeColor')} !important;`;
  const navbar = bgUrl
    ? `
      ytlr-guide-response {
          background-image: none !important;
          background-color: rgba(15, 15, 15, 0.35) !important;
      }
      ytlr-guide-response > div {
          background-image: none !important;
          background-color: transparent !important;
      }
      ytlr-guide-response .zylon-ve {
          background-image: none !important;
          background-color: transparent !important;
      }`
    : '';
  const textTheme = textThemeCss(configRead('textTheme'));
  css = `
    /* ytaf-theme-start */
    #container {
        ${bg}
    }
    ${navbar}
    ${textTheme}
    /* ytaf-theme-end */
`;
  const existingStyle = document.querySelector('style[nonce]');
  if (existingStyle) {
    let text = existingStyle.textContent || '';
    const startIdx = text.indexOf(THEME_BLOCK_PREFIX);
    const endIdx = text.indexOf(THEME_BLOCK_SUFFIX);
    if (startIdx !== -1 && endIdx !== -1) {
      text =
        text.slice(0, startIdx) +
        text.slice(endIdx + THEME_BLOCK_SUFFIX.length);
    }
    existingStyle.textContent = text + css;
  } else {
    style.textContent = css;
  }
}

document.head.appendChild(style);
updateStyle();
export default updateStyle;
