// usage: node strings.js <file>: prints printable ASCII runs of 5+ characters as "<hex file offset> <string>"
const fs=require('fs');const b=fs.readFileSync(process.argv[2]);let s='',st=0;const out=[];
for(let i=0;i<b.length;i++){const c=b[i];if(c>=32&&c<127){if(!s)st=i;s+=String.fromCharCode(c);}else{if(s.length>=5)out.push(st.toString(16).padStart(8,'0')+' '+s);s='';}}
console.log(out.join('\n'));
