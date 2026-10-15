// usage: node mkmap.js, run in analysis/tr. Builds fnmap.txt, a function-name map from rtti_all.txt: FUN_00xxxxxx -> Class__vN (first owner wins, base classes listed earlier lose to... keep shortest-chain: first seen)
const fs=require('fs');const lines=fs.readFileSync('rtti_all.txt','utf8').split('\n');const m=new Map();
const dem=s=>{let r=[],i=0;if(s[0]=='N'){i=1}while(i<s.length&&s[i]!='E'){let n='';while(/\d/.test(s[i]))n+=s[i++];if(!n)break;r.push(s.substr(i,+n));i+=+n}return r.join('::')};
for(const l of lines){const p=l.split(' ');if(p.length<5)continue;const cls=dem(p[0]);const top=+p[3].split('=')[1];if(top>0)continue;const sub=top<0?'_sub'+(-top):'';
 p.slice(4).forEach((f,i)=>{const k='FUN_'+f.padStart(8,'0');const nm=cls.replace(/::/g,'_')+sub+'_v'+i;if(!m.has(k))m.set(k,[]);m.get(k).push(nm)})}
let out='';for(const [k,v] of m)out+=k+' '+v[0]+(v.length>1?'__x'+v.length:'')+'\n';fs.writeFileSync('fnmap.txt',out);console.log(m.size);
