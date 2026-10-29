import {build} from 'esbuild';
import {renderToString} from 'react-dom/server';
import {createElement} from 'react';
import {writeFile,unlink} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const target=path.resolve('.smoke-app.mjs');
try{
  const result=await build({entryPoints:['src/App.jsx'],bundle:true,platform:'node',format:'esm',packages:'external',loader:{'.css':'empty'},write:false});
  await writeFile(target,result.outputFiles[0].text);
  const {default:App}=await import(pathToFileURL(target).href);
  const html=renderToString(createElement(App));
  for(const expected of ['Security overview','Threat activity','Successful login after repeated failures','Skip to content','Detection rules'])if(!html.includes(expected))throw Error('Missing rendered UI: '+expected);
  console.log('Dashboard render smoke check passed. Browser layout and interactions require separate verification.');
}finally{await unlink(target).catch(()=>{});}
