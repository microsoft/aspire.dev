export let registration;
export const messages = [];
export const createCanvas = (options) => options;
export class CanvasError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
export async function joinSession(options) {
    registration = options;
    return {
        log() {},
        async send(message) { messages.push(message); },
        rpc: { canvas: { async open() {} } },
    };
}
