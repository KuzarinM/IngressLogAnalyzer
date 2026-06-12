<script>
    export default {
        name: 'TimelinePlayer',
        props: {
            minTime: Number,   // Начало диапазона (от фильтра)
            maxTime: Number,   // Конец диапазона (от фильтра)
            modelValue: Number // Текущее время (v-model)
        },
        emits: ['update:modelValue', 'play-state-change'],
        data() {
            return {
                isPlaying: false,
                speed: 1000, // Множитель скорости (1 сек реальная = 1000 сек логов)
                animationFrame: null,
                lastFrameTime: 0,
                speeds: [
                    { label: 'x100', val: 100 },
                    { label: 'x500', val: 500 },
                    { label: 'x1k', val: 1000 },
                    { label: 'x5k', val: 5000 },
                    { label: 'x10k', val: 10000 },
                    { label: 'MAX', val: 100000 }
                ]
            }
        },
        computed: {
            progress() {
                if (!this.minTime || !this.maxTime) return 0;
                const total = this.maxTime - this.minTime;
                const current = this.modelValue - this.minTime;
                return Math.min(100, Math.max(0, (current / total) * 100));
            },
            formattedCurrentTime() {
                if (!this.modelValue) return '--:--';
                return new Date(this.modelValue).toLocaleString();
            }
        },
        watch: {
            // Если изменились границы фильтра, останавливаем проигрывание
            minTime() { this.stop(); },
            maxTime() { this.stop(); }
        },
        beforeUnmount() {
            this.stop();
        },
        methods: {
            togglePlay() {
                this.isPlaying = !this.isPlaying;
                if (this.isPlaying) {
                    // Если мы в самом конце, начинаем сначала
                    if (this.modelValue >= this.maxTime) {
                        this.$emit('update:modelValue', this.minTime);
                    }
                    this.lastFrameTime = performance.now();
                    this.loop();
                } else {
                    cancelAnimationFrame(this.animationFrame);
                }
            },
            stop() {
                this.isPlaying = false;
                cancelAnimationFrame(this.animationFrame);
            },
            loop(timestamp) {
                if (!this.isPlaying) return;
    
                const now = timestamp || performance.now();
                const deltaTime = now - this.lastFrameTime;
                this.lastFrameTime = now;
    
                // Вычисляем, сколько времени прошло в "мире логов"
                // deltaTime (мс) * speed
                const logDelta = deltaTime * this.speed;
    
                let nextTime = this.modelValue + logDelta;
    
                if (nextTime >= this.maxTime) {
                    nextTime = this.maxTime;
                    this.isPlaying = false; // Стоп в конце
                }
    
                this.$emit('update:modelValue', nextTime);
    
                if (this.isPlaying) {
                    this.animationFrame = requestAnimationFrame(this.loop);
                }
            },
            onSliderChange(e) {
                const val = parseFloat(e.target.value);
                this.$emit('update:modelValue', val);
            }
        }
    }
    </script>
    
    <template>
        <div class="bg-white border-t border-gray-200 p-2 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] flex flex-col gap-2 z-30 shrink-0">
            
            <!-- Верхняя часть: Контролы -->
            <div class="flex items-center justify-between gap-4">
                
                <div class="flex items-center gap-3">
                    <!-- Кнопка Play/Pause -->
                    <button @click="togglePlay" class="w-10 h-10 flex items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 transition shadow-md group">
                        <svg v-if="!isPlaying" class="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                        <svg v-else class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                    </button>
    
                    <!-- Время -->
                    <div class="font-mono text-sm font-bold text-gray-700 w-40">
                        {{ formattedCurrentTime }}
                    </div>
                </div>
    
                <!-- Выбор скорости -->
                <div class="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                    <button 
                        v-for="s in speeds" 
                        :key="s.val"
                        @click="speed = s.val"
                        class="px-2 py-1 text-[10px] rounded font-bold transition-colors"
                        :class="speed === s.val ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'"
                    >
                        {{ s.label }}
                    </button>
                </div>
            </div>
    
            <!-- Слайдер -->
            <div class="relative w-full h-6 flex items-center group">
                <!-- Фоновая линия -->
                <div class="absolute w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div class="h-full bg-blue-500 transition-all duration-75 ease-linear" :style="{ width: progress + '%' }"></div>
                </div>
                
                <!-- Нативный input range (прозрачный, но кликабельный) -->
                <input 
                    type="range" 
                    :min="minTime" 
                    :max="maxTime" 
                    :value="modelValue" 
                    @input="onSliderChange"
                    class="absolute w-full h-full opacity-0 cursor-pointer z-10"
                >
                
                <!-- Ползунок (кастомный) -->
                <div 
                    class="absolute h-4 w-4 bg-white border-2 border-blue-600 rounded-full shadow transition-all duration-75 ease-linear pointer-events-none z-0 group-hover:scale-125"
                    :style="{ left: `calc(${progress}% - 8px)` }"
                ></div>
            </div>
        </div>
    </template>