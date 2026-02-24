/**
 * Squared (^2) Interpreter
 * Executes AST directly with file-based scoping and inheritance support.
 */

export class Interpreter {
    constructor(outputCallback, inputCallback, externalScope = null) {
        this.output = outputCallback || console.log;
        this.inputPrompt = inputCallback || (() => Promise.resolve(""));
        this.globals = externalScope || new Map();
        this.stop = false;
        
        // Built-ins (only set if not already present)
        if (!this.globals.has('print')) {
            this.globals.set('print', async (...args) => {
                this.output(args.map(a => this.stringify(a)).join(' '));
            });
        }
        if (!this.globals.has('input')) {
            this.globals.set('input', async (msg) => {
                return await this.inputPrompt(this.stringify(msg));
            });
        }
    }

    async run(ast) {
        this.stop = false;
        // Use the global scope directly to allow cross-file persistence
        return await this.executeBlock(ast.body, this.globals);
    }

    async executeBlock(statements, scope) {
        let lastResult = null;
        for (const stmt of statements) {
            if (this.stop) return null;
            lastResult = await this.executeStatement(stmt, scope);
            if (scope.has('__return_value__')) return scope.get('__return_value__');
        }
        return lastResult;
    }

    async executeStatement(node, scope) {
        if (this.stop) return null;
        switch (node.type) {
            case 'ImportStatement':
                const url = window.__sqrdModules?.get(node.moduleName) || `./${node.moduleName}`;
                const mod = await import(url);
                scope.set(node.moduleName.split('.')[0], mod.default || mod);
                break;
            case 'FunctionDeclaration':
                scope.set(node.name, async (...args) => {
                    const localScope = new Map(scope);
                    node.params.forEach((p, i) => localScope.set(p, args[i]));
                    const res = await this.executeBlock(node.body, localScope);
                    localScope.delete('__return_value__');
                    return res;
                });
                break;
            case 'ObjectDefinition':
                let obj = node.parent && typeof scope.get(node.parent) === 'object' ? { ...scope.get(node.parent) } : {};
                const objScope = new Map(Object.entries(obj));
                await this.executeBlock(node.properties, objScope);
                scope.set(node.name, Object.fromEntries(objScope));
                break;
            case 'Assignment':
                const val = await this.evaluateExpression(node.value, scope);
                const target = scope.has(node.name) ? scope : this.globals;
                const cur = target.get(node.name) || 0;
                const ops = { 
                    '=': v => v, '+=': v => cur + v, '-=': v => cur - v, 
                    '*=': v => cur * v, '/=': v => cur / v 
                };
                target.set(node.name, ops[node.operator](val));
                break;
            case 'IfStatement':
                if (await this.evaluateExpression(node.test, scope)) return await this.executeBlock(node.consequent, scope);
                if (node.alternate) return await this.executeBlock(node.alternate, scope);
                break;
            case 'WhileStatement':
                let iters = 0;
                while (!this.stop && await this.evaluateExpression(node.test, scope)) {
                    const res = await this.executeBlock(node.body, scope);
                    if (scope.has('__return_value__')) return res;
                    if (++iters % 100 === 0) await new Promise(r => setTimeout(r, 0));
                }
                break;
            case 'ReturnStatement': {
                const val = await this.evaluateExpression(node.value, scope);
                scope.set('__return_value__', val);
                return val;
            }
            case 'ExpressionStatement':
                return await this.evaluateExpression(node.expression, scope);
        }
    }

    async evaluateExpression(node, scope) {
        if (!node) return null;
        switch (node.type) {
            case 'Literal': return node.value;
            case 'ArrayLiteral': return await Promise.all(node.elements.map(e => this.evaluateExpression(e, scope)));
            case 'Identifier': {
                if (!scope.has(node.value)) throw new Error(`Undefined variable: ${node.value}`);
                return scope.get(node.value);
            }
            case 'BinaryExpression': {
                const left = await this.evaluateExpression(node.left, scope);
                const right = await this.evaluateExpression(node.right, scope);
                switch (node.operator) {
                    case '+': return left + right;
                    case '-': return left - right;
                    case '*': return left * right;
                    case '/': return left / right;
                    case '==': return left == right;
                    case '!=': return left != right;
                    case '>': return left > right;
                    case '<': return left < right;
                    case '>=': return left >= right;
                    case '<=': return left <= right;
                }
                return null;
            }
            case 'CallExpression': {
                const callee = await this.evaluateExpression(node.callee, scope);
                const args = await Promise.all(node.arguments.map(a => this.evaluateExpression(a, scope)));
                if (typeof callee === 'function') return await callee(...args);
                return null;
            }
            case 'MemberExpression': {
                const obj = await this.evaluateExpression(node.object, scope);
                if (obj && typeof obj === 'object') return obj[node.property];
                return null;
            }
            case 'EvalCall': {
                const code = await this.evaluateExpression(node.argument, scope);
                const { Lexer, Parser } = await import('./parser.js');
                const tokens = new Lexer(String(code)).tokenize();
                const ast = new Parser(tokens).parse();
                // Simple eval: run as expression if possible
                if (ast.body.length > 0 && ast.body[0].expression) {
                    return await this.evaluateExpression(ast.body[0].expression, scope);
                }
                return await this.executeBlock(ast.body, scope);
            }
        }
    }

    stringify(val) {
        if (val === null) return 'null';
        if (Array.isArray(val)) return "[" + val.map(v => this.stringify(v)).join(", ") + "]";
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val);
    }
}