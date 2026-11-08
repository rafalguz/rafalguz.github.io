'use strict';
const assert=require('node:assert/strict');
const comfort=require('./sisu-centrum/tv_comfort');
const baseStates=[
 ['switch.qs_zigbee_sec01_single_gang_4_switch_1','off'],
 ['switch.qs_zigbee_sec01_single_gang_3_switch_1','off'],
 ['switch.qs_zigbee_sec01_single_gang_2_switch_1','off'],
 ['switch.qs_zigbee_sec01_single_gang_switch_1','off'],
 ['switch.1_gang_touch_switch_switch','off'],
 ['climate.401_apartament','off'],
 ['climate.zg253_trv_2','heat_cool'],['climate.zg253_trv_3','heat_cool'],
 ['climate.zg253_trv','heat_cool'],
 ...['binary_sensor.contact_sensor_drzwi','binary_sensor.contact_sensor_2_drzwi','binary_sensor.contact_sensor_3_drzwi','binary_sensor.contact_sensor_4_drzwi','binary_sensor.contact_sensor_5_drzwi'].map(x=>[x,'off'])
];
let states=baseStates.map(([entity_id,state])=>({entity_id,state,attributes:{temperature:23,current_temperature:18,fan_mode:'auto'}}));
let calls=[];
const api=async(path,method,body)=>{
 if(path==='/states')return states;
 if(path.startsWith('/services/')){calls.push({path,body});return [];}
 throw Error('Unexpected HA API request '+path);
};
const service=comfort({
 haApi:api,send:(res,status,data)=>{res.status=status;res.body=data},
 jsonBody:async req=>req.body,
 resolveDevice:req=>req.device||null,
 audit:()=>{}
});
async function request(method,body,device={id:'pilot401',mode:'room',room:401}){
 const req={method,body,device},res={};
 try{await service.handle(req,res,'/api/tv/comfort')}
 catch(e){res.status=e.status||500;res.body={error:e.message}}
 return res;
}
async function run(){
 assert.equal((await request('GET',null,null)).status,401,'unpaired must reject');
 assert.equal((await request('GET',null,{mode:'demo',room:401})).status,403,'demo must reject');
 assert.equal((await request('GET',null,{mode:'room',room:402})).status,403,'other room must reject');
 const view=await request('GET',null);
 assert.equal(view.status,200);
 assert.equal(Object.keys(view.body.lights).length,5);
 assert.equal(Object.keys(view.body.climate).length,4);
 assert.equal(view.body.windows.acBlocked,false);
 assert.equal((await request('POST',{kind:'light',zone:'sypialnia',value:'on'})).status,200);
 assert.equal(calls.at(-1).path,'/services/switch/turn_on');
 assert.equal(calls.at(-1).body.entity_id,'switch.1_gang_touch_switch_switch');
 assert.equal((await request('POST',{kind:'light',zone:'salon',value:'toggle'})).status,400);
 assert.equal((await request('POST',{kind:'target',zone:'ac',value:28})).status,400);
 assert.equal((await request('POST',{kind:'target',zone:'salon',value:22.3})).status,400);
 assert.equal((await request('POST',{kind:'target',zone:'salon',value:22.5})).status,200);
 assert.equal(calls.at(-1).body.temperature,22.5);
 states=states.map(s=>s.entity_id==='binary_sensor.contact_sensor_3_drzwi'?{...s,state:'on'}:s);
 assert.equal((await request('GET',null)).body.windows.acBlocked,true);
 assert.equal((await request('POST',{kind:'mode',zone:'ac',value:'heat'})).status,409);
 assert.equal((await request('POST',{kind:'target',zone:'ac',value:23})).status,409);
 assert.equal((await request('POST',{kind:'mode',zone:'ac',value:'off'})).status,200,'stop AC permitted with open window');
 assert.equal((await request('POST',{kind:'target',zone:'sypialnia',value:22})).status,409);
 assert.equal((await request('POST',{kind:'target',zone:'salon',value:22})).status,200,'salon may change when bedroom open');
 states=states.map(s=>s.entity_id==='binary_sensor.contact_sensor_3_drzwi'?{...s,state:'off'}:s);
 assert.equal((await request('POST',{kind:'mode',zone:'ac',value:'cool'})).status,200);
 assert.equal((await request('POST',{kind:'fan',zone:'ac',value:'auto'})).status,200);
 assert.equal(calls.at(-1).path,'/services/climate/set_fan_mode');
 states=states.filter(s=>s.entity_id!=='binary_sensor.contact_sensor_4_drzwi');
 assert.equal((await request('POST',{kind:'mode',zone:'ac',value:'heat'})).status,409,'sensor unavailable must fail closed');
 console.log('PASS: 19 security/functionality tests and room-scoped commands');
}
run().catch(e=>{console.error(e);process.exitCode=1});
