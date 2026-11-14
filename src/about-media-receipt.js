import { createHash } from 'node:crypto';

const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_ABOUT_VIDEO_BYTES = 5 * 1024 * 1024;

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  return value >>> 0;
});

const asBytes = (value) => (
  value instanceof Uint8Array
    ? value
    : Uint8Array.from(value || [])
);

const readUint32 = (bytes, offset) => (
  (((bytes[offset] << 24) >>> 0)
    | (bytes[offset + 1] << 16)
    | (bytes[offset + 2] << 8)
    | bytes[offset + 3]) >>> 0
);

const hex32 = (value) => value.toString(16).padStart(8, '0');

export const computePngCrc32 = (value) => {
  const bytes = asBytes(value);
  let crc = 0xffffffff;
  bytes.forEach((byte) => {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  });
  return (crc ^ 0xffffffff) >>> 0;
};

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export const parsePngChunkReceipt = (value) => {
  const bytes = asBytes(value);
  const signatureValid = (
    bytes.length >= PNG_SIGNATURE.length
    && PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)
  );
  const chunks = [];
  const parseErrors = [];
  let offset = PNG_SIGNATURE.length;

  if (!signatureValid) {
    return {
      signatureValid: false,
      byteLength: bytes.length,
      chunks,
      trailingBytes: Math.max(0, bytes.length - PNG_SIGNATURE.length),
      parseErrors: ['png-signature'],
    };
  }

  while (offset < bytes.length) {
    if (bytes.length - offset < 12) {
      parseErrors.push('truncated-chunk-header');
      break;
    }
    const length = readUint32(bytes, offset);
    const payloadStart = offset + 8;
    const payloadEnd = payloadStart + length;
    const chunkEnd = payloadEnd + 4;
    if (chunkEnd > bytes.length) {
      parseErrors.push('truncated-chunk-payload');
      break;
    }

    const typeBytes = bytes.slice(offset + 4, offset + 8);
    const type = String.fromCharCode(...typeBytes);
    const payload = bytes.slice(payloadStart, payloadEnd);
    const crcRead = readUint32(bytes, payloadEnd);
    const crcComputed = computePngCrc32(bytes.slice(offset + 4, payloadEnd));
    const chunk = {
      type,
      length,
      crcRead: hex32(crcRead),
      crcComputed: hex32(crcComputed),
      crcValid: crcRead === crcComputed,
    };
    if (type === 'IDAT') {
      chunk.payloadSha256 = sha256(payload);
    } else {
      chunk.payloadHex = Buffer.from(payload).toString('hex');
    }
    chunks.push(chunk);
    offset = chunkEnd;
  }

  return {
    signatureValid,
    byteLength: bytes.length,
    chunks,
    trailingBytes: bytes.length - offset,
    parseErrors,
  };
};

const decodeHex = (value) => Uint8Array.from(Buffer.from(value || '', 'hex'));

export const validateAboutPosterPng = (value) => {
  const receipt = parsePngChunkReceipt(value);
  const errors = [...receipt.parseErrors];
  const types = receipt.chunks.map((chunk) => chunk.type);

  if (!receipt.signatureValid && !errors.includes('png-signature')) errors.push('png-signature');
  if (receipt.trailingBytes !== 0) errors.push('trailing-bytes');
  if (receipt.chunks.some((chunk) => !chunk.crcValid)) errors.push('chunk-crc');
  if (
    types.length < 4
    || types[0] !== 'IHDR'
    || types[1] !== 'sRGB'
    || types.at(-1) !== 'IEND'
    || types.slice(2, -1).length === 0
    || types.slice(2, -1).some((type) => type !== 'IDAT')
  ) errors.push('chunk-sequence');
  if (types.filter((type) => type === 'IHDR').length !== 1) errors.push('ihdr-count');
  if (types.filter((type) => type === 'sRGB').length !== 1) errors.push('srgb-count');
  if (types.filter((type) => type === 'IEND').length !== 1) errors.push('iend-count');

  const ihdr = receipt.chunks.find((chunk) => chunk.type === 'IHDR');
  const ihdrPayload = decodeHex(ihdr?.payloadHex);
  if (
    !ihdr
    || ihdr.length !== 13
    || ihdrPayload.length !== 13
    || readUint32(ihdrPayload, 0) !== 720
    || readUint32(ihdrPayload, 4) !== 720
    || ihdrPayload[8] !== 8
    || ihdrPayload[9] !== 2
    || ihdrPayload[10] !== 0
    || ihdrPayload[11] !== 0
    || ihdrPayload[12] !== 0
  ) errors.push('ihdr-contract');

  const srgb = receipt.chunks.find((chunk) => chunk.type === 'sRGB');
  if (!srgb || srgb.length !== 1 || srgb.payloadHex !== '01') errors.push('srgb-contract');
  const iend = receipt.chunks.find((chunk) => chunk.type === 'IEND');
  if (!iend || iend.length !== 0 || iend.payloadHex !== '') errors.push('iend-contract');

  return { valid: errors.length === 0, errors: [...new Set(errors)], receipt };
};

const exactTags = (actual, expected) => {
  const normalized = actual || {};
  const actualKeys = Object.keys(normalized).sort();
  const expectedKeys = Object.keys(expected).sort();
  return (
    JSON.stringify(actualKeys) === JSON.stringify(expectedKeys)
    && expectedKeys.every((key) => String(normalized[key]) === String(expected[key]))
  );
};

const frameRateIs30 = (stream) => (
  stream.r_frame_rate === '30/1' && stream.avg_frame_rate === '30/1'
);

export const validateAboutWorkflowFfprobe = (receipt, container = 'mp4') => {
  const errors = [];
  const isMp4 = container === 'mp4';
  const isWebm = container === 'webm';
  if (!isMp4 && !isWebm) return { valid: false, errors: ['container'] };

  if (!Array.isArray(receipt?.streams) || receipt.streams.length !== 1) errors.push('stream-topology');
  if (!Array.isArray(receipt?.chapters) || receipt.chapters.length !== 0) errors.push('chapters');
  if (!Array.isArray(receipt?.programs) || receipt.programs.length !== 0) errors.push('programs');
  const stream = receipt?.streams?.[0] || {};
  const format = receipt?.format || {};

  if (stream.codec_type !== 'video') errors.push('video-only');
  if (stream.codec_name !== (isMp4 ? 'h264' : 'vp9')) errors.push('codec');
  if (isMp4 && stream.profile !== 'High') errors.push('h264-profile');
  if (stream.pix_fmt !== 'yuv420p') errors.push('pixel-format');
  if (Number(stream.width) !== 720 || Number(stream.height) !== 720) errors.push('dimensions');
  if (!frameRateIs30(stream)) errors.push('frame-rate');
  if (
    stream.color_primaries !== 'bt709'
    || stream.color_transfer !== 'bt709'
    || stream.color_space !== 'bt709'
    || stream.color_range !== 'tv'
  ) errors.push('color-metadata');
  if (Number(stream.disposition?.attached_pic || 0) !== 0) errors.push('attached-picture');
  if (
    'side_data_list' in stream
    && (!Array.isArray(stream.side_data_list) || stream.side_data_list.length > 0)
  ) errors.push('side-data');

  const expectedStreamTags = isMp4
    ? { language: 'und', handler_name: 'VideoHandler' }
    : {};
  if (!exactTags(stream.tags, expectedStreamTags)) errors.push('stream-tags');
  const expectedFormatTags = isMp4
    ? {
      major_brand: 'isom',
      minor_version: '512',
      compatible_brands: 'isomiso2avc1mp41',
    }
    : {};
  if (!exactTags(format.tags, expectedFormatTags)) errors.push('format-tags');
  if (Number(format.nb_streams) !== 1) errors.push('format-stream-count');
  if (Number(format.nb_programs) !== 0) errors.push('format-program-count');
  if (!(Number(format.duration) > 0)) errors.push('duration');
  if (
    !Number.isFinite(Number(format.size))
    || Number(format.size) <= 0
    || Number(format.size) > MAX_ABOUT_VIDEO_BYTES
  ) {
    errors.push('file-size');
  }

  return { valid: errors.length === 0, errors };
};
