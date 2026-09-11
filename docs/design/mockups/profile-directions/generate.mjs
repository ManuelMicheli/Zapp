import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(dir,'../../../..');
const data=(p,mime)=>`data:${mime};base64,${fs.readFileSync(path.join(root,p)).toString('base64')}`;
const assets={FONT:data('public/fonts/inter-var.woff2','font/woff2'),ST:data('docs/design/mockups/zconnection/poster-st.jpg','image/jpeg'),SILO:data('docs/design/mockups/zconnection/p4.jpg','image/jpeg'),GENT:data('docs/design/mockups/zconnection/p8.jpg','image/jpeg')};
for(const n of ['search','library','home','cinema','profile'])assets[n.toUpperCase()]=data(`public/icons/nav/${n}.png`,'image/png');
const template=fs.readFileSync(path.join(dir,'profile-template.html'),'utf8');
for(const [KEY,CLASS,LABEL] of [['a','equilibrio','A · Equilibrio cinematografico'],['b','editoriale','B · Ritratto editoriale'],['c','collezione','C · Collezione']]){
 const values={...assets,KEY,CLASS,LABEL};
 const html=template.replace(/__([A-Z]+)__/g,(_,key)=>values[key]);
 fs.writeFileSync(path.join(dir,`profilo-${KEY}.html`),html);
 console.log(`profilo-${KEY}.html: ${Buffer.byteLength(html)} bytes`);
}
