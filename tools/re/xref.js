// usage: node xref.js <dll> <hexva>... : find dwords in file equal to va, print VA of each location
const fs=require('fs');const b=fs.readFileSync(process.argv[2]);
const pe=b.readUInt32LE(0x3c),ns=b.readUInt16LE(pe+6),opt=b.readUInt16LE(pe+20),base=b.readUInt32LE(pe+24+28);
const secs=[];for(let i=0;i<ns;i++){const o=pe+24+opt+i*40;secs.push({va:b.readUInt32LE(o+12),vs:b.readUInt32LE(o+8),raw:b.readUInt32LE(o+20),rs:b.readUInt32LE(o+16)});}
const toVa=o=>{for(const s of secs)if(o>=s.raw&&o<s.raw+s.rs)return base+s.va+o-s.raw;return -1};
for(const a of process.argv.slice(3)){const v=parseInt(a,16);const r=[];for(let o=0;o+4<=b.length;o++)if(b.readUInt32LE(o)===v)r.push(toVa(o).toString(16));console.log(a,':',r.join(' '));}
