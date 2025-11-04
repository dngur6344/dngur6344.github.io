import { basic, initSidebar, initTopbar } from './modules/layouts.js';
import { initLocaleDatetime, loadImg } from './modules/components.js';

loadImg();
initLocaleDatetime();
initSidebar();
initTopbar();
basic();
