export class Lexer {
    constructor(input) {
        this.input = input;
        this.pos = 0;
        this.tokens = [];
        this.currentIndent = 0;
    }

    tokenize() {
        while (this.pos < this.input.length) {
            let char = this.input[this.pos];

            if (char === '\n') {
                this.tokens.push({ type: 'NEWLINE', line: this.getLine() });
                this.pos++;
                this.handleIndentation();
                continue;
            }

            if (/\s/.test(char)) {
                this.pos++;
                continue;
            }

            if (char === '#') {
                this.skipComment();
                continue;
            }

            if (['=', ',', '.', '+', '-', '*', '/', '(', ')', '{', '}', '<', '>', '!'].includes(char)) {
                const next = this.input[this.pos + 1];
                if (char === '=' && next === '=') { this.tokens.push({type:'SYMBOL', value:'=='}); this.pos+=2; continue; }
                if (char === '!' && next === '=') { this.tokens.push({type:'SYMBOL', value:'!='}); this.pos+=2; continue; }
                if (char === '<' && next === '=') { this.tokens.push({type:'SYMBOL', value:'<='}); this.pos+=2; continue; }
                if (char === '>' && next === '=') { this.tokens.push({type:'SYMBOL', value:'>='}); this.pos+=2; continue; }

                this.tokens.push({ type: 'SYMBOL', value: char });
                this.pos++;
                continue;
            }

            if (char === '[') {
                this.tokens.push({ type: 'LBRACKET', value: '[' });
                this.pos++;
                continue;
            }
            if (char === ']') {
                this.tokens.push({ type: 'RBRACKET', value: ']' });
                this.pos++;
                continue;
            }

            if (/[a-zA-Z_]/.test(char)) {
                let ident = this.readIdentifier();
                this.tokens.push({ type: 'IDENTIFIER', value: ident });
                continue;
            }

            if (/[0-9]/.test(char)) {
                let num = this.readNumber();
                this.tokens.push({ type: 'NUMBER', value: num });
                continue;
            }

            console.warn(`Unknown character: ${char} at ${this.pos}`);
            this.pos++;
        }

        while (this.currentIndent > 0) {
            this.tokens.push({ type: 'DEDENT' });
            this.currentIndent -= 4;
        }

        return this.tokens;
    }

    handleIndentation() {
        let spaces = 0;
        while (this.pos < this.input.length && this.input[this.pos] !== '\n') {
            if (this.input[this.pos] === ' ') spaces++;
            else if (this.input[this.pos] === '\t') spaces += 4;
            else break;
            this.pos++;
        }
        if (this.pos >= this.input.length || this.input[this.pos] === '\n' || this.input[this.pos] === '#') {
            return;
        }
        if (spaces > this.currentIndent) {
            this.tokens.push({ type: 'INDENT', count: spaces - this.currentIndent });
            this.currentIndent = spaces;
        } else if (spaces < this.currentIndent) {
            while (spaces < this.currentIndent) {
                this.tokens.push({ type: 'DEDENT' });
                this.currentIndent -= 4;
                if(this.currentIndent < 0) this.currentIndent = 0;
            }
            this.currentIndent = spaces;
        }
    }

    skipComment() {
        while (this.pos < this.input.length && this.input[this.pos] !== '\n') {
            this.pos++;
        }
    }

    readIdentifier() {
        let res = '';
        while (this.pos < this.input.length && /[a-zA-Z0-9_]/.test(this.input[this.pos])) {
            res += this.input[this.pos];
            this.pos++;
        }
        return res;
    }

    readNumber() {
        let res = '';
        while (this.pos < this.input.length && /[0-9.]/.test(this.input[this.pos])) {
            res += this.input[this.pos];
            this.pos++;
        }
        return res;
    }

    getLine() {
        return this.input.substring(0, this.pos).split('\n').length;
    }
}

export class Parser {
    constructor(tokens) {
        this.tokens = tokens;
        this.pos = 0;
    }

    parse() {
        const statements = [];
        while (this.pos < this.tokens.length) {
            if (this.match('NEWLINE')) continue;
            if (this.match('DEDENT')) continue;

            const stmt = this.parseStatement();
            if (stmt) statements.push(stmt);
            else break;
        }
        return { type: 'Program', body: statements };
    }

    parseStatement() {
        if (this.check('IDENTIFIER', 'var')) return this.parseVarDeclaration();
        if (this.check('IDENTIFIER', 'func')) return this.parseFunctionDeclaration();
        if (this.check('IDENTIFIER', 'return')) return this.parseReturnStatement();
        if (this.check('IDENTIFIER', 'if')) return this.parseIfStatement();
        if (this.check('IDENTIFIER', 'while')) return this.parseWhileStatement();
        if (this.check('IDENTIFIER', 'for')) return this.parseForStatement();
        if (this.check('IDENTIFIER', 'break')) return this.parseBreakStatement();
        if (this.check('IDENTIFIER', 'continue')) return this.parseContinueStatement();
        
        if (this.check('IDENTIFIER') && this.tokens[this.pos + 1]?.value === '=') {
             return this.parseAssignmentStatement();
        }

        const expr = this.parseExpression();
        this.match('NEWLINE'); 
        return { type: 'ExpressionStatement', expression: expr };
    }

    parseVarDeclaration(consumeNewline = true) {
        this.consume('IDENTIFIER', 'var');
        this.consume('LBRACKET');
        const name = this.consume('IDENTIFIER').value;
        this.consume('RBRACKET');
        this.consume('SYMBOL', '=');
        const value = this.parseExpression();
        if (consumeNewline) this.match('NEWLINE');
        return { type: 'VarDeclaration', name, value };
    }

    parseAssignmentStatement(consumeNewline = true) {
        const name = this.consume('IDENTIFIER').value;
        this.consume('SYMBOL', '=');
        const value = this.parseExpression();
        if (consumeNewline) this.match('NEWLINE');
        return { type: 'AssignmentStatement', name, value };
    }

    parseIfStatement() {
        this.consume('IDENTIFIER', 'if');
        this.consume('LBRACKET');
        const test = this.parseExpression();
        this.consume('RBRACKET');
        this.consume('NEWLINE');
        const consequent = this.parseBlock();
        let alternate = null;
        if (this.check('IDENTIFIER', 'else')) {
            this.consume('IDENTIFIER', 'else');
            this.consume('NEWLINE');
            alternate = this.parseBlock();
        }
        return { type: 'IfStatement', test, consequent, alternate };
    }

    parseWhileStatement() {
        this.consume('IDENTIFIER', 'while');
        this.consume('LBRACKET');
        const test = this.parseExpression();
        this.consume('RBRACKET');
        this.consume('NEWLINE');
        const body = this.parseBlock();
        return { type: 'WhileStatement', test, body };
    }

    parseForStatement() {
        this.consume('IDENTIFIER', 'for');
        this.consume('LBRACKET');
        
        let init = null;
        if (this.check('IDENTIFIER', 'var')) init = this.parseVarDeclaration(false);
        else if (this.check('IDENTIFIER') && this.tokens[this.pos+1]?.value === '=') init = this.parseAssignmentStatement(false);
        else init = { type: 'ExpressionStatement', expression: this.parseExpression() };

        this.consume('SYMBOL', ',');
        const test = this.parseExpression();
        this.consume('SYMBOL', ',');
        
        let update = null;
        if (this.check('IDENTIFIER', 'var')) update = this.parseVarDeclaration(false);
        else if (this.check('IDENTIFIER') && this.tokens[this.pos+1]?.value === '=') update = this.parseAssignmentStatement(false);
        else update = { type: 'ExpressionStatement', expression: this.parseExpression() };

        this.consume('RBRACKET');
        this.consume('NEWLINE');
        const body = this.parseBlock();
        return { type: 'ForStatement', init, test, update, body };
    }

    parseBlock() {
        this.consume('INDENT');
        const body = [];
        while (!this.check('DEDENT') && this.pos < this.tokens.length) {
            if (this.match('NEWLINE')) continue;
            body.push(this.parseStatement());
        }
        this.consume('DEDENT');
        return body;
    }

    parseFunctionDeclaration() {
        this.consume('IDENTIFIER', 'func');
        this.consume('LBRACKET');
        const name = this.consume('IDENTIFIER').value;
        this.consume('SYMBOL', '(');
        const params = [];
        if (!this.check('SYMBOL', ')')) {
            do {
                params.push(this.consume('IDENTIFIER').value);
            } while (this.match('SYMBOL', ','));
        }
        this.consume('SYMBOL', ')');
        this.consume('RBRACKET');
        
        this.consume('NEWLINE');
        const body = this.parseBlock();
        
        return { type: 'FunctionDeclaration', name, params, body };
    }

    parseReturnStatement() {
        this.consume('IDENTIFIER', 'return');
        const value = this.parseExpression();
        this.match('NEWLINE');
        return { type: 'ReturnStatement', value };
    }

    parseBreakStatement() {
        this.consume('IDENTIFIER', 'break');
        this.match('NEWLINE');
        return { type: 'BreakStatement' };
    }

    parseContinueStatement() {
        this.consume('IDENTIFIER', 'continue');
        this.match('NEWLINE');
        return { type: 'ContinueStatement' };
    }

    parseExpression() {
        return this.parseComparisonExpression();
    }

    parseComparisonExpression() {
        let left = this.parseAdditiveExpression();
        while (this.check('SYMBOL', '==') || this.check('SYMBOL', '!=') || 
               this.check('SYMBOL', '<') || this.check('SYMBOL', '>') || 
               this.check('SYMBOL', '<=') || this.check('SYMBOL', '>=')) {
            const op = this.consume('SYMBOL').value;
            const right = this.parseAdditiveExpression();
            left = { type: 'BinaryExpression', left, operator: op, right };
        }
        return left;
    }

    parseAdditiveExpression() {
        let left = this.parseCallMemberPrimary();
        while (this.check('SYMBOL', '+') || this.check('SYMBOL', '-') || 
               this.check('SYMBOL', '*') || this.check('SYMBOL', '/')) {
            const op = this.consume('SYMBOL').value;
            const right = this.parseCallMemberPrimary();
            left = { type: 'BinaryExpression', left, operator: op, right };
        }
        return left;
    }

    parseCallMemberPrimary() {
        let expr = this.parsePrimary();

        while (true) {
            if (this.match('SYMBOL', '.')) {
                let prop;
                if (this.check('IDENTIFIER')) {
                    prop = this.consume('IDENTIFIER').value;
                } else if (this.check('NUMBER')) {
                    prop = this.consume('NUMBER').value;
                } else {
                    throw new Error('Expected identifier or number after dot');
                }
                expr = { type: 'MemberExpression', object: expr, property: prop };
            } else if (this.match('SYMBOL', '(')) {
                const args = [];
                if (!this.check('SYMBOL', ')')) {
                    do {
                        args.push(this.parseExpression());
                    } while (this.match('SYMBOL', ','));
                }
                this.consume('SYMBOL', ')');
                expr = { type: 'CallExpression', callee: expr, arguments: args };
            } else if (this.check('LBRACKET')) {
                const isConstructor = (expr.type === 'Identifier' && ['int', 'str', 'bool', 'fstr', 'fint', 'var', 'o', 'obj', 'a', 'f', 'fobj'].includes(expr.value));
                
                if (isConstructor) {
                    this.consume('LBRACKET');
                    const contentTokens = [];
                    let balance = 1;
                    while(balance > 0 && this.pos < this.tokens.length) {
                        const t = this.tokens[this.pos];
                        if(t.type === 'LBRACKET') balance++;
                        if(t.type === 'RBRACKET') {
                            balance--;
                            if(balance === 0) break;
                        }
                        contentTokens.push(this.tokens[this.pos]);
                        this.pos++;
                    }
                    this.consume('RBRACKET');
                    expr = { type: 'TypeConstruction', callee: expr.value, bodyTokens: contentTokens };
                } else {
                    break;
                }
            } else {
                break;
            }
        }
        return expr;
    }

    parsePrimary() {
        if (this.match('SYMBOL', '(')) {
            const expr = this.parseExpression();
            this.consume('SYMBOL', ')');
            return expr;
        }
        if (this.check('IDENTIFIER')) {
            return { type: 'Identifier', value: this.consume('IDENTIFIER').value };
        }
        if (this.check('NUMBER')) {
            return { type: 'Literal', value: Number(this.consume('NUMBER').value) };
        }
        throw new Error(`Unexpected token: ${JSON.stringify(this.tokens[this.pos])}`);
    }

    check(type, value) {
        if (this.pos >= this.tokens.length) return false;
        const token = this.tokens[this.pos];
        if (token.type !== type) return false;
        if (value && token.value !== value) return false;
        return true;
    }

    match(type, value) {
        if (this.check(type, value)) {
            this.pos++;
            return true;
        }
        return false;
    }

    consume(type, value) {
        if (this.check(type, value)) return this.tokens[this.pos++];
        throw new Error(`Expected ${type} ${value || ''} but found ${JSON.stringify(this.tokens[this.pos])}`);
    }
}