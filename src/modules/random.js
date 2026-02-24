/**
 * Squared (^2) Random Module
 * A single-function export for range selection or array picking.
 */

/**
 * Squared (^2) Random Module
 * Supports range selection random(!1!, !10!) or array picking random(fruits).
 */

export default function random(a, b) {
    // Array picking: random(fruits)
    if (Array.isArray(a) && b === undefined) {
        if (a.length === 0) return null;
        return a[Math.floor(Math.random() * a.length)];
    }
    
    // If range is provided (even if they are array elements)
    const min = Number(a);
    const max = Number(b);
    
    // If both are numbers, return random in range
    if (!isNaN(min) && !isNaN(max)) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    
    // Fallback: if two values are provided but aren't numbers, pick one of the two
    if (b !== undefined) {
        return Math.random() > 0.5 ? a : b;
    }
    
    return a;
}