// Ambient declarations for packages that ship without TypeScript types.
declare module '@upscalerjs/esrgan-slim' {
  const model: unknown;
  export default model;
}
declare module '@upscalerjs/esrgan-slim/2x' {
  const model: unknown;
  export default model;
}
declare module '@upscalerjs/esrgan-slim/3x' {
  const model: unknown;
  export default model;
}
declare module '@upscalerjs/esrgan-slim/4x' {
  const model: unknown;
  export default model;
}
declare module '@upscalerjs/esrgan-medium' {
  const model: unknown;
  export default model;
}
declare module '@upscalerjs/esrgan-medium/2x' {
  const model: unknown;
  export default model;
}
declare module '@upscalerjs/esrgan-medium/3x' {
  const model: unknown;
  export default model;
}
declare module '@upscalerjs/esrgan-medium/4x' {
  const model: unknown;
  export default model;
}
declare module '@upscalerjs/esrgan-thick' {
  const model: unknown;
  export default model;
}
declare module '@upscalerjs/esrgan-thick/2x' {
  const model: unknown;
  export default model;
}
declare module '@upscalerjs/esrgan-thick/3x' {
  const model: unknown;
  export default model;
}
declare module '@upscalerjs/esrgan-thick/4x' {
  const model: unknown;
  export default model;
}
declare module 'utif' {
  export interface IFD {
    width: number;
    height: number;
    [key: string]: unknown;
  }
  export function decode(buffer: ArrayBuffer | Uint8Array): IFD[];
  export function decodeImage(buffer: ArrayBuffer | Uint8Array, ifd: IFD): void;
  export function toRGBA8(ifd: IFD): Uint8Array;
}
