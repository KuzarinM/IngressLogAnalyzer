<script>
    import AppHeader from './components/AppHeader.vue';
    import FileUploader from './components/FileUploader.vue';
    import SidebarList from './components/SidebarList.vue';
    import MapContainer from './components/MapContainer.vue';
    import HistoryModal from './components/HistoryModal.vue';
    import TimelinePlayer from './components/TimelinePlayer.vue';
    import { getFlagEmoji } from './utils/formatters';
        
    export default {
        name: 'App',
        components: {
            AppHeader, FileUploader, SidebarList, MapContainer, HistoryModal, TimelinePlayer
        },
        data() {
            return {
                dataLoaded: false,
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

            handleFilterChange({ search, service, timeStart, timeEnd }) {
                const q = search.toLowerCase();
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
                        return passService && passTime;
                    });

                    if (matchingLogs.length === 0) return;

                    const passSearch = !q || 
                        loc.ip.includes(q) || 
                        (loc.city && loc.city.toLowerCase().includes(q)) || 
                        (loc.country && loc.country.toLowerCase().includes(q));

                    if (passSearch) {
                        res.push({ ...loc, logs: matchingLogs });
                    }
                });

                res.sort((a, b) => b.logs.length - a.logs.length);
                this.filteredLocations = res;
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
                // Извлекаем IP, у которых нет координат и которые ранее не завершились ошибкой
                const ipsToFetch = this.locations.filter(l => !l.latitude && !l.geoFailed);
                if (ipsToFetch.length === 0) return;
                
                this.enrichment.total = ipsToFetch.length;
                this.enrichment.active = true;
                
                for (const loc of ipsToFetch) {
                    let attempts = 0;
                    const maxAttempts = 3;
                    let success = false;
                    
                    while (attempts < maxAttempts && !success) {
                        try {
                            // Очищаем IP от лишних символов на случай пробелов
                            const cleanIp = loc.ip.trim();
                            const res = await fetch(`https://geoip.detector404.ru/api/v1/ip/${cleanIp}`);
                            
                            // Обработка превышения лимита запросов (код 429)
                            if (res.status === 429) {
                                this.enrichment.rateLimited = true;
                                await new Promise(r => setTimeout(r, 5000)); // Ожидание 5 сек
                                attempts++;
                                continue;
                            }
                            
                            if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
                            
                            const responseData = await res.json();
                            
                            if (responseData.success && responseData.data) {
                                const geo = responseData.data.country;
                                const ispInfo = responseData.data.isp;
                                
                                // Проверяем наличие координат в ответе
                                if (geo && typeof geo.latitude === 'number' && typeof geo.longitude === 'number') {
                                    loc.latitude = geo.latitude;
                                    loc.longitude = geo.longitude;
                                    
                                    // Пытаемся взять город (последнее значение из "Обвальден, Энгельберг")
                                    loc.city = geo.location ? geo.location.split(',').pop().trim() : 'Неизвестный город';
                                    loc.country = geo.country || 'Неизвестная страна';
                                    
                                    loc.flag = { 
                                        emoji: geo.ccode ? getFlagEmoji(geo.ccode) : '🌐', 
                                        img: null // Данный API не присылает ссылку на картинку флага, используем emoji
                                    };
                                    
                                    loc.connection = { 
                                        isp: ispInfo?.isp || 'Неизвестный провайдер', 
                                        org: ispInfo?.org || 'Неизвестная организация' 
                                    };
                                    
                                    success = true;
                                    this.enrichment.rateLimited = false;
                                } else {
                                    // Если координат нет в ответе (например, локальный диапазон)
                                    break;
                                }
                            } else {
                                // Если API вернул ошибку, связанную с лимитами
                                if (responseData.message && responseData.message.includes("Rate limit")) {
                                    this.enrichment.rateLimited = true;
                                    await new Promise(r => setTimeout(r, 3000));
                                    attempts++;
                                } else {
                                    // Другая ошибка API — не требующая повторных попыток
                                    break;
                                }
                            }
                        } catch (e) {
                            console.error(`Ошибка гео-запроса для IP ${loc.ip}:`, e);
                            await new Promise(r => setTimeout(r, 1000));
                            attempts++;
                        }
                    }
                    
                    // Если не удалось определить координаты
                    if (!success) {
                        loc.geoFailed = true;
                        loc.city = 'Неизвестно';
                        loc.country = 'Локальный IP / Ошибка API';
                        loc.flag = { emoji: '❓' };
                        loc.connection = { isp: 'Частная сеть', org: 'Не удалось определить' };
                    }
                    
                    // Обновляем копии объектов в отфильтрованном списке
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
                    
                    // Сигнализируем Vue об изменениях в массиве
                    this.filteredLocations = [...this.filteredLocations];
                    
                    this.enrichment.current++;
                    
                    // Небольшой таймаут (1 секунда), чтобы не нагружать бесплатный шлюз API
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
            },
            // Вспомогательная функция маскирования IP
            maskIp(ip) {
                if (!ip) return 'x.x.x.x';
                const parts = ip.split('.');
                if (parts.length === 4) {
                    return `${parts[0]}.${parts[1]}.x.x`;
                }
                const p6 = ip.split(':');
                if (p6.length > 2) {
                    return `${p6[0]}:${p6[1]}:xxxx::`;
                }
                return 'masked';
            },

            // Вспомогательная функция очистки и маскирования редких запросов
            maskRequest(req) {
                if (!req) return 'Unknown';
                const parts = req.split(' ');
                if (parts.length < 2) {
                    return req.slice(0, 40) + '...';
                }
                const method = parts[0];
                let path = parts[1];
                const protocol = parts[2] || '';

                // Срезаем GET параметры
                if (path.includes('?')) {
                    path = path.split('?')[0] + '?...';
                }

                // Заменяем длинные хэши / UUID / токены (более 12 символов) на заглушку
                path = path.replace(/\/[a-fA-F0-9-]{12,}/g, '/[id]');
                // Заменяем длинные числовые идентификаторы на заглушку
                path = path.replace(/\/\d{5,}/g, '/[num]');

                let masked = `${method} ${path}`;
                if (protocol) masked += ` ${protocol}`;

                if (masked.length > 80) {
                    masked = masked.slice(0, 77) + '...';
                }
                return masked;
            },

exportCompactData() {
                if (this.filteredLocations.length === 0) return;

                // 1. Находим IP с максимальным количеством запросов (собственный IP сервера / балансировщика)
                let maxLogsCount = -1;
                let serverIp = null;

                this.filteredLocations.forEach(loc => {
                    const totalLogs = loc.logs.length;
                    if (totalLogs > maxLogsCount) {
                        maxLogsCount = totalLogs;
                        serverIp = loc.ip;
                    }
                });

                if (serverIp) {
                    console.log(`[Фильтрация] Исключен IP-адрес сервера с пиковой активностью: ${serverIp} (${maxLogsCount} запросов)`);
                }

                // Оставляем для экспорта только внешние адреса
                const filteredForExport = this.filteredLocations.filter(loc => loc.ip !== serverIp);

                // Если после очистки ничего не осталось
                if (filteredForExport.length === 0) {
                    alert("Все доступные IP были идентифицированы как служебные. Нечего экспортировать.");
                    return;
                }

                // 2. Создаем словарь уникальных сервисов строго на основе отфильтрованных данных
                const services = new Set();
                filteredForExport.forEach(loc => {
                    loc.logs.forEach(log => {
                        if (log.service) {
                            services.add(log.service);
                        }
                    });
                });
                const servicesList = Array.from(services).sort();
                const servicesMap = new Map(servicesList.map((svc, idx) => [svc, idx]));

                // 3. Вычисляем популярные запросы на основе очищенного списка
                const requestFrequencies = {};
                filteredForExport.forEach(loc => {
                    loc.logs.forEach(log => {
                        const req = log.request || '';
                        requestFrequencies[req] = (requestFrequencies[req] || 0) + 1;
                    });
                });

                // Популярными по-прежнему считаем запросы, встретившиеся 3 и более раз
                const commonRequestsList = Object.keys(requestFrequencies).filter(
                    req => requestFrequencies[req] >= 3
                );
                const commonRequestsMap = new Map(commonRequestsList.map((req, idx) => [req, idx]));

                // 4. Формируем компактную структуру локаций
                const compactLocations = filteredForExport.map(loc => {
                    // Группируем логи текущего IP
                    const logGroups = {};
                    loc.logs.forEach(log => {
                        const key = `${log.request}|${log.status}|${log.service}`;
                        if (!logGroups[key]) {
                            logGroups[key] = {
                                request: log.request,
                                status: parseInt(log.status, 10) || 0,
                                service: log.service,
                                count: 0,
                                timestamps: []
                            };
                        }
                        logGroups[key].count++;
                        if (log.timestamp) {
                            logGroups[key].timestamps.push(log.timestamp);
                        }
                    });

                    // Формируем сжатый массив логов
                    const groupedLogs = Object.values(logGroups).map(group => {
                        group.timestamps.sort((a, b) => a - b);
                        
                        const firstTs = group.timestamps[0] ? Math.round(group.timestamps[0] / 1000) : 0;
                        const lastTs = group.timestamps.length ? Math.round(group.timestamps[group.timestamps.length - 1] / 1000) : firstTs;

                        let requestRef;
                        if (commonRequestsMap.has(group.request)) {
                            requestRef = commonRequestsMap.get(group.request); // Числовая ссылка на словарь популярных запросов
                        } else {
                            requestRef = this.maskRequest(group.request); // Маскированная строка на месте
                        }

                        return {
                            r: requestRef,
                            s: group.status,
                            svc: servicesMap.get(group.service) ?? -1,
                            c: group.count,
                            f: firstTs,
                            l: lastTs
                        };
                    });

                    return {
                        ip: this.maskIp(loc.ip),
                        city: loc.city || 'Unknown',
                        country: loc.country || 'Unknown',
                        org: loc.connection?.org || 'Unknown',
                        g: groupedLogs
                    };
                });

                // Итоговая структура
                const outputData = {
                    services: servicesList,
                    common_requests: commonRequestsList,
                    locations: compactLocations
                };

                const dataStr = JSON.stringify(outputData, null, 2);
                const blob = new Blob([dataStr], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `geo-analytics-compact-llm.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            },
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
            @export="exportData" 
            @export-compact="exportCompactData"
            @reset="resetApp"
        />

        <div v-if="dataLoaded" class="flex-1 flex overflow-hidden relative">
            <SidebarList 
                :locations="displayLocations" 
                :unique-services="uniqueServices"
                :global-min-time="globalMinTime"
                :global-max-time="globalMaxTime"
                @focus-location="focusLocation"
                @filter-change="handleFilterChange"
            />

            <MapContainer 
                ref="mapComp"
                :locations="displayLocations"
                @open-history="openHistory"
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