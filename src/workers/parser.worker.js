self.onmessage = (e) => {
    const text = e.data;

    const months = {
        'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
        'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
    };

    try {
        const lines = text.split('\n');
        const ipMap = new Map();

        // ДЕБАГ: Смотрим первые строки
        console.log("--- DEBUG PARSER ---");
        if (lines.length > 0) console.log("Line 1:", lines[0]);

        // 1. Ищем IP (4 числа через точку)
        const ipRegex = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/;
        
        // 2. Ищем ДАТУ в формате 01/Dec/2025:05:59:03 +0000
        // Она может быть в скобках [ ] или без них
        const dateRegex = /(\d{2}\/[A-Za-z]{3}\/\d{4}:\d{2}:\d{2}:\d{2}\s\+\d{4})/;

        // 3. Ищем статус (3 цифры с пробелами вокруг)
        const statusRegex = /\s(\d{3})\s/;
        
        // 4. Ищем сервис [service-name]
        const serviceRegex = /\[([a-zA-Z0-9-_.]+-[a-zA-Z0-9]+)\]/;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line || line.trim() === '') continue;

            const ipMatch = line.match(ipRegex);
            if (!ipMatch) continue;
            
            const ip = ipMatch[1];
            if (ip.startsWith('10.') || ip.startsWith('127.') || ip.startsWith('192.168')) continue;

            // --- ПАРСИНГ ДАТЫ ---
            const dateMatch = line.match(dateRegex);
            let timestamp = 0;
            let timeStr = '';

            if (dateMatch) {
                timeStr = dateMatch[1]; // "01/Dec/2025:05:59:03 +0000"
                try {
                    // Разбиваем строку по разделителям: / : и пробел
                    // "01/Dec/2025:05:59:03 +0000" -> ["01", "Dec", "2025", "05", "59", "03", "+0000"]
                    const parts = timeStr.split(/[\/:\s]/);
                    
                    if (parts.length >= 6) {
                        const day = parseInt(parts[0], 10);
                        const monthStr = parts[1];
                        const year = parseInt(parts[2], 10);
                        const hour = parseInt(parts[3], 10);
                        const minute = parseInt(parts[4], 10);
                        const second = parseInt(parts[5], 10);

                        if (months.hasOwnProperty(monthStr)) {
                            // Используем Date.UTC, так как в логе +0000
                            timestamp = Date.UTC(year, months[monthStr], day, hour, minute, second);
                        }
                    }
                } catch (e) {
                    console.error("Date error:", e);
                }
            }

            // Если дата не нашлась, timestamp = 0.
            // App.vue теперь умеет с этим работать и не будет скрывать такие логи.

            const statusMatch = line.match(statusRegex);
            const status = statusMatch ? statusMatch[1] : '000';

            const svcMatch = line.match(serviceRegex);
            const service = svcMatch ? svcMatch[1] : 'Unknown';

            let request = 'Unknown';
            const reqMatch = line.match(/"(.*?)"/);
            if (reqMatch) request = reqMatch[1];

            if (!ipMap.has(ip)) {
                ipMap.set(ip, { 
                    ip, logs: [], city: null, country: null, latitude: null, longitude: null, 
                    flag: null, connection: null 
                });
            }
            
            ipMap.get(ip).logs.push({ 
                time: timeStr, 
                timestamp: timestamp, 
                request, status, service 
            });
        }

        const result = Array.from(ipMap.values());
        console.log(`Parsed ${result.length} IPs. Sample timestamp:`, result[0]?.logs[0]?.timestamp);
        
        self.postMessage({ success: true, data: result });

    } catch (err) {
        console.error("Worker Error:", err);
        self.postMessage({ success: false, error: err.message });
    }
};