import { configRead } from '../config.js';

const THEME_BLOCK_PREFIX = '/* ytaf-theme-start */';
const THEME_BLOCK_SUFFIX = '/* ytaf-theme-end */';

const style = document.createElement('style');
let css = '';

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
  css = `
    /* ytaf-theme-start */
    #container {
        ${bg}
    }
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
