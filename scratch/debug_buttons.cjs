const http = require('http');
const { spawn } = require('child_process');

async function debugButtons() {
  const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const port = 9337;
  const proc = spawn(chromePath, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=' + port,
    '--user-data-dir=C:/Users/Siam/AppData/Local/Temp/chrome-dbg5',
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
    return new Promise(res => {
      const msgId = id++;
      const fn = e => {
        const m = JSON.parse(e.data);
        if (m.id === msgId) {
          ws.removeEventListener('message', fn);
          res(m.result);
        }
      };
      ws.addEventListener('message', fn);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  await new Promise(r => ws.addEventListener('open', r, { once: true }));

  // Simulate mousemove inside player to make controls fully visible
  await call('Runtime.evaluate', {
    expression: `
      (() => {
        const player = document.querySelector('.preview-player');
        if (player) {
          player.dispatchEvent(new MouseEvent('pointerenter', { bubbles: true }));
          player.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 300, clientY: 300 }));
        }
      })()
    `
  });

  await new Promise(r => setTimeout(r, 500));

  const res = await call('Runtime.evaluate', {
    expression: `
      (() => {
        const btns = Array.from(document.querySelectorAll('.media-skin button, .media-skin [class*="liquid-btn"]'));
        return btns.map((b, i) => {
          const cs = window.getComputedStyle(b);
          const after = window.getComputedStyle(b, '::after');
          const parent = b.parentElement ? window.getComputedStyle(b.parentElement) : null;
          return {
            index: i,
            classSample: b.className.split(' ').filter(c => c.includes('group/')).join(' '),
            btnDisplay: cs.display,
            btnVisibility: cs.visibility,
            parentDisplay: parent?.display,
            afterDisplay: after.display,
            afterAnimName: after.animationName,
            afterAnimDuration: after.animationDuration,
            afterAnimPlayState: after.animationPlayState
          };
        });
      })()
    `,
    returnByValue: true
  });

  console.log(JSON.stringify(res.result.value, null, 2));

  ws.close();
  proc.kill();
}

debugButtons().catch(console.error);
