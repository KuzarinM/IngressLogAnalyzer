<script>
import { Chart, registerables } from 'chart.js';
import { markRaw } from 'vue';

Chart.register(...registerables);

export default {
    name: 'AnalyticsDashboard',
    props: {
        locations: Array // Сюда приходит displayLocations
    },
    emits: ['select-search', 'select-service'],
    data() {
        return {
            zoomSpan: 24,   // Сколько часов показывать на детальном графике по умолчанию
            zoomOffset: 0,  // С какого часа начинать показ детального графика
        }
    },
    created() {
        this.charts = {}; 
    },
    computed: {
        // "Сплющиваем" логи
        flatLogs() {
            return this.locations.flatMap(loc => 
                loc.logs.map(log => ({
                    ...log,
                    ip: loc.ip,
                    country: loc.country || 'Unknown',
                    isp: loc.connection?.org || 'Unknown',
                }))
            );
        },

        // Хронологически точная агрегация активности по часам
        timeSeriesStats() {
            const counts = {};
            this.flatLogs.forEach(log => {
                if (!log.timestamp) return;
                const d = new Date(log.timestamp);
                d.setMinutes(0, 0, 0); // Округляем до начала часа
                const hourTs = d.getTime();
                counts[hourTs] = (counts[hourTs] || 0) + 1;
            });

            // Строго сортируем по временной метке
            const sortedTs = Object.keys(counts).map(Number).sort((a, b) => a - b);

            return sortedTs.map(ts => {
                const d = new Date(ts);
                const label = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth()+1).toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:00`;
                return { ts, label, count: counts[ts] };
            });
        },

        // Срез данных для детального графика
        mainChartData() {
            const fullData = this.timeSeriesStats;
            if (fullData.length === 0) return [];
            
            let span = this.zoomSpan;
            if (span > fullData.length) span = fullData.length;

            let offset = this.zoomOffset;
            if (offset + span > fullData.length) {
                offset = Math.max(0, fullData.length - span);
            }

            return fullData.slice(offset, offset + span);
        },

        // Данные для обзорной мини-карты (весь период)
        miniChartData() {
            return this.timeSeriesStats;
        },

        // Остальная статистика для дашборда
        serviceStats() {
            const counts = {};
            this.flatLogs.forEach(log => {
                counts[log.service] = (counts[log.service] || 0) + 1;
            });
            return Object.entries(counts).sort((a, b) => b[1] - a[1]);
        },
        requestStats() {
            const counts = {};
            this.flatLogs.forEach(log => {
                counts[log.request] = (counts[log.request] || 0) + 1;
            });
            const sorted = Object.entries(counts).map(([req, count]) => ({ req, count }));
            sorted.sort((a, b) => b.count - a.count);
            return {
                popular: sorted.slice(0, 10),
                rare: sorted.slice(-10).reverse()
            };
        },
        geoStats() {
            const countries = {};
            const isps = {};
            this.flatLogs.forEach(log => {
                countries[log.country] = (countries[log.country] || 0) + 1;
                isps[log.isp] = (isps[log.isp] || 0) + 1;
            });
            return {
                countries: Object.entries(countries).sort((a, b) => b[1] - a[1]).slice(0, 10),
                isps: Object.entries(isps).sort((a, b) => b[1] - a[1]).slice(0, 10)
            };
        }
    },
    watch: {
        flatLogs() {
            // Корректируем смещение, если логов стало меньше в результате фильтрации
            const maxOffset = Math.max(0, this.timeSeriesStats.length - this.zoomSpan);
            if (this.zoomOffset > maxOffset) {
                this.zoomOffset = maxOffset;
            }
            this.updateCharts();
        },
        // Следим за изменениями масштаба и смещения, чтобы плавно перерисовывать
        zoomSpan() { this.updateCharts(); },
        zoomOffset() { this.updateCharts(); }
    },
    mounted() {
        this.initCharts();
    },
    beforeUnmount() {
        if (this.charts) {
            Object.values(this.charts).forEach(chart => {
                if (chart && typeof chart.destroy === 'function') {
                    chart.destroy();
                }
            });
        }
    },
    methods: {
        initCharts() {
            // 1. Детальный линейный график
            this.charts.timeLine = markRaw(new Chart(this.$refs.timeChart, {
                type: 'line',
                data: { labels: [], datasets: [{ label: 'Запросов', data: [], borderColor: '#3b82f6', tension: 0.3, fill: true, backgroundColor: 'rgba(59, 130, 246, 0.1)' }] },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false, 
                    animation: false,
                    plugins: { legend: { display: false } },
                    scales: { 
                        x: { ticks: { maxRotation: 45, minRotation: 45 } } 
                    }
                }
            }));

            // 2. Обзорная мини-карта (весь период)
            this.charts.miniTimeLine = markRaw(new Chart(this.$refs.miniTimeChart, {
                type: 'line',
                data: { labels: [], datasets: [{ label: 'Всего', data: [], borderColor: '#93c5fd', borderWidth: 1, tension: 0.3, fill: true, backgroundColor: 'rgba(147, 197, 253, 0.05)' }] },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false, 
                    animation: false,
                    plugins: { 
                        legend: { display: false },
                        tooltip: { enabled: false }
                    },
                    scales: { 
                        x: { display: false }, 
                        y: { display: false } 
                    }
                }
            }));

            // 3. Пончик по сервисам
            this.charts.services = markRaw(new Chart(this.$refs.serviceChart, {
                type: 'doughnut',
                data: { labels: [], datasets: [{ data: [], backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'] }] },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false, 
                    animation: false,
                    onClick: (event, elements) => {
                        if (elements.length > 0) {
                            const idx = elements[0].index;
                            const service = this.charts.services.data.labels[idx];
                            this.$emit('select-service', service);
                        }
                    }
                }
            }));

            // 4. Столбики по странам
            this.charts.countries = markRaw(new Chart(this.$refs.countryChart, {
                type: 'bar',
                data: { labels: [], datasets: [{ label: 'Запросов', data: [], backgroundColor: '#10b981' }] },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false, 
                    animation: false, 
                    indexAxis: 'y',
                    onClick: (event, elements) => {
                        if (elements.length > 0) {
                            const idx = elements[0].index;
                            const country = this.charts.countries.data.labels[idx];
                            this.$emit('select-search', country);
                        }
                    }
                }
            }));

            this.updateCharts();
        },
        updateCharts() {
            if (!this.charts.timeLine || !this.charts.miniTimeLine || !this.charts.services || !this.charts.countries) return;

            // Обновляем Детальный график
            const mainData = this.mainChartData;
            this.charts.timeLine.data.labels = mainData.map(d => d.label);
            this.charts.timeLine.data.datasets[0].data = mainData.map(d => d.count);
            this.charts.timeLine.update('none');

            // Обновляем Обзорный график (мини-карту)
            const fullData = this.miniChartData;
            this.charts.miniTimeLine.data.labels = fullData.map(d => d.label);
            this.charts.miniTimeLine.data.datasets[0].data = fullData.map(d => d.count);
            this.charts.miniTimeLine.update('none');

            // Обновляем Сервисы
            this.charts.services.data.labels = this.serviceStats.map(s => s[0]);
            this.charts.services.data.datasets[0].data = this.serviceStats.map(s => s[1]);
            this.charts.services.update('none');

            // Обновляем Страны
            this.charts.countries.data.labels = this.geoStats.countries.map(c => c[0]);
            this.charts.countries.data.datasets[0].data = this.geoStats.countries.map(c => c[1]);
            this.charts.countries.update('none');
        },
        setZoomSpan(val) {
            this.zoomSpan = val;
            // Корректируем смещение, чтобы окно не вылетало за границы массива
            const maxOffset = Math.max(0, this.timeSeriesStats.length - val);
            if (this.zoomOffset > maxOffset) {
                this.zoomOffset = maxOffset;
            }
        }
    }
}
</script>

<template>
    <div class="flex-1 overflow-y-auto bg-gray-100 p-6">
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-2xl font-bold text-gray-800">Аналитический Дашборд</h2>
            <span class="text-xs text-gray-400 italic">💡 Нажмите на элементы дашборда для фильтрации</span>
        </div>
        
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <!-- Временная шкала с таймлайн-скроллером -->
            <div class="bg-white rounded-xl shadow-sm p-4 border border-gray-200 lg:col-span-2 flex flex-col justify-between">
                <div class="flex justify-between items-center mb-2">
                    <h3 class="text-sm font-bold text-gray-500 uppercase tracking-wider">Активность во времени (Детализация)</h3>
                    
                    <!-- Переключатель масштаба детализации -->
                    <div class="flex items-center gap-2">
                        <span class="text-[10px] font-bold text-gray-400 uppercase">Показать:</span>
                        <div class="flex bg-gray-100 p-0.5 rounded-lg">
                            <button 
                                v-for="opt in [
                                    { label: '12ч', val: 12 },
                                    { label: '24ч', val: 24 },
                                    { label: '3д', val: 72 },
                                    { label: 'Все', val: 999999 }
                                ]" 
                                :key="opt.val"
                                @click="setZoomSpan(opt.val)"
                                :class="zoomSpan === opt.val ? 'bg-white shadow-sm text-blue-600 font-bold' : 'text-gray-500'"
                                class="px-2 py-0.5 rounded text-[10px] transition"
                            >
                                {{ opt.label }}
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Основной крупный детальный график -->
                <div class="h-44 relative mb-2">
                    <canvas ref="timeChart"></canvas>
                </div>

                <!-- Интерактивный ползунок-скроллер -->
                <div v-if="timeSeriesStats.length > zoomSpan" class="flex flex-col gap-1 mb-2 px-2">
                    <div class="flex justify-between text-[10px] text-gray-400 font-bold font-mono">
                        <span>{{ timeSeriesStats[zoomOffset]?.label || 'Начало' }}</span>
                        <span class="text-blue-500">Прокрутка окна времени (Всего: {{ timeSeriesStats.length }}ч)</span>
                        <span>{{ timeSeriesStats[Math.min(timeSeriesStats.length - 1, zoomOffset + zoomSpan - 1)]?.label || 'Конец' }}</span>
                    </div>
                    <input 
                        type="range" 
                        min="0" 
                        :max="Math.max(0, timeSeriesStats.length - zoomSpan)" 
                        v-model.number="zoomOffset"
                        class="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600 hover:bg-gray-300 transition-colors"
                    >
                </div>

                <!-- Мелкая обзорная мини-карта (весь период) -->
                <div class="h-10 relative bg-gray-50/50 rounded border border-dashed border-gray-200 p-1">
                    <div class="absolute inset-0 pointer-events-none flex items-center justify-center">
                        <span class="text-[8px] text-gray-400 font-bold uppercase tracking-widest bg-white/90 px-2 py-0.5 rounded border border-gray-100">Обзор всего периода</span>
                    </div>
                    <canvas ref="miniTimeChart"></canvas>
                </div>
            </div>

            <!-- Сервисы -->
            <div class="bg-white rounded-xl shadow-sm p-4 border border-gray-200">
                <h3 class="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Распределение по сервисам</h3>
                <div class="h-64 relative"><canvas ref="serviceChart"></canvas></div>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <!-- Топ стран -->
            <div class="bg-white rounded-xl shadow-sm p-4 border border-gray-200">
                <h3 class="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Топ-10 Стран (Источники)</h3>
                <div class="h-64 relative"><canvas ref="countryChart"></canvas></div>
            </div>

            <!-- Топ Провайдеров -->
            <div class="bg-white rounded-xl shadow-sm p-4 border border-gray-200">
                <h3 class="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Топ Провайдеров (ISP)</h3>
                <ul class="divide-y divide-gray-100 h-64 overflow-y-auto pr-2">
                    <li v-for="isp in geoStats.isps" :key="isp[0]" 
                        @click="$emit('select-search', isp[0])"
                        class="py-2 flex justify-between items-center text-sm cursor-pointer hover:bg-blue-50 px-2 rounded transition">
                        <span class="font-medium text-gray-700 truncate w-3/4" :title="isp[0]">{{ isp[0] }}</span>
                        <span class="bg-blue-100 text-blue-800 py-0.5 px-2 rounded-full font-bold text-xs">{{ isp[1] }} reqs</span>
                    </li>
                </ul>
            </div>
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <!-- Популярные запросы -->
            <div class="bg-white rounded-xl shadow-sm p-4 border border-gray-200">
                <h3 class="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4 text-orange-600">Топ самых частых запросов</h3>
                <ul class="divide-y divide-gray-100 h-80 overflow-y-auto pr-2 font-mono text-xs">
                    <li v-for="req in requestStats.popular" :key="req.req" 
                        @click="$emit('select-search', req.req)"
                        class="py-2 flex flex-col gap-1 cursor-pointer hover:bg-gray-50 px-2 rounded transition">
                        <div class="flex justify-between items-start">
                            <span class="text-gray-800 break-all bg-gray-50 p-1 rounded">{{ req.req }}</span>
                            <span class="ml-2 font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full shrink-0">{{ req.count }}</span>
                        </div>
                    </li>
                </ul>
            </div>

            <!-- Редкие запросы -->
            <div class="bg-white rounded-xl shadow-sm p-4 border border-gray-200">
                <h3 class="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4 text-green-600">Самые редкие запросы (Аномалии)</h3>
                <ul class="divide-y divide-gray-100 h-80 overflow-y-auto pr-2 font-mono text-xs">
                    <li v-for="req in requestStats.rare" :key="req.req" 
                        @click="$emit('select-search', req.req)"
                        class="py-2 flex flex-col gap-1 cursor-pointer hover:bg-gray-50 px-2 rounded transition">
                        <div class="flex justify-between items-start">
                            <span class="text-gray-800 break-all bg-gray-50 p-1 rounded">{{ req.req }}</span>
                            <span class="ml-2 font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full shrink-0">{{ req.count }}</span>
                        </div>
                    </li>
                </ul>
            </div>
        </div>
    </div>
</template>