import assert from "node:assert/strict";
import test from "node:test";
import { chooseRoomSession } from "../../src/components/observer-room/roomSession";
import { phoneProgress, PHONE_OPEN_MS, carPosition } from "../../src/components/observer-room/roomMotion";
import { readableTitle, safeSourceUrl } from "../../src/components/observer-room/terminalFormat";
import { documentBlocks } from "../../src/components/observer-room/markdownBlocks";

test("all four initial room combinations can be chosen without storing or mutating the draw", () => {
  assert.deepEqual(chooseRoomSession(0.2, 0.2), { windowOpen: true, musicWanted: true });
  assert.deepEqual(chooseRoomSession(0.8, 0.2), { windowOpen: false, musicWanted: true });
  assert.deepEqual(chooseRoomSession(0.2, 0.8), { windowOpen: true, musicWanted: false });
  assert.deepEqual(chooseRoomSession(0.8, 0.8), { windowOpen: false, musicWanted: false });
  assert.deepEqual(chooseRoomSession(0.4, 0.6), { windowOpen: false, musicWanted: false });
});
test("phone motion is continuous, bounded, and takes the full approach interval", () => {
  assert.equal(phoneProgress(0, true), 0); assert.equal(phoneProgress(PHONE_OPEN_MS, true), 1);
  assert.equal(phoneProgress(0, false), 1); assert.equal(phoneProgress(600, false), 0);
  let previous = 0;
  for (let time = 0; time <= PHONE_OPEN_MS; time += 10) { const next = phoneProgress(time, true); assert.ok(next >= previous && next <= 1); assert.ok(next - previous < 0.02); previous = next; }
  assert.ok(phoneProgress(300, true) < 0.2); assert.equal(phoneProgress(-100, true), 0); assert.equal(phoneProgress(9999, true), 1);
});
test("street cars move in opposing lanes and wrap outside the visible neighbourhood", () => {
  assert.ok(carPosition(1, 0) > carPosition(0, 0)); assert.ok(carPosition(1, 1) < carPosition(0, 1));
  for (let i = 0; i < 4; i++) for (let t = 0; t < 200; t += 0.2) {
    const x = carPosition(t, i), next = carPosition(t + 0.2, i); assert.ok(x >= -50 && x < 50);
    if (Math.abs(next - x) > 60) assert.ok(Math.abs(x) > 49);
  }
});
test("reading preserves paragraphs, source quotes, lists and literal code while deduplicating the title", () => {
  const blocks = documentBlocks('# Title\n\n作成: yesterday\n生成: model\n\n## A question\n\nA full paragraph.\n\n> Source claim\n\n- first\n- second\n\n```\n<script>literal</script>\n```', 'Title');
  assert.deepEqual(blocks, [
    {kind:'metadata',text:'作成: yesterday\n生成: model'}, {kind:'heading',level:2,text:'A question'},
    {kind:'paragraph',text:'A full paragraph.'}, {kind:'quote',text:'Source claim'},
    {kind:'list',ordered:false,items:['first','second']}, {kind:'code',text:'<script>literal</script>'},
  ]);
});
test("title decoding is safe text and source links reject credentials and active schemes", () => {
  assert.equal(readableTitle('Library&#8217;s &amp; &quot;record&quot;'), 'Library’s & "record"');
  assert.equal(readableTitle('&lt;script&gt;'), '<script>'); assert.equal(readableTitle('&#99999999;'), '&#99999999;');
  assert.equal(safeSourceUrl('javascript:alert(1)'), null); assert.equal(safeSourceUrl('https://user:secret@example.com/'), null);
  assert.equal(safeSourceUrl('https://example.com/source'), 'https://example.com/source');
});
