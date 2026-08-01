import { configRead } from '../config.js';

const THEME_BLOCK_PREFIX = '/* ytaf-theme-start */';
const THEME_BLOCK_SUFFIX = '/* ytaf-theme-end */';

const style = document.createElement('style');
let css = '';

function updateStyle() {
  css = `
    /* ytaf-theme-start */
    ytlr-guide-response yt-focus-container {
        background-color: ${configRead('focusContainerColor')};
    }

    #container {
        background-color: ${configRead('routeColor')} !important;
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
