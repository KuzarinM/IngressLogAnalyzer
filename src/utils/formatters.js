export function getStatusClass(status) {
    const s = String(status);
    if (s.startsWith('2')) return 'text-green-600 bg-green-50 border-green-200';
    if (s.startsWith('3')) return 'text-blue-600 bg-blue-50 border-blue-200';
    if (s.startsWith('4')) return 'text-orange-600 bg-orange-50 border-orange-200';
    return 'text-red-600 bg-red-50 border-red-200';
}

export function getCountBadgeClass(count) {
    if (count > 1000) return 'bg-red-100 text-red-800';
    if (count > 100) return 'bg-orange-100 text-orange-800';
    if (count > 10) return 'bg-yellow-100 text-yellow-800';
    return 'bg-green-100 text-green-800';
}

export function getFlagEmoji(cc) {
    if (!cc) return '';
    const codePoints = cc.toUpperCase().split('').map(char => 127397 + char.charCodeAt());
    return String.fromCodePoint(...codePoints);
}