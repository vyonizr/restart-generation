// usage: node fat.js <universal dylib> <out>: lists the slices of a Mach-O universal binary and writes the i386 slice to <out>
const fs=require('fs');const b=fs.readFileSync(process.argv[2]);const n=b.readUInt32BE(4);
for(let i=0;i<n;i++){const o=8+i*20;const ct=b.readUInt32BE(o),off=b.readUInt32BE(o+8),sz=b.readUInt32BE(o+12);console.log(ct.toString(16),off,sz);if(ct==7)fs.writeFileSync(process.argv[3],b.subarray(off,off+sz));}
