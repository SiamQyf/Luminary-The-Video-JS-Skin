const http = require('http');
const { spawn } = require('child_process');

async function getMatchedStyles() {
  const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const port = 9339;
  const proc = spawn(chromePath, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=' + port,
    '--user-data-dir=C:/Users/Siam/AppData/Local/Temp/chrome-dbg7',
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

  await call('DOM.enable');
  await call('CSS.enable');

  const root = await call('DOM.getDocument');
  const search = await call('DOM.querySelectorAll', {
    nodeId: root.root.nodeId,
    selector: '.preview-player button'
  });

  console.log('Found buttons:', search.nodeIds.length);

  for (let i = 0; i < search.nodeIds.length; i++) {
    const nodeId = search.nodeIds[i];
    const nodeDesc = await call('DOM.describeNode', { nodeId });
    const styles = await call('CSS.getMatchedStylesForNode', { nodeId });
    
    // Look at pseudoElements
    const pseudo = styles.pseudoElements || [];
    const afterPseudo = pseudo.find(p => p.pseudoType === 'after');
    
    // Get computed animationName
    const computed = await call('CSS.getComputedStyleForNode', { nodeId });
    
    console.log(`\n--- Button ${i}: <${nodeDesc.node.nodeName} class="${nodeDesc.node.attributes.find((a, idx) => nodeDesc.node.attributes[idx-1] === 'class') || ''}"> ---`);
    if (afterPseudo) {
      const rules = afterPseudo.matches || afterPseudo.matchedCSSRules || [];
      console.log('Has ::after matched rules:', rules.length);
      for (const r of rules) {
        const ruleObj = r.rule || r;
        const animProp = (ruleObj.style?.cssProperties || []).filter(p => p.name.includes('animation'));
        if (animProp.length > 0) {
          console.log('  Rule:', ruleObj.selectorList?.text, '-> animation:', animProp.map(p => `${p.name}: ${p.value} (${p.important ? '!important' : ''})`));
        }
      }
    } else {
      console.log('No ::after pseudo in styles.pseudoElements');
    }
  }

  ws.close();
  proc.kill();
}

getMatchedStyles().catch(console.error);
