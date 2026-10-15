// node macho.js <dylib> segs | dwords <va> <n> | rtti [filter] | xref <va>
const fs=require('fs');const [,,file,cmd,a1,a2]=process.argv;const b=fs.readFileSync(file);
const ncmds=b.readUInt32LE(16);let o=28;const segs=[];
for(let i=0;i<ncmds;i++){const c=b.readUInt32LE(o),sz=b.readUInt32LE(o+4);
 if(c==1){const name=b.toString('latin1',o+8,o+24).replace(/\0.*/,'');const vm=b.readUInt32LE(o+24),vs=b.readUInt32LE(o+28),fo=b.readUInt32LE(o+32),fs_=b.readUInt32LE(o+36);const nsect=b.readUInt32LE(o+48);
  const sects=[];for(let j=0;j<nsect;j++){const p=o+56+j*68;sects.push({name:b.toString('latin1',p,p+16).replace(/\0.*/,''),addr:b.readUInt32LE(p+32),size:b.readUInt32LE(p+36),off:b.readUInt32LE(p+40)})}
  segs.push({name,vm,vs,fo,fs:fs_,sects});}
 o+=sz;}
const off=va=>{for(const s of segs)if(va>=s.vm&&va<s.vm+s.fs)return va-s.vm+s.fo;return -1};
const toVa=f=>{for(const s of segs)if(f>=s.fo&&f<s.fo+s.fs&&s.fs)return f-s.fo+s.vm;return -1};
const rd=va=>b.readUInt32LE(off(va));const str=va=>{let p=off(va),s='';while(b[p])s+=String.fromCharCode(b[p++]);return s};
const text=segs.find(s=>s.name=='__TEXT').sects.find(s=>s.name=='__text');
const isCode=v=>v>=text.addr&&v<text.addr+text.size;
if(cmd=='segs')for(const s of segs){console.log(s.name,s.vm.toString(16),s.vs.toString(16),s.fo.toString(16));for(const t of s.sects)console.log('  ',t.name,t.addr.toString(16),t.size.toString(16))}
if(cmd=='dwords'){const v=parseInt(a1,16);for(let i=0;i<Number(a2);i++)console.log((v+i*4).toString(16),rd(v+i*4).toString(16))}
if(cmd=='xref'){const v=parseInt(a1,16);for(let f=0;f+4<=b.length;f+=1)if(b.readUInt32LE(f)===v)console.log(toVa(f).toString(16))}
if(cmd=='rtti'){
 // collect all dword positions (aligned) in data segments
 const dataSegs=segs.filter(s=>s.name!='__TEXT'||true);
 const idx=new Map();for(const s of segs){for(let f=s.fo;f+4<=s.fo+s.fs;f+=4){const v=b.readUInt32LE(f);if(!idx.has(v))idx.set(v,[]);idx.get(v).push(f-s.fo+s.vm)}}
 // find names
 const re=/^N?\d+[A-Za-z_]/;
 for(const s of segs)for(const t of s.sects){if(t.name!='__cstring'&&t.name!='__const')continue;}
 const names=[];const cs=segs.flatMap(s=>s.sects).filter(t=>t.name=='__cstring'||t.name=='__const'||t.name=='__textcoal_nt'||t.name=='__const_coal');
 for(const t of cs){let p=t.off;const end=t.off+t.size;while(p<end){let q=p;while(q<end&&b[q])q++;const s=b.toString('latin1',p,q);if(/^(N\d+[A-Za-z_][\w]*E|\d+[A-Za-z_]\w*)$/.test(s)&&s.length>3){names.push({va:t.addr+p-t.off,s})}p=q+1}}
 for(const n of names){if(a1&&!n.s.includes(a1))continue;const tis=(idx.get(n.va)||[]).map(x=>x-4);
  for(const ti of tis){const vts=(idx.get(ti)||[]).filter(x=>rd(x-4)<0x10000||rd(x-4)>0xfff00000);for(const vt of vts){const slots=[];for(let i=1;i<40;i++){const v=rd(vt+i*4);if(!isCode(v))break;slots.push(v.toString(16))}console.log(n.s,'ti='+ti.toString(16),'vt='+(vt+4).toString(16),'top='+(rd(vt-4)|0),slots.join(' '))}
   if(!vts.length)console.log(n.s,'ti='+ti.toString(16),'(no vtable)')}}
}
