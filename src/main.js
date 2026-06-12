import { createApp } from 'vue'
import App from './App.vue'

// Подключение стилей Tailwind (через main.css)
import './assets/main.css'

// Обязательно подключаем стили Leaflet, иначе карта "развалится"
import 'leaflet/dist/leaflet.css' 

// Исправление путей к иконкам Leaflet (частая проблема при сборке через Webpack/Vite)
import L from 'leaflet';
// Удаляем старые ссылки на иконки
delete L.Icon.Default.prototype._getIconUrl;

// Прописываем новые пути к иконкам (они подтянутся из node_modules)
L.Icon.Default.mergeOptions({
    iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
    iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
    shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href,
});

createApp(App).mount('#app')