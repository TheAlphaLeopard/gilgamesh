export function highlight(code) {
    // Escape HTML special characters to prevent injection and rendering issues
    const escaped = code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Syntax Highlighting Patterns
    // 1. Comments: # ...
    // 2. Keywords: var, if, else, while, for, func, return, break, continue
    // 3. Types & Built-ins: int, str, bool, fstr, fint, obj, prop, val, print, random, eval, a, f, fobj, e0..eN
    // 4. Numbers: 0-9
    // 5. Punctuation: [ ] { } ( ) . , = + - * / < > !

    // Note: We construct a single master regex with capturing groups for each token type.
    // The order is important: Comments first!
    
    const patterns = [
        /(#.*)/,                                                                                    // Group 1: Comment
        /\b(var|func|return|if|else|while|for|break|continue)\b/,                                  // Group 2: Keyword
        /\b(int|str|bool|fstr|fint|obj|prop|val|print|random|eval|a|f|fobj|e\d+)\b/,               // Group 3: Type
        /(\b\d+\b)/,                                                                               // Group 4: Number
        /([[\]{}()=.,+\-*/<>!])/,                                                                  // Group 5: Punctuation
        /(".*?")/                                                                                  // Group 6: Strings (generic, though ^2 uses str[])
    ];

    const masterRegex = new RegExp(patterns.map(r => r.source).join('|'), 'g');

    return escaped.replace(masterRegex, (match, comment, keyword, type, number, punct, string) => {
        if (comment) return `<span class="token-comment">${comment}</span>`;
        if (keyword) return `<span class="token-keyword">${keyword}</span>`;
        if (type) return `<span class="token-type">${type}</span>`;
        if (number) return `<span class="token-number">${number}</span>`;
        if (punct) return `<span class="token-punctuation">${punct}</span>`;
        if (string) return `<span class="token-string">${string}</span>`;
        return match;
    });
}