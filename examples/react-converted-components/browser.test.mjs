// The chart page in a real Chrome (@ehtb/agent-ui/testing/browser.mjs): Chart.js needs a real canvas, so this is the test that shows the plugin
// works. The page is built for production (Chart.js bundled into the chunk of /charts only), served, and driven with real input. It
// skips itself when there is no Chrome (set CHROME_PATH) or Chart.js is not installed (npm install).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, serveSite } from '@ehtb/agent-ui/testing/browser.mjs';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const installed = existsSync(join(projectRoot, 'node_modules/chart.js/package.json'));
const browser = installed ? await launchBrowser() : null;
const cleanups = [];
after(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
  await browser?.close();
});

// Reads the canvas back: for each bar, the x of its middle and the number of its pixels in a column (its height), found by the colour
// of the bars (grey, or blue for the selected one), so the test needs nothing from Chart.js.
const READ_BARS = `(() => {
  const canvas = document.querySelector('#revenue-chart canvas');
  canvas.scrollIntoView({ block: 'center' }); // a click lands only on what is in the viewport
  const { width, height } = canvas;
  const { data } = canvas.getContext('2d').getImageData(0, 0, width, height);
  const colourAt = (x, y) => { const at = (y * width + x) * 4; return data[at + 3] ? [data[at], data[at + 1], data[at + 2]] : null; };
  const isBar = (colour) => colour && ((colour[0] === 148 && colour[1] === 163 && colour[2] === 184) || (colour[0] === 37 && colour[1] === 99 && colour[2] === 235));
  const bars = [];
  const y = height - 40; // just above the axis labels: every bar with a value reaches this row
  let start = null;
  for (let x = 0; x <= width; x++) {
    const on = x < width && isBar(colourAt(x, y));
    if (on && start === null) start = x;
    if (!on && start !== null) {
      const middle = Math.round((start + x - 1) / 2);
      let top = y;
      while (top > 0 && isBar(colourAt(middle, top - 1))) top--;
      bars.push({ middle, height: y - top, selected: colourAt(middle, y)[2] === 235 });
      start = null;
    }
  }
  const box = canvas.getBoundingClientRect();
  return JSON.stringify({ bars, scale: canvas.width / box.width, left: box.left, top: box.top, y });
})()`;

test('the chart is drawn into its element, follows the state, reports a click as an action and is removed with the app', { skip: !installed ? 'Chart.js is not installed (npm install)' : browser ? false : 'no Chrome found (set CHROME_PATH)' }, async () => {
  const site = await serveSite({ projectRoot });
  cleanups.push(site.close);
  const page = await browser.open(`${site.url}/charts`);
  await page.until(`!!document.querySelector('#revenue-chart canvas')`, 'the chart to be drawn');
  const read = async () => {
    await page.evaluate(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))`); // Chart.js draws on the next frame
    return JSON.parse(await page.evaluate(READ_BARS));
  };

  // The number fields show the data the bars are drawn from (each row has its own value after the browser takes over from the server's markup).
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-id="value-input"]')].map((input) => Number(input.value))`), [12, 19, 7, 15]);

  // Four bars, Q1 12, Q2 19, Q3 7, Q4 15: their heights are in that proportion, and none is selected.
  const first = await read();
  assert.equal(first.bars.length, 4);
  const [q1, q2, q3, q4] = first.bars.map((bar) => bar.height);
  assert.ok(q2 > q4 && q4 > q1 && q1 > q3, `heights ${[q1, q2, q3, q4]}`);
  assert.ok(Math.abs((q2 - q3) / (q4 - q3) - 12 / 8) < 0.2, `heights differ in the proportion of the values: ${[q1, q2, q3, q4]}`); // measured above the axis labels, so compare differences
  assert.deepEqual(first.bars.map((bar) => bar.selected), [false, false, false, false]);

  // A real click on the third bar: the chart's own event becomes the action sales.select.
  const third = first.bars[2];
  const clickAt = { x: first.left + third.middle / first.scale, y: first.top + first.y / first.scale };
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await page.send('Input.dispatchMouseEvent', { type, ...clickAt, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: type === 'mouseMoved' ? 0 : 1 });
  }
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1, button: 'none' }); // off the bar: Chart.js shades the bar under the pointer
  await page.until(`window.__ui.state().sales.selectedId === 'q3'`, 'the click to select Q3');
  assert.deepEqual(await page.evaluate(`window.__ui.log.filter(([name]) => name === 'sales.select')`), [['sales.select', { id: 'q3' }]], 'the click is a logged action');
  await page.settle();
  await page.until(`document.querySelector('#chart-summary').textContent.includes('Selected: Q3')`, 'the summary');
  const selected = await read();
  assert.deepEqual(selected.bars.map((bar) => bar.selected), [false, false, true, false], 'the chart follows the selection');

  // Typing in the form changes state; the chart follows it (Q1 from 12 to 30 becomes the tallest bar).
  await page.type('[data-id="value-input"]', '30', { replace: true });
  await page.settle();
  await page.until(`window.__ui.state().sales.series[0].value === 30`, 'the value');
  const edited = await read();
  assert.ok(edited.bars[0].height > edited.bars[1].height, 'Q1 is now the tallest');
  assert.equal(await page.evaluate(`document.querySelector('#chart-summary').textContent`), 'Total: 71k. Selected: Q3');

  // Replaying the log reproduces the state: the click does not dispatch again (the plugin is quiet while replaying).
  const before = await page.evaluate('JSON.stringify(window.__ui.state().sales)');
  assert.equal(await page.evaluate(`window.__ui.replay().then((state) => JSON.stringify(state.sales))`), before);
  assert.equal(await page.evaluate(`window.__ui.log.filter(([name]) => name === 'sales.select').length`), 1);

  // Destroying the app gives the element back: the canvas is gone and Chart.js released it.
  await page.evaluate('window.__ui.destroy()');
  assert.equal(await page.evaluate(`document.querySelectorAll('canvas').length`), 0);
  assert.deepEqual(page.report.console, [], 'nothing was reported in the console');
});
