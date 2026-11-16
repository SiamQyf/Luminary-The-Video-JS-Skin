const http = require('http');
const { spawn } = require('child_process');

async function inspectPlayBtn() {
  const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const port = 9341;
  const proc = spawn(chromePath, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=' + port,
    '--user-data-dir=C:/Users/Siam/AppData/Local/Temp/chrome-dbg9',
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
        const btns = Array.from(document.querySelectorAll('.media-skin button'));
        const b0 = btns[0]; // cast
        const b1 = btns[1]; // play
        
        // Find every rule matching b0::after and b1::after
        function getRulesFor(el) {
          const matched = [];
          for (const s of Array.from(document.styleSheets)) {
            try {
              for (const r of Array.from(s.cssRules || [])) {
                if (!r.selectorText || !r.selectorText.includes('::after')) continue;
                for (const sel of r.selectorText.split(',')) {
                  const base = sel.trim().replace(/::after/g, '').trim();
                  try {
                    if (el.matches(base)) {
                      matched.push({
                        sel: sel.trim(),
                        anim: r.style.animation,
                        animName: r.style.animationName
                      });
                    }
                  } catch (e) {}
                }
              }
            } catch (e) {}
          }
          return matched;
        }

        return {
          b0Rules: getRulesFor(b0),
          b1Rules: getRulesFor(b1)
        };
      })()
    `,
    returnByValue: true
  });

  console.log(JSON.stringify(res.result.value, null, 2));

  ws.close();
  proc.kill();
}

inspectPlayBtn().catch(console.error);
