<script>
    import { getCountBadgeClass } from '../utils/formatters';
        
    export default {
        name: 'SidebarList',
        props: {
            locations: Array,
            uniqueServices: Array,
            globalMinTime: Number,
            globalMaxTime: Number
        },
        emits: ['focus-location', 'filter-change'],
        data() {
            return {
                searchQuery: '',
                selectedServiceFilter: '',
                timeStart: '',
                timeEnd: ''
            }
        },
        computed: {
            minTimeISO() { return this.formatDateForInput(this.globalMinTime); },
            maxTimeISO() { return this.formatDateForInput(this.globalMaxTime); }
        },
        watch: {
            searchQuery() { this.emitFilter(); },
            selectedServiceFilter() { this.emitFilter(); },
            timeStart() { this.emitFilter(); },
            timeEnd() { this.emitFilter(); },
            globalMinTime: {
                immediate: true,
                handler(newVal) {
                    if (newVal && newVal > 0) {
                        this.timeStart = this.formatDateForInput(newVal);
                    }
                }
            },
            globalMaxTime: {
                immediate: true,
                handler(newVal) {
                    if (newVal && newVal > 0) {
                        this.timeEnd = this.formatDateForInput(newVal);
                    }
                }
            }
        },
        methods: {
            getCountBadgeClass,
            emitFocus(loc) { this.$emit('focus-location', loc); },
            emitFilter() {
                this.$emit('filter-change', {
                    search: this.searchQuery,
                    service: this.selectedServiceFilter,
                    timeStart: this.timeStart,
                    timeEnd: this.timeEnd
                });
            },
            // Вспомогательные методы для изменения состояния фильтров из App.vue
            setSearch(val) {
                this.searchQuery = val;
            },
            setService(val) {
                this.selectedServiceFilter = val;
            },
            formatDateForInput(timestamp) {
                if (!timestamp || timestamp <= 0 || isNaN(timestamp)) return '';
                try {
                    const date = new Date(timestamp);
                    if (isNaN(date.getTime())) return '';
                    const offset = date.getTimezoneOffset() * 60000;
                    const localDate = new Date(date.getTime() - offset);
                    return localDate.toISOString().slice(0, 16);
                } catch (e) {
                    console.warn('Error formatting date:', e);
                    return '';
                }
            }
        }
    }
</script>

<template>
    <aside class="w-80 bg-white border-r border-gray-200 flex flex-col z-10 shadow-lg shrink-0">
        <!-- Фильтры -->
        <div class="p-3 border-b bg-gray-50 space-y-3">
            <!-- Поиск -->
            <input type="text" v-model="searchQuery" placeholder="Поиск (IP, Страна, Запрос)..." class="w-full px-3 py-1.5 border rounded text-sm focus:outline-none focus:border-blue-500">
            
            <!-- Сервисы -->
            <select v-model="selectedServiceFilter" class="w-full px-3 py-1.5 border rounded text-sm bg-white text-gray-700 focus:outline-none focus:border-blue-500">
                <option value="">Все сервисы</option>
                <option v-for="svc in uniqueServices" :key="svc" :value="svc">{{ svc }}</option>
            </select>

            <!-- Временное окно -->
            <div class="space-y-1">
                <div class="flex justify-between items-center">
                    <label class="text-[10px] uppercase font-bold text-gray-400">Временное окно</label>
                    <button @click="timeStart = minTimeISO; timeEnd = maxTimeISO" class="text-[10px] text-blue-500 hover:text-blue-700 cursor-pointer" title="Сбросить время">Сброс</button>
                </div>
                
                <div class="flex flex-col gap-2">
                    <div class="flex items-center gap-2">
                        <span class="text-xs text-gray-400 w-4">С:</span>
                        <input 
                            type="datetime-local" 
                            v-model="timeStart" 
                            class="w-full px-2 py-1 border rounded text-xs text-gray-600 font-mono focus:border-blue-500 outline-none"
                            :min="minTimeISO"
                            :max="maxTimeISO"
                        >
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="text-xs text-gray-400 w-4">По:</span>
                        <input 
                            type="datetime-local" 
                            v-model="timeEnd" 
                            class="w-full px-2 py-1 border rounded text-xs text-gray-600 font-mono focus:border-blue-500 outline-none"
                            :min="minTimeISO"
                            :max="maxTimeISO"
                        >
                    </div>
                </div>
            </div>

            <div class="text-[10px] text-gray-400 text-center pt-1 border-t border-gray-200 mt-2">
                Найдено: {{ locations.length }} локаций
            </div>
        </div>

        <!-- Список -->
        <div class="overflow-y-auto flex-1">
            <ul class="divide-y divide-gray-100">
                <li v-for="(loc, index) in locations" :key="index" 
                    @click="emitFocus(loc)"
                    class="p-3 hover:bg-gray-50 cursor-pointer transition-colors border-l-4 border-transparent hover:border-blue-400 relative">
                    
                    <div class="flex justify-between items-start">
                        <div class="flex items-center gap-3 w-full">
                            <span class="text-xl shrink-0">{{ loc.flag?.emoji || '🏳️' }}</span>
                            <div class="overflow-hidden w-full">
                                <div class="flex justify-between items-center w-full">
                                    <span class="font-bold text-gray-800 text-sm font-mono">{{ loc.ip }}</span>
                                    <span class="text-[10px] px-1.5 rounded-full font-bold min-w-[24px] text-center"
                                        :class="getCountBadgeClass(loc.logs.length)">
                                        {{ loc.logs.length }}
                                    </span>
                                </div>
                                <p class="text-xs text-gray-500 truncate">{{ loc.city || 'Загрузка...' }}, {{ loc.country }}</p>
                            </div>
                        </div>
                    </div>
                </li>
            </ul>
        </div>
    </aside>
</template>