// usage: node sym.js <i386 dylib>: prints the Mach-O symbol table as "<hex value> <hex type> <name>"
const fs=require('fs');const b=fs.readFileSync(process.argv[2]);const ncmds=b.readUInt32LE(16);let o=28;
for(let i=0;i<ncmds;i++){const cmd=b.readUInt32LE(o),sz=b.readUInt32LE(o+4);
if(cmd==2){const symoff=b.readUInt32LE(o+8),nsyms=b.readUInt32LE(o+12),stroff=b.readUInt32LE(o+16);console.log('nsyms',nsyms);
for(let j=0;j<nsyms;j++){const p=symoff+j*12;const sx=b.readUInt32LE(p),type=b[p+4],val=b.readUInt32LE(p+8);let q=stroff+sx,s='';while(b[q])s+=String.fromCharCode(b[q++]);console.log(val.toString(16),type.toString(16),s)}}
o+=sz;}
