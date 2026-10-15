// Drives headless Edge/Chrome over the DevTools protocol against the running server: opens the page,
// presses Start, sends keys, saves screenshots and prints console errors.
// Usage: node web/tools/browser-test.mjs [url] [script]   script: "wait:8,shot:a,key:Control,wait:2,shot:b"
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const url = process.argv[2] || 'http://localhost:8080/';
const steps = (process.argv[3] || 'wait:20,shot:title').split(',').map(s => s.split(':'));
const browser = process.env.BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port = 9300 + Math.floor(Math.random() * 500);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-browser-'));
const proc = spawn(browser, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--autoplay-policy=no-user-gesture-required', '--window-size=600,900', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let ws, id = 0;
const pending = new Map(), errors = [];
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });

try {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch {}
  }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || m.error); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) errors.push(m.params.args.map(a => a.value ?? a.description).join(' '));
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url });
  const evaluate = async expr => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.value;
  // Wait for the Start button, then press it.
  for (let i = 0; i < 300; i++) {
    const s = await evaluate(`document.getElementById('status').textContent + '|' + !document.getElementById('start').hidden`);
    if (s && s.endsWith('|true')) break;
    if (i % 20 === 0) console.log('status:', s);
    await sleep(200);
  }
  await evaluate(`document.getElementById('start').click()`);
  console.log('started');
  const keyEvent = async (type, key) => {
    const codes = { Control: 17, Shift: 16, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Enter: 13, Escape: 27 };
    await send('Input.dispatchKeyEvent', { type, key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key === 'Control' ? 'ControlLeft' : key === 'Shift' ? 'ShiftLeft' : key,
      windowsVirtualKeyCode: codes[key] ?? key.toUpperCase().charCodeAt(0), location: key === 'Control' || key === 'Shift' ? 1 : 0 });
  };
  for (const [cmd, arg] of steps) {
    if (cmd === 'wait') await sleep(+arg * 1000);
    else if (cmd === 'login') { // login:name:password fills and submits the Arena login dialog
      const [name, pw] = arg.split(';');
      for (let i = 0; i < 50 && !(await evaluate(`!document.getElementById('login').hidden`)); i++) await sleep(200);
      await evaluate(`document.getElementById('username').value=${JSON.stringify(name)};document.getElementById('password').value=${JSON.stringify(pw)};document.getElementById('login').requestSubmit()`);
    }
    else if (cmd === 'key') { await keyEvent('rawKeyDown', arg); await sleep(150); await keyEvent('keyUp', arg); await sleep(400); }
    else if (cmd === 'shot') {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(`tmp/browser_${arg}.png`, Buffer.from(data, 'base64'));
      const fps = await evaluate(`window.rgStats ? JSON.stringify(window.rgStats) : ''`);
      console.log(`shot ${arg}`, fps);
    }
  }
  console.log(errors.length ? `console errors:\n  ${errors.slice(0, 10).join('\n  ')}` : 'no console errors');
} finally {
  proc.kill();
}
