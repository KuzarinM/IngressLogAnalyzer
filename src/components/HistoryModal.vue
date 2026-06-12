<script>
    import { getStatusClass } from '../utils/formatters';
    
    export default {
        name: 'HistoryModal',
        props: {
            show: Boolean,
            ip: String,
            geo: String,
            logs: Array
        },
        emits: ['close'],
        data() {
            return {
                grouped: true,
                displayLimit: 50,
                observer: null,
                
                // Новые состояния для фильтра и сортировки
                searchQuery: '',
                sortKey: 'time', // 'time', 'status', 'service', 'count', 'request'
                sortDesc: true   // true = убывание, false = возрастание
            }
        },
        computed: {
            // 1. Сначала формируем базовый список (Сгруппированный или Сырой)
            baseRows() {
                if (!this.grouped) {
                    // В сыром виде добавляем поле originalIndex для стабильности
                    return this.logs.map((l, i) => ({ ...l, _id: i }));
                }
    
                const groups = {};
                this.logs.forEach(log => {
                    const key = `${log.request}|${log.status}|${log.service}`;
                    if (!groups[key]) {
                        groups[key] = {
                            request: log.request, 
                            status: log.status, 
                            service: log.service,
                            count: 0, 
                            timestamps: [], // Храним массив timestamp'ов
                            timeStr: log.time // Храним строковое время для отображения
                        };
                    }
                    groups[key].count++;
                    // Если у нас есть timestamp (от нового парсера), сохраняем его
                    if (log.timestamp) {
                        groups[key].timestamps.push(log.timestamp);
                    }
                });
    
                return Object.values(groups).map(g => {
                    // Сортируем таймстампы внутри группы, чтобы найти первый и последний
                    g.timestamps.sort((a, b) => a - b);
                    return {
                        ...g,
                        // Для сортировки берем время последнего события
                        timestamp: g.timestamps.length ? g.timestamps[g.timestamps.length - 1] : 0,
                        firstTime: this.formatTime(g.timestamps[0]),
                        lastTime: this.formatTime(g.timestamps[g.timestamps.length - 1])
                    };
                });
            },
    
            // 2. Фильтруем и Сортируем
            processedRows() {
                let result = this.baseRows;
    
                // --- ФИЛЬТРАЦИЯ ---
                if (this.searchQuery) {
                    const q = this.searchQuery.toLowerCase();
                    result = result.filter(row => 
                        String(row.status).includes(q) ||
                        (row.service && row.service.toLowerCase().includes(q)) ||
                        (row.request && row.request.toLowerCase().includes(q))
                    );
                }
    
                // --- СОРТИРОВКА ---
                result.sort((a, b) => {
                    let valA, valB;
    
                    // Выбираем поле для сортировки
                    switch (this.sortKey) {
                        case 'time':
                            valA = a.timestamp || 0;
                            valB = b.timestamp || 0;
                            break;
                        case 'count':
                            // В разгруппированном виде count всегда 1
                            valA = this.grouped ? a.count : 1;
                            valB = this.grouped ? b.count : 1;
                            break;
                        case 'status':
                            valA = parseInt(a.status, 10);
                            valB = parseInt(b.status, 10);
                            break;
                        case 'service':
                            valA = a.service || '';
                            valB = b.service || '';
                            break;
                        case 'request':
                            valA = a.request || '';
                            valB = b.request || '';
                            break;
                        default:
                            valA = 0; valB = 0;
                    }
    
                    // Сравниваем
                    if (valA < valB) return this.sortDesc ? 1 : -1;
                    if (valA > valB) return this.sortDesc ? -1 : 1;
                    return 0;
                });
    
                return result;
            },
    
            // 3. Пагинация (Бесконечный скролл)
            visibleRows() {
                return this.processedRows.slice(0, this.displayLimit);
            }
        },
        watch: {
            show() { this.resetView(); },
            grouped() { this.resetView(); },
            // При поиске или сортировке сбрасываем скролл наверх
            searchQuery() { this.displayLimit = 50; this.$refs.scrollContainer?.scrollTo(0,0); },
            sortKey() { this.displayLimit = 50; this.$refs.scrollContainer?.scrollTo(0,0); },
            sortDesc() { this.displayLimit = 50; this.$refs.scrollContainer?.scrollTo(0,0); }
        },
        methods: {
            getStatusClass,
            close() { this.$emit('close'); },
            
            resetView() {
                this.displayLimit = 50;
                this.searchQuery = '';
                // По умолчанию сортируем по времени (новые сверху)
                this.sortKey = this.grouped ? 'count' : 'time'; 
                this.sortDesc = true;
                this.$nextTick(this.setupObserver);
            },
    
            sortBy(key) {
                if (this.sortKey === key) {
                    // Если кликнули по той же колонке - меняем направление
                    this.sortDesc = !this.sortDesc;
                } else {
                    // Если новая колонка - сортируем по убыванию (обычно это удобнее)
                    this.sortKey = key;
                    this.sortDesc = true;
                }
            },
    
            // Хелпер для стрелочек
            getSortIcon(key) {
                if (this.sortKey !== key) return 'opacity-20'; // Неактивная стрелка
                return this.sortDesc ? 'transform rotate-180 opacity-100' : 'opacity-100';
            },
    
            setupObserver() {
                if (this.observer) this.observer.disconnect();
                const trigger = this.$refs.loadTrigger;
                if (!trigger) return;
    
                this.observer = new IntersectionObserver((entries) => {
                    if (entries[0].isIntersecting) {
                        this.loadMore();
                    }
                }, { root: this.$refs.scrollContainer, threshold: 0.1 });
    
                this.observer.observe(trigger);
            },
    
            loadMore() {
                if (this.displayLimit < this.processedRows.length) {
                    this.displayLimit += 50;
                }
            },
    
            formatTime(ts) {
                if (!ts) return '-';
                // Форматируем timestamp в читаемую строку
                const d = new Date(ts);
                // Если дата валидна
                if (!isNaN(d.getTime())) {
                    return d.toLocaleString('ru-RU');
                }
                return '-';
            }
        },
        beforeUnmount() {
            if (this.observer) this.observer.disconnect();
        }
    }
    </script>
    
    <template>
        <div v-if="show" class="absolute inset-0 z-[6000] bg-black/60 flex justify-center items-center backdrop-blur-sm" @click.self="close">
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden animate-fade-in">
                
                <!-- Шапка -->
                <div class="p-4 border-b bg-gray-50 shrink-0">
                    <div class="flex justify-between items-start mb-4">
                        <div>
                            <h2 class="text-xl font-bold text-gray-800 flex items-center gap-2">
                                История запросов
                                <span class="bg-blue-600 text-white text-sm px-2 py-1 rounded font-mono">{{ ip }}</span>
                            </h2>
                            <p class="text-sm text-gray-500 mt-1 flex gap-2">
                                {{ geo }} • Записей: {{ processedRows.length }} <span v-if="processedRows.length !== logs.length" class="text-gray-400">(фильтр из {{ logs.length }})</span>
                            </p>
                        </div>
                        
                        <div class="flex items-center gap-4">
                            <label class="flex items-center cursor-pointer select-none">
                                <div class="relative">
                                    <input type="checkbox" v-model="grouped" class="sr-only">
                                    <div class="block bg-gray-300 w-10 h-6 rounded-full" :class="{'bg-blue-500': grouped}"></div>
                                    <div class="dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition" :class="{'transform translate-x-4': grouped}"></div>
                                </div>
                                <div class="ml-3 text-sm font-medium text-gray-700">Группировка</div>
                            </label>
                            <button @click="close" class="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-200 rounded-full transition cursor-pointer">
                                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                        </div>
                    </div>
    
                    <!-- Поле поиска -->
                    <div class="relative">
                        <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                        </span>
                        <input 
                            type="text" 
                            v-model="searchQuery" 
                            placeholder="Фильтр по запросу, статусу или сервису..." 
                            class="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                        >
                    </div>
                </div>
                
                <!-- Таблица -->
                <div ref="scrollContainer" class="flex-1 overflow-auto p-0 bg-white relative">
                    <table class="w-full text-left text-sm border-collapse">
                        <thead class="bg-gray-100 sticky top-0 shadow-sm z-10 text-xs uppercase text-gray-500 font-bold select-none">
                            <tr>
                                <!-- Сортируемые заголовки -->
                                <th @click="sortBy(grouped ? 'count' : 'time')" class="p-3 w-44 border-b cursor-pointer hover:bg-gray-200 transition-colors group">
                                    <div class="flex items-center gap-1">
                                        {{ grouped ? 'Кол-во / Время' : 'Время' }}
                                        <svg class="w-3 h-3 transition-transform duration-200" :class="getSortIcon(grouped ? 'count' : 'time')" fill="currentColor" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/></svg>
                                    </div>
                                </th>
                                
                                <th @click="sortBy('status')" class="p-3 w-24 border-b cursor-pointer hover:bg-gray-200 transition-colors group">
                                    <div class="flex items-center gap-1">
                                        Статус
                                        <svg class="w-3 h-3 transition-transform duration-200" :class="getSortIcon('status')" fill="currentColor" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/></svg>
                                    </div>
                                </th>
                                
                                <th @click="sortBy('service')" class="p-3 w-48 border-b cursor-pointer hover:bg-gray-200 transition-colors group">
                                    <div class="flex items-center gap-1">
                                        Сервис
                                        <svg class="w-3 h-3 transition-transform duration-200" :class="getSortIcon('service')" fill="currentColor" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/></svg>
                                    </div>
                                </th>
                                
                                <th @click="sortBy('request')" class="p-3 border-b cursor-pointer hover:bg-gray-200 transition-colors group">
                                    <div class="flex items-center gap-1">
                                        Запрос (Request)
                                        <svg class="w-3 h-3 transition-transform duration-200" :class="getSortIcon('request')" fill="currentColor" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/></svg>
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100">
                            <tr v-for="(row, idx) in visibleRows" :key="idx" class="hover:bg-gray-50 font-mono text-xs transition-colors">
                                
                                <!-- Время / Кол-во -->
                                <td class="p-3 text-gray-500 whitespace-nowrap align-top" :class="{'bg-gray-50/50': grouped}">
                                    <div v-if="grouped">
                                        <div class="font-bold text-blue-600 text-sm">x{{ row.count }}</div>
                                        <div class="text-[10px] mt-1 text-gray-400">{{ row.firstTime }}</div>
                                        <!-- <div class="text-gray-300 leading-3 text-[8px] pl-1">⬇</div> -->
                                        <div class="text-[10px] text-gray-600">{{ row.lastTime }}</div>
                                    </div>
                                    <span v-else>{{ row.time }}</span>
                                </td>
    
                                <!-- Статус -->
                                <td class="p-3 align-top">
                                    <span :class="getStatusClass(row.status)" class="px-2 py-0.5 rounded border">
                                        {{ row.status }}
                                    </span>
                                </td>
    
                                <!-- Сервис -->
                                <td class="p-3 text-gray-700 align-top break-words">
                                    {{ row.service }}
                                </td>
    
                                <!-- Запрос -->
                                <td class="p-3 text-gray-600 break-all align-top">
                                    <span v-if="searchQuery" v-html="row.request.replace(new RegExp(searchQuery, 'gi'), match => `<span class='bg-yellow-200'>${match}</span>`)"></span>
                                    <span v-else>{{ row.request }}</span>
                                </td>
                            </tr>
                            
                            <!-- Пустое состояние -->
                            <tr v-if="processedRows.length === 0">
                                <td colspan="4" class="p-8 text-center text-gray-400">
                                    Ничего не найдено по запросу "{{ searchQuery }}"
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    
                    <!-- Триггер загрузки -->
                    <div ref="loadTrigger" class="h-10 w-full flex justify-center items-center py-4">
                        <span v-if="visibleRows.length < processedRows.length" class="text-gray-400 text-xs animate-pulse">Загрузка...</span>
                    </div>
                </div>
            </div>
        </div>
    </template>