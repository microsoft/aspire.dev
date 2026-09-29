export let registration;
export const messages = [];
export const createCanvas = (options) => options;
export class CanvasError extends Error {}
export async function joinSession(options) {
    registration = options;
    return {
        log() {},
        async send(message) { messages.push(message); },
        rpc: { canvas: { async open() {} } },
    };
}
