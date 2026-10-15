// usage: node findref.js <file> <hexdword>: prints the file offset of every little-endian occurrence of the dword
const fs=require('fs');const b=fs.readFileSync(process.argv[2]);const v=parseInt(process.argv[3],16);const t=Buffer.alloc(4);t.writeUInt32LE(v);let i=-1;while((i=b.indexOf(t,i+1))>=0)console.log('dword at file off 0x'+i.toString(16));
