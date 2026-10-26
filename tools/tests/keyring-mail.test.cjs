const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const senderCode = fs.readFileSync(path.join(root,'assets/keyring-mail.js'),'utf8');
const receiverCode = fs.readFileSync(path.join(root,'Send_3MF.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function sender(blocked = false, local = false) {
  const events = new Map(), sent = [];
  const popup = {closed:false, postMessage:(data,origin)=>sent.push({data,origin}),close(){this.closed=true;}};
  const win = {addEventListener:(key,fn)=>events.set(key,fn), removeEventListener:key=>events.delete(key),open:()=>blocked?null:popup};
  const context = {window:win,location:{protocol:local?'file:':'https:',href:local?'file:///C:/Bambu/tools/Free_Name_Keyring.html':'https://jiamom.github.io/3Dprint/tools/Free_Name_Keyring.html'},URL,Blob,setTimeout:()=>1,clearTimeout(){}};
  vm.runInNewContext(senderCode,context);
  return {api:win.KeyringMail,events,popup,sent};
}
function receiver(opener = true) {
  const events = new Map(), posts = [], forms = [], status = {};
  const source = {postMessage:(...args)=>posts.push(args)};
  const doc = {getElementById:()=>status,createElement:tag=>({tag,children:[],append(...items){this.children.push(...items);}}),body:{append:form=>forms.push(form)}};
  const win = {opener:opener?source:null,addEventListener:(key,fn)=>events.set(key,fn)};
  let submissions = 0;
  const context = {window:win,document:doc,location:{origin:'https://jiamom.github.io',href:'https://jiamom.github.io/3Dprint/tools/Send_3MF.html'},Blob,File,DataTransfer:class {constructor(){this.files=[];this.items={add:file=>this.files.push(file)};}},HTMLFormElement:{prototype:{submit(){submissions++;}}},setTimeout:()=>1,clearTimeout(){}};
  vm.runInNewContext(receiverCode,context);
  return {events,source,posts,forms,status,get submissions(){return submissions;}};
}
test('local editor hands the exact file to the hosted recipient form',async()=>{
  const s=sender(false,true),session=s.api.open(),file=new Blob(['3mf-test-bytes']);
  const ready=s.events.get('message');
  ready({source:{},origin:'https://jiamom.github.io',data:{type:'keyring-mail-ready'}});
  assert.equal(s.sent.length,0);
  ready({source:s.popup,origin:'https://jiamom.github.io',data:{type:'keyring-mail-ready'}});
  await session.send({file,filename:'키링.3mf',title:'키링'});
  assert.equal(s.sent[0].origin,'https://jiamom.github.io');
  assert.equal(await s.sent[0].data.file.text(),'3mf-test-bytes');
});
test('blocked popup and oversized file report errors without sending',async()=>{
  assert.throws(()=>sender(true).api.open(),/팝업/);
  const s=sender(),session=s.api.open();
  await assert.rejects(session.send({file:new Blob([new Uint8Array(10*1024*1024+1)]),filename:'large.3mf'}),/10MB/);
  session.close(); assert.equal(s.sent.length,0);
});
test('mail form attaches exact bytes once and fixes recipient server-side endpoint',async()=>{
  const r=receiver(),message=r.events.get('message'),payload={type:'keyring-mail-file',file:new Blob(['3mf-test-bytes']),filename:'한글.3mf',title:'키링\r\n이름'};
  message({source:r.source,origin:'https://untrusted.example',data:payload});assert.equal(r.forms.length,0);
  message({source:{},origin:'null',data:payload});assert.equal(r.forms.length,0);
  message({source:r.source,origin:'null',data:payload});
  assert.equal(r.submissions,1);
  const form=r.forms[0];assert.equal(form.action,'https://formsubmit.co/10040mee@gmail.com');
  assert.equal(form.method,'POST');assert.equal(form.enctype,'multipart/form-data');
  assert.equal(form.children.find(x=>x.name==='_url').value,'https://jiamom.github.io/3Dprint/index.html');
  assert.equal(form.children.find(x=>x.name==='_next').value,'https://jiamom.github.io/3Dprint/index.html?v=mail-2');
  const attachment=form.children.find(x=>x.name==='attachment').files[0];
  assert.equal(attachment.name,'한글.3mf');assert.equal(await attachment.text(),'3mf-test-bytes');
  assert(!form.children.find(x=>x.name==='_subject').value.includes('\n'));
  assert(!form.children.some(x=>x.name==='_captcha'));
  message({source:r.source,origin:'null',data:payload});assert.equal(r.submissions,1);
});
test('mail form rejects non-3MF files and explains direct page visits',()=>{
  const r=receiver();r.events.get('message')({source:r.source,origin:'null',data:{type:'keyring-mail-file',file:new Blob(['data']),filename:'other.exe'}});
  assert.equal(r.submissions,0);assert.match(r.status.textContent,/3MF/);
  assert.match(receiver(false).status.textContent,/메일 보내기/);
});
test('editor pages parse and expose mail buttons after save',()=>{
  for(const filename of ['Free_Name_Keyring.html','Keyring_Name_Maker.html']) {
    const html=fs.readFileSync(path.join(root,filename),'utf8');
    for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(m[1].trim())new vm.Script(m[1]);
    assert(html.includes('id="sendMail"'));assert(html.indexOf('id="sendMail"')>html.indexOf('id="download"'));
    assert(html.includes('keyring-mail.js?v=mail-2'));
  }
});
