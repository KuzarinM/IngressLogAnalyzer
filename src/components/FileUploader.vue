<script>
    // Vite позволяет импортировать воркеры с суффиксом ?worker
    import ParserWorker from '../workers/parser.worker.js?worker'; 
    
    export default {
        name: 'FileUploader',
        data() {
            return {
                error: null,
                isProcessing: false // Флаг для отображения загрузки
            }
        },
        emits: ['data-loaded'],
        methods: {
            handleFileUpload(event) {
                const file = event.target.files[0];
                if (!file) return;
    
                this.error = null;
                this.isProcessing = true; // Включаем спиннер
    
                const reader = new FileReader();
                
                reader.onload = (e) => {
                    const content = e.target.result;
                    const filename = file.name;
    
                    // Если это JSON, парсим в основном потоке (это быстро)
                    if (content.trim().startsWith('[') || filename.endsWith('.json')) {
                        try {
                            const json = JSON.parse(content);
                            if(!Array.isArray(json)) throw new Error("JSON должен быть массивом");
                            this.$emit('data-loaded', json);
                        } catch (err) {
                            this.error = "Ошибка чтения JSON: " + err.message;
                        } finally {
                            this.isProcessing = false;
                        }
                        return;
                    }
    
                    // Если это логи - запускаем Воркер
                    this.runWorker(content);
                };
    
                reader.readAsText(file);
            },
    
            runWorker(content) {
                // Инициализация воркера
                const worker = new ParserWorker();
    
                // Отправляем текст логов
                worker.postMessage(content);
    
                // Получаем результат
                worker.onmessage = (e) => {
                    const { success, data, error } = e.data;
                    
                    if (success) {
                        this.$emit('data-loaded', data);
                    } else {
                        this.error = "Ошибка парсинга: " + error;
                    }
                    
                    this.isProcessing = false;
                    worker.terminate(); // Убиваем воркер после работы
                };
    
                // Обработка системных ошибок воркера
                worker.onerror = (e) => {
                    this.error = "Критическая ошибка Worker: " + e.message;
                    this.isProcessing = false;
                    worker.terminate();
                };
            }
        }
    }
    </script>
    
    <template>
        <div class="flex-1 flex flex-col justify-center items-center p-10 text-center bg-slate-50 relative">
            
            <!-- Оверлей загрузки -->
            <div v-if="isProcessing" class="absolute inset-0 bg-white/80 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
                <div class="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-600 mb-4"></div>
                <h3 class="text-xl font-bold text-gray-700 animate-pulse">Обработка данных...</h3>
                <p class="text-sm text-gray-500 mt-2">Пожалуйста, подождите, это может занять время для больших файлов.</p>
            </div>
    
            <label class="bg-white p-12 rounded-xl shadow-xl max-w-lg border-2 border-dashed border-blue-300 hover:border-blue-500 cursor-pointer transition-colors group">
                <input type="file" @change="handleFileUpload" class="hidden" :disabled="isProcessing" />
                <div class="text-6xl mb-6 group-hover:scale-110 transition-transform">📂</div>
                <h3 class="text-xl font-bold text-gray-900">Загрузите файл</h3>
                <p class="mt-2 text-sm text-gray-500">Поддерживаются:</p>
                <ul class="text-xs text-gray-400 mt-2 space-y-1">
                    <li>1. Текстовые логи (Nginx, K8s, Apache)</li>
                    <li>2. JSON отчеты, выгруженные из этой системы</li>
                </ul>
                <div class="mt-6 bg-blue-50 text-blue-700 py-2 px-4 rounded font-semibold text-sm">
                    {{ isProcessing ? 'Загрузка...' : 'Нажмите для выбора файла' }}
                </div>
            </label>
            
            <div v-if="error" class="mt-6 text-red-500 text-sm font-bold bg-red-50 p-3 rounded border border-red-100 max-w-lg animate-fade-in">
                ⚠️ {{ error }}
            </div>
        </div>
    </template>