const http = require('http');
const { spawn } = require('child_process');

async function testNoReducedMotion() {
  const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const port = 9342;
  const proc = spawn(chromePath, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=' + port,
    '--user-data-dir=C:/Users/Siam/AppData/Local/Temp/chrome-dbg10',
    'http://localhost:5173/preview.html?theme=water-droplet'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  const list = await new Promise((res, rej) => {
    http.get('http://127.0.0.1:' + port + '/json/list', r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });

  const page = list.find(t => t.type === 'page') || list[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);

  let id = 1;
  function call(method, params = {}) {
    return new Promise((res, rej) => {
      const msgId = id++;
      const fn = e => {
        const m = JSON.parse(e.data);
        if (m.id === msgId) {
          ws.removeEventListener('message', fn);
          if (m.error) rej(m.error);
          else res(m.result);
        }
      };
      ws.addEventListener('message', fn);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  await new Promise(r => ws.addEventListener('open', r, { once: true }));

  // Emulate prefers-reduced-motion: no-preference
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }]
  });

  const check = await call('Runtime.evaluate', {
    expression: `
      (() => {
        const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
        return {
          matchesReducedMotion: mql.matches,
          buttons: Array.from(document.querySelectorAll('.media-skin button')).map((b, i) => {
            const after = window.getComputedStyle(b, '::after');
            return {
              i,
              cls: b.className.split(' ').filter(c => c.startsWith('group/')).join(' '),
              anim: after.animationName,
              duration: after.animationDuration,
              bgPos: after.backgroundPosition
            };
          })
        };
      })()
    `,
    returnByValue: true
  });

  console.log('Matches reduced motion:', check.result.value.matchesReducedMotion);
  console.log('Buttons with no-preference:', check.result.value.buttons);

  ws.close();
  proc.kill();
}

testNoReducedMotion().catch(console.error);
