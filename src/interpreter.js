import { Parser } from './parser.js';

/**
 * Squared (^2) Compiler
 * Optimizes the AST into an executable function for maximum performance.
 */
export class Compiler {
    constructor(outputCallback) {
        this.globals = new Map();
        this.output = outputCallback || console.log;
        this.evalResult = null;
    }

    formatOutput(val) {
        if (val === null || val === undefined) return 'undefined';
        if (typeof val === 'number') return String(val);
        if (typeof val === 'string') return val;
        if (Array.isArray(val)) {
            return `[${val.map(v => this.formatOutput(v)).join(', ')}]`;
        }
        if (val && typeof val === 'object') {
            if (val.type === 'primitive') return String(val.value);
            if (val.type === 'OBJECT') {
                 const props = [];
                 for(const [k, v] of val.properties) {
                     props.push(`${k}: ${this.formatOutput(v)}`);
                 }
                 return `{ ${props.join(', ')} }`;
            }
            return String(val.value ?? val);
        }
        return String(val);
    }

    /**
     * "Compiles" the AST into a runnable async function.
     * We use a high-performance tree-walking strategy with pre-parsed hot-paths.
     */
    compile(ast) {
        // Pre-optimize the AST (e.g., pre-parsing TypeConstruction segments)
        this.optimize(ast.body);
        
        return async () => {
            try {
                return this.executeBlock(ast.body, this.globals);
            } catch (e) {
                this.output(`Runtime Error: ${e.message}`, true);
                throw e;
            }
        };
    }

    optimize(nodes) {
        for (const node of nodes) {
            if (!node) continue;
            if (node.type === 'TypeConstruction') {
                node.compiledSegment = this.preCompileSegment(node.bodyTokens);
            }
            // Recurse into blocks
            if (node.body) this.optimize(node.body);
            if (node.consequent) this.optimize(node.consequent);
            if (node.alternate) this.optimize(node.alternate);
            if (node.value && typeof node.value === 'object') this.optimize([node.value]);
            if (node.expression) this.optimize([node.expression]);
        }
    }

    preCompileSegment(tokens) {
        if (!tokens || tokens.length === 0) return null;
        try {
            return new Parser(tokens).parseExpression();
        } catch {
            return null; // Fallback to raw token evaluation if it's not a standard expression
        }
    }

    executeBlock(statements, scope) {
        const len = statements.length;
        for (let i = 0; i < len; i++) {
            const result = this.execute(statements[i], scope);
            if (result && (result.type === 'RETURN' || result.type === 'BREAK' || result.type === 'CONTINUE')) {
                return result;
            }
        }
    }

    execute(node, scope) {
        switch (node.type) {
            case 'BreakStatement': return { type: 'BREAK' };
            case 'ContinueStatement': return { type: 'CONTINUE' };
            case 'VarDeclaration':
                const val = this.evaluate(node.value, scope);
                scope.set(node.name, val);
                return;
            case 'AssignmentStatement':
                const newVal = this.evaluate(node.value, scope);
                if (scope.has(node.name)) scope.set(node.name, newVal);
                else if (this.globals.has(node.name)) this.globals.set(node.name, newVal);
                else throw new Error(`Undefined variable for assignment: ${node.name}`);
                return;
            case 'FunctionDeclaration':
                scope.set(node.name, {
                    type: 'FUNCTION',
                    params: node.params,
                    body: node.body,
                    closure: scope
                });
                return;
            case 'IfStatement':
                const cond = this.evaluate(node.test, scope);
                if (cond && (cond.value !== false && cond.value !== 0)) {
                    const res = this.executeBlock(node.consequent, scope);
                    if (res) return res;
                } else if (node.alternate) {
                    const res = this.executeBlock(node.alternate, scope);
                    if (res) return res;
                }
                return;
            case 'WhileStatement':
                while (true) {
                    const c = this.evaluate(node.test, scope);
                    if (!c || c.value === false || c.value === 0) break;
                    const res = this.executeBlock(node.body, scope);
                    if (res) {
                        if (res.type === 'RETURN') return res;
                        if (res.type === 'BREAK') break;
                        if (res.type === 'CONTINUE') continue;
                    }
                }
                return;
            case 'ForStatement':
                this.execute(node.init, scope);
                while(true) {
                    const c = this.evaluate(node.test, scope);
                    if (!c || c.value === false || c.value === 0) break;
                    const res = this.executeBlock(node.body, scope);
                    if (res) {
                        if (res.type === 'RETURN') return res;
                        if (res.type === 'BREAK') break;
                        if (res.type === 'CONTINUE') {
                            this.execute(node.update, scope);
                            continue;
                        }
                    }
                    this.execute(node.update, scope);
                }
                return;
            case 'ExpressionStatement':
                this.evaluate(node.expression, scope);
                return;
            case 'ReturnStatement':
                return { type: 'RETURN', value: this.evaluate(node.value, scope) };
        }
    }

    evaluate(node, scope) {
        if (!node) return null;

        switch (node.type) {
            case 'Literal':
                return node.value;

            case 'Identifier':
                if (scope.has(node.value)) return scope.get(node.value);
                if (this.globals.has(node.value)) return this.globals.get(node.value);
                return node.value; 

            case 'BinaryExpression':
                const left = this.evaluate(node.left, scope);
                const right = this.evaluate(node.right, scope);
                return this.applyOp(node.operator, left, right);

            case 'CallExpression':
                return this.handleCall(node, scope);

            case 'MemberExpression':
                const obj = this.evaluate(node.object, scope);
                const prop = node.property;
                
                // Array elements access
                if (Array.isArray(obj)) {
                    if (prop === 'val') return obj;
                    
                    const eMatch = prop.match(/^e(\d+)$/);
                    if (eMatch) {
                         const idx = parseInt(eMatch[1], 10);
                         if (obj[idx] !== undefined) return obj[idx];
                         return { type: 'primitive', value: 'undefined' };
                    }
                    
                    if (/^\d+$/.test(prop)) {
                        const idx = parseInt(prop, 10);
                        if (obj[idx] !== undefined) return obj[idx];
                        return { type: 'primitive', value: 'undefined' };
                    }
                }

                if (obj && typeof obj === 'object' && obj.properties && obj.properties.has(prop)) {
                    return obj.properties.get(prop);
                }
                if (obj && typeof obj === 'object' && obj[prop] !== undefined) {
                    return obj[prop];
                }
                if (obj && prop === 'result') { 
                    return obj.result;
                }
                throw new Error(`Cannot access property '${prop}' of ${JSON.stringify(obj)}`);

            case 'TypeConstruction':
                return this.handleTypeConstruction(node, scope);

            default:
                throw new Error(`Unknown node type: ${node.type}`);
        }
    }

    applyOp(op, a, b) {
        const valA = (a && a.value !== undefined) ? a.value : a;
        const valB = (b && b.value !== undefined) ? b.value : b;
        
        switch(op) {
            case '+': return valA + valB;
            case '-': return valA - valB;
            case '*': return valA * valB;
            case '/': return valA / valB;
            case '==': return { type: 'primitive', value: valA == valB };
            case '!=': return { type: 'primitive', value: valA != valB };
            case '<': return { type: 'primitive', value: valA < valB };
            case '>': return { type: 'primitive', value: valA > valB };
            case '<=': return { type: 'primitive', value: valA <= valB };
            case '>=': return { type: 'primitive', value: valA >= valB };
        }
        return 0;
    }

    handleCall(node, scope) {
        const calleeName = node.callee.type === 'Identifier' ? node.callee.value : null;
        
        if (calleeName === 'print') {
            const args = node.arguments.map(arg => {
                let val = this.evaluate(arg, scope);
                return this.formatOutput(val);
            });
            this.output(args.join(' '));
            return;
        }

        if (calleeName === 'random') {
            const min = this.evaluate(node.arguments[0], scope);
            const max = this.evaluate(node.arguments[1], scope);
            const vMin = (min.value !== undefined) ? min.value : min;
            const vMax = (max.value !== undefined) ? max.value : max;
            return Math.floor(Math.random() * (vMax - vMin + 1)) + vMin;
        }

        if (calleeName === 'eval') {
            if (node.arguments.length === 0) return { result: this.evalResult };
            const argVal = this.evaluate(node.arguments[0], scope);
            this.evalResult = argVal;
            return { result: argVal }; 
        }

        if (node.callee.type === 'MemberExpression') {
            const obj = this.evaluate(node.callee.object, scope);
            const func = obj.properties.get(node.callee.property);
            if (func && func.type === 'FUNCTION') {
                return this.callUserFunction(func, node.arguments, scope);
            }
        }

        const func = this.evaluate(node.callee, scope);
        if (func && func.type === 'FUNCTION') {
            return this.callUserFunction(func, node.arguments, scope);
        }

        throw new Error(`Unknown function: ${calleeName}`);
    }

    callUserFunction(func, argNodes, callerScope) {
        const funcScope = new Map(func.closure);
        for (let i = 0; i < func.params.length; i++) {
            const val = this.evaluate(argNodes[i], callerScope);
            funcScope.set(func.params[i], val);
        }
        const result = this.executeBlock(func.body, funcScope);
        if (result && result.type === 'RETURN') return result.value;
        return null;
    }

    handleTypeConstruction(node, scope) {
        const type = node.callee;
        const tokens = node.bodyTokens;

        const getRawString = () => tokens.map(t => t.value).join('');

        if (type === 'int') return { type: 'primitive', value: parseInt(getRawString(), 10) };
        
        if (type === 'str') {
            let s = "";
            for(let t of tokens) {
                s += t.value + (t.type==='SYMBOL' && t.value===',' ? " " : "");
            }
            s = tokens.map(t => t.value).join(' ').replace(/ , /g, ',').replace(/ \./g, '.');
            return { type: 'primitive', value: s.trim() };
        }
        
        if (type === 'bool') return { type: 'primitive', value: getRawString().toLowerCase() === 'true' };
        
        if (type === 'var') {
            const varName = tokens[0].value;
            if (scope.has(varName)) return scope.get(varName);
            if (this.globals.has(varName)) return this.globals.get(varName);
            throw new Error(`Undefined variable: ${varName}`);
        }

        if (type === 'f' || type === 'fobj') {
            return node.compiledSegment ? this.evaluate(node.compiledSegment, scope) : this.evaluateSegment(tokens, scope);
        }

        if (type === 'a') {
            const elements = [];
            let currentSegment = [];
            let balance = 0;
            
            for (let t of tokens) {
                if (t.value === ',' && balance === 0) {
                    if (currentSegment.length > 0) elements.push(this.evaluateSegment(currentSegment, scope));
                    currentSegment = [];
                } else {
                    if (t.type === 'LBRACKET') balance++;
                    if (t.type === 'RBRACKET') balance--;
                    currentSegment.push(t);
                }
            }
            if (currentSegment.length > 0) elements.push(this.evaluateSegment(currentSegment, scope));
            return elements;
        }

        if (type === 'o' || type === 'obj') {
            const properties = new Map();
            let currentSegment = [];
            let balance = 0;
            const segments = [];
            
            for (let t of tokens) {
                if (t.value === ',' && balance === 0) {
                    segments.push(currentSegment);
                    currentSegment = [];
                } else {
                    if (t.type === 'LBRACKET') balance++;
                    if (t.type === 'RBRACKET') balance--;
                    currentSegment.push(t);
                }
            }
            segments.push(currentSegment);

            for(let seg of segments) {
                if (seg.length === 0 || seg[0].value !== 'prop') continue;
                const key = seg[2].value;
                const eqIndex = seg.findIndex(t => t.value === '=');
                const valTokens = seg.slice(eqIndex + 1);
                properties.set(key, this.evaluateSegment(valTokens, scope));
            }
            return { type: 'OBJECT', properties };
        }

        if (type === 'fint' || type === 'fstr') {
            let raw = "";
            tokens.forEach(t => raw += t.value + " ");
            
            const processedTokens = [];
            let i = 0;
            while(i < tokens.length) {
                if (tokens[i].value === '{') {
                    let exprTokens = [];
                    i++;
                    let balance = 1;
                    while(i < tokens.length && balance > 0) {
                        if(tokens[i].value === '{') balance++;
                        if(tokens[i].value === '}') {
                            balance--;
                            if(balance===0) break;
                        }
                        exprTokens.push(tokens[i]);
                        i++;
                    }
                    const val = this.evaluateSegment(exprTokens, scope);
                    processedTokens.push({ type: 'IDENTIFIER', value: this.formatOutput(val) });
                } else {
                    processedTokens.push(tokens[i]);
                }
                i++;
            }
            
            if (type === 'fstr') {
                let s = processedTokens.map(t => t.value).join(' ');
                s = s.replace(/\s+([,!?.])/g, '$1');
                return { type: 'primitive', value: s.trim() };
            }
            
            if (type === 'fint') {
                const s = processedTokens.map(t => t.value).join('');
                return { type: 'primitive', value: parseInt(s) };
            }
        }

        return { type: 'UNKNOWN', value: tokens };
    }

    evaluateSegment(tokens, scope) {
        if (!tokens || tokens.length === 0) return null;
        
        // Use pre-compiled parser result if available or single tokens for speed
        if (tokens.length === 1) {
            const t = tokens[0];
            if (t.type === 'NUMBER') return Number(t.value);
            if (t.type === 'IDENTIFIER') {
                if (scope.has(t.value)) return scope.get(t.value);
                if (this.globals.has(t.value)) return this.globals.get(t.value);
                return t.value;
            }
            return t.value;
        }

        try {
            return this.evaluate(new Parser(tokens).parseExpression(), scope);
        } catch {
            return tokens.map(t => t.value).join('');
        }
    }
}