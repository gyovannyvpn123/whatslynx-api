declare module 'qrcode-terminal' {
  export function generate(text: string, options?: any): void;
  export default {
    generate: generate
  };
}