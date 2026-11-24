const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function verifyWindow(bundleDir, expandedMinimum) {
  const html = fs.readFileSync(path.join(bundleDir, 'ui.html'), 'utf8');
  const controls = html.match(/<script id="windowControls">([\s\S]*?)<\/script>/)[1];
  const window = {};
  const resizeCalls = [];
  const figma = {
    showUI(_html, { width, height }) { Object.assign(window, { innerWidth: width, innerHeight: height }); },
    ui: {
      resize(width, height) {
        resizeCalls.push([width, height]);
        Object.assign(window, { innerWidth: width, innerHeight: height });
      },
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(bundleDir, 'code.js'), 'utf8'), { figma, __html__: html });

  const handlers = {};
  let compact = false;
  let capturedPointer;
  const elements = {
    toggleWindow: {
      addEventListener(name, handler) { handlers[name] = handler; },
      setAttribute(name, value) { this[name] = value; },
    },
    resizeWindow: {
      addEventListener(name, handler) { handlers[name] = handler; },
      setPointerCapture(id) { capturedPointer = id; },
    },
  };
  const document = {
    body: { toggleAttribute() { compact = !compact; return compact; } },
    getElementById: (id) => elements[id],
  };
  const parent = { postMessage: ({ pluginMessage }) => figma.ui.onmessage(pluginMessage) };
  vm.runInNewContext(controls, { window, document, parent });

  handlers.pointerdown({ button: 0, pointerId: 1, screenX: 500, screenY: 400 });
  assert.equal(capturedPointer, 1);
  handlers.pointermove({ pointerId: 1, screenX: 5, screenY: 5 });
  assert.deepEqual(resizeCalls.at(-1), [308, expandedMinimum]);
  handlers.lostpointercapture({ pointerId: 1 });
  const beforeRelease = resizeCalls.length;
  handlers.pointermove({ pointerId: 1, screenX: 600, screenY: 600 });
  assert.equal(resizeCalls.length, beforeRelease);

  handlers.keydown({ key: 'ArrowRight', preventDefault() {} });
  assert.deepEqual(resizeCalls.at(-1), [324, expandedMinimum]);
  handlers.click();
  assert.equal(elements.toggleWindow['aria-expanded'], 'false');
  assert.deepEqual(resizeCalls.at(-1), [308, 124]);
  handlers.click();
  assert.equal(elements.toggleWindow['aria-expanded'], 'true');
  assert.deepEqual(resizeCalls.at(-1), [324, expandedMinimum]);

  const beforeInvalid = resizeCalls.length;
  await figma.ui.onmessage({ type: 'RESIZE_WINDOW', width: NaN, height: 300 });
  assert.equal(resizeCalls.length, beforeInvalid);
}

(async () => {
  await verifyWindow(process.argv[2], 240);
  await verifyWindow(process.argv[3], 146);
  console.log('verify_window.js: kéo, đổi bằng bàn phím, thu gọn và khôi phục kích thước đạt ở cả hai chế độ.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
