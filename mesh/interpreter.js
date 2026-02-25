/**
 * Gilgamesh Interpreter (Optimized)
 * Optimized for asynchronous execution and better scoping.
 */

class Scope {
    constructor(parent = null) {
        this.values = new Map();
        this.parent = parent;
        this.isObject = false;
    }
    get(name) {
        if (this.values.has(name)) return this.values.get(name);
        return this.parent ? this.parent.get(name) : undefined;
    }
    set(name, val) { this.values.set(name, val); }
    assign(name, val) {
        if (this.values.has(name)) { this.values.set(name, val); return true; }
        if (this.parent) return this.parent.assign(name, val);
        return false;
    }
}

export class Interpreter {
    constructor(output, input, external, deps) {
        this.globals = new Scope();
        this.stop = false;
        this.deps = deps;
        this.evalCache = new Map();
        this.opCounter = 0;

        // Load external globals if provided
        if (external instanceof Map) {
            for (const [k, v] of external) {
                this.globals.set(k, v);
            }
        }

        // Minimal built-ins for MESH Online
        this.globals.set('print', async (...args) => console.log(...args));
        this.globals.set('activateCanvas', () => {}); // Legacy support, now always on
    }

    async run(ast) {
        this.stop = false;
        return await this.executeBlock(ast.body, this.globals);
    }

    async executeBlock(stmts, scope) {
        let res = null;
        for (const node of stmts) {
            if (this.stop) return null;
            res = await this.executeStatement(node, scope);
            
            if (scope.values.has('__ret__')) return scope.get('__ret__');
            if (scope.values.has('__break__')) break;
            if (scope.values.has('__continue__')) break;
            
            if (++this.opCounter % 1000 === 0) await new Promise(r => setTimeout(r, 0));
        }
        return res;
    }

    async executeStatement(node, scope) {
        switch (node.type) {
            case 'ImportStatement':
                const res = this.deps.ModuleManager.resolve(node.moduleName);
                let moduleVal;
                if (res.type === 'object') {
                    moduleVal = res.value;
                } else {
                    const mod = await import(res.value);
                    moduleVal = mod.default || mod;
                }
                const name = node.moduleName.split('.')[0];
                scope.set(name, moduleVal);
                break;
            case 'FunctionDeclaration':
                scope.set(node.name, async (...args) => {
                    const fnScope = new Scope(scope);
                    node.params.forEach((p, i) => fnScope.set(p, args[i]));
                    return await this.executeBlock(node.body, fnScope);
                });
                break;
            case 'ObjectDefinition':
                let base = {};
                if (node.parent) {
                    const p = scope.get(node.parent);
                    if (p && typeof p === 'object') base = { ...p };
                }
                const objScope = new Scope(null); 
                Object.entries(base).forEach(([k,v]) => objScope.set(k,v));
                await this.executeBlock(node.properties, objScope);
                scope.set(node.name, Object.fromEntries(objScope.values));
                break;
            case 'Assignment':
                let val = await this.evaluate(node.value, scope);
                if (node.operator !== '=') {
                    const current = scope.get(node.name) || 0;
                    switch (node.operator) {
                        case '+=': val = current + val; break;
                        case '-=': val = current - val; break;
                        case '*=': val = current * val; break;
                        case '/=': val = current / val; break;
                    }
                }
                if (!scope.assign(node.name, val)) scope.set(node.name, val);
                break;
            case 'IfStatement':
                if (await this.evaluate(node.test, scope)) return await this.executeBlock(node.consequent, scope);
                for (const elif of node.elifs || []) {
                    if (await this.evaluate(elif.test, scope)) return await this.executeBlock(elif.body, scope);
                }
                if (node.alternate) return await this.executeBlock(node.alternate, scope);
                break;
            case 'WhileStatement':
                while (!this.stop && await this.evaluate(node.test, scope)) {
                    await this.executeBlock(node.body, scope);
                    if (scope.values.has('__ret__')) break;
                    if (scope.values.has('__break__')) { scope.values.delete('__break__'); break; }
                    if (scope.values.has('__continue__')) { scope.values.delete('__continue__'); }
                    await new Promise(r => setTimeout(r, 0));
                }
                break;
            case 'ForStatement':
                const start = Number(await this.evaluate(node.start, scope));
                const end = Number(await this.evaluate(node.end, scope));
                for (let i = start; i <= end; i++) {
                    if (this.stop) break;
                    scope.set(node.iterator, i);
                    await this.executeBlock(node.body, scope);
                    if (scope.values.has('__ret__')) break;
                    if (i % 50 === 0) await new Promise(r => setTimeout(r, 0));
                }
                break;
            case 'ReturnStatement':
                scope.set('__ret__', await this.evaluate(node.value, scope));
                break;
            case 'BreakStatement':
                scope.set('__break__', true);
                break;
            case 'ContinueStatement':
                scope.set('__continue__', true);
                break;
            case 'ExpressionStatement':
                return await this.evaluate(node.expression, scope);
        }
    }

    async evaluate(node, scope) {
        if (!node) return null;
        switch (node.type) {
            case 'Literal': return node.value;
            case 'Identifier':
                const v = scope.get(node.value);
                if (v === undefined) throw new Error(`Undefined: ${node.value}`);
                return v;
            case 'BinaryExpression':
                const l = await this.evaluate(node.left, scope);
                
                // Short-circuiting logical operators
                if (node.operator === 'and') {
                    if (!l) return l;
                    return await this.evaluate(node.right, scope);
                }
                if (node.operator === 'or') {
                    if (l) return l;
                    return await this.evaluate(node.right, scope);
                }

                const r = await this.evaluate(node.right, scope);
                switch (node.operator) {
                    case '+': return l + r; 
                    case '-': return l - r; 
                    case '*': return l * r; 
                    case '/': return l / r;
                    case '==': return l == r; 
                    case '!=': return l != r; 
                    case '>': return l > r; 
                    case '<': return l < r;
                    case '>=': return l >= r;
                    case '<=': return l <= r;
                }
                return null;
            case 'CallExpression':
                let fn, context = null;
                if (node.callee.type === 'MemberExpression') {
                    context = await this.evaluate(node.callee.object, scope);
                    if (context && typeof context === 'object') {
                        fn = context[node.callee.property];
                    }
                } else {
                    fn = await this.evaluate(node.callee, scope);
                }
                const args = await Promise.all(node.arguments.map(a => this.evaluate(a, scope)));
                if (typeof fn !== 'function') {
                    throw new Error(`Execution Error: Call target is not a function.`);
                }
                return await fn.apply(context, args);
            case 'MemberExpression':
                const obj = await this.evaluate(node.object, scope);
                if (obj === undefined || obj === null) {
                    throw new Error(`Execution Error: Cannot access property '${node.property}' of ${obj}.`);
                }
                return obj[node.property];
            case 'EvalCall':
                const code = String(await this.evaluate(node.argument, scope));
                if (!this.evalCache.has(code)) {
                    const tokens = new this.deps.Lexer(code).tokenize();
                    this.evalCache.set(code, new this.deps.Parser(tokens).parse());
                }
                const ast = this.evalCache.get(code);
                return ast.body.length === 1 && ast.body[0].type === 'ExpressionStatement' 
                    ? await this.evaluate(ast.body[0].expression, scope)
                    : await this.executeBlock(ast.body, scope);
        }
    }

    stringify(v) {
        if (v === null) return 'null';
        if (Array.isArray(v)) return `[${v.map(i => this.stringify(i)).join(', ')}]`;
        if (typeof v === 'object') return JSON.stringify(v);
        return String(v);
    }
}