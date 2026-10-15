// usage: node ren.js, run in analysis/tr: copies mac_decomp.c to mac_named.c with FUN_ names replaced from fnmap.txt
const fs=require('fs');const m=new Map(fs.readFileSync('fnmap.txt','utf8').trim().split('\n').map(l=>l.split(' ')));
let s=fs.readFileSync('mac_decomp.c','latin1');s=s.replace(/FUN_[0-9a-f]{8}/g,x=>m.has(x)?m.get(x)+'_'+x.slice(6):x);fs.writeFileSync('mac_named.c',s,'latin1');
