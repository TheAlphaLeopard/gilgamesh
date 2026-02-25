/**
 * Squared (^2) Parser & Lexer
 * Handles indentation-based scoping and strict value typing.
 */

export class Lexer {
    constructor(input) {
        this.input = input;
        this.pos = 0;
        this.tokens = [];
        this.indentStack = [0];
    }

    tokenize() {
        const lines = this.input.split(/\r?\n/);
        
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            const lineNum = i + 1;
            
            // Handle indentation
            if (line.trim().length === 0 || line.trim().startsWith('--')) {
                continue; 
            }

            const indentMatch = line.match(/^([ \t]*)/);
            const indent = indentMatch ? indentMatch[1].replace(/\t/g, '    ').length : 0;
            line = line.trim();

            if (indent > this.indentStack[this.indentStack.length - 1]) {
                this.tokens.push({ type: 'INDENT', value: indent, line: lineNum });
                this.indentStack.push(indent);
            } else {
                while (indent < this.indentStack[this.indentStack.length - 1]) {
                    this.tokens.push({ type: 'DEDENT', line: lineNum });
                    this.indentStack.pop();
                }
            }

            this.tokenizeLine(line, lineNum);
            this.tokens.push({ type: 'NEWLINE', line: lineNum });
        }

        while (this.indentStack.length > 1) {
            this.tokens.push({ type: 'DEDENT' });
            this.indentStack.pop();
        }

        return this.tokens;
    }

    tokenizeLine(line, lineNum) {
        const regex = /--.*|!(-?\d*\.?\d+)!|"[^"]*"|#[a-zA-Z_][a-zA-Z0-9_]*#|\+=|-=|\*=|\/=|==|!=|<=|>=|[a-zA-Z_][a-zA-Z0-9_]*|\d+|[=,.\+\-\*\/\(\)\[\]\{\}\<\>\!]/g;
        let match;
        while ((match = regex.exec(line)) !== null) {
            const val = match[0];
            if (val.startsWith('--')) break;
            const base = { line: lineNum };
            if (val.startsWith('!')) {
                this.tokens.push({ ...base, type: 'NUMBER_LITERAL', value: parseFloat(val.slice(1, -1)) });
            } else if (val.startsWith('"')) {
                this.tokens.push({ ...base, type: 'STR_LITERAL', value: val.slice(1, -1) });
            } else if (val === 'True' || val === 'False') {
                this.tokens.push({ ...base, type: 'BOOL_LITERAL', value: val === 'True' });
            } else if (val.startsWith('#')) {
                this.tokens.push({ ...base, type: 'OBJ_IDENTIFIER', value: val.slice(1, -1) });
            } else if (/^[a-zA-Z_]/.test(val)) {
                this.tokens.push({ ...base, type: 'IDENTIFIER', value: val });
            } else if (/^\d+$/.test(val)) {
                this.tokens.push({ ...base, type: 'NUMBER', value: val });
            } else {
                this.tokens.push({ ...base, type: 'SYMBOL', value: val });
            }
        }
    }
}

export class Parser {
    constructor(tokens) {
        this.tokens = tokens;
        this.pos = 0;
    }

    parse() {
        const body = this.parseBlock();
        return { type: 'Program', body };
    }

    parseBlock() {
        const statements = [];
        while (this.pos < this.tokens.length && !this.check('DEDENT')) {
            if (this.match('NEWLINE')) continue;
            const stmt = this.parseStatement();
            if (stmt) statements.push(stmt);
        }
        return statements;
    }

    parseStatement() {
        const line = this.peek()?.line;
        let node = null;

        if (this.check('IDENTIFIER', 'function')) node = this.parseFunction();
        else if (this.check('IDENTIFIER', 'if')) node = this.parseIf();
        else if (this.check('IDENTIFIER', 'while')) node = this.parseWhile();
        else if (this.check('IDENTIFIER', 'for')) node = this.parseFor();
        else if (this.check('IDENTIFIER', 'return')) node = this.parseReturn();
        else if (this.check('IDENTIFIER', 'import')) node = this.parseImport();
        else if (this.check('IDENTIFIER', 'break')) { this.consume('IDENTIFIER'); this.consume('NEWLINE'); node = { type: 'BreakStatement' }; }
        else if (this.check('IDENTIFIER', 'continue')) { this.consume('IDENTIFIER'); this.consume('NEWLINE'); node = { type: 'ContinueStatement' }; }
        else if (this.check('OBJ_IDENTIFIER') || (this.check('IDENTIFIER') && this.peek(1)?.type === 'OBJ_IDENTIFIER')) {
            node = this.parseObjectDefinition();
        }
        else if (this.check('IDENTIFIER') && ['=', '+=', '-=', '*=', '/='].includes(this.peek(1)?.value)) {
            node = this.parseAssignment();
        } else {
            const expr = this.parseExpression();
            this.consume('NEWLINE');
            node = { type: 'ExpressionStatement', expression: expr };
        }

        if (node) node.line = line;
        return node;
    }

    parseFor() {
        this.consume('IDENTIFIER', 'for');
        const iterator = this.consume('IDENTIFIER').value;
        this.consume('SYMBOL', '=');
        const start = this.parseExpression();
        this.consume('IDENTIFIER', 'to');
        const end = this.parseExpression();
        this.consume('NEWLINE');
        this.consume('INDENT');
        const body = this.parseBlock();
        this.consume('DEDENT');
        return { type: 'ForStatement', iterator, start, end, body };
    }

    parseImport() {
        this.consume('IDENTIFIER', 'import');
        let moduleName = "";
        // Collect everything until NEWLINE to support dots and extensions in filenames
        while (this.pos < this.tokens.length && !this.check('NEWLINE')) {
            moduleName += this.consumeAny().value;
        }
        if (this.pos < this.tokens.length) this.consume('NEWLINE');
        return { type: 'ImportStatement', moduleName };
    }

    parseObjectDefinition() {
        let name;
        let parent = null;
        
        if (this.check('IDENTIFIER')) {
            name = this.consume('IDENTIFIER').value;
            parent = this.consume('OBJ_IDENTIFIER').value;
        } else {
            name = this.consume('OBJ_IDENTIFIER').value;
        }

        const op = this.consume('SYMBOL').value; // =
        this.consume('SYMBOL', '[');
        this.consume('NEWLINE');
        this.consume('INDENT');
        const properties = this.parseBlock();
        this.consume('DEDENT');
        this.consume('SYMBOL', ']');
        this.consume('NEWLINE');

        return { type: 'ObjectDefinition', name, parent, properties, operator: op };
    }

    parseAssignment() {
        const name = this.consume('IDENTIFIER').value;
        const op = this.consume('SYMBOL').value;
        const value = this.parseExpression();
        this.consume('NEWLINE');
        return { type: 'Assignment', name, operator: op, value };
    }

    parseFunction() {
        this.consume('IDENTIFIER', 'function');
        const name = this.consume('IDENTIFIER').value;
        this.consume('SYMBOL', '(');
        const params = [];
        if (!this.check('SYMBOL', ')')) {
            do { params.push(this.consume('IDENTIFIER').value); } while (this.match('SYMBOL', ','));
        }
        this.consume('SYMBOL', ')');
        this.consume('NEWLINE');
        this.consume('INDENT');
        const body = this.parseBlock();
        this.consume('DEDENT');
        return { type: 'FunctionDeclaration', name, params, body };
    }

    parseIf() {
        this.consume('IDENTIFIER', 'if');
        const test = this.parseExpression();
        this.consume('NEWLINE');
        this.consume('INDENT');
        const consequent = this.parseBlock();
        this.consume('DEDENT');
        
        const elifs = [];
        while (this.match('IDENTIFIER', 'elif')) {
            const elifTest = this.parseExpression();
            this.consume('NEWLINE');
            this.consume('INDENT');
            const elifBody = this.parseBlock();
            this.consume('DEDENT');
            elifs.push({ test: elifTest, body: elifBody });
        }

        let alternate = null;
        if (this.match('IDENTIFIER', 'else')) {
            this.consume('NEWLINE');
            this.consume('INDENT');
            alternate = this.parseBlock();
            this.consume('DEDENT');
        }
        return { type: 'IfStatement', test, consequent, elifs, alternate };
    }

    parseWhile() {
        this.consume('IDENTIFIER', 'while');
        const test = this.parseExpression();
        this.consume('NEWLINE');
        this.consume('INDENT');
        const body = this.parseBlock();
        this.consume('DEDENT');
        return { type: 'WhileStatement', test, body };
    }

    parseReturn() {
        this.consume('IDENTIFIER', 'return');
        this.consume('SYMBOL', '=');
        const value = this.parseExpression();
        this.consume('NEWLINE');
        return { type: 'ReturnStatement', value };
    }

    parseExpression() {
        return this.parseLogicalOr();
    }

    parseLogicalOr() {
        let left = this.parseLogicalAnd();
        while (this.check('IDENTIFIER', 'or')) {
            const op = this.consume('IDENTIFIER').value;
            const right = this.parseLogicalAnd();
            left = { type: 'BinaryExpression', left, operator: op, right };
        }
        return left;
    }

    parseLogicalAnd() {
        let left = this.parseComparison();
        while (this.check('IDENTIFIER', 'and')) {
            const op = this.consume('IDENTIFIER').value;
            const right = this.parseComparison();
            left = { type: 'BinaryExpression', left, operator: op, right };
        }
        return left;
    }

    parseComparison() {
        let left = this.parseAdditive();
        const ops = ['==', '!=', '<', '>', '<=', '>='];
        while (this.check('SYMBOL') && ops.includes(this.peek().value)) {
            const op = this.consume('SYMBOL').value;
            const right = this.parseAdditive();
            left = { type: 'BinaryExpression', left, operator: op, right };
        }
        return left;
    }

    parseAdditive() {
        let left = this.parseMultiplicative();
        while (this.check('SYMBOL', '+') || this.check('SYMBOL', '-')) {
            const op = this.consume('SYMBOL').value;
            const right = this.parseMultiplicative();
            left = { type: 'BinaryExpression', left, operator: op, right };
        }
        return left;
    }

    parseMultiplicative() {
        let left = this.parsePrimary();
        while (this.check('SYMBOL', '*') || this.check('SYMBOL', '/')) {
            const op = this.consume('SYMBOL').value;
            const right = this.parsePrimary();
            left = { type: 'BinaryExpression', left, operator: op, right };
        }
        return left;
    }

    parsePrimary() {
        if (this.match('SYMBOL', '(')) {
            const expr = this.parseExpression();
            this.consume('SYMBOL', ')');
            return expr;
        }
        if (this.match('SYMBOL', '[')) {
            const elements = [];
            if (!this.check('SYMBOL', ']')) {
                do { elements.push(this.parseExpression()); } while (this.match('SYMBOL', ','));
            }
            this.consume('SYMBOL', ']');
            return { type: 'ArrayLiteral', elements };
        }
        if (this.check('NUMBER_LITERAL')) return { type: 'Literal', value: this.consume('NUMBER_LITERAL').value };
        if (this.check('NUMBER')) return { type: 'Literal', value: parseFloat(this.consume('NUMBER').value) };
        if (this.check('STR_LITERAL')) return { type: 'Literal', value: this.consume('STR_LITERAL').value };
        if (this.check('BOOL_LITERAL')) return { type: 'Literal', value: this.consume('BOOL_LITERAL').value };
        
        if (this.check('IDENTIFIER')) {
            const idToken = this.consume('IDENTIFIER');
            const id = idToken.value;
            if (id === 'eval') {
                this.consume('SYMBOL', '(');
                const arg = this.parseExpression();
                this.consume('SYMBOL', ')');
                return { type: 'EvalCall', argument: arg };
            }
            let expr = { type: 'Identifier', value: id };
            return this.parseSuffix(expr);
        }
        if (this.check('OBJ_IDENTIFIER')) {
            let expr = { type: 'Identifier', value: this.consume('OBJ_IDENTIFIER').value };
            return this.parseSuffix(expr);
        }
        
        throw new Error(`Unexpected token at position ${this.pos}: ${JSON.stringify(this.tokens[this.pos])}`);
    }

    parseSuffix(expr) {
        while (true) {
            if (this.match('SYMBOL', '.')) {
                const propToken = this.consumeAny();
                const prop = propToken.value;
                expr = { type: 'MemberExpression', object: expr, property: prop };
            } else if (this.match('SYMBOL', '(')) {
                const args = [];
                if (!this.check('SYMBOL', ')')) {
                    do { args.push(this.parseExpression()); } while (this.match('SYMBOL', ','));
                }
                this.consume('SYMBOL', ')');
                expr = { type: 'CallExpression', callee: expr, arguments: args };
            } else break;
        }
        return expr;
    }

    peek(n = 0) { return this.tokens[this.pos + n]; }
    check(type, value) {
        const t = this.peek();
        return t && t.type === type && (!value || t.value === value);
    }
    match(type, value) {
        if (this.check(type, value)) { this.pos++; return true; }
        return false;
    }
    consume(type, value) {
        if (this.check(type, value)) return this.tokens[this.pos++];
        throw new Error(`Expected ${type} ${value || ''} but found ${JSON.stringify(this.peek())}`);
    }
    consumeAny() { return this.tokens[this.pos++]; }
}