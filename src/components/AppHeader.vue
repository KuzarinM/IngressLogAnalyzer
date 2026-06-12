<script>
    export default {
        name: 'AppHeader',
        props: {
            dataLoaded: Boolean,
            enrichment: Object,
            currentView: String // <-- ДОБАВЛЯЕМ PROP
        },
        emits: ['export', 'export-compact', 'reset', 'change-view'] // <-- ДОБАВЛЯЕМ EMIT
    }
</script>

<template>
    <header class="bg-white shadow-md p-3 z-20 shrink-0">
        <div class="flex justify-between items-center h-10">
            <h1 class="text-lg font-bold text-blue-600 flex items-center gap-4 shrink-0">
                🚀 Log Analytics Pro
                
                <!-- ПЕРЕКЛЮЧАТЕЛЬ ВИДОВ -->
                <div v-if="dataLoaded" class="flex bg-gray-100 p-1 rounded-lg">
                    <button 
                        @click="$emit('change-view', 'map')" 
                        :class="currentView === 'map' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'" 
                        class="px-3 py-1 text-xs font-bold rounded transition">
                        🗺️ Карта
                    </button>
                    <button 
                        @click="$emit('change-view', 'dashboard')" 
                        :class="currentView === 'dashboard' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'" 
                        class="px-3 py-1 text-xs font-bold rounded transition">
                        📊 Дашборд
                    </button>
                </div>
            </h1>
            
            <div class="flex items-center gap-3">
                <button v-if="dataLoaded" @click="$emit('export')" class="flex items-center gap-1 text-xs font-bold bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded hover:bg-green-100 transition">
                    <span>💾</span> Скачать оригинал (JSON)
                </button>

                <!-- Новая кнопка экспорта для нейросетей -->
                <button v-if="dataLoaded" @click="$emit('export-compact')" class="flex items-center gap-1 text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded hover:bg-blue-100 transition" title="Сжать и анонимизировать данные для отправки в ChatGPT/Claude">
                    <span>🤖</span> Экспорт для LLM (Compact)
                </button>
                                
                <button v-if="dataLoaded" @click="$emit('reset')" class="text-xs text-red-500 border border-red-200 px-3 py-1.5 rounded hover:bg-red-50">
                    Сброс
                </button>
            </div>
        </div>
        <!-- Прогресс бар обогащения геоданных -->
        <div v-if="enrichment.active" class="mt-2 text-xs">
            <div class="flex justify-between mb-1">
                <span class="font-medium text-blue-600">Обогащение данных: {{ enrichment.current }} / {{ enrichment.total }}</span>
                <span class="text-orange-500 font-bold" v-if="enrichment.rateLimited">⏳ API Limit (Ждем...)</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                <div class="bg-blue-500 h-1.5 transition-all duration-300" :style="{ width: (enrichment.current / enrichment.total * 100) + '%' }"></div>
            </div>
        </div>
    </header>
</template>