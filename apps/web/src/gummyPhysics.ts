/**
 * Gummy bear soft bodies: each bear is a handful of mass points held together by shape matching
 * (Müller et al. 2005) with a volume-preserving affine mode. Contacts with the floor, walls and other
 * bears are position constraints, so energy cannot pile up the way rigid-body impulses do.
 * Steps at a fixed 1/120 s. Pure TypeScript, no DOM, so it can be unit tested.
 */
export type V3=[number,number,number];
export const STEP=1/120;

/** Mass points in the bear's rest frame (soles at y=0, facing +z), for a bear `height` tall. */
export function bearPoints(height:number):Array<{at:V3;radius:number;mass:number}>{
  const s=height/1.15,p=(x:number,y:number,z:number,radius:number,mass:number)=>({at:[x*s,y*s,z*s] as V3,radius:radius*s,mass});
  return [
    p(-.15,.1,.02,.1,1.2),p(.15,.1,.02,.1,1.2),// feet
    p(0,.28,.04,.2,2),p(0,.5,0,.17,1.6),p(0,.45,-.13,.12,1),// belly, chest, back
    p(-.24,.47,.1,.08,.5),p(.24,.47,.1,.08,.5),// hands
    p(0,.8,0,.2,1.4),p(-.2,1.03,-.02,.07,.3),p(.2,1.03,-.02,.07,.3),p(0,.74,.19,.07,.3),// head, ears, snout
  ];
}

export interface BodyOptions{stiffness:number;affine:number;damping:number;bounce:number;friction:number}
export const DEFAULT_OPTIONS:BodyOptions={stiffness:.1,affine:.55,damping:1.4,bounce:.28,friction:.55};

type M3=Float64Array;// row-major 3x3
const m3=()=>new Float64Array(9);
function invert(m:M3,out:M3){
  const [a,b,c,d,e,f,g,h,i]=m as unknown as number[] as [number,number,number,number,number,number,number,number,number];
  const A=e*i-f*h,B=-(d*i-f*g),C=d*h-e*g,det=a*A+b*B+c*C||1e-12;
  out[0]=A/det;out[1]=-(b*i-c*h)/det;out[2]=(b*f-c*e)/det;out[3]=B/det;out[4]=(a*i-c*g)/det;out[5]=-(a*f-c*d)/det;out[6]=C/det;out[7]=-(a*h-b*g)/det;out[8]=(a*e-b*d)/det;return out;
}
const det3=(m:M3)=>m[0]!*(m[4]!*m[8]!-m[5]!*m[7]!)-m[1]!*(m[3]!*m[8]!-m[5]!*m[6]!)+m[2]!*(m[3]!*m[7]!-m[4]!*m[6]!);
function multiply(a:M3,b:M3,out:M3){for(let r=0;r<3;r++)for(let c=0;c<3;c++)out[r*3+c]=a[r*3]!*b[c]!+a[r*3+1]!*b[3+c]!+a[r*3+2]!*b[6+c]!;return out;}
function quatToMatrix(q:number[],out:M3){
  const [x,y,z,w]=q as [number,number,number,number];
  out[0]=1-2*(y*y+z*z);out[1]=2*(x*y-z*w);out[2]=2*(x*z+y*w);out[3]=2*(x*y+z*w);out[4]=1-2*(x*x+z*z);out[5]=2*(y*z-x*w);out[6]=2*(x*z-y*w);out[7]=2*(y*z+x*w);out[8]=1-2*(x*x+y*y);return out;
}
function quatMultiply(a:number[],b:number[]){const [ax,ay,az,aw]=a as [number,number,number,number],[bx,by,bz,bw]=b as [number,number,number,number];return [aw*bx+ax*bw+ay*bz-az*by,aw*by-ax*bz+ay*bw+az*bx,aw*bz+ax*by-ay*bx+az*bw,aw*bw-ax*bx-ay*by-az*bz];}
/** Rotation part of A by quaternion iteration (Müller et al. 2016), warm-started from q. */
function extractRotation(A:M3,q:number[],R:M3){
  for(let iteration=0;iteration<6;iteration++){
    quatToMatrix(q,R);
    let ox=0,oy=0,oz=0,dot=0;
    for(let c=0;c<3;c++){const rx=R[c]!,ry=R[3+c]!,rz=R[6+c]!,ax=A[c]!,ay=A[3+c]!,az=A[6+c]!;ox+=ry*az-rz*ay;oy+=rz*ax-rx*az;oz+=rx*ay-ry*ax;dot+=rx*ax+ry*ay+rz*az;}
    const scale=1/(Math.abs(dot)+1e-9);ox*=scale;oy*=scale;oz*=scale;const w=Math.hypot(ox,oy,oz);if(w<1e-9)break;
    const half=w/2,s=Math.sin(half)/w,next=quatMultiply([ox*s,oy*s,oz*s,Math.cos(half)],q),length=Math.hypot(...next)||1;
    for(let k=0;k<4;k++)q[k]=next[k]!/length;
  }
  return quatToMatrix(q,R);
}

export class GummyBody{
  readonly count:number;readonly rest:Float64Array;readonly radius:Float64Array;readonly mass:Float64Array;
  readonly x:Float64Array;readonly previous:Float64Array;readonly goal:Float64Array;
  /** Current shape transform (rest → world, without translation) and centre of mass. */
  readonly transform:M3=m3();readonly rotation:M3=m3();readonly center:V3=[0,0,0];
  readonly restCenter:V3=[0,0,0];private readonly qq:M3=m3();private readonly apq:M3=m3();private readonly a:M3=m3();
  private readonly quat=[0,0,0,1];
  grabbed=-1;readonly target:V3=[0,0,0];
  asleep=false;private stillTime=0;

  constructor(points:Array<{at:V3;radius:number;mass:number}>,public options:BodyOptions=DEFAULT_OPTIONS){
    this.count=points.length;this.rest=new Float64Array(this.count*3);this.radius=new Float64Array(this.count);this.mass=new Float64Array(this.count);
    let total=0;points.forEach((point,i)=>{this.mass[i]=point.mass;this.radius[i]=point.radius;total+=point.mass;for(let k=0;k<3;k++)this.restCenter[k]=this.restCenter[k]!+(point.at[k]!*point.mass);});
    for(let k=0;k<3;k++)this.restCenter[k]=this.restCenter[k]!/(total);
    points.forEach((point,i)=>{for(let k=0;k<3;k++)this.rest[i*3+k]=point.at[k]!-this.restCenter[k]!;});
    const aqq=m3();for(let i=0;i<this.count;i++)for(let r=0;r<3;r++)for(let c=0;c<3;c++)aqq[r*3+c]=aqq[r*3+c]!+(this.mass[i]!*this.rest[i*3+r]!*this.rest[i*3+c]!);
    invert(aqq,this.qq);
    this.x=new Float64Array(this.count*3);this.previous=new Float64Array(this.count*3);this.goal=new Float64Array(this.count*3);
    this.place([0,0,0],0);
  }

  /** Puts the bear with its soles at `at` (y = floor height), turned by `yaw`, at rest. */
  place(at:V3,yaw:number){
    const c=Math.cos(yaw),s=Math.sin(yaw);
    for(let i=0;i<this.count;i++){
      const rx=this.rest[i*3]!,ry=this.rest[i*3+1]!+this.restCenter[1]!,rz=this.rest[i*3+2]!;
      this.x[i*3]=at[0]+c*rx+s*rz;this.x[i*3+1]=at[1]+ry;this.x[i*3+2]=at[2]-s*rx+c*rz;
    }
    this.previous.set(this.x);this.quat.splice(0,4,0,Math.sin(yaw/2),0,Math.cos(yaw/2));this.asleep=false;this.stillTime=0;this.match(0);
  }

  /** Adds a velocity (units/s) to every point. */
  kick(v:V3){for(let i=0;i<this.count;i++)for(let k=0;k<3;k++)this.previous[i*3+k]=this.previous[i*3+k]!-(v[k]!*STEP);this.wake();}
  wake(){this.asleep=false;this.stillTime=0;}
  /** Falls asleep after 0.7 s without meaningful motion. */
  settle(h:number,moving:boolean){if(moving){this.stillTime=0;return;}this.stillTime+=h;if(this.stillTime>.7)this.asleep=true;}
  speed(i:number){return Math.hypot(this.x[i*3]!-this.previous[i*3]!,this.x[i*3+1]!-this.previous[i*3+1]!,this.x[i*3+2]!-this.previous[i*3+2]!)/STEP;}

  /** Shape matching: compute the best affine fit and pull points towards it by `strength`. */
  match(strength:number,upright=0){
    const {count,x,mass,rest,center,apq,a,transform,rotation,goal}=this;
    let total=0;center[0]=center[1]=center[2]=0;
    for(let i=0;i<count;i++){total+=mass[i]!;for(let k=0;k<3;k++)center[k]=center[k]!+(x[i*3+k]!*mass[i]!);}
    for(let k=0;k<3;k++)center[k]=center[k]!/(total);
    apq.fill(0);for(let i=0;i<count;i++)for(let r=0;r<3;r++){const p=x[i*3+r]!-center[r]!;for(let c=0;c<3;c++)apq[r*3+c]=apq[r*3+c]!+(mass[i]!*p*rest[i*3+c]!);}
    extractRotation(apq,this.quat,rotation);
    if(upright>0){// tip the goal a little towards standing up
      const ux=rotation[1]!,uy=rotation[4]!,uz=rotation[7]!,ax=-uz,az=ux,length=Math.hypot(ax,az);
      if(length>1e-4){const angle=Math.acos(Math.max(-1,Math.min(1,uy)))*upright,s=Math.sin(angle/2)/length,q=quatMultiply([ax*s,0,az*s,Math.cos(angle/2)],this.quat),n=Math.hypot(...q);for(let k=0;k<4;k++)this.quat[k]=q[k]!/n;quatToMatrix(this.quat,rotation);}
    }
    multiply(apq,this.qq,a);const d=det3(a);
    if(d>1e-6){const v=Math.cbrt(d);for(let k=0;k<9;k++)a[k]=a[k]!/(v);}else a.set(rotation);
    const beta=this.options.affine;for(let k=0;k<9;k++)transform[k]=beta*a[k]!+(1-beta)*rotation[k]!;
    for(let i=0;i<count;i++)for(let r=0;r<3;r++){
      const g=center[r]!+transform[r*3]!*rest[i*3]!+transform[r*3+1]!*rest[i*3+1]!+transform[r*3+2]!*rest[i*3+2]!;
      goal[i*3+r]=g;if(strength>0)x[i*3+r]=x[i*3+r]!+((g-x[i*3+r]!)*strength);
    }
  }
}

export interface Bounds{halfWidth:number;back:number;front:number;ceiling:number}

/** One fixed step for all bears. */
export function stepWorld(bodies:GummyBody[],bounds:Bounds,gravity=-11){
  const h=STEP;
  for(const body of bodies){
    if(body.asleep)continue;
    const {x,previous,count,options}=body,keep=Math.exp(-options.damping*h);
    for(let i=0;i<count;i++){
      for(let k=0;k<3;k++){let v=(x[i*3+k]!-previous[i*3+k]!)*keep;if(k===1)v+=gravity*h*h;previous[i*3+k]=x[i*3+k]!;x[i*3+k]=x[i*3+k]!+(v);}
    }
    if(body.grabbed>=0){const g=body.grabbed;for(let k=0;k<3;k++)x[g*3+k]=x[g*3+k]!+((body.target[k]!-x[g*3+k]!)*.5);
      // The rest of the bear is carried along too, so a fast drag stretches it without pulling a spike.
      const pull:V3=[body.target[0]-x[g*3]!,body.target[1]-x[g*3+1]!,body.target[2]-x[g*3+2]!];for(let i=0;i<count;i++)if(i!==g)for(let k=0;k<3;k++)x[i*3+k]=x[i*3+k]!+(pull[k]!*.06);}
    let low=Infinity;for(let i=0;i<count;i++)low=Math.min(low,x[i*3+1]!-body.radius[i]!);
    body.match(options.stiffness,body.grabbed<0&&low<.08?.12:0);
  }
  // Bear-bear contacts between point spheres, mass-weighted, half the overlap per step for softness.
  for(let a=0;a<bodies.length;a++)for(let b=a+1;b<bodies.length;b++){
    const A=bodies[a]!,B=bodies[b]!;if(A.asleep&&B.asleep)continue;
    if(Math.hypot(A.center[0]-B.center[0],A.center[1]-B.center[1],A.center[2]-B.center[2])>1.6)continue;
    for(let i=0;i<A.count;i++)for(let j=0;j<B.count;j++){
      const dx=B.x[j*3]!-A.x[i*3]!,dy=B.x[j*3+1]!-A.x[i*3+1]!,dz=B.x[j*3+2]!-A.x[i*3+2]!,d=Math.hypot(dx,dy,dz),min=A.radius[i]!+B.radius[j]!;
      if(d>=min||d<1e-6)continue;
      const push=(min-d)*.5/d,wa=B.mass[j]!/(A.mass[i]!+B.mass[j]!),wb=1-wa;
      A.x[i*3]=A.x[i*3]!-(dx*push*wa);A.x[i*3+1]=A.x[i*3+1]!-(dy*push*wa);A.x[i*3+2]=A.x[i*3+2]!-(dz*push*wa);B.x[j*3]=B.x[j*3]!+(dx*push*wb);B.x[j*3+1]=B.x[j*3+1]!+(dy*push*wb);B.x[j*3+2]=B.x[j*3+2]!+(dz*push*wb);
      if(A.asleep)A.wake();if(B.asleep)B.wake();
    }
  }
  for(const body of bodies){
    if(body.asleep)continue;
    const {x,previous,count,radius,options}=body;let fastest=0;
    for(let i=0;i<count;i++){
      const r=radius[i]!,o=i*3;
      if(x[o+1]!<r){// floor: no penetration, a little bounce, friction on the slide
        const vy=(x[o+1]!-previous[o+1]!)/h;x[o+1]=r;
        previous[o+1]=vy< -1.6?r+vy*options.bounce*h:r;
        previous[o]=previous[o]!+(x[o]!-previous[o]!)*options.friction;previous[o+2]=previous[o+2]!+(x[o+2]!-previous[o+2]!)*options.friction;
      }
      if(x[o+1]!>bounds.ceiling-r){x[o+1]=bounds.ceiling-r;previous[o+1]=x[o+1]!;}
      if(x[o]!< -bounds.halfWidth+r){x[o]=-bounds.halfWidth+r;previous[o]=x[o]!;}
      if(x[o]!>bounds.halfWidth-r){x[o]=bounds.halfWidth-r;previous[o]=x[o]!;}
      if(x[o+2]!<bounds.back+r){x[o+2]=bounds.back+r;previous[o+2]=x[o+2]!;}
      if(x[o+2]!>bounds.front-r){x[o+2]=bounds.front-r;previous[o+2]=x[o+2]!;}
      // Speed cap keeps a hard throw from tunnelling or starting a pile-up.
      const vx=x[o]!-previous[o]!,vy=x[o+1]!-previous[o+1]!,vz=x[o+2]!-previous[o+2]!,v=Math.hypot(vx,vy,vz)/h;
      if(v>10){const s=10/v;previous[o]=x[o]!-vx*s;previous[o+1]=x[o+1]!-vy*s;previous[o+2]=x[o+2]!-vz*s;}
      fastest=Math.max(fastest,Math.min(v,10));
    }
    body.settle(h,body.grabbed>=0||fastest>=.06);
  }
}
