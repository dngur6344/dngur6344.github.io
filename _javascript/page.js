import { basic, initSidebar, initTopbar } from './modules/layouts.js';
import {
  loadImg,
  imgPopup,
  initClipboard,
  loadMermaid
} from './modules/components.js';

loadImg();
imgPopup();
initSidebar();
initTopbar();
initClipboard();
loadMermaid();
basic();
