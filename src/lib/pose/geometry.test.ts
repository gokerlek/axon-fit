import { test } from 'node:test';
import assert from 'node:assert/strict';
import { angleAt, lineTilt, analyzePose, type Landmark } from './geometry.ts';

const point = (x: number, y: number): Landmark => ({ x, y, visibility: 1, presence: 1 });
function body(): Landmark[] {
  const p = Array.from({length: 33}, () => point(0.5, 0.5));
  p[0]=point(.5,.1); p[11]=point(.35,.25); p[12]=point(.65,.25);
  p[23]=point(.4,.5); p[24]=point(.6,.5); p[25]=point(.4,.7); p[26]=point(.6,.7);
  p[27]=point(.4,.9); p[28]=point(.6,.9); p[31]=point(.4,.95); p[32]=point(.6,.95);
  return p;
}

test('projected angle uses pixel aspect ratio, not normalized square coordinates', () => {
  assert.ok(Math.abs(angleAt(point(.5,0),point(.5,.5),point(1,.5),1920,1080)!-90)<1e-8);
  const diagonal=angleAt(point(.5,0),point(.5,.5),point(1,0),200,100)!;
  assert.ok(Math.abs(diagonal-63.4349488)<1e-5);
});
test('degenerate and non-finite segments have no angle', () => {
  assert.equal(angleAt(point(.5,.5),point(.5,.5),point(.7,.5),100,100),null);
  assert.equal(angleAt(point(NaN,0),point(.5,.5),point(.7,.5),100,100),null);
});
test('horizontal tilt is invariant to the order of left/right points', () => {
  assert.equal(lineTilt(point(.2,.3),point(.8,.3),100,100),0);
  const a=lineTilt(point(.2,.3),point(.8,.5),100,100);
  assert.equal(a,lineTilt(point(.8,.5),point(.2,.3),100,100));
});
test('full-body single-person frame produces descriptive front metrics', () => {
  const result=analyzePose([body()],100,100,'front');
  assert.equal(result.quality,'ready');
  assert.equal(result.metrics.find(m=>m.id==='shoulder_tilt')?.degrees,0);
  assert.equal(result.metrics.find(m=>m.id==='trunk_tilt')?.degrees,0);
});
test('no person, multiple people, cropped feet and uncertain landmarks never produce metrics', () => {
  assert.equal(analyzePose([],100,100,'front').quality,'no_person');
  assert.deepEqual(analyzePose([body(),body()],100,100,'front').metrics,[]);
  const cropped=body();cropped[31]=point(.4,1.1);
  assert.equal(analyzePose([cropped],100,100,'front').quality,'cropped');
  assert.deepEqual(analyzePose([cropped],100,100,'front').metrics,[]);
  const weak=body();weak[11]={...weak[11]!,visibility:.2};
  assert.equal(analyzePose([weak],100,100,'front').quality,'uncertain');
});
test('side view only uses visible near-side segments; shoulder asymmetry is not inferred', () => {
  const points=body();points[12]={...points[12]!,visibility:.1};points[24]={...points[24]!,visibility:.1};
  const result=analyzePose([points],100,100,'side');
  assert.equal(result.quality,'ready');
  assert.equal(result.metrics.some(m=>m.id==='shoulder_tilt'),false);
});
test('squat uses visible knee angles and does not turn projected angles into valgus diagnosis', () => {
  const result=analyzePose([body()],1280,720,'squat');
  assert.equal(result.quality,'ready');
  assert.equal(result.metrics.find(m=>m.id==='near_knee')?.degrees,180);
  assert.equal(result.metrics.some(m=>m.id==='shoulder_tilt'),false);
});
