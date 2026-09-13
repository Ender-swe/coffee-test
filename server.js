const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = fs.existsSync('dist/index.html') ? path.join(__dirname,'dist') : __dirname;
const port = Number(process.env.PORT || process.argv[process.argv.indexOf('--port')+1]) || 3000;
http.createServer((req,res)=>{let name;try{name=decodeURIComponent(req.url.split('?')[0])}catch{res.writeHead(400);res.end();return}const file=path.join(root,name==='/'?'index.html':name);if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end('Not found');return}res.setHeader('Content-Type',({'html':'text/html','css':'text/css','js':'text/javascript','svg':'image/svg+xml'})[file.split('.').pop()]||'application/octet-stream');res.end(data)})}).listen(port,'0.0.0.0',()=>console.log(`Orlast running on http://localhost:${port}`));
