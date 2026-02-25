/**
 * Squared (^2) Module Manager
 * Handles external module registration and resolution.
 */

export const ModuleManager = {
    modules: new Map(),
    objects: new Map(),
    globals: new Map(),

    register(name, content) {
        const blob = new Blob([content], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        this.modules.set(name, url);
        return url;
    },

    registerObject(name, obj) {
        this.objects.set(name, obj);
    },

    resolve(name) {
        if (this.objects.has(name)) return { type: 'object', value: this.objects.get(name) };
        if (this.modules.has(name)) return { type: 'url', value: this.modules.get(name) };
        return { type: 'url', value: `./${name}` };
    },

    clearGlobals() {
        this.globals.clear();
    }
};

export default ModuleManager;