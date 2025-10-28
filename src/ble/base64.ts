/* eslint-disable no-bitwise */
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const padChunk = (chunk: string) => chunk.padEnd(4, '=');

export const base64Chars = BASE64_CHARS;

export const decodeBase64ToBytes = (data: string): number[] => {
  if (!data) {
    return [];
  }
  const cleaned = data.replace(/[^A-Za-z0-9+/=]/g, '');
  const bytes: number[] = [];

  for (let i = 0; i < cleaned.length; i += 4) {
    const chunk = padChunk(cleaned.substring(i, i + 4));
    const c1 = BASE64_CHARS.indexOf(chunk[0]);
    const c2 = BASE64_CHARS.indexOf(chunk[1]);
    const c3 = chunk[2] === '=' ? -1 : BASE64_CHARS.indexOf(chunk[2]);
    const c4 = chunk[3] === '=' ? -1 : BASE64_CHARS.indexOf(chunk[3]);

    if (c1 === -1 || c2 === -1) {
      break; // Invalid chunk
    }

    const byte1 = ((c1 << 2) | (c2 >> 4)) & 0xff;
    bytes.push(byte1);

    if (c3 !== -1) {
      const byte2 = (((c2 & 0x0f) << 4) | (c3 >> 2)) & 0xff;
      bytes.push(byte2);

      if (c4 !== -1) {
        const byte3 = (((c3 & 0x03) << 6) | c4) & 0xff;
        bytes.push(byte3);
      }
    }
  }

  return bytes;
};

export const encodeBytesToBase64 = (bytes: number[]): string => {
  if (!bytes.length) {
    return '';
  }

  let result = '';

  for (let i = 0; i < bytes.length; i += 3) {
    const byte1 = bytes[i];
    const byte2 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const byte3 = i + 2 < bytes.length ? bytes[i + 2] : 0;

    const enc1 = byte1 >> 2;
    const enc2 = ((byte1 & 0x03) << 4) | (byte2 >> 4);
    const enc3 = ((byte2 & 0x0f) << 2) | (byte3 >> 6);
    const enc4 = byte3 & 0x3f;

    if (i + 1 >= bytes.length) {
      result += `${BASE64_CHARS[enc1]}${BASE64_CHARS[enc2]}==`;
    } else if (i + 2 >= bytes.length) {
      result += `${BASE64_CHARS[enc1]}${BASE64_CHARS[enc2]}${BASE64_CHARS[enc3]}=`;
    } else {
      result += `${BASE64_CHARS[enc1]}${BASE64_CHARS[enc2]}${BASE64_CHARS[enc3]}${BASE64_CHARS[enc4]}`;
    }
  }

  return result;
};

export const decodeSingleByte = (data: string): number => {
  const bytes = decodeBase64ToBytes(data);
  return bytes.length ? bytes[0] : 0;
};

export const encodeSingleByte = (value: number): string => {
  const clamped = Math.max(0, Math.min(255, value));
  return encodeBytesToBase64([clamped]);
};
