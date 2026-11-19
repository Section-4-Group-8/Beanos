// Copy only public website assets, never source secrets, tests or SQL, for Vercel.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname,'..');
const output = path.join(root,'public');
fs.mkdirSync(output,{recursive:true});
for(const file of fs.readdirSync(root,{withFileTypes:true})) {
  if(file.isFile() && /\.(html|css|ico|svg|png|jpe?g|webp|gif|woff2?|mp[34]|pdf)$/.test(file.name)) fs.copyFileSync(path.join(root,file.name),path.join(output,file.name));
  if(file.isFile() && ['admin-dashboard.js','beanos-api.js','home.js','lessons.js','login.js','profile.js','survey.js'].includes(file.name)) fs.copyFileSync(path.join(root,file.name),path.join(output,file.name));
}
for(const dir of ['images','assets']) if(fs.existsSync(path.join(root,dir))) fs.cpSync(path.join(root,dir),path.join(output,dir),{recursive:true});
fs.cpSync(path.join(__dirname,'public'),path.join(output,'ganderson'),{recursive:true});
console.log('Public Beanos and Ganderson assets prepared.');
