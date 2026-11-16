const http = require('http');
const { spawn } = require('child_process');

async function inspectRules() {
  const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const port = 9336;
  const proc = spawn(chromePath, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=' + port,
    '--user-data-dir=C:/Users/Siam/AppData/Local/Temp/chrome-dbg4',
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
        const castBtn = document.querySelector('[class*="group/cast"]');
        const afterRules = [];
        for (const sheet of Array.from(document.styleSheets)) {
          try {
            for (const rule of Array.from(sheet.cssRules || [])) {
              if (rule.cssText && rule.cssText.includes('animation') && rule.selectorText) {
                // Check if this rule matches castBtn or castBtn::after
                const baseSelector = rule.selectorText.replace(/::after/g, '');
                try {
                  if (castBtn.matches(baseSelector)) {
                    afterRules.push({
                      selector: rule.selectorText,
                      cssText: rule.cssText
                    });
                  }
                } catch (e) {}
              }
            }
          } catch (e) {}
        }
        return afterRules;
      })()
    `,
    returnByValue: true
  });

  if (res.exceptionDetails) {
    console.error('Exception:', res.exceptionDetails);
  } else {
    console.log(JSON.stringify(res.result.value, null, 2));
  }

  ws.close();
  proc.kill();
}

inspectRules().catch(console.error);
