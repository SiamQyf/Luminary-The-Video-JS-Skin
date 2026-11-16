const http = require('http');
const { spawn } = require('child_process');

async function inspect() {
  const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const port = 9335;
  const proc = spawn(chromePath, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=' + port,
    '--user-data-dir=C:/Users/Siam/AppData/Local/Temp/chrome-dbg3',
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

  const res = await call('Runtime.evaluate', {
    expression: `
      (() => {
        const previewPlayer = document.querySelector('.preview-player');
        const theme = previewPlayer?.getAttribute('data-theme');
        const btns = Array.from(document.querySelectorAll('button, .media-fullscreen-button, .vertical-volume-popup, [data-part="bottom-controls-bar"] button'));
        const playerButtons = Array.from(document.querySelectorAll('.media-skin button, .media-skin .media-fullscreen-button, .media-skin [class*="liquid-btn"], .media-skin [class*="vol-pill"]'));
        
        const details = playerButtons.map(b => {
          const cs = window.getComputedStyle(b);
          const after = window.getComputedStyle(b, '::after');
          return {
            tag: b.tagName,
            classes: b.className,
            background: cs.background.slice(0, 80),
            afterContent: after.content,
            afterAnimationName: after.animationName,
            afterAnimationDuration: after.animationDuration,
            afterBg: after.backgroundImage.slice(0, 80),
            afterOpacity: after.opacity,
            afterDisplay: after.display
          };
        });

        return {
          theme,
          rootTheme: document.documentElement.dataset.theme,
          playerButtonsCount: playerButtons.length,
          buttons: details
        };
      })()
    `,
    returnByValue: true
  });

  console.log(JSON.stringify(res.result.value, null, 2));

  ws.close();
  proc.kill();
}

inspect().catch(console.error);
