import {describe,expect,it} from 'vitest';
import {GummyBody,bearPoints,stepWorld,STEP} from './gummyPhysics.js';

const bounds={halfWidth:2.4,back:-1.2,front:1.4,ceiling:4.2};
const drop=(count:number)=>Array.from({length:count},(_,index)=>{const body=new GummyBody(bearPoints(1.15));body.place([(index-(count-1)/2)*.66,.9+index*.45,index%2?-.25:.2],index%2?-.4:.4);return body;});
const finite=(body:GummyBody)=>Array.from(body.x).every(Number.isFinite);

describe('gummy soft bodies',()=>{
  it('drops a pile of bears that settles upright, in bounds and asleep',()=>{
    const bodies=drop(6);for(let step=0;step<Math.round(12/STEP);step++)stepWorld(bodies,bounds);
    for(const body of bodies){
      expect(finite(body)).toBe(true);
      expect(body.asleep).toBe(true);
      expect(body.rotation[4]).toBeGreaterThan(.8);// local up stays near world up
      for(let i=0;i<body.count;i++){expect(Math.abs(body.x[i*3]!)).toBeLessThanOrEqual(bounds.halfWidth);expect(body.x[i*3+1]!).toBeGreaterThanOrEqual(body.radius[i]!-1e-9);}
    }
  });
  it('loses energy after repeated hops instead of amplifying it',()=>{
    const bodies=drop(6);for(let step=0;step<Math.round(4/STEP);step++)stepWorld(bodies,bounds);
    for(const body of bodies)body.kick([0,3.6,0]);
    const fastest=()=>Math.max(...bodies.flatMap(body=>Array.from({length:body.count},(_,i)=>body.speed(i))));
    for(let step=0;step<Math.round(1/STEP);step++)stepWorld(bodies,bounds);
    const afterOne=fastest();for(let step=0;step<Math.round(3/STEP);step++)stepWorld(bodies,bounds);
    expect(fastest()).toBeLessThan(Math.max(.2,afterOne));
    expect(bodies.every(finite)).toBe(true);
  });
  it('stretches towards a grabbed point and recovers its shape when released',()=>{
    const [body]=drop(1) as [GummyBody];for(let step=0;step<240;step++)stepWorld([body],bounds);
    const head=7,span=()=>body.x[head*3+1]!-body.x[1]!,rest=span(),restHeight=body.x[head*3+1]!;body.grabbed=head;body.target.splice(0,3,body.x[head*3]!,restHeight+.6,body.x[head*3+2]!);
    let stretched=0;for(let step=0;step<30;step++){stepWorld([body],bounds);stretched=Math.max(stretched,span());}
    body.grabbed=-1;
    for(let step=0;step<Math.round(5/STEP);step++)stepWorld([body],bounds);
    expect(stretched).toBeGreaterThan(rest*1.08);expect(Math.abs(span()-rest)).toBeLessThan(rest*.08);expect(finite(body)).toBe(true);expect(body.rotation[4]).toBeGreaterThan(.8);
  });
});
