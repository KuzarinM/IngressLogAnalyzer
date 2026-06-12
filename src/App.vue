<script>
    import AppHeader from './components/AppHeader.vue';
    import FileUploader from './components/FileUploader.vue';
    import SidebarList from './components/SidebarList.vue';
    import MapContainer from './components/MapContainer.vue';
    import HistoryModal from './components/HistoryModal.vue';
    import TimelinePlayer from './components/TimelinePlayer.vue';
    import AnalyticsDashboard from './components/AnalyticsDashboard.vue';
    import { getFlagEmoji } from './utils/formatters';
            
    export default {
        name: 'App',
        components: {
            AppHeader, FileUploader, SidebarList, MapContainer, HistoryModal, TimelinePlayer, AnalyticsDashboard
        },
        data() {
            return {
                dataLoaded: false,
                currentView: 'map', // 'map' | 'dashboard'
                locations: [],
                filteredLocations: [],
                currentTime: 0,
                globalMinTime: 0,
                globalMaxTime: 0,
                filterTimeStart: 0,
                filterTimeEnd: 0,
                enrichment: { active: false, total: 0, current: 0, rateLimited: false },
                historyModal: { show: false, ip: '', geo: '', logs: [] }
            }
        },
        computed: {
            uniqueServices() {
                const services = new Set();
                this.locations.forEach(loc => {
                    loc.logs.forEach(log => {
                        if (log.service) {
                            services.add(log.service);
                        }
                    });
                });
                return Array.from(services).sort();
            },
            displayLocations() {
                if (this.filteredLocations.length === 0) return [];
                if (!this.currentTime || this.currentTime >= this.filterTimeEnd) {
                    return this.filteredLocations;
                }
                const res = [];
                for (const loc of this.filteredLocations) {
                    const visibleLogs = loc.logs.filter(l => l.timestamp <= this.currentTime);
                    if (visibleLogs.length > 0) {
                        res.push({
                            ...loc,
                            logs: visibleLogs
                        });
                    }
                }
                return res;
            }
        },
        methods: {
            onDataLoaded(data) {
                const months = { 'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5, 'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11 };
                data.forEach(loc => {
                    loc.logs.forEach(log => {
                        if (!log.timestamp && log.time) {
                            try {
                                const match = log.time.match(/(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})/);
                                if (match) {
                                    const [_, d, mStr, y, h, min, s] = match;
                                    if (months[mStr] !== undefined) {
                                        log.timestamp = Date.UTC(y, months[mStr], d, h, min, s);
                                    }
                                }
                            } catch (e) {}
                        }
                        if (!log.timestamp) log.timestamp = 0;
                    });
                });
                this.locations = data;
                let min = Infinity;
                let max = -Infinity;
                let hasTime = false;
                this.locations.forEach(loc => {
                    loc.logs.forEach(log => {
                        if (log.timestamp && log.timestamp > 0) {
                            if (log.timestamp < min) min = log.timestamp;
                            if (log.timestamp > max) max = log.timestamp;
                            hasTime = true;
                        }
                    });
                });
                if (hasTime && min !== Infinity) {
                    this.globalMinTime = min;
                    this.globalMaxTime = max;
                    this.currentTime = max;
                } else {
                    this.globalMinTime = 0;
                    this.globalMaxTime = 0;
                    this.currentTime = 0;
                }
                this.dataLoaded = true;
                this.$nextTick(() => { this.enrichGeoData(); });
            },
            
            // Продвинутый движок фильтрации: поддерживает сквозной поиск по запросам, провайдерам, городам и странам
            handleFilterChange({ search, service, timeStart, timeEnd }) {
                const q = search.toLowerCase().trim();
                const tStart = timeStart ? new Date(timeStart).getTime() : 0;
                const tEnd = timeEnd ? new Date(timeEnd).getTime() : 8640000000000000;
                this.filterTimeStart = (tStart > 0 && tStart >= this.globalMinTime) ? tStart : this.globalMinTime;
                this.filterTimeEnd = (tEnd < 8640000000000000 && tEnd <= this.globalMaxTime) ? tEnd : this.globalMaxTime;
                
                if (this.currentTime < this.filterTimeStart || this.currentTime > this.filterTimeEnd) {
                    this.currentTime = this.filterTimeEnd;
                }
                
                const ignoreTime = (this.globalMinTime === 0 && this.globalMaxTime === 0);
                const res = [];
                
                this.locations.forEach(loc => {
                    const matchingLogs = loc.logs.filter(log => {
                        const passService = !service || log.service === service;
                        let passTime = true;
                        if (!ignoreTime && log.timestamp > 0) {
                            if (tStart > 0 && log.timestamp < tStart) passTime = false;
                            if (tEnd < 8640000000000000 && log.timestamp > tEnd) passTime = false;
                        }
                        
                        // Если в поиске передан конкретный запрос (например, роут аномалии), 
                        // то мы скрываем в логах этого хоста все другие запросы.
                        const passQueryInLog = !q || 
                            log.request.toLowerCase().includes(q) || 
                            (log.service && log.service.toLowerCase().includes(q));

                        return passService && passTime && (
                            passQueryInLog || 
                            loc.ip.includes(q) || 
                            (loc.city && loc.city.toLowerCase().includes(q)) || 
                            (loc.country && loc.country.toLowerCase().includes(q)) ||
                            (loc.connection?.org && loc.connection.org.toLowerCase().includes(q))
                        );
                    });
                    
                    if (matchingLogs.length === 0) return;
                    
                    // Проверяем, соответствует ли сам хост строке поиска
                    const passSearch = !q || 
                        loc.ip.includes(q) || 
                        (loc.city && loc.city.toLowerCase().includes(q)) || 
                        (loc.country && loc.country.toLowerCase().includes(q)) ||
                        (loc.connection?.org && loc.connection.org.toLowerCase().includes(q)) ||
                        matchingLogs.some(log => log.request.toLowerCase().includes(q));
                        
                    if (passSearch) {
                        res.push({ ...loc, logs: matchingLogs });
                    }
                });
                
                res.sort((a, b) => b.logs.length - a.logs.length);
                this.filteredLocations = res;
            },
            
            // Обработчики кликов на дашборде, которые транслируют значения в сайдбар
            onSelectSearch(val) {
                if (this.$refs.sidebar) {
                    this.$refs.sidebar.setSearch(val);
                }
            },
            onSelectService(val) {
                if (this.$refs.sidebar) {
                    this.$refs.sidebar.setService(val);
                }
            },

            focusLocation(loc) {
                if (this.$refs.mapComp) this.$refs.mapComp.focusLocation(loc);
            },
            openHistory(ip) {
                const loc = this.displayLocations.find(l => l.ip === ip);
                if (loc) {
                    this.historyModal.ip = loc.ip;
                    this.historyModal.geo = `${loc.city || ''}, ${loc.country || ''}`;
                    this.historyModal.logs = loc.logs;
                    this.historyModal.show = true;
                }
            },
async enrichGeoData() {
                const ipsToFetch = this.locations.filter(l => !l.latitude && !l.geoFailed);
                if (ipsToFetch.length === 0) return;
                                
                this.enrichment.total = ipsToFetch.length;
                this.enrichment.active = true;
                                
                for (const loc of ipsToFetch) {
                    let attempts = 0;
                    const maxAttempts = 3;
                    let success = false;
                    const cleanIp = loc.ip.trim();
                                        
                    while (attempts < maxAttempts && !success) {
                        try {
                            // 1. Основной запрос к вашему API
                            const res = await fetch(`https://geoip.detector404.ru/api/v1/ip/${cleanIp}`);
                                                        
                            if (res.status === 429) {
                                this.enrichment.rateLimited = true;
                                await new Promise(r => setTimeout(r, 5000));
                                attempts++;
                                continue;
                            }
                                                        
                            if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
                                                        
                            const responseData = await res.json();
                                                        
                            if (responseData.success && responseData.data) {
                                const geo = responseData.data.country;
                                const ispInfo = responseData.data.isp;
                                                                
                                if (geo) {
                                    const ccode = geo.ccode ? geo.ccode.toLowerCase() : null;
                                    let lat = geo.latitude;
                                    let lng = geo.longitude;
                                    let countryName = geo.country;
                                    let city = geo.location ? geo.location.split(',').pop().trim() : 'Неизвестный город';

                                    // Проверяем, получили ли мы полные координаты от основного провайдера
                                    let hasCoords = typeof lat === 'number' && typeof lng === 'number' && lat !== null && lng !== null;
                                    
                                    // 2. ГИБРИДНЫЙ ФОЛБЕК: Если координат нет, запрашиваем точное расположение у freeipapi.com
                                    if (!hasCoords) {
                                        try {
                                            const fallbackRes = await fetch(`https://free.freeipapi.com/api/json/${cleanIp}`);
                                            if (fallbackRes.ok) {
                                                const fallbackData = await fallbackRes.json();
                                                if (fallbackData && typeof fallbackData.latitude === 'number' && typeof fallbackData.longitude === 'number') {
                                                    lat = fallbackData.latitude;
                                                    lng = fallbackData.longitude;
                                                    if (fallbackData.countryName) {
                                                        countryName = fallbackData.countryName;
                                                    }
                                                    if (fallbackData.cityName) {
                                                        city = fallbackData.cityName;
                                                    }
                                                    hasCoords = true;
                                                }
                                            }
                                        } catch (fallbackError) {
                                            console.warn(`[Фолбек API] Не удалось получить координаты с freeipapi.com для IP ${cleanIp}:`, fallbackError);
                                        }
                                    }

                                    // 3. ТРЕТИЙ УРОВЕНЬ ЗАЩИТЫ: Если оба API не вернули координаты, берем из локальной базы
                                    if (!hasCoords && ccode) {
                                        const fb = countryFallbacks[ccode] || this.generateDeterministicCoords(ccode);
                                        lat = fb.lat;
                                        lng = fb.lng;
                                        if (!countryName) {
                                            countryName = fb.name;
                                        }
                                        city = 'Центр страны';
                                        hasCoords = true;
                                    }

                                    // Если на каком-то из трех уровней мы успешно получили координаты
                                    if (hasCoords && typeof lat === 'number' && typeof lng === 'number') {
                                        loc.latitude = lat;
                                        loc.longitude = lng;
                                        loc.country = countryName || 'Unknown Country';
                                        loc.city = city;
                                        
                                        loc.flag = { 
                                             emoji: ccode ? getFlagEmoji(ccode) : '🌐',
                                             img: null 
                                        };
                                                                            
                                        loc.connection = { 
                                             isp: ispInfo?.isp || 'Неизвестный провайдер',
                                             org: ispInfo?.org || 'Неизвестная организация' 
                                         };
                                                                            
                                        success = true;
                                        this.enrichment.rateLimited = false;
                                    } else {
                                        break; // Нет возможности определить положение
                                    }
                                } else {
                                    break;
                                }
                            } else {
                                if (responseData.message && responseData.message.includes("Rate limit")) {
                                    this.enrichment.rateLimited = true;
                                    await new Promise(r => setTimeout(r, 3000));
                                    attempts++;
                                } else {
                                    break;
                                }
                            }
                        } catch (e) {
                            console.error(`Ошибка гео-запроса для IP ${loc.ip}:`, e);
                            await new Promise(r => setTimeout(r, 1000));
                            attempts++;
                        }
                    }
                                        
                    if (!success) {
                        loc.geoFailed = true;
                        loc.city = 'Неизвестно';
                        loc.country = 'Локальный IP / Ошибка API';
                        loc.flag = { emoji: '❓' };
                        loc.connection = { isp: 'Частная сеть', org: 'Не удалось определить' };
                    }
                                        
                    const filteredLoc = this.filteredLocations.find(fl => fl.ip === loc.ip);
                    if (filteredLoc) {
                        filteredLoc.latitude = loc.latitude;
                        filteredLoc.longitude = loc.longitude;
                        filteredLoc.city = loc.city;
                        filteredLoc.country = loc.country;
                        filteredLoc.flag = loc.flag;
                        filteredLoc.connection = loc.connection;
                        filteredLoc.geoFailed = loc.geoFailed;
                    }
                                        
                    this.filteredLocations = [...this.filteredLocations];
                    this.enrichment.current++;
                    
                    // Небольшая задержка, чтобы не перегружать бесплатный лимит запросов в секунду
                    await new Promise(r => setTimeout(r, 1000));
                }
                                
                this.enrichment.active = false;
                this.enrichment.rateLimited = false;
            },
            exportData() {
                const cleanData = this.filteredLocations.map(loc => {
                    const { _marker, ...rest } = loc;
                    return rest;
                });
                const dataStr = JSON.stringify(cleanData, null, 2);
                const blob = new Blob([dataStr], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `geo-analytics-filtered.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            },
            resetApp() {
                this.dataLoaded = false;
                this.locations = [];
                this.filteredLocations = [];
                this.enrichment = { active: false, total: 0, current: 0, rateLimited: false };
            }
        }
    }
</script>

<template>
    <div id="app-container" class="h-screen flex flex-col relative overflow-hidden bg-gray-100 text-slate-800">
        <HistoryModal 
            :show="historyModal.show"
            :ip="historyModal.ip"
            :geo="historyModal.geo"
            :logs="historyModal.logs"
            @close="historyModal.show = false"
        />
        
        <AppHeader 
            :data-loaded="dataLoaded" 
            :enrichment="enrichment"
            :current-view="currentView"
            @change-view="v => currentView = v"
            @export="exportData" 
            @reset="resetApp"
        />
        
        <div v-if="dataLoaded" class="flex-1 flex overflow-hidden relative">
            <!-- Сайдбар теперь всегда на экране -->
            <SidebarList 
                ref="sidebar"
                :locations="displayLocations" 
                :unique-services="uniqueServices"
                :global-min-time="globalMinTime"
                :global-max-time="globalMaxTime"
                @focus-location="focusLocation"
                @filter-change="handleFilterChange"
            />
            
            <MapContainer 
                v-show="currentView === 'map'"
                ref="mapComp"
                :locations="displayLocations"
                @open-history="openHistory"
            />
            
            <!-- Слушаем события клика на дашборде -->
            <AnalyticsDashboard 
                v-if="currentView === 'dashboard'" 
                :locations="displayLocations" 
                @select-search="onSelectSearch"
                @select-service="onSelectService"
            />
        </div>
        
        <TimelinePlayer 
            v-if="dataLoaded && globalMaxTime > 0"
            :min-time="filterTimeStart"
            :max-time="filterTimeEnd"
            v-model="currentTime"
        />
        
        <FileUploader v-else @data-loaded="onDataLoaded" />
    </div>
</template>