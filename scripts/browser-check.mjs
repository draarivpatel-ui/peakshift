import { serve } from './serve.mjs';
import { connectCdp, launchChrome, openPage, sleep } from './cdp.mjs';

const checks = [];
function check(name, condition, detail = '') {
  checks.push({ name, passed: Boolean(condition), detail });
  if (!condition) throw new Error(`${name} failed${detail ? `: ${detail}` : ''}`);
  console.log(`ok ${checks.length} - ${name}`);
}

const { server, origin } = await serve(0, '/');
const browser = await launchChrome(1440, 900);
const consoleErrors = [];

async function shutdown(code) {
  await browser.cleanup();
  server.close();
  process.exit(code);
}

process.on('unhandledRejection', async (error) => {
  console.error(error);
  await shutdown(1);
});

try {
  const cdp = await connectCdp(browser.webSocketDebuggerUrl);
  cdp.listeners.push((message) => {
    if (message.method === 'Runtime.exceptionThrown') consoleErrors.push(message.params.exceptionDetails?.text || 'exception');
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      consoleErrors.push(message.params.args?.map((arg) => arg.value ?? arg.description).join(' ') || 'console error');
    }
  });
  const page = await openPage(cdp, origin, 1440, 900);

  const evaluate = page.evaluate;
  const click = async (selector) => {
    const point = await evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) throw new Error('missing ${selector}');
      element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`);
    await page.page('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    await page.page('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    await page.page('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    await sleep(240);
  };

  check('page exposes the PeakShift test API', await evaluate('Boolean(window.__peakshift)'));
  check('three labeled synthetic profiles render', await evaluate('document.querySelectorAll(".profile-option").length') === 3);
  check('sample appliance queue renders six rows', await evaluate('document.querySelectorAll("#appliance-rows tr").length') === 6);
  check('intensity chart renders 24 hourly bars', await evaluate('document.querySelectorAll(".chart-bar").length') === 24);
  check('results start hidden before solving', await evaluate('document.querySelector("#results").hidden') === true);
  const externalResources = await evaluate(`performance.getEntriesByType('resource')
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith(${JSON.stringify(origin)}) && !name.startsWith('data:'))`);
  check('no external network resources load', externalResources.length === 0, externalResources.join(', '));

  await click('#solve-button');
  await sleep(450);
  check('solver reveals the results section', await evaluate('document.querySelector("#results").hidden') === false);
  check('exact-search metadata is visible', await evaluate('document.querySelector("#search-meta").textContent.includes("exact branch-and-bound")'));
  check('timeline reserves eleven whole-hour slots', await evaluate('document.querySelectorAll(".hour-cell.filled").length') === 11);
  check('summary stays locked before acknowledgment', await evaluate('document.querySelector("#summary-panel").hidden') === true);
  check('summary button starts disabled', await evaluate('document.querySelector("#reveal-summary").disabled') === true);

  await click('#reveal-summary');
  check('clicking the disabled summary button changes nothing', await evaluate('document.querySelector("#summary-panel").hidden') === true);
  await click('#acknowledge-model');
  check('acknowledgment enables the summary button', await evaluate('document.querySelector("#reveal-summary").disabled') === false);
  await click('#reveal-summary');
  await sleep(300);
  check('acknowledgment unlocks the modeled summary', await evaluate('document.querySelector("#summary-panel").hidden') === false);
  check('optimized total matches deterministic sample', await evaluate('document.querySelector("#metric-optimized").textContent.includes("1.85 kgCO2e")'));
  check('naive total matches deterministic sample', await evaluate('document.querySelector("#metric-naive").textContent.includes("11.55 kgCO2e")'));
  check('six marginal saving rows render', await evaluate('document.querySelectorAll("#savings-rows tr").length') === 6);
  check('EV windows differ between plans', await evaluate('document.querySelector("#savings-rows tr").children[1].textContent') !== await evaluate('document.querySelector("#savings-rows tr").children[2].textContent'));

  await click('[data-profile="wind-heavy"]');
  await sleep(300);
  check('switching profiles invalidates the prior results', await evaluate('document.querySelector("#results").hidden') === true);
  check('wind profile becomes the checked option', await evaluate('document.querySelector(\'[data-profile="wind-heavy"]\').getAttribute("aria-checked")') === 'true');
  check('wind low statistic updates', await evaluate('document.querySelector("#stat-low").textContent.includes("108 g")'));
  check('no console errors or uncaught exceptions occurred', consoleErrors.length === 0, consoleErrors.join(' | '));

  console.log(`browser checks passed: ${checks.length}/${checks.length}`);
  cdp.ws.close();
  await shutdown(0);
} catch (error) {
  console.error(error);
  await shutdown(1);
}
