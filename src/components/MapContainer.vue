<script>
    import L from 'leaflet';
    import { markRaw } from 'vue';
    
    export default {
        name: 'MapContainer',
        props: {
            locations: Array
        },
        emits: ['open-history'],
        data() {
            return {
                map: null,
                layerGroup: null,
                
                isRendering: false,
                renderProgress: 0,
                renderTask: null,
    
                selectedGroup: null,
                
                // КЭШ МАРКЕРОВ: { "lat,lng": LeafletMarker }
                // Позволяет обновлять точки без удаления (убирает мигание)
                markersCache: {}
            }
        },
        computed: {
            selectedTotalLogs() {
                if (!this.selectedGroup) return 0;
                return this.selectedGroup.reduce((sum, item) => sum + item.logs.length, 0);
            }
        },
        watch: {
            locations: {
                handler() { 
                    if (this.selectedGroup) {
                        const groupExists = this.locations.some(l => 
                            l.latitude === this.selectedGroup[0].latitude && 
                            l.longitude === this.selectedGroup[0].longitude
                        );
                        if (!groupExists) this.selectedGroup = null;
                    }
                    this.scheduleUpdate(); 
                },
                deep: false
            }
        },
        mounted() {
            this.initMap();
            if (this.locations.length > 0) {
                this.scheduleUpdate();
            }
        },
        beforeUnmount() {
            this.cancelRendering();
            if (this.map) {
                this.map.remove();
                this.map = null;
            }
        },
        methods: {
            initMap() {
                if (this.map) return;
                
                const mapInstance = L.map('map', {
                    zoomControl: false, 
                    preferCanvas: false 
                }).setView([40, 0], 2);
    
                this.map = markRaw(mapInstance);
                
                L.control.zoom({ position: 'bottomright' }).addTo(this.map);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
                    attribution: 'OSM', maxZoom: 18
                }).addTo(this.map);
                
                this.layerGroup = markRaw(L.layerGroup().addTo(this.map));
            },
    
            cancelRendering() {
                if (this.renderTask) {
                    clearTimeout(this.renderTask);
                    this.renderTask = null;
                }
                this.isRendering = false;
            },
    
            scheduleUpdate() {
                this.isRendering = false;
                if (this.renderTask) return;
    
                this.renderTask = setTimeout(() => {
                    this.updateMapMarkersSmart();
                    this.renderTask = null;
                }, 50); // Частота обновления ~20 FPS
            },
    
            async updateMapMarkersSmart() {
                if (!this.map || !this.layerGroup) return;
    
                this.isRendering = true;
                this.renderProgress = 0;
                
                // ВАЖНО: Мы НЕ делаем clearLayers(), чтобы не было мигания.
                
                // 1. Группируем новые данные
                const groups = {};
                const currentLocations = this.locations;
                
                for (let i = 0; i < currentLocations.length; i++) {
                    const loc = currentLocations[i];
                    if (loc.latitude && loc.longitude) {
                        const key = `${loc.latitude},${loc.longitude}`;
                        if (!groups[key]) groups[key] = [];
                        groups[key].push(loc);
                    }
                }
    
                const groupKeys = Object.keys(groups);
                const totalGroups = groupKeys.length;
                const CHUNK_SIZE = 200; // Можно больше, так как обновление дешевле создания
                
                // Сет для отслеживания актуальных ключей (чтобы удалить лишние потом)
                const processedKeys = new Set();
                
                let currentIndex = 0;
    
                const processChunk = () => {
                    if (!this.isRendering) return;
    
                    const end = Math.min(currentIndex + CHUNK_SIZE, totalGroups);
                    
                    for (let i = currentIndex; i < end; i++) {
                        const key = groupKeys[i];
                        const group = groups[key];
                        
                        // Обновляем или создаем маркер
                        this.updateOrCreateMarker(key, group);
                        processedKeys.add(key);
                    }
    
                    currentIndex = end;
                    this.renderProgress = Math.round((currentIndex / totalGroups) * 100);
    
                    if (currentIndex < totalGroups) {
                        setTimeout(processChunk, 0); 
                    } else {
                        // Конец рендеринга: Удаляем старые маркеры, которых нет в новых данных
                        this.pruneMarkers(processedKeys);
                        this.isRendering = false;
                    }
                };
                processChunk();
            },
    
            updateOrCreateMarker(key, group) {
                const mainLoc = group[0];
                const totalLogs = group.reduce((sum, item) => sum + item.logs.length, 0);
                const { color, sizeClass } = this.getMarkerStyle(totalLogs);
    
                // Получаем существующий маркер из кэша
                let marker = this.markersCache[key];
    
                // Генерируем HTML иконки
                const iconHtml = `<div class="marker-pin ${color} ${sizeClass} cursor-pointer hover:scale-110 transition-transform shadow-lg"></div>`;
    
                if (marker) {
                    // ОБНОВЛЕНИЕ
                    // Меняем иконку только если стиль изменился или мы хотим быть уверены
                    // Сравнение строк HTML - это быстро
                    // Можно оптимизировать: хранить прошлый totalLogs и сравнивать числа
                    if (marker._lastCount !== totalLogs) {
                        const newIcon = L.divIcon({
                            className: 'custom-div-icon',
                            html: iconHtml,
                            iconSize: [24, 24], iconAnchor: [12, 12]
                        });
                        marker.setIcon(newIcon);
                        marker._lastCount = totalLogs;
                        
                        // Обновляем zIndex, чтобы красные были выше зеленых
                        marker.setZIndexOffset(totalLogs); 
                    }
    
                    // Обновляем обработчик клика (перезаписываем данные замыкания)
                    // Самый простой способ обновить данные внутри клика - сохранить их в сам маркер
                    marker._currentGroup = group; 
                } else {
                    // СОЗДАНИЕ
                    const newIcon = L.divIcon({
                        className: 'custom-div-icon',
                        html: iconHtml,
                        iconSize: [24, 24], iconAnchor: [12, 12]
                    });
    
                    marker = L.marker([mainLoc.latitude, mainLoc.longitude], { icon: newIcon });
                    marker._lastCount = totalLogs;
                    marker._currentGroup = group; // Сохраняем данные прямо в объект маркера
    
                    marker.on('click', (e) => {
                        if (e.originalEvent) {
                            e.originalEvent.stopPropagation();
                            e.originalEvent.preventDefault();
                        }
                        this.map.flyTo([mainLoc.latitude, mainLoc.longitude], 10, { duration: 1 });
                        
                        // Берем актуальные данные из маркера
                        this.selectedGroup = e.target._currentGroup;
                    });
                    
                    marker.addTo(this.layerGroup);
                    this.markersCache[key] = marker; // Сохраняем в кэш
                }
    
                // Обновляем ссылку в данных (для сайдбара)
                group.forEach(l => l._marker = markRaw(marker));
            },
    
            pruneMarkers(validKeys) {
                // Проходим по всем маркерам в кэше
                for (const key in this.markersCache) {
                    // Если ключа нет в наборе новых данных - удаляем маркер
                    if (!validKeys.has(key)) {
                        const marker = this.markersCache[key];
                        this.layerGroup.removeLayer(marker);
                        delete this.markersCache[key];
                    }
                }
            },
    
            getMarkerStyle(count) {
                if (count > 1000) return { color: 'bg-red-600 pulse', sizeClass: 'w-6 h-6' };
                if (count > 100) return { color: 'bg-orange-500', sizeClass: 'w-5 h-5' };
                if (count > 10) return { color: 'bg-yellow-400', sizeClass: 'w-4 h-4' };
                return { color: 'bg-green-500', sizeClass: 'w-3 h-3' };
            },
    
            focusLocation(loc) {
                if (loc.latitude && loc._marker) {
                    this.map.flyTo([loc.latitude, loc.longitude], 10);
                    const group = this.locations.filter(l => 
                        l.latitude === loc.latitude && l.longitude === loc.longitude
                    );
                    if (group.length > 0) {
                        this.selectedGroup = group;
                    }
                }
            }
        }
    }
    </script>
    
    <template>
        <main class="flex-1 relative bg-gray-200 group overflow-hidden">
            <div id="map"></div>
            
            <!-- Оверлей рендеринга (показываем только если прогресс < 100 и это не реплей) -->
            <!-- Для реплея лучше скрыть этот бар, чтобы не мелькал, так как обновление идет постоянно -->
            <div v-if="isRendering && renderProgress < 100" class="absolute inset-x-0 top-0 z-[1000] bg-white/80 backdrop-blur px-4 py-2 shadow-sm flex items-center justify-between transition-all opacity-70">
                <div class="text-xs font-bold text-blue-600 flex items-center gap-2">
                    <div class="animate-spin h-3 w-3 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                    Обновление...
                </div>
            </div>
    
            <!-- ИНФО-ПАНЕЛЬ -->
            <Transition 
                enter-active-class="transition duration-200 ease-out" 
                enter-from-class="opacity-0 scale-95" 
                enter-to-class="opacity-100 scale-100" 
                leave-active-class="transition duration-150 ease-in" 
                leave-from-class="opacity-100 scale-100" 
                leave-to-class="opacity-0 scale-95"
            >
                <div v-if="selectedGroup" class="absolute top-4 right-4 z-[5000] w-80 bg-white rounded-xl shadow-2xl border border-gray-100 flex flex-col max-h-[85%] overflow-hidden">
                    
                    <div class="p-4 bg-gray-50 border-b flex justify-between items-start shrink-0">
                        <div>
                            <div class="flex items-center gap-2">
                                <span class="text-2xl">{{ selectedGroup[0].flag?.emoji || '🏳️' }}</span>
                                <div>
                                    <h3 class="font-bold text-gray-900 leading-tight text-sm">
                                        {{ selectedGroup[0].city || 'Локация' }}
                                    </h3>
                                    <p class="text-xs text-gray-500">{{ selectedGroup[0].country }}</p>
                                </div>
                            </div>
                        </div>
                        <button @click="selectedGroup = null" class="text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-lg p-1.5 transition cursor-pointer">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                    </div>
    
                    <div class="grid grid-cols-2 gap-px bg-gray-200 border-b shrink-0">
                        <div class="bg-white p-3 text-center">
                            <div class="text-[10px] text-gray-500 uppercase font-bold tracking-wider">IP адресов</div>
                            <div class="text-lg font-bold text-gray-800">{{ selectedGroup.length }}</div>
                        </div>
                        <div class="bg-white p-3 text-center">
                            <div class="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Запросов</div>
                            <div class="text-lg font-bold text-blue-600">{{ selectedTotalLogs }}</div>
                        </div>
                    </div>
    
                    <div class="flex-1 overflow-y-auto bg-white p-2">
                        <ul class="space-y-1">
                            <li v-for="(loc, idx) in selectedGroup" :key="idx" class="p-2 hover:bg-blue-50 rounded-lg border border-transparent hover:border-blue-100 transition-all flex justify-between items-center group/item">
                                <div class="overflow-hidden mr-2">
                                    <div class="flex items-center gap-2">
                                        <div class="w-2 h-2 rounded-full" :class="getMarkerStyle(loc.logs.length).color.replace('pulse', '')"></div>
                                        <div class="text-xs font-bold text-slate-700 font-mono truncate" :title="loc.ip">{{ loc.ip }}</div>
                                    </div>
                                    <div class="text-[10px] text-gray-400 truncate pl-4" :title="loc.connection?.org">{{ loc.connection?.org || 'Неизвестный провайдер' }}</div>
                                </div>
                                <button @click="$emit('open-history', loc.ip)" class="opacity-0 group-hover/item:opacity-100 focus:opacity-100 transition-opacity bg-white border border-blue-200 text-blue-600 text-[10px] font-bold px-2 py-1 rounded shadow-sm hover:bg-blue-50 shrink-0 cursor-pointer">
                                    Логи
                                </button>
                            </li>
                        </ul>
                    </div>
                </div>
            </Transition>
    
            <div class="absolute bottom-8 left-5 bg-white/90 p-2 rounded shadow text-xs z-[500] pointer-events-none border border-gray-200">
                <div class="font-bold mb-1 text-gray-700">Активность (reqs)</div>
                <div class="space-y-1">
                    <div class="flex items-center gap-2"><div class="w-3 h-3 rounded-full bg-green-500"></div> < 10</div>
                    <div class="flex items-center gap-2"><div class="w-3 h-3 rounded-full bg-yellow-400"></div> 10 - 100</div>
                    <div class="flex items-center gap-2"><div class="w-3 h-3 rounded-full bg-orange-500"></div> 100 - 1000</div>
                    <div class="flex items-center gap-2"><div class="w-3 h-3 rounded-full bg-red-600 animate-pulse"></div> > 1000</div>
                </div>
            </div>
        </main>
    </template>
    
    <style scoped>
    #map { height: 100%; width: 100%; z-index: 0; background: #e5e7eb; }
    </style>