import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CameraPreviewSession, cameraErrorMessage } from './camera-preview.ts';

function fakeStream() {
  let stops = 0;
  return { stream: { getTracks: () => [{ stop: () => { stops += 1; } }, { stop: () => { stops += 1; } }] }, stops: () => stops };
}

test('cancelled permission request releases a stream arriving later', async () => {
  const session = new CameraPreviewSession();
  const fake = fakeStream();
  let resolve!: (stream: typeof fake.stream) => void;
  const result = session.open(() => new Promise((done) => { resolve = done; }));
  session.stop();
  resolve(fake.stream);
  assert.equal(await result, null);
  assert.equal(session.stream, null);
  assert.equal(fake.stops(), 2);
});

test('switching requests cannot reactivate the old camera', async () => {
  const session = new CameraPreviewSession();
  const old = fakeStream();
  const next = fakeStream();
  let resolve!: (stream: typeof old.stream) => void;
  const first = session.open(() => new Promise((done) => { resolve = done; }));
  assert.equal(await session.open(async () => next.stream), next.stream);
  resolve(old.stream);
  assert.equal(await first, null);
  assert.equal(old.stops(), 2);
  assert.equal(session.stream, next.stream);
  session.stop();
  session.stop();
  assert.equal(next.stops(), 2);
});

test('cancelled request errors do not replace a newer preview state', async () => {
  const session = new CameraPreviewSession();
  let reject!: (reason: Error) => void;
  const first = session.open(() => new Promise((_, fail) => { reject = fail; }));
  session.stop();
  reject(new Error('late rejection'));
  assert.equal(await first, null);
});

test('permission denial has a manual alternative and never exposes raw error content', () => {
  assert.match(cameraErrorMessage({ name: 'NotAllowedError', message: 'sensitive payload' }), /manuel/);
  assert.ok(!cameraErrorMessage({ message: 'sensitive payload' }).includes('sensitive payload'));
});
