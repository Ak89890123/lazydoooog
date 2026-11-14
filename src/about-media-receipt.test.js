import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computePngCrc32,
  parsePngChunkReceipt,
  validateAboutPosterPng,
  validateAboutWorkflowFfprobe,
} from './about-media-receipt.js';

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const uint32 = (value) => {
  const result = Buffer.alloc(4);
  result.writeUInt32BE(value >>> 0);
  return result;
};

const pngChunk = (type, payload = Buffer.alloc(0)) => {
  const typeBytes = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBytes, payload]);
  return Buffer.concat([
    uint32(payload.length),
    typeBytes,
    payload,
    uint32(computePngCrc32(crcInput)),
  ]);
};

const ihdrPayload = () => {
  const payload = Buffer.alloc(13);
  payload.writeUInt32BE(720, 0);
  payload.writeUInt32BE(720, 4);
  payload.set([8, 2, 0, 0, 0], 8);
  return payload;
};

const createPosterPng = (extraChunks = []) => Buffer.concat([
  signature,
  pngChunk('IHDR', ihdrPayload()),
  pngChunk('sRGB', Buffer.from([1])),
  ...extraChunks,
  pngChunk('IDAT', Buffer.from([0x78, 0x9c, 0x00])),
  pngChunk('IEND'),
]);

const createMp4Receipt = () => ({
  streams: [{
    index: 0,
    codec_name: 'h264',
    profile: 'High',
    codec_type: 'video',
    pix_fmt: 'yuv420p',
    width: 720,
    height: 720,
    r_frame_rate: '30/1',
    avg_frame_rate: '30/1',
    color_range: 'tv',
    color_space: 'bt709',
    color_transfer: 'bt709',
    color_primaries: 'bt709',
    disposition: { attached_pic: 0 },
    tags: { language: 'und', handler_name: 'VideoHandler' },
    side_data_list: [],
  }],
  chapters: [],
  programs: [],
  format: {
    nb_streams: 1,
    nb_programs: 0,
    duration: '3.500000',
    size: '4200000',
    tags: {
      major_brand: 'isom',
      minor_version: '512',
      compatible_brands: 'isomiso2avc1mp41',
    },
  },
});

test('PNG CRC implementation matches the standard check vector', () => {
  assert.equal(computePngCrc32(Buffer.from('123456789')), 0xcbf43926);
});

test('exact About poster chunk sequence produces a complete deterministic receipt', () => {
  const png = createPosterPng();
  const result = validateAboutPosterPng(png);

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.receipt.chunks.map(({ type }) => type), ['IHDR', 'sRGB', 'IDAT', 'IEND']);
  const idat = result.receipt.chunks[2];
  assert.equal(idat.crcValid, true);
  assert.match(idat.payloadSha256, /^[a-f0-9]{64}$/);
  assert.equal('payloadHex' in idat, false);
});

test('poster validator rejects ancillary chunks and non-relative sRGB intent', () => {
  const ancillary = validateAboutPosterPng(createPosterPng([pngChunk('pHYs', Buffer.alloc(9))]));
  assert.equal(ancillary.valid, false);
  assert.ok(ancillary.errors.includes('chunk-sequence'));

  const invalidIntent = Buffer.concat([
    signature,
    pngChunk('IHDR', ihdrPayload()),
    pngChunk('sRGB', Buffer.from([0])),
    pngChunk('IDAT', Buffer.from([1])),
    pngChunk('IEND'),
  ]);
  const intentResult = validateAboutPosterPng(invalidIntent);
  assert.equal(intentResult.valid, false);
  assert.ok(intentResult.errors.includes('srgb-contract'));
});

test('poster validator rejects CRC corruption, wrong geometry, and trailing data', () => {
  const corrupted = Buffer.from(createPosterPng());
  corrupted[corrupted.length - 13] ^= 0xff;
  const corruptedResult = validateAboutPosterPng(corrupted);
  assert.equal(corruptedResult.valid, false);
  assert.ok(corruptedResult.errors.includes('chunk-crc'));

  const wrongIhdr = ihdrPayload();
  wrongIhdr.writeUInt32BE(719, 0);
  const wrongGeometry = Buffer.concat([
    signature,
    pngChunk('IHDR', wrongIhdr),
    pngChunk('sRGB', Buffer.from([1])),
    pngChunk('IDAT', Buffer.from([1])),
    pngChunk('IEND'),
  ]);
  assert.ok(validateAboutPosterPng(wrongGeometry).errors.includes('ihdr-contract'));

  const trailing = Buffer.concat([createPosterPng(), Buffer.from([0])]);
  assert.equal(parsePngChunkReceipt(trailing).parseErrors.includes('truncated-chunk-header'), true);
  assert.ok(validateAboutPosterPng(trailing).errors.includes('trailing-bytes'));
});

test('closed MP4 ffprobe topology and metadata allowlist passes', () => {
  assert.deepEqual(validateAboutWorkflowFfprobe(createMp4Receipt(), 'mp4'), {
    valid: true,
    errors: [],
  });
});

test('ffprobe validator rejects extra streams, tags, side data, color drift, and oversize media', () => {
  const receipt = createMp4Receipt();
  receipt.streams.push({ codec_type: 'audio', codec_name: 'aac' });
  receipt.streams[0].tags.encoder = 'forbidden';
  receipt.streams[0].side_data_list.push({ side_data_type: 'ICC Profile' });
  receipt.streams[0].color_transfer = 'iec61966-2-1';
  receipt.format.nb_streams = 2;
  receipt.format.size = String(6 * 1024 * 1024);

  const result = validateAboutWorkflowFfprobe(receipt, 'mp4');
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('stream-topology'));
  assert.ok(result.errors.includes('stream-tags'));
  assert.ok(result.errors.includes('side-data'));
  assert.ok(result.errors.includes('color-metadata'));
  assert.ok(result.errors.includes('format-stream-count'));
  assert.ok(result.errors.includes('file-size'));
});

test('WebM receipt requires one VP9 stream and completely empty tags', () => {
  const receipt = createMp4Receipt();
  receipt.streams[0].codec_name = 'vp9';
  delete receipt.streams[0].profile;
  receipt.streams[0].tags = {};
  receipt.format.tags = {};

  assert.equal(validateAboutWorkflowFfprobe(receipt, 'webm').valid, true);
  receipt.format.tags = { encoder: 'forbidden' };
  assert.ok(validateAboutWorkflowFfprobe(receipt, 'webm').errors.includes('format-tags'));
});
