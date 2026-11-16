const http = require('http');
const { spawn } = require('child_process');

async function findDifference() {
  const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const port = 9338;
  const proc = spawn(chromePath, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=' + port,
    '--user-data-dir=C:/Users/Siam/AppData/Local/Temp/chrome-dbg6',
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
        const btns = Array.from(document.querySelectorAll('.media-skin button, .media-skin [class*="liquid-btn"]'));
        const btnWorking = btns[2]; // the one where animation works
        const btnBroken = btns[5]; // captions button where animation is 'none'

        // Check all sheets and all rules that apply to btnBroken::after
        const brokenRules = [];
        const workingRules = [];

        for (const sheet of Array.from(document.styleSheets)) {
          try {
            for (const rule of Array.from(sheet.cssRules || [])) {
              if (!rule.selectorText) continue;
              // Check if rule mentions ::after
              if (rule.selectorText.includes('::after')) {
                // Split comma separated selectors
                const parts = rule.selectorText.split(',');
                for (const part of parts) {
                  const p = part.trim();
                  if (!p.includes('::after')) continue;
                  const base = p.replace(/::after/g, '').trim();
                  try {
                    if (btnWorking.matches(base)) {
                      workingRules.push({ selector: p, rule: rule.cssText.slice(0, 200) });
                    }
                    if (btnBroken.matches(base)) {
                      brokenRules.push({ selector: p, rule: rule.cssText.slice(0, 200) });
                    }
                  } catch (e) {}
                }
              }
            }
          } catch (e) {}
        }

        return {
          btnWorkingCls: btnWorking.className,
          btnBrokenCls: btnBroken.className,
          workingRules,
          brokenRules
        };
      })()
    `,
    returnByValue: true
  });

  console.log(JSON.stringify(res.result.value, null, 2));

  ws.close();
  proc.kill();
}

findDifference().catch(console.error);
