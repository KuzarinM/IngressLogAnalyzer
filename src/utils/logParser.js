// src/utils/logParser.js

// ВАЖНО: слово export обязательно!
export function parseLogs(text) {
    const lines = text.split('\n');
    const ipMap = new Map();
    // Регулярка для Nginx/K8s Ingress
    const mainRegex = /^(\d{1,3}(?:\.\d{1,3}){3})\s.*?\[(.*?)\]\s+"(.*?)"\s+(\d{3})/;
    const serviceRegex = /\[([a-zA-Z0-9-_.]+-[a-zA-Z0-9]+)\]/; 

    lines.forEach(line => {
        const match = line.match(mainRegex);
        if (match) {
            const [_, ip, time, request, status] = match;
            if (ip.startsWith('10.') || ip.startsWith('127.') || ip.startsWith('192.168')) return;

            const restOfLine = line.substring(line.indexOf(status) + 3);
            const svcMatch = restOfLine.match(serviceRegex);
            const service = svcMatch ? svcMatch[1] : 'Unknown';

            if (!ipMap.has(ip)) {
                ipMap.set(ip, { 
                    ip, 
                    logs: [], 
                    city: null, 
                    country: null, 
                    latitude: null, 
                    longitude: null,
                    flag: null,
                    connection: null 
                });
            }
            ipMap.get(ip).logs.push({ time, request, status, service });
        }
    });

    if (ipMap.size === 0) {
        throw new Error("IP адреса не найдены. Проверьте формат логов.");
    }

    return Array.from(ipMap.values());
}