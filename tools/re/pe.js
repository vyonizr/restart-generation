// usage: node pe.js <dll> dwords <va> <count> | str <va>
const fs=require('fs');const [,,file,cmd,vaS,cnt]=process.argv;const b=fs.readFileSync(file);
const pe=b.readUInt32LE(0x3c),ns=b.readUInt16LE(pe+6),opt=b.readUInt16LE(pe+20),base=b.readUInt32LE(pe+24+28);
const secs=[];for(let i=0;i<ns;i++){const o=pe+24+opt+i*40;secs.push({va:b.readUInt32LE(o+12),vs:b.readUInt32LE(o+8),raw:b.readUInt32LE(o+20)});}
const off=va=>{const r=va-base;for(const s of secs)if(r>=s.va&&r<s.va+s.vs)return r-s.va+s.raw;return -1};
const va=parseInt(vaS,16);
if(cmd==='dwords'){for(let i=0;i<Number(cnt);i++){const o=off(va+i*4);console.log((va+i*4).toString(16),b.readUInt32LE(o).toString(16).padStart(8,'0'))}}
if(cmd==='str'){let o=off(va),s='';while(b[o])s+=String.fromCharCode(b[o++]);console.log(s)}
if(cmd==='bytes'){const o=off(va);console.log(b.subarray(o,o+Number(cnt)).toString('hex'))}
