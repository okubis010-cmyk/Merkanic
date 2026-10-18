import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const routes=new Map();
const hooks=new Map();
class ForbiddenError extends Error{}; class BadRequestError extends Error{};
vm.runInNewContext(fs.readFileSync(new URL('apps/pocketbase/pb_hooks/parts-order-email.pb.js',import.meta.url),'utf8'),{routerAdd:(method,path,handler,...middleware)=>routes.set(method+' '+path,{handler,middleware}),onRecordAfterCreateSuccess:()=>{},onRecordCreateRequest:(handler,collection)=>hooks.set('create:'+collection,handler),onRecordAuthRequest:(handler,collection)=>hooks.set('auth:'+collection,handler),onBootstrap:()=>{},$apis:{requireAuth:(...collections)=>({auth:collections}),bodyLimit:limit=>({limit})},ForbiddenError,BadRequestError});
const note=routes.get('POST /api/merkanic/work-orders/{id}/notes'),update=routes.get('PATCH /api/merkanic/work-orders/{id}');
test('new registrations stay pending and cannot authenticate until approved',()=>{
 const values={role:'beheerder',status:'active'};let continued=false;
 const record={set:(key,value)=>{values[key]=value},getString:key=>values[key]};
 hooks.get('create:users')({record,next:()=>{continued=true}});
 assert.equal(continued,true);assert.equal(values.role,'klant');assert.equal(values.status,'pending');
 assert.throws(()=>hooks.get('auth:users')({record,next:()=>{}}),ForbiddenError);
 values.status='active';continued=false;hooks.get('auth:users')({record,next:()=>{continued=true}});assert.equal(continued,true);
});
test('only an active beheerder can read applicant email addresses',()=>{
 const route=routes.get('GET /api/merkanic/admin/users');
 const accounts=[{id:'one',getString:key=>({name:'Aanvrager',email:'aanvrager@example.test',role:'klant',status:'pending'})[key]}];
 const fixture=(role,status)=>({auth:{getString:key=>key==='role'?role:status},app:{findAllRecords:()=>accounts},json:(code,body)=>({code,body})});
 assert.throws(()=>route.handler(fixture('klant','active')),ForbiddenError);
 assert.throws(()=>route.handler(fixture('beheerder','pending')),ForbiddenError);
 const result=route.handler(fixture('beheerder','active'));
 assert.equal(result.code,200);
 assert.equal(result.body.users[0].email,'aanvrager@example.test');
});
function fixture(role='monteur',id='assigned',status='Bezig'){
 const values={mechanic:'assigned',status,remarks:'Oorspronkelijke werkzaamheden'};let saves=0;
 const order={id:'order1',getString:k=>String(values[k]??''),set:(k,v)=>{values[k]=v}};
 const e={auth:{id,getString:k=>k==='role'?role:'Monteur'},request:{pathValue:()=>order.id},requestInfo:()=>({body:{note:'Filter vervangen'}}),app:{runInTransaction:fn=>fn({findRecordById:()=>order,save:()=>{saves++}})},json:(status,body)=>({status,body})};
 return {e,values,saves:()=>saves};
}
test('routes require user authentication and bounded request bodies',()=>{for(const r of [note,update]){assert.deepEqual(Array.from(r.middleware[0].auth),['users']);assert.equal(r.middleware[1].limit,16384)}});
test('note appends timestamp and author while preserving work',()=>{const f=fixture();const r=note.handler(f.e);assert.equal(r.status,200);assert.match(r.body.remarks,/^Oorspronkelijke werkzaamheden\n\n\[\d{4}-.* · Monteur\]\nFilter vervangen$/);assert.equal(f.saves(),1)});
test('customer, other mechanic and completed order cannot add notes',()=>{for(const args of [['klant','assigned','Bezig'],['monteur','other','Bezig'],['monteur','assigned','Gereed']]){const f=fixture(...args);assert.throws(()=>note.handler(f.e),ForbiddenError);assert.equal(f.saves(),0)}});
test('assigned mechanic can start planned work',()=>{const f=fixture('monteur','assigned','Gepland');f.e.requestInfo=()=>({body:{status:'Bezig'}});update.handler(f.e);assert.equal(f.values.status,'Bezig');assert.equal(f.saves(),1)});
test('mechanic cannot reassign, edit another order or overwrite notes',()=>{for(const [id,body] of [['assigned',{mechanic:'other'}],['other',{status:'Bezig'}],['assigned',{remarks:'overwrite'}]]){const f=fixture('monteur',id);f.e.requestInfo=()=>({body});assert.throws(()=>update.handler(f.e));assert.equal(f.saves(),0)}});
test('administrator can reopen completed work; invalid status is rejected',()=>{const f=fixture('beheerder','admin','Gereed');f.e.requestInfo=()=>({body:{status:'Bezig'}});update.handler(f.e);assert.equal(f.values.status,'Bezig');f.e.requestInfo=()=>({body:{status:'unknown'}});assert.throws(()=>update.handler(f.e),BadRequestError)});
test('assigned mechanic can save checklist progress and cannot edit completed work',()=>{
 const tasks=[{id:'task-1',label:'Motorolie verversen',done:true,form:'Kleine beurt',note:''}];
 const active=fixture('monteur','assigned','Bezig');active.e.requestInfo=()=>({body:{checklist:tasks}});update.handler(active.e);
 assert.equal(active.values.checklist[0].done,true);
 const completed=fixture('monteur','assigned','Gereed');completed.e.requestInfo=()=>({body:{checklist:tasks}});
 assert.throws(()=>update.handler(completed.e),ForbiddenError);
});
test('malformed checklist is rejected before saving',()=>{
 const f=fixture('beheerder','admin','Bezig');f.e.requestInfo=()=>({body:{checklist:[{id:'a',label:'',done:'yes',form:'APK'}]}});
 assert.throws(()=>update.handler(f.e),BadRequestError);assert.equal(f.saves(),0);
});

