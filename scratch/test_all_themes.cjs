const http = require('http');
const { spawn } = require('child_process');

async function testAllAnimatedThemes() {
  const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const themes = ['water-droplet', 'crystal', 'cosmic-nebula', 'deep-abyss'];

  for (const theme of themes) {
    const port = 9345;
    const proc = spawn(chromePath, [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--remote-debugging-port=' + port,
      '--user-data-dir=C:/Users/Siam/AppData/Local/Temp/chrome-dbg-' + theme,
      `http://localhost:5173/preview.html?theme=${theme}`
    ]);

    await new Promise(r => setTimeout(r, 1800));

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

    const check = await call('Runtime.evaluate', {
      expression: `
        (() => {
          const btn = document.querySelector('.media-skin button');
          const after = btn ? window.getComputedStyle(btn, '::after') : null;
          return {
            theme: '${theme}',
            animName: after?.animationName,
            animDuration: after?.animationDuration,
            opacity: after?.opacity
          };
        })()
      `,
      returnByValue: true
    });

    console.log(check.result.value);

    ws.close();
    proc.kill();
    await new Promise(r => setTimeout(r, 600));
  }
}

testAllAnimatedThemes().catch(console.error);
