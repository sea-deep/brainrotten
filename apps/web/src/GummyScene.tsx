import React,{useCallback,useEffect,useRef,useState} from 'react';
import type {BufferAttribute,BufferGeometry,Mesh,MeshPhysicalMaterial,MeshStandardMaterial,NormalBufferAttributes} from 'three';
import {GummyBody,bearPoints,stepWorld,type Bounds,type V3} from './gummyPhysics.js';

/**
 * Hero toy: translucent gummy bears (CC0 Grab3D model) you can grab, stretch, squash, throw and tap to hop.
 * Each bear is a shape-matching soft body (gummyPhysics.ts) stepped by Squishy Lab's fixed 120 Hz clock;
 * the mesh is skinned to the body's mass points so heads lag, bodies squash and everything wobbles back.
 */
const PAUSE_KEY='brainrotten.gummies.paused';
const COLORS=['#f08f74','#a58bd8','#f1c45a','#e98fae','#9b7fe0','#f6a96f'];
const HEIGHT=1.15;
const readPaused=()=>{try{return localStorage.getItem(PAUSE_KEY);}catch{return null;}};
const writePaused=(value:boolean)=>{try{localStorage.setItem(PAUSE_KEY,value?'1':'0');}catch{/* private mode */}};

export function GummyScene():React.ReactElement{
  const host=useRef<HTMLDivElement>(null),controls=useRef<{setPaused:(paused:boolean)=>void}|null>(null);
  const[ready,setReady]=useState(false);
  const[paused,setPausedState]=useState(()=>{
    const stored=readPaused();if(stored!==null)return stored==='1';
    return typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  const pausedRef=useRef(paused);
  const toggle=useCallback(()=>{const next=!pausedRef.current;pausedRef.current=next;setPausedState(next);writePaused(next);controls.current?.setPaused(next);},[]);

  useEffect(()=>{
    const element=host.current;if(!element)return;
    let disposed=false,cleanup:()=>void=()=>{};
    void (async()=>{
      const [T,{GLTFLoader},{RoomEnvironment},{FixedClock}]=await Promise.all([
        import('three'),import('three/addons/loaders/GLTFLoader.js'),import('three/addons/environments/RoomEnvironment.js'),import('./vendor/squishy-lab/physics/solver.js'),
      ]);
      const gltf=await new GLTFLoader().loadAsync('/models/gummy-bear.glb');
      if(disposed)return;
      let renderer:InstanceType<typeof T.WebGLRenderer>;
      try{renderer=new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});}catch{return;}
      const canvas=renderer.domElement;canvas.tabIndex=0;canvas.setAttribute('role','img');
      canvas.setAttribute('aria-label','Interactive gummy bears. Drag a bear to stretch and throw it; tap one to make it hop. Press Space to make them all hop, Escape to reset.');
      renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));(renderer as unknown as {transmissionResolutionScale:number}).transmissionResolutionScale=.5;// half-res refraction passrenderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
      element.append(canvas);
      const scene=new T.Scene();scene.background=new T.Color('#faf5ee');
      const camera=new T.PerspectiveCamera(36,1,.1,40);camera.position.set(0,2.5,6.2);camera.lookAt(0,.75,0);
      const room=new RoomEnvironment(),generator=new T.PMREMGenerator(renderer),environment=generator.fromScene(room,.04);scene.environment=environment.texture;room.dispose();generator.dispose();
      scene.add(new T.HemisphereLight('#fff9f1','#cbb6e2',1));
      const key=new T.DirectionalLight('#fff7ec',2.5);key.position.set(-3.5,6,3);scene.add(key);
      const rim=new T.DirectionalLight('#ffe9f2',1.4);rim.position.set(2.5,3,-4);scene.add(rim);// back light makes the candy glow at the edges

      // Source mesh, scaled so the soles sit at y=0 and the bear is HEIGHT tall.
      let source:Mesh|undefined;gltf.scene.traverse(node=>{if(!source&&(node as Mesh).isMesh)source=node as Mesh;});
      if(!source)return;
      const base=source.geometry.clone() as BufferGeometry<NormalBufferAttributes>;base.computeBoundingBox();
      const box=base.boundingBox!,size=box.getSize(new T.Vector3()),scale=HEIGHT/size.y;
      base.translate(-(box.min.x+box.max.x)/2,-box.min.y,-(box.min.z+box.max.z)/2);base.scale(scale,scale,scale);
      const restPosition=((base.getAttribute('position') as BufferAttribute).array as Float32Array).slice(),restNormal=((base.getAttribute('normal') as BufferAttribute).array as Float32Array).slice();
      const vertexCount=restPosition.length/3,normalMap=(source.material as MeshStandardMaterial).normalMap??null;

      // Skin weights: each vertex follows its four nearest mass points (Gaussian falloff).
      const points=bearPoints(HEIGHT),probe=new GummyBody(points),K=4;
      const skinIndex=new Uint8Array(vertexCount*K),skinWeight=new Float32Array(vertexCount*K),local=new Float32Array(vertexCount*3);
      for(let v=0;v<vertexCount;v++){
        const px=restPosition[v*3]!,py=restPosition[v*3+1]!,pz=restPosition[v*3+2]!;
        for(let k=0;k<3;k++)local[v*3+k]=restPosition[v*3+k]!-probe.restCenter[k]!;
        const near=points.map((point,i)=>({i,d:Math.hypot(px-point.at[0],py-point.at[1],pz-point.at[2])})).sort((a,b)=>a.d-b.d).slice(0,K);
        let total=0;near.forEach((entry,k)=>{const w=Math.exp(-((entry.d/.16)**2))+1e-4;skinIndex[v*K+k]=entry.i;skinWeight[v*K+k]=w;total+=w;});
        for(let k=0;k<K;k++)skinWeight[v*K+k]=skinWeight[v*K+k]!/total;
      }

      const count=element.clientWidth<520||(navigator.hardwareConcurrency??8)<=4?4:6;
      interface Bear{body:GummyBody;geometry:BufferGeometry<NormalBufferAttributes>;material:MeshPhysicalMaterial;position:Float32Array;normal:Float32Array;home:V3;yaw:number;drawn:boolean;mesh:Mesh}
      const bears:Bear[]=[];
      for(let index=0;index<count;index++){
        const color=COLORS[index%COLORS.length]!;
        const material=new T.MeshPhysicalMaterial({color,roughness:.14,metalness:0,transmission:.7,thickness:.85,ior:1.45,clearcoat:1,clearcoatRoughness:.06,attenuationColor:color,attenuationDistance:.55,normalMap,normalScale:new T.Vector2(.5,.5),envMapIntensity:1.1});
        const geometry=base.clone() as BufferGeometry<NormalBufferAttributes>,mesh=new T.Mesh(geometry,material);mesh.frustumCulled=false;scene.add(mesh);
        geometry.boundingSphere=new T.Sphere(new T.Vector3(),HEIGHT*.75);
        const spread=(index-(count-1)/2)*(count>4?.66:.85),home:V3=[spread,.9+index*.45,index%2?-.25:.2],yaw=(index%2?-.4:.4)+(index-count/2)*.05;
        const body=new GummyBody(points);body.place(home,yaw);
        const bear:Bear={body,mesh,geometry,material,position:(geometry.getAttribute('position') as BufferAttribute).array as Float32Array,normal:(geometry.getAttribute('normal') as BufferAttribute).array as Float32Array,home,yaw,drawn:false};
        mesh.userData['bear']=bear;bears.push(bear);
      }
      const bodies=bears.map(bear=>bear.body);

      // Mesh = shape-matched pose + each mass point's own lag (that residual is the jiggle).
      const residual=new Float64Array(points.length*3);
      const skin=(bear:Bear)=>{
        const {body,position,normal}=bear,M=body.transform,R=body.rotation,c=body.center;
        for(let i=0;i<body.count*3;i++)residual[i]=body.x[i]!-body.goal[i]!;
        for(let v=0;v<vertexCount;v++){
          const lx=local[v*3]!,ly=local[v*3+1]!,lz=local[v*3+2]!;let dx=0,dy=0,dz=0;
          for(let k=0;k<K;k++){const i=skinIndex[v*K+k]!*3,w=skinWeight[v*K+k]!;dx+=residual[i]!*w;dy+=residual[i+1]!*w;dz+=residual[i+2]!*w;}
          position[v*3]=c[0]+M[0]!*lx+M[1]!*ly+M[2]!*lz+dx;position[v*3+1]=c[1]+M[3]!*lx+M[4]!*ly+M[5]!*lz+dy;position[v*3+2]=c[2]+M[6]!*lx+M[7]!*ly+M[8]!*lz+dz;
          const nx=restNormal[v*3]!,ny=restNormal[v*3+1]!,nz=restNormal[v*3+2]!;
          normal[v*3]=R[0]!*nx+R[1]!*ny+R[2]!*nz;normal[v*3+1]=R[3]!*nx+R[4]!*ny+R[5]!*nz;normal[v*3+2]=R[6]!*nx+R[7]!*ny+R[8]!*nz;
        }
        bear.geometry.getAttribute('position').needsUpdate=true;bear.geometry.getAttribute('normal').needsUpdate=true;
        bear.geometry.boundingSphere!.center.set(c[0],c[1],c[2]);
      };

      const bounds:Bounds={halfWidth:2,back:-1.2,front:1.4,ceiling:4.2};
      const ray=new T.Raycaster(),pointer=new T.Vector2(),plane=new T.Plane(),hit=new T.Vector3();
      let grabbed:{bear:Bear;pointerId:number;startX:number;startY:number;startTime:number;moved:boolean}|null=null;
      const projected=new T.Vector3();
      const pick=(x:number,y:number)=>{
        const rect=canvas.getBoundingClientRect();pointer.set((x-rect.left)/rect.width*2-1,1-(y-rect.top)/rect.height*2);ray.setFromCamera(pointer,camera);
        const direct=ray.intersectObjects(bears.map(bear=>bear.mesh),false)[0];if(direct)return {object:direct.object,point:direct.point};
        // Forgiving grab: the nearest mass point within ~28px on screen also counts.
        let best:{object:Mesh;point:InstanceType<typeof T.Vector3>}|null=null,closest=28;
        for(const bear of bears)for(let i=0;i<bear.body.count;i++){projected.set(bear.body.x[i*3]!,bear.body.x[i*3+1]!,bear.body.x[i*3+2]!).project(camera);
          const d=Math.hypot((projected.x-pointer.x)*rect.width/2,(projected.y-pointer.y)*rect.height/2);if(d<closest){closest=d;best={object:bear.mesh,point:new T.Vector3(bear.body.x[i*3]!,bear.body.x[i*3+1]!,bear.body.x[i*3+2]!)};}}
        return best;
      };
      const hop=(bear:Bear,strength=1)=>bear.body.kick([(Math.random()-.5)*.9*strength,4.3*strength,(Math.random()-.5)*.6*strength]);
      const drop=()=>{if(!grabbed)return;document.documentElement.classList.remove('is-dragging-gummy');const {bear,pointerId}=grabbed;bear.body.grabbed=-1;if(canvas.hasPointerCapture(pointerId))canvas.releasePointerCapture(pointerId);grabbed=null;canvas.style.cursor='';wake();};
      const down=(event:PointerEvent)=>{
        if(paused||grabbed||event.button!==0)return;const found=pick(event.clientX,event.clientY);const bear=found?.object.userData['bear'] as Bear|undefined;if(!found||!bear)return;
        // Mouse drags keep their default so `mousemove` (and the site cursor) still fire; touch needs it to stop scrolling.
        if(event.pointerType!=='mouse')event.preventDefault();canvas.setPointerCapture(event.pointerId);document.documentElement.classList.add('is-dragging-gummy');
        let nearest=0,best=Infinity;for(let i=0;i<bear.body.count;i++){const d=Math.hypot(bear.body.x[i*3]!-found.point.x,bear.body.x[i*3+1]!-found.point.y,bear.body.x[i*3+2]!-found.point.z)-bear.body.radius[i]!;if(d<best){best=d;nearest=i;}}
        plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new T.Vector3()).negate(),found.point);
        bear.body.grabbed=nearest;bear.body.target.splice(0,3,bear.body.x[nearest*3]!,bear.body.x[nearest*3+1]!,bear.body.x[nearest*3+2]!);bear.body.wake();
        grabbed={bear,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,startTime:performance.now(),moved:false};canvas.style.cursor='grabbing';wake();
      };
      let lastHover=0;
      const move=(event:PointerEvent)=>{
        if(grabbed&&event.pointerId===grabbed.pointerId){
          if(Math.hypot(event.clientX-grabbed.startX,event.clientY-grabbed.startY)>4)grabbed.moved=true;
          const rect=canvas.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2);ray.setFromCamera(pointer,camera);
          if(ray.ray.intersectPlane(plane,hit))grabbed.bear.body.target.splice(0,3,Math.max(-bounds.halfWidth+.2,Math.min(bounds.halfWidth-.2,hit.x)),Math.max(.05,Math.min(3.6,hit.y)),Math.max(-1,Math.min(1.2,hit.z)));
          wake();return;
        }
        if(event.pointerType==='mouse'&&!paused&&event.timeStamp-lastHover>70){lastHover=event.timeStamp;canvas.style.cursor=pick(event.clientX,event.clientY)?'grab':'';}
      };
      const up=(event:PointerEvent)=>{if(!grabbed||event.pointerId!==grabbed.pointerId)return;const tapped=!grabbed.moved&&performance.now()-grabbed.startTime<320,bear=grabbed.bear;drop();if(tapped&&event.type==='pointerup'){hop(bear);wake();}};
      const reset=()=>{drop();for(const bear of bears)bear.body.place(bear.home,bear.yaw);wake();};
      const keydown=(event:KeyboardEvent)=>{
        if(paused)return;
        if((event.code==='Space'||event.code==='Enter')&&!event.repeat){event.preventDefault();bears.forEach((bear,index)=>setTimeout(()=>{if(!disposed){hop(bear,.85+Math.random()*.2);wake();}},index*90));}
        if(event.code==='Escape')reset();
      };
      const touch=(event:TouchEvent)=>{if(grabbed&&event.cancelable)event.preventDefault();};
      canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);
      for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,up as EventListener);
      canvas.addEventListener('keydown',keydown);canvas.addEventListener('blur',drop);canvas.addEventListener('touchstart',touch,{passive:false});

      const clock=new FixedClock(),reduced=matchMedia('(prefers-reduced-motion: reduce)');
      let frame=0,previous=0,visible=true,paused=pausedRef.current,idle:ReturnType<typeof setTimeout>|undefined;
      const running=()=>!disposed&&visible&&!paused&&!document.hidden;
      const render=()=>{for(const bear of bears)if(!bear.drawn){skin(bear);bear.drawn=true;}renderer.render(scene,camera);};
      const scheduleIdle=()=>{clearTimeout(idle);if(!running()||reduced.matches)return;idle=setTimeout(()=>{if(running()&&!grabbed){const resting=bears.filter(bear=>bear.body.asleep),bear=resting[Math.floor(Math.random()*resting.length)];if(bear){hop(bear,.55);wake();}}scheduleIdle();},6000+Math.random()*4000);};
      const draw=(time:number)=>{
        frame=0;if(!running())return;
        const elapsed=previous?Math.min((time-previous)/1000,.05):1/60;previous=time;
        clock.advance(elapsed,()=>stepWorld(bodies,bounds));
        for(const bear of bears)if(!bear.body.asleep)bear.drawn=false;
        render();
        if(!grabbed&&bodies.every(body=>body.asleep)){previous=0;canvas.dataset['motion']='still';}else frame=requestAnimationFrame(draw);
      };
      function wake(){canvas.dataset['motion']='live';if(!frame&&running()){previous=0;frame=requestAnimationFrame(draw);}}
      const stop=()=>{cancelAnimationFrame(frame);frame=0;clock.pause();previous=0;clearTimeout(idle);};
      controls.current={setPaused:value=>{paused=value;element.dataset['paused']=value?'true':'false';if(value){drop();stop();render();}else{wake();scheduleIdle();}}};

      const resize=()=>{if(disposed)return;const {width,height}=element.getBoundingClientRect();if(!width||!height)return;renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();
        bounds.halfWidth=Math.max(1.2,Math.tan(T.MathUtils.degToRad(camera.fov/2))*camera.position.z*camera.aspect*.9-.2);for(const body of bodies)body.wake();
        if(paused)render();else wake();};
      const sized=new ResizeObserver(resize);sized.observe(element);
      const observer=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??false;if(visible){wake();scheduleIdle();}else{drop();stop();}},{threshold:0});observer.observe(element);
      const visibility=()=>{if(document.hidden){drop();stop();}else{wake();scheduleIdle();}};document.addEventListener('visibilitychange',visibility);
      const preference=()=>{if(reduced.matches)clearTimeout(idle);else scheduleIdle();};reduced.addEventListener('change',preference);
      cleanup=()=>{stop();observer.disconnect();sized.disconnect();document.removeEventListener('visibilitychange',visibility);reduced.removeEventListener('change',preference);
        canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.removeEventListener(name,up as EventListener);
        canvas.removeEventListener('keydown',keydown);canvas.removeEventListener('blur',drop);canvas.removeEventListener('touchstart',touch);
        for(const bear of bears){bear.geometry.dispose();bear.material.dispose();}base.dispose();normalMap?.dispose();environment.dispose();renderer.dispose();canvas.remove();controls.current=null;document.documentElement.classList.remove('is-dragging-gummy');};
      resize();element.dataset['paused']=paused?'true':'false';
      if(paused){for(let step=0;step<600;step++)stepWorld(bodies,bounds);render();}// settle once so a paused visit shows bears on the floor
      else{wake();scheduleIdle();}
      setReady(true);
    })().catch(error=>{/* The poster stays visible if WebGL or the model is unavailable. */if(import.meta.env.DEV)console.error(error);});
    return()=>{disposed=true;cleanup();};
  },[]);

  return <div className={`primitive-stage gummy-stage${ready?' is-ready':''}`}>
    <img className="primitive-fallback" src="/models/gummy-preview.webp" alt="Translucent gummy bears in coral, lavender, yellow and pink" width="824" height="737"/>
    <div ref={host} className="primitive-canvas"/>
    <p className="gummy-hint" aria-hidden="true">Grab · stretch · throw · tap to hop</p>
    <button type="button" className="gummy-pause" aria-pressed={paused} onClick={toggle} aria-label={paused?'Resume gummy bear animation':'Pause gummy bear animation'}>
      {paused?<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3.5 2.2v9.6L11.5 7Z" fill="currentColor"/></svg>:<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3.5 2.5h2.4v9H3.5zm4.6 0h2.4v9H8.1z" fill="currentColor"/></svg>}
      <span>{paused?'Resume':'Pause'}</span>
    </button>
  </div>;
}
