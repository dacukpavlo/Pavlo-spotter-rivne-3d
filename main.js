/* СПОТЕР РІВНЕ 3D — self-contained WebGL city transit simulator; no libraries or accounts needed. */
'use strict';
const $=id=>document.getElementById(id);
const STOP_NAMES={
  trolley:[
    'м/н Північний','вул. Коновальця','вул. Романа Шухевича','ТЦ «Чайка»',
    'Дитяча поліклініка','бул. Богдана Хмельницького','ТЦ «Політон» (школа №12)',
    'Кооперативний коледж','Майдан Незалежності','Театральна','Пивзавод',
    'Аграрний коледж','Меморіал Слави','Боярка'
  ],
  bus:[
    'вул. Коновальця','вул. Коновальця (Мазда)','вул. Коновальця',
    'вул. Романа Шухевича','ТЦ «Чайка»','Дитяча поліклініка',
    'бул. Богдана Хмельницького','Школа №12','вул. Марка Вовчка',
    'Автотранспортний коледж','Майдан Міст-героїв України','Міська лікарня',
    'Медичний коледж','Водна станція','Святотроїцька церква',
    'Магазин','вул. Залізнична','вул. Поліська','вул. Дворецька',
    'Магазин будматеріалів','РБУ-4','Агроресурс'
  ]
};
const STEP=151;
const PALETTE={asphalt:[.235,.273,.309],grass:[.29,.40,.29],concrete:[.64,.655,.63],cream:[.91,.89,.83],blue:[.09,.23,.56],yellow:[.98,.71,.075],black:[.055,.075,.097],glass:[.13,.27,.37],sky:[.53,.71,.88]};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const mix=(a,b,t)=>a+(b-a)*t;
const routeX=z=>52*Math.sin(z/255)+21*Math.sin(z/112)+10*Math.sin(z/680);
const rand=(seed)=>{let s=seed;return()=>((s=(1664525*s+1013904223)>>>0)/4294967296)};

/* Untextured, face-shaded triangle mesh builder. Geometry is REAL 3D/WebGL. */
class Geometry {
  constructor(){this.p=[];this.c=[];}
  tri(a,b,c,color,k=1){for(const v of [a,b,c]){this.p.push(...v);this.c.push(color[0]*k,color[1]*k,color[2]*k)}}
  quad(a,b,c,d,col,k=1){this.tri(a,b,c,col,k);this.tri(a,c,d,col,k)}
  box(x,y,z,w,h,d,col){const x0=x-w/2,x1=x+w/2,y0=y-h/2,y1=y+h/2,z0=z-d/2,z1=z+d/2;
    this.quad([x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1],col,1.10);
    this.quad([x0,y0,z1],[x1,y0,z1],[x1,y0,z0],[x0,y0,z0],col,.54);
    this.quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],col,.85);
    this.quad([x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],col,.65);
    this.quad([x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],col,.74);
    this.quad([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],col,.94);
  }
  line(a,b,r,col){const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],len=Math.hypot(dx,dy,dz)||1;
    let ux=-dz/Math.hypot(dx,dz||1),uz=dx/Math.hypot(dx,dz||1),uy=0;
    if(Math.hypot(dx,dz)<.02){ux=1;uz=0;}
    const vx=dy*uz/len,vy=-(dx*uz-dz*ux)/len,vz=-dy*ux/len;
    const p=(t,s,q)=>[a[0]+dx*t+(ux*s+vx*q)*r,a[1]+dy*t+(uy*s+vy*q)*r,a[2]+dz*t+(uz*s+vz*q)*r];
    for(let i=0;i<6;i++){const a0=i*Math.PI/3,a1=(i+1)*Math.PI/3;this.quad(p(0,Math.cos(a0),Math.sin(a0)),p(0,Math.cos(a1),Math.sin(a1)),p(1,Math.cos(a1),Math.sin(a1)),p(1,Math.cos(a0),Math.sin(a0)),col,.85+Math.sin(a0)*.1)}
  }
  disc(x,y,z,r,col,n=12){for(let i=0;i<n;i++){const t=i*Math.PI*2/n,t2=(i+1)*Math.PI*2/n;this.tri([x,y,z],[x+Math.cos(t)*r,y,z+Math.sin(t)*r],[x+Math.cos(t2)*r,y,z+Math.sin(t2)*r],col)}}
  cone(x,y,z,rad,h,col,n=9){for(let i=0;i<n;i++){let a=i*Math.PI*2/n,b=(i+1)*Math.PI*2/n;this.tri([x,y+h/2,z],[x+rad*Math.cos(a),y-h/2,z+rad*Math.sin(a)],[x+rad*Math.cos(b),y-h/2,z+rad*Math.sin(b)],col,.7+(i%3)*.12)}}
}
class Engine3D {
  constructor(mount){this.mount=mount;this.canvas=document.createElement('canvas');this.canvas.setAttribute('aria-label','Реальна 3D-сцена Рівного');mount.appendChild(this.canvas);
    this.gl=this.canvas.getContext('webgl',{antialias:true,alpha:false,depth:true}) || this.canvas.getContext('experimental-webgl',{antialias:true,alpha:false});
    if(!this.gl){this.soft=true;this.ctx2d=this.canvas.getContext('2d');this.resize();return;}
    this.soft=false;this.init(); this.resize();
  }
  init(){const gl=this.gl;
    const vs=`attribute vec3 aP;attribute vec3 aC;varying vec3 vC;varying float vDepth;uniform vec3 uCam,uRight,uUp,uForward,uPosition;uniform float uYaw,uAspect,uFocal,uNight;void main(){float c=cos(uYaw),s=sin(uYaw);vec3 world=vec3(aP.x*c+aP.z*s,aP.y,-aP.x*s+aP.z*c)+uPosition;vec3 d=world-uCam;float dep=dot(d,uForward);gl_Position=vec4(dot(d,uRight)*uFocal/uAspect,dot(d,uUp)*uFocal,dep*1.00010-.14,dep);vC=aC;vDepth=max(0.,dep);}`;
    const fs=`precision mediump float;varying vec3 vC;varying float vDepth;uniform vec3 uFog;uniform float uFogDist,uNight;void main(){float glow=step(.49,vC.r)*step(.38,vC.g)*(1.-step(.58,vC.b));vec3 color=vC*mix(1.,.20,uNight);color=mix(color,vC*.95,glow*uNight*.78);float fog=clamp(1.-exp(-vDepth/uFogDist),0.,.99);gl_FragColor=vec4(mix(color,uFog,fog),1.);}`;
    const shader=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s};
    const prog=gl.createProgram();gl.attachShader(prog,shader(gl.VERTEX_SHADER,vs));gl.attachShader(prog,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(prog);if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);this.prog=prog;
    this.loc={p:gl.getAttribLocation(prog,'aP'),c:gl.getAttribLocation(prog,'aC')};
    for(const n of ['uCam','uRight','uUp','uForward','uPosition','uYaw','uAspect','uFocal','uFog','uFogDist','uNight'])this.loc[n]=gl.getUniformLocation(prog,n);
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LESS);gl.disable(gl.CULL_FACE);
  }
  upload(geo){if(this.soft)return{p:null,c:null,n:0};const gl=this.gl,p=gl.createBuffer(),c=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,p);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(geo.p),gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,c);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(geo.c),gl.STATIC_DRAW);return{p,c,n:geo.p.length/3}}
  remove(mesh){if(!mesh||this.soft)return;this.gl.deleteBuffer(mesh.p);this.gl.deleteBuffer(mesh.c)}
  resize(){const rect=this.mount.getBoundingClientRect();const ratio=Math.min(1.6,window.devicePixelRatio||1);let w=Math.max(10,Math.floor(rect.width*ratio)),h=Math.max(10,Math.floor(rect.height*ratio));if(w!==this.canvas.width||h!==this.canvas.height){this.canvas.width=w;this.canvas.height=h;if(!this.soft)this.gl.viewport(0,0,w,h);}this.aspect=w/h;}
  renderMesh(mesh,pos=[0,0,0],yaw=0){if(!mesh||this.soft)return;const gl=this.gl,L=this.loc;
    gl.uniform3fv(L.uPosition,pos);gl.uniform1f(L.uYaw,yaw);
    gl.bindBuffer(gl.ARRAY_BUFFER,mesh.p);gl.enableVertexAttribArray(L.p);gl.vertexAttribPointer(L.p,3,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,mesh.c);gl.enableVertexAttribArray(L.c);gl.vertexAttribPointer(L.c,3,gl.FLOAT,false,0,0);
    gl.drawArrays(gl.TRIANGLES,0,mesh.n);
  }
  frame(camera,night,weather,scene,vehicle,interior,doors,poles,traffic){this.resize();if(this.soft){fallbackFrame(this.ctx2d,this.canvas,camera,night,weather,vehicle,traffic);return;}const gl=this.gl,L=this.loc;gl.useProgram(this.prog);
    const sky=night?[.016,.028,.063]:weather==='rain'?[.32,.41,.51]:weather==='snow'?[.64,.73,.79]:[.55,.72,.88];
    gl.clearColor(...sky,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    const fog=sky.map(c=>night?c*.68:c*.9);let yaw=camera.yaw,pitch=camera.pitch||0;let fx=Math.sin(yaw)*Math.cos(pitch),fy=Math.sin(pitch),fz=Math.cos(yaw)*Math.cos(pitch);let right=[Math.cos(yaw),0,-Math.sin(yaw)],up=[-Math.sin(yaw)*Math.sin(pitch),Math.cos(pitch),-Math.cos(yaw)*Math.sin(pitch)];
    gl.uniform3fv(L.uCam,camera.pos);gl.uniform3fv(L.uRight,right);gl.uniform3fv(L.uUp,up);gl.uniform3fv(L.uForward,[fx,fy,fz]);
    gl.uniform1f(L.uAspect,this.aspect);gl.uniform1f(L.uFocal,1.44);gl.uniform3fv(L.uFog,fog);gl.uniform1f(L.uFogDist,night?150:weather==='rain'?240:weather==='snow'?360:490);gl.uniform1f(L.uNight,night?1:0);
    this.renderMesh(scene);
    for(const t of traffic)this.renderMesh(t.mesh,t.pos,t.yaw);
    if(camera.kind==='driver'||camera.kind==='cabin'){this.renderMesh(interior,vehicle.position,vehicle.yaw);this.renderMesh(game.passengerMesh,vehicle.position,vehicle.yaw);}
    else this.renderMesh(vehicle.mesh,vehicle.position,vehicle.yaw);
    this.renderMesh(doors,vehicle.position,vehicle.yaw);
    if(vehicle.isTrolley)this.renderMesh(poles,vehicle.position,vehicle.yaw);
  }
}
function generateCity(engine,count,weather){if(engine.soft)return{p:null,c:null,n:0};const g=new Geometry(),r=rand(811),max=(count-1)*STEP,grass=weather==='snow'?[.80,.85,.86]:PALETTE.grass;
  // wide terrain
  g.box(0,-.35,max/2,2800,.7,max+900,grass);
  const road=PALETTE.asphalt,sidewalk=[.60,.62,.61],white=[.80,.83,.80];
  for(let z=-230;z<max+260;z+=5){const x0=routeX(z),x1=routeX(z+5),wid=10.8;
    g.quad([x0-wid,.018,z],[x0+wid,.018,z],[x1+wid,.018,z+5],[x1-wid,.018,z+5],road,.96);
    // sidewalks are narrow strips placed along road tangent
    for(let s of [-1,1]){let xa=x0+s*12.3,xb=x1+s*12.3;
      g.quad([xa-1.6,.10,z],[xa+1.6,.10,z],[xb+1.6,.10,z+5],[xb-1.6,.10,z+5],sidewalk,.97);
    }
  }
  // lane markings and kerbs
  for(let z=-200;z<max+220;z+=8){const x=routeX(z),x2=routeX(z+3);
    if(Math.floor(z/12)%3!==1){g.box((x+x2)/2,.06,z+1.5,.15,.04,3,white);} // center line
    for(const offset of [-9.25,9.25])g.box((x+x2)/2+offset,.065,z+1.6,.12,.03,3,[.78,.79,.72]);
  }
  // Crossroads, junctions and crossings
  for(let z=105;z<max+80;z+=185){const x=routeX(z),wide=64;
    g.box(x,.009,z,wide,.025,11.5,road);g.box(x,.034,z,wide,.02,.16,[.69,.7,.62]);
    for(let k=-6;k<=6;k++){if(k%2)g.box(x+k*2.6,.060,z-9,1.65,.022,3.3,white);}
    for(const s of [-1,1]){const bx=x+s*37;g.box(bx,6,z-5,.6,12,.6,[.35,.39,.36]);g.box(bx,12.4,z-5,.85,.85,.85,[.12,.20,.18]);g.box(bx,12.9,z-5,.77,.77,.80,[.72,.17,.12]);}
  }
  // Shopfronts, apartment blocks, trees, signs, street lights and balconies
  for(let z=-100;z<max+250;z+=27){const cx=routeX(z);
    for(const side of [-1,1]){
      const d=23+r()*12,x=cx+side*d,baseH=7+Math.floor(r()*6)*3.3;
      if(r()<.27){ // trees
        g.line([x,0,z],[x,5.5,z],.21,[.30,.24,.16]);
        g.cone(x,8,z,2.8,7.7,weather==='snow'?[.79,.84,.81]:[.14+.07*r(),.36+.08*r(),.13],10);
      } else {const w=14+r()*9,l=16+r()*7,height=baseH;
        const palette=[[.68,.72,.70],[.74,.67,.61],[.69,.68,.75],[.85,.77,.65],[.70,.77,.77],[.65,.69,.65],[.69,.56,.49]];
        const col=palette[Math.floor(r()*palette.length)];g.box(x,height/2,z,w,height,l,col);
        g.box(x,height+.18,z,w+.45,.45,l+.4,[.32,.35,.37]);
        const floors=Math.floor(height/3.1);
        for(let floor=0;floor<floors;floor++)for(let j=-2;j<=2;j++){
          const iz=z+j*l/6;if(Math.abs(j)>1 && r()<.30)continue;
          g.box(x-side*(w/2+.035),2.25+floor*3.05,iz,.13,1.45,1.45,nightWindow(r));
          if(floor%2===0&&j===1)g.box(x-side*(w/2+.45),1.1+floor*3.05,iz,.8,.14,2.1,[.43,.46,.46]);
        }
        if(r()<.32){g.box(x-side*(w/2+.12),2.8,z, .20,1.30,6,[.21,.41,.53]);g.box(x-side*(w/2+.22),3.6,z,.28,.18,6,[.94,.77,.25]);}
      }
      if(Math.floor(z/27)%3===0){const p=cx+side*14.3;
        g.line([p,.1,z],[p,8.1,z],.16,[.42,.47,.48]);
        g.line([p,8.1,z],[p-side*2.7,8.4,z],.10,[.38,.39,.41]);
        g.box(p-side*2.9,8.15,z,1.35,.25,.85,[.98,.86,.54]);
      }
    }
  }
  // stop areas in exact requested sequence; the labels in HUD supply the actual names
  for(let i=0;i<count;i++){const z=i*STEP,cx=routeX(z),x=cx+14.5;
    g.box(x,.12,z,9,.18,18,[.57,.61,.60]);
    g.line([x-1.9,.1,z-3],[x-1.9,3.4,z-3],.10,[.37,.43,.48]);
    g.line([x+2.1,.1,z-3],[x+2.1,3.4,z-3],.10,[.37,.43,.48]);
    g.line([x-1.9,.1,z+3.6],[x-1.9,3.4,z+3.6],.10,[.37,.43,.48]);
    g.line([x+2.1,.1,z+3.6],[x+2.1,3.4,z+3.6],.10,[.37,.43,.48]);
    g.box(x,3.45,z+.5,5.6,.22,8.3,[.14,.25,.31]);
    g.box(x+1.9,1.7,z+.5,.10,2.8,7.3,[.45,.68,.74]);
    g.box(x-.2,.58,z+.4,1.2,.23,3.7,[.33,.27,.21]);
    for(let q=0;q<3;q++)g.box(x-.2,.8,z-1.2+q*1.5,.14,.4,.12,[.35,.35,.32]);
    g.line([cx+11,.1,z-13],[cx+11,5.3,z-13],.15,[.36,.40,.39]);
    g.box(cx+11,4.7,z-13,1.4,1.45,.16,[.07,.37,.63]);
    g.box(cx+11,4.65,z-12.82,.85,.18,.055,[.96,.98,1]);
    // waiting passengers
    for(let p=0;p<2+(i%3);p++){makePerson(g,x+(.7+r()*1.8),z-2+r()*5,i+p);}
  }
  // trolley overhead wires on the road (also visible in passenger view)
  for(let z=-180;z<max+200;z+=4){for(let side of [-.7,.7])g.line([routeX(z)+side,6.9,z],[routeX(z+4)+side,6.9,z+4],.03,[.14,.17,.19]);}
  for(let z=-120;z<max+150;z+=66){const x=routeX(z)-13;
    g.line([x,.05,z],[x,7.5,z],.13,[.40,.47,.46]);g.line([x,7.5,z],[routeX(z)+2,7.5,z],.045,[.23,.29,.32]);
    g.line([routeX(z)+2,7.5,z],[routeX(z)+2,6.9,z],.035,[.16,.20,.21]);
  }
  // АЗС на маршруті 38/38А: декорації реальної зупинки для заправки (не GPS).
  for(const stationIndex of [5, 13]){
    const z=stationIndex*STEP+48,x=routeX(z)+31.5;
    g.box(x,.12,z,24,.23,28,[.51,.52,.51]);
    for(const dx of [-8,8])for(const dz of [-10,10])g.box(x+dx,3.2,z+dz,.42,6.3,.42,[.82,.86,.86]);
    g.box(x,6.43,z,22,.62,25,[.18,.51,.54]);
    g.box(x,6.86,z,22,.12,25,[.92,.96,.96]);
    for(const dz of [-5,5]){
      g.box(x-3,1.3,z+dz,1.55,2.55,1.2,[.86,.88,.85]);
      g.box(x-3,1.78,z+dz,1.57,.62,1.25,[.09,.35,.41]);
      g.line([x-3,1.5,z+dz],[x-1.9,.65,z+dz+.55],.035,[.16,.16,.15]);
    }
    g.box(x+7,4.55,z-11,2.5,3.65,.45,[.12,.39,.41]);
    g.box(x+7,4.88,z-11.33,2.1,.64,.09,[.89,.94,.93]);
  }
  return engine.upload(g);
}
function nightWindow(r){return r()<.2?[.96,.77,.37]:[.27+r()*.10,.40+r()*.09,.46+r()*.05]}
function makePerson(g,x,z,seed){const colors=[[.69,.28,.24],[.18,.32,.62],[.28,.47,.32],[.75,.67,.38],[.40,.36,.55]];
  const cloth=colors[seed%colors.length];g.box(x,1.18,z,.52,1.22,.39,cloth);g.box(x,2.05,z,.34,.44,.34,[.70,.56,.42]);g.box(x-.14,.35,z,.15,.7,.18,[.19,.21,.23]);g.box(x+.14,.35,z,.15,.7,.18,[.19,.21,.23]);}

function makeVehicle(engine,kind){const isT=kind==='trolley',len=isT?11.7:8.5,w=isT?2.66:2.52,h=isT?3.03:2.80;if(engine.soft)return{mesh:null,cab:null,up:null,down:null,doorUp:null,doorDown:null,len,w};
  const ext=new Geometry(), interior=new Geometry(); const cream=isT?[.93,.91,.85]:PALETTE.yellow;
  // roof, floor, front / back and narrow pillars; windows are opaque blue-gray except when in cabin view
  ext.box(0,1.12,0,w,1.78,len,cream);ext.box(0,2.93,0,w+.10,.22,len+.08,isT?[.84,.83,.77]:[.91,.69,.16]);
  ext.box(0,1.70,0,w+.07,.40,len,isT?PALETTE.blue:[.93,.70,.11]);
  ext.box(0,2.47,-len/2+.2,w,.98,.35,[.12,.25,.33]);ext.box(0,2.48,len/2-.13,w,.94,.28,[.16,.33,.40]);
  // side belt + windows, pillars, tires
  for(const s of [-1,1]){
    ext.box(s*(w/2+.017),1.26,0,.044,.22,len,isT?PALETTE.blue:[.76,.54,.05]);
    for(let z=-len/2+.95;z<len/2-1.0;z+=1.22){ext.box(s*(w/2+.032),2.43,z,.045,.88,1.04,[.10,.23,.34]);
      ext.box(s*(w/2+.05),2.4,z+.54,.075,1.02,.08,isT?[.84,.86,.86]:[.28,.26,.22]);}
    for(const z of [-len/2+2.1,len/2-1.6]){ext.box(s*(w/2-.10),.50,z,.45,.66,1,[.095,.104,.115]);ext.box(s*(w/2+.14),.50,z,.25,.45,.48,[.26,.27,.28]);}
    ext.box(s*(w/2+.05),1.86,1.3,.06,.10,1.8,isT?[.92,.88,.80]:[.18,.19,.20]);
  }
  // windscreen, windscreen border, wipers, license plate and lights
  ext.box(0,2.36,len/2+.035,w-.32,1.03,.06,[.12,.23,.31]);
  ext.box(0,2.90,len/2+.075,w-.21,.09,.06,isT?[.87,.85,.79]:[.13,.17,.21]);
  ext.box(0,1.85,len/2+.10,w-.24,.07,.08,[.08,.12,.14]);
  for(const s of [-1,1]){ext.box(s*.90,.98,len/2+.06,.30,.26,.10,isT?[.89,.84,.65]:[.92,.91,.77]);ext.box(s*1.03,1.22,-len/2-.06,.23,.31,.10,[.80,.15,.09]);}
  ext.box(0,.56,len/2+.10,1.12,.19,.09,isT?[.23,.25,.28]:[.94,.72,.12]);
  // Машини 107 і 38: відтворюємо форму передньої маски, бампери,
  // дзеркала, лобове скло, смуги, вентиляцію і круглі фари за фотографіями.
  const front=len/2+.16;
  ext.box(0,1.25,front,w-.10,.38,.09,isT?[.93,.93,.86]:[.94,.72,.09]);
  ext.box(0,.69,front+.08,w-.25,.20,.16,isT?[.15,.18,.23]:[.13,.15,.18]);
  ext.box(0,.97,front+.10,isT?1.28:1.48,.24,.08,[.10,.13,.17]);
  ext.box(0,2.53,front+.13,w-.40,.10,.05,[.09,.11,.14]);
  ext.box(0,2.21,front+.14,.045,1.04,.04,[.11,.15,.18]);
  ext.line([-w*.38,1.96,front+.20],[.13,2.12,front+.21],.026,[.16,.18,.18]);
  for(const sx of [-1,1]){
    const lx=sx*(w*.40);
    ext.box(lx,1.18,front+.13,.56,.55,.08,isT?[.22,.26,.28]:[.13,.17,.22]);
    for(let k=0;k<(isT?2:3);k++){
      const offset=isT?(-.115+k*.23):(-.18+k*.18);
      ext.box(lx+offset,1.13+(k%2)*.12,front+.21,.13,.13,.042,[.88,.91,.82]);
    }
    ext.box(sx*(w/2+.28),2.15,front-.68,.56,.13,.15,[.10,.12,.14]);
    ext.box(sx*(w/2+.50),2.12,front-.62,.23,.45,.12,[.09,.13,.16]);
  }
  if(isT){
    // синя нижня смуга, розділені бокові вікна, дахове обладнання
    ext.box(0,.71,-.02,w+.09,.43,len-.24,[.08,.22,.57]);
    ext.box(0,2.98,-1.8,1.8,.28,2.7,[.60,.63,.60]);
    ext.box(0,3.25,-1.8,1.1,.23,1.8,[.30,.36,.37]);
  } else {
    ext.box(0,1.78,front+.20,1.42,.22,.05,[.10,.13,.16]);
    ext.box(0,2.98,.04,1.28,.17,2.20,[.78,.57,.12]);
    // чорна пластикова маска характерної жовтої маршрутки
    for(const sx of [-1,1]) ext.box(sx*.89,.84,front+.20,.47,.55,.06,[.14,.18,.23]);
  }
  // trolley poles, separate to animate and toggle
  const poleUp=new Geometry(),poleDown=new Geometry();
  if(isT){for(let s of [-.55,.55]){
    poleUp.line([s,3.12,-len/2+.9],[s*.65,7.0,-len/2-6.6],.048,[.42,.44,.43]);poleUp.box(s*.65,7.05,-len/2-6.6,.43,.12,.45,[.20,.23,.24]);
    poleDown.line([s,3.13,-len/2+.9],[s,3.44,-len/2-7],.05,[.32,.34,.35]);
  }}
  // cabin interior (first-person); open front and side windows out to 3D road, blue poles and grey seats
  interior.box(0,.36,0,w,.17,len,[.32,.31,.28]);
  interior.box(0,3.05,0,w,.12,len,[.80,.81,.78]);
  for(const s of [-1,1]){
    interior.box(s*(w/2),1.15,0,.12,1.28,len,[.71,.74,.74]);
    interior.box(s*(w/2),2.98,0,.13,.22,len,[.70,.73,.75]);
    for(let z=-len/2+.6;z<len/2-.4;z+=1.28){interior.box(s*(w/2),2.42,z,.095,1.1,.075,[.23,.31,.34]);}
  }
  // support bars and passenger seats
  for(let z=-len/2+1.3;z<len/2-2.0;z+=1.5){
    for(let s of [-1,1]){
      interior.box(s*.78,.82,z,.72,.20,.7,[.36,.29,.27]);
      interior.box(s*.78,1.36,z-.26,.72,.96,.17,[.38,.29,.26]);
      interior.box(s*1.13,.65,z,.085,.50,.08,[.47,.50,.50]);
    }
    if(Math.round(z*10)%3!==0){interior.line([.18,.34,z],[.18,2.98,z],.035,isT?[.08,.50,.82]:[.86,.64,.15]);}
  }
  interior.line([0,2.91,-len/2+.3],[0,2.91,len/2-.2],.05,isT?[.14,.52,.83]:[.88,.65,.13]);
  interior.line([w/2-.14,2.86,-len/2+.3],[w/2-.14,2.86,len/2-.2],.035,isT?[.14,.52,.83]:[.88,.65,.13]);
  // driver control console and steering wheel
  interior.box(0,1.52,len/2-.65,w-.08,.78,1.0,[.13,.17,.20]);
  interior.box(-.66,1.97,len/2-1.03,.80,.16,.36,[.20,.27,.30]);
  for(let j=0;j<4;j++)interior.box(-1.0+j*.21,2.062,len/2-.86,.10,.015,.16,[.61,.74,.43]);
  for(let i=0;i<12;i++){const a=i*2*Math.PI/12,b=(i+1)*2*Math.PI/12;
    interior.line([-.70+Math.cos(a)*.35,2.31+Math.sin(a)*.35,len/2-1.05],[-.70+Math.cos(b)*.35,2.31+Math.sin(b)*.35,len/2-1.05],.035,[.08,.10,.11]);}
  interior.line([-.7,2.31,len/2-1.05],[-.7,1.96,len/2-.78],.067,[.07,.08,.09]);
  for(let s of [-1,1]){
    interior.box(s*(w/2-.055),2.5,len/2-.18,.12,1.14,.16,[.12,.18,.21]);
    interior.box(s*(w/2-.10),2.82,len/2-.3,.18,.20,.40,[.16,.21,.25]);
  }
  interior.box(0,3.0,len/2-.15,w,.16,.15,[.20,.26,.29]);
  const mesh=engine.upload(ext),cab=engine.upload(interior),poleMeshUp=engine.upload(poleUp),poleMeshDown=engine.upload(poleDown);
  const doorsOpen=new Geometry(),doorsClosed=new Geometry();
  for(const z of (isT?[-len/2+2.8,len/2-2.2]:[len/2-2])){
    for(const s of [-1,1]){
      // each pair of folding doors slides along the Z axis to reveal the entrance
      doorsClosed.box(w/2+.1,1.42,z+s*.46,.13,2.03,.80,isT?[.87,.87,.80]:[.91,.68,.14]);
      doorsClosed.box(w/2+.19,2.01,z+s*.46,.075,.70,.62,[.12,.28,.35]);
      doorsOpen.box(w/2+.70,1.42,z+s*.93,.13,2.03,.31,isT?[.88,.87,.79]:[.91,.69,.13]);
      doorsOpen.box(w/2+.76,2.02,z+s*.93,.09,.72,.23,[.12,.28,.35]);
    }
  }
  return{mesh,cab,up:poleMeshUp,down:poleMeshDown,doorUp:engine.upload(doorsOpen),doorDown:engine.upload(doorsClosed),len,w};
}
function makeCabPassengers(engine,kind,n,len){
  if(engine.soft)return null;
  const g=new Geometry();const coats=[[.18,.32,.53],[.56,.26,.24],[.23,.43,.29],[.58,.49,.31],[.38,.30,.53]];
  for(let i=0;i<Math.min(8,n);i++){
    const side=i%2===0?-1:1, z=-len/2+1.35+Math.floor(i/2)*1.55,x=side*.76, coat=coats[i%coats.length];
    g.box(x,1.65,z-.08,.55,.80,.48,coat);g.box(x,2.24,z-.08,.36,.42,.36,[.71,.56,.43]);
    g.box(x-.15,1.18,z+.18,.21,.42,.39,[.23,.25,.26]);g.box(x+.15,1.18,z+.18,.21,.42,.39,[.23,.25,.26]);
  }
  return engine.upload(g);
}
function genTrafficVehicle(engine,color){if(engine.soft)return null;const g=new Geometry();g.box(0,.88,0,1.75,1.3,4.0,color);g.box(0,1.82,-.2,1.55,.72,2.25,[.16,.28,.36]);for(const x of [-.80,.80])for(const z of [-1.33,1.30])g.box(x,.34,z,.28,.51,.62,[.09,.10,.11]);g.box(-.55,.92,2.04,.22,.16,.08,[.96,.91,.64]);g.box(.55,.92,2.04,.22,.16,.08,[.96,.91,.64]);return engine.upload(g);}
const clock=()=>new Date().toLocaleTimeString('uk-UA',{hour:'2-digit',minute:'2-digit'});

class Synth {
  constructor(){this.ctx=null;this.osc=null;this.osc2=null;this.gain=null;this.gain2=null;}
  start(){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
    if(this.ctx){this.ctx.resume();return;}
    const c=this.ctx=new AC();
    this.gain=c.createGain();this.gain.gain.value=.0001;this.gain.connect(c.destination);
    this.osc=c.createOscillator();this.osc.type='sawtooth';this.osc.frequency.value=54;const lp=c.createBiquadFilter();lp.type='lowpass';lp.frequency.value=260;this.osc.connect(lp);lp.connect(this.gain);this.osc.start();
    this.gain2=c.createGain();this.gain2.gain.value=.0001;this.gain2.connect(c.destination);this.osc2=c.createOscillator();this.osc2.type='sine';this.osc2.frequency.value=108;this.osc2.connect(this.gain2);this.osc2.start();
  }
  motor(speed,bus,power,doors){if(!this.ctx)return;const t=this.ctx.currentTime;const s=Math.abs(speed);this.osc.frequency.setTargetAtTime((bus?58:90)+s*(bus?2.0:1.85),t,.15);this.osc.type=bus?'sawtooth':'triangle';
    this.osc2.frequency.setTargetAtTime((bus?120:165)+s*(bus?3:3.2),t,.15);const on=power&&!doors;
    this.gain.gain.setTargetAtTime(on?(bus?.024:.015)*(1+Math.min(1,s/35)):.0001,t,.2);
    this.gain2.gain.setTargetAtTime(on?(bus?.012:.017)*(1+Math.min(1,s/40)):.0001,t,.20);
  }
  tone(freq=400,dur=.18,type='sine',volume=.14){if(!this.ctx)return;const c=this.ctx,o=c.createOscillator(),g=c.createGain(),t=c.currentTime;o.type=type;o.frequency.setValueAtTime(freq,t);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.002,volume),t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+dur+.03);}
  hiss(duration=.52){if(!this.ctx)return;const c=this.ctx,N=Math.floor(c.sampleRate*duration),buf=c.createBuffer(1,N,c.sampleRate),d=buf.getChannelData(0);for(let i=0;i<N;i++)d[i]=(Math.random()*2-1);const src=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();src.buffer=buf;filter.type='bandpass';filter.frequency.value=980;gain.gain.setValueAtTime(.001,c.currentTime);gain.gain.linearRampToValueAtTime(.12,c.currentTime+.06);gain.gain.exponentialRampToValueAtTime(.001,c.currentTime+duration);src.connect(filter);filter.connect(gain);gain.connect(c.destination);src.start();src.stop(c.currentTime+duration);}
  doors(){this.hiss(.58);this.tone(215,.18,'sine',.06);}
  poles(){this.tone(780,.12,'triangle',.14);setTimeout(()=>this.tone(540,.16,'sine',.12),180);}
  horn(){this.tone(330,.43,'sawtooth',.10);this.tone(415,.43,'triangle',.10);}
  ticket(){this.tone(1250,.09,'sine',.08);setTimeout(()=>this.tone(1460,.11,'sine',.07),100);}
}

const game={kind:'trolley',direction:'forward',weather:'sun',daytime:'day',camera:'driver',running:false,paused:false,speed:0,s:0,lateral:0,steering:0,doors:false,poles:true,atStop:0,people:0,tickets:0,money:0,boarded:new Set(),announced:new Set(),total:0,vehicle:null,city:null,traffic:[],scene:null,engine:null,last:0,speech:true,raf:0,particles:[],weatherCanvas:null,wctx:null,stoppedAtEnd:false,passengerMesh:null,fuel:80,tank:80,contact:true,contactTimer:0};
const sound=new Synth();
let messageTimeout=0;
function configStops(){const names=STOP_NAMES[game.kind],back=game.direction==='backward';return back?[...names].reverse():[...names];}
function currentStops(){return configStops()}
function zAt(i){const n=STOP_NAMES[game.kind].length;return game.direction==='backward'?(n-1-i)*STEP:i*STEP;}
function driverDirection(){return game.direction==='forward'?1:-1;}
function status(msg,kind=''){const el=$('status');el.textContent=msg;el.className='status'+(kind?' '+kind:'');messageTimeout=7;}
function announcement(text,voice=true){$('announcement').textContent=text;const box=$('announcer');box.classList.remove('hidden');setTimeout(()=>box.classList.add('hidden'),6500);if(voice)speak(text);}
function speak(text){if(!('speechSynthesis'in window))return;try{
  speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='uk-UA';u.rate=.93;u.pitch=1.03;u.volume=.95;const vs=speechSynthesis.getVoices();u.voice=vs.find(v=>v.lang?.toLowerCase().startsWith('uk'))||null;speechSynthesis.speak(u);
}catch(e){console.warn('TTS not available',e)}}
function gpsHint(){let stop=currentStops()[game.atStop];if(!stop)stop='Кінцева';const metres=Math.abs(game.s-zAt(game.atStop));$('nextStop').textContent=stop;$('distance').textContent=`${Math.round(metres)} м • ${game.atStop+1}/${game.total}`;}
function drawStopList(){const names=currentStops();const list=$('stopList');list.replaceChildren();names.forEach((name,i)=>{const el=document.createElement('div');el.className='stop-item'+(i===game.atStop?' active':i<game.atStop?' done':'');const index=document.createElement('span');index.className='index';index.textContent=i<game.atStop?'✓':i+1;const t=document.createElement('span');t.textContent=name;el.append(index,t);list.appendChild(el)});$('routeTitle').textContent=names[0]+' → '+names.at(-1);$('done').textContent=game.boarded.size+' / '+names.length;}
function setVehicle(kind){game.kind=kind;document.querySelectorAll('[data-vehicle]').forEach(el=>{const active=el.dataset.vehicle===kind;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));});
  $('photoMain').src=kind==='trolley'?'assets/trolley-107-exterior.jpg':'assets/marshrutka-38-front.jpg';
  $('photoInterior').src=kind==='trolley'?'assets/trolley-107-interior.jpg':'assets/marshrutka-38-interior.jpg';
  $('poleBtn').disabled=kind!=='trolley';$('poleBadge').textContent=kind==='trolley'?'⚡ Штанги піднято':'⛽ Дизельний двигун';
  $('fuelBtn').disabled=kind!=='bus';$('fuelBadge').textContent=kind==='bus'?'⛽ Пальне: '+game.fuel.toFixed(1)+' / '+game.tank+' л':'⚡ Живлення від дротів';
  game.total=STOP_NAMES[kind].length;game.atStop=0;game.boarded.clear();game.direction=$('direction').value;drawStopList();gpsHint();
}
function cameraView(){const dz=driverDirection(),yaw=Math.atan2((routeX(game.s+dz*.4)-routeX(game.s))*dz,.4)+ (dz===1?0:Math.PI);
  const x=routeX(game.s)+game.lateral;const model=game.vehicle||{len:game.kind==='trolley'?11.7:8.5};
  const yawModel=yaw + game.steering*.035;
  const transform=(lx,ly,lz)=>[x+Math.cos(yawModel)*lx+Math.sin(yawModel)*lz,ly,game.s-Math.sin(yawModel)*lx+Math.cos(yawModel)*lz];
  const mode=game.camera;
  if(mode==='driver')return{pos:transform(-.58,2.40,model.len/2-1.72),yaw:yawModel,pitch:-.027,kind:mode};
  if(mode==='cabin')return{pos:transform(.15,2.25,-model.len/2+1.1),yaw:yawModel,pitch:0,kind:mode};
  if(mode==='side')return{pos:transform(-15,5.5,1.5),yaw:yawModel+1.28,pitch:-.10,kind:mode};
  return{pos:transform(0,5.7,-20),yaw:yawModel,pitch:-.12,kind:mode};
}
function renderMini(){const cv=$('mini'),c=cv.getContext('2d'),W=cv.width,H=cv.height,n=game.total,max=(n-1)*STEP,cx=W/2;
  c.clearRect(0,0,W,H);c.fillStyle=game.daytime==='night'?'#1c3442':'#42604b';c.fillRect(0,0,W,H);
  const xscale=.22,yscale=H/(max+100);
  const point=z=>[cx+routeX(z)*xscale, H-12-(z+45)*yscale];
  c.strokeStyle='#9caeb2';c.lineWidth=16;c.lineCap='round';c.beginPath();for(let z=0;z<=max;z+=8){const [x,y]=point(z);if(z===0)c.moveTo(x,y);else c.lineTo(x,y)}c.stroke();
  c.strokeStyle='#4e5d66';c.lineWidth=10;c.stroke();c.setLineDash([4,4]);c.strokeStyle='#e4d9a5';c.lineWidth=1;c.stroke();c.setLineDash([]);
  if(game.kind==='bus'){for(const zi of [5*STEP+48,13*STEP+48]){const [xx,yy]=point(zi);c.fillStyle='#eafabd';c.font='bold 16px system-ui';c.fillText('⛽',xx+11,yy+5);}}
  for(let i=0;i<n;i++){const [x,y]=point(i*STEP);c.fillStyle='#e6f2f2';c.beginPath();c.arc(x,y,2.4,0,Math.PI*2);c.fill()}
  const [tx,ty]=point(zAt(game.atStop));c.beginPath();c.arc(tx,ty,5,0,Math.PI*2);c.strokeStyle='#befa7d';c.lineWidth=2;c.stroke();
  const [vx,vy]=point(game.s);c.beginPath();c.arc(vx,vy,5,0,Math.PI*2);c.fillStyle=game.kind==='trolley'?'#69beff':'#ffce48';c.fill();c.strokeStyle='#17262d';c.stroke();
}
function displayStats(){$('people').textContent=game.people;$('tickets').textContent=game.tickets;$('money').textContent=game.money+' ₴';$('done').textContent=`${game.boarded.size} / ${game.total}`;}
function updateOptionsFromUI(){game.direction=$('direction').value;game.camera=$('camera').value;game.weather=$('weather').value;game.daytime=$('daytime').value;game.total=STOP_NAMES[game.kind].length;game.atStop=0;game.boarded.clear();drawStopList();gpsHint();}
function rebuild(){if(!game.engine)return;const e=game.engine;e.remove(game.city);game.city=generateCity(e,game.total,game.weather);
  if(game.vehicle){for(const key of ['mesh','cab','up','down','doorUp','doorDown'])e.remove(game.vehicle[key]);}
  game.vehicle=makeVehicle(e,game.kind);e.remove(game.passengerMesh);game.passengerMesh=makeCabPassengers(e,game.kind,game.people||0,game.vehicle.len);
}
function start(){sound.start();updateOptionsFromUI();rebuild();game.running=true;game.paused=false;game.s=zAt(0);game.lateral=0;game.speed=0;game.steering=0;game.doors=false;game.poles=true;game.people=0;game.tickets=0;game.money=0;game.stoppedAtEnd=false;game.fuel=game.kind==='bus'?14:80;game.contact=true;game.contactTimer=0;game.announced.clear();game.boarded.clear();game.atStop=0;game.last=performance.now();game.weatherTime=0;
  $('landing').style.display='none';$('start').textContent='↺ НОВИЙ РЕЙС';$('pauseBtn').innerHTML='⏸<small>Пауза [P]</small>';
  displayStats();drawStopList();updateButtons();gpsHint(); if(game.engine){game.engine.remove(game.passengerMesh);game.passengerMesh=makeCabPassengers(game.engine,game.kind,0,game.vehicle.len);}
  status('Ти на початковій. Відкрий двері [O] і посади пасажирів [E].','good');
  announcement('Ласкаво просимо! '+(game.kind==='trolley'?'Тролейбус номер сто сім.':'Маршрутка номер тридцять вісім А.')+' Початкова зупинка: '+currentStops()[0]+'.',true);
}
function toggleDoor(){if(!game.running){status('Спочатку почни рейс.','warn');return;}if(Math.abs(game.speed)>2.2){status('Двері можна відкривати тільки після повної зупинки!','warn');sound.tone(280,.2);return;}
  sound.doors();game.doors=!game.doors;updateButtons();status(game.doors?'Двері відкриті. Можна виконувати посадку.':'Двері зачинилися. Можеш вирушати.','good');}
function updateButtons(){$('fuelBadge').textContent=game.kind==='bus'?'⛽ Пальне: '+game.fuel.toFixed(1)+' / '+game.tank+' л':'⚡ Живлення від дротів';$('doorBadge').textContent=game.doors?'🚪 Двері відчинені':'🚪 Двері зачинені';$('poleBadge').textContent=game.kind==='trolley'?(game.poles?'⚡ Штанги піднято':'⚠️ Штанги опущено'):'⛽ Дизельний двигун';}
function board(){if(!game.running){status('Спочатку почни рейс.','warn');return;}
  if(game.boarded.has(game.atStop)){status('Посадку на цій зупинці вже виконано. Рухайся далі.','warn');return;}
  if(!game.doors){status('Відкрий двері [O], щоб прийняти пасажирів.','warn');return;}
  if(Math.abs(game.speed)>1){status('Перед посадкою потрібно зупинитися.','warn');return;}
  if(Math.abs(game.s-zAt(game.atStop))>22){status('Під’їдь до зупинки. На мінікарті позначено потрібну точку.','warn');return;}
  const number=4+Math.floor(Math.random()*7),leaving=game.atStop?Math.floor(Math.random()*4):0;game.people=Math.max(0,game.people-leaving)+number;
  game.boarded.add(game.atStop);if(game.engine){game.engine.remove(game.passengerMesh);game.passengerMesh=makeCabPassengers(game.engine,game.kind,game.people,game.vehicle.len);}sound.ticket();displayStats();const name=currentStops()[game.atStop];status(`🚏 ${name}: +${number} пасажирів, вийшло ${leaving}. Закрий двері й рушай.`,'good');
  announcement('Зупинка: '+name+'. Посадку завершено. Обережно, двері зачиняються.',true);
  if(game.atStop===game.total-1){game.stoppedAtEnd=true;status('🏁 Кінцева '+name+'! Рейс завершено. Обери «Назад» для зворотного рейсу.','good');announcement('Кінцева зупинка: '+name+'. Дякуємо за поїздку. Виходьте, будь ласка.',true);}
  else {game.atStop++;game.announced.delete(game.atStop);drawStopList();}
}
function ticket(){if(!game.running){status('Спочатку почни рейс.','warn');return;}if(game.tickets>=game.people){status('У всіх пасажирів уже є квитки.','good');return;}
  if(Math.abs(game.speed)>4) {status('Продавай квитки лише під час зупинки, для безпеки.','warn');return;}
  game.tickets++;game.money+=game.kind==='trolley'?12:18;sound.ticket();displayStats();status('🎫 Квиток видано! +'+(game.kind==='trolley'?12:18)+' ₴ (ігровий тариф).','good');}
function togglePoles(){if(game.kind!=='trolley')return;if(Math.abs(game.speed)>1){status('Штанги можна перемикати лише стоячи.','warn');return;}game.poles=!game.poles;sound.poles();updateButtons();status(game.poles?'Штанги піднято. Електромережу підключено.':'Штанги опущено. Рух заборонено.','good');}
function stationDistance(){const zs=[5*STEP+48,13*STEP+48];return Math.min(...zs.map(z=>Math.abs(game.s-z)));}
function refuel(){
  if(!game.running||game.kind!=='bus'){status('Заправка потрібна тільки маршрутці під час рейсу.','warn');return;}
  if(Math.abs(game.speed)>1){status('Спочатку повністю зупини маршрутку перед АЗС.','warn');return;}
  if(stationDistance()>55){status('Під’їдь до АЗС. Вона позначена на мінікарті як ⛽.','warn');return;}
  const litres=game.tank-game.fuel;if(litres<1){status('Бак уже повний.','good');return;}
  game.fuel=game.tank;sound.tone(380,.27,'triangle',.10);updateButtons();
  status(`⛽ Заправлено ${litres.toFixed(1)} л дизпального. Можеш продовжити рейс.`,'good');
}
function togglePause(){if(!game.running)return;game.paused=!game.paused;game.last=performance.now();if(game.paused)sound.motor(0,game.kind==='bus',false,true);$('pauseBtn').innerHTML=game.paused?'▶<small>Продовжити</small>':'⏸<small>Пауза [P]</small>';status(game.paused?'⏸ Пауза. Натисни P для продовження.':'Гру продовжено.','good');}
const keys={gas:false,brake:false,left:false,right:false};
function simulate(dt){if(!game.running||game.paused)return;
  const direction=driverDirection(),max=game.kind==='trolley'?55:65;
  if(game.doors||(!game.poles&&game.kind==='trolley')||(game.kind==='bus'&&game.fuel<=0)||game.stoppedAtEnd){game.speed=Math.sign(game.speed)*Math.max(0,Math.abs(game.speed)-dt*10);}
  else if(keys.gas){game.speed=clamp(game.speed+dt*(game.kind==='bus'?11:9),-16,max);}
  else if(keys.brake){game.speed=Math.max(-16,game.speed-dt*(game.speed>0?23:8.5));}
  else{game.speed=Math.sign(game.speed)*Math.max(0,Math.abs(game.speed)-dt*4.5);}
  let steer=(keys.right?1:0)-(keys.left?1:0);game.steering=mix(game.steering,steer,.13);game.lateral=clamp(game.lateral+game.steering*dt*(1+game.speed/25),-2.1,2.1);
  const dz=game.speed/3.6*dt*direction;
  if(game.kind==='bus'&&game.fuel>0){game.fuel=clamp(game.fuel-Math.abs(dz)*.0060-(keys.gas?dt*.001:0),0,game.tank);$('fuelBadge').textContent='⛽ Пальне: '+game.fuel.toFixed(1)+' / '+game.tank+' л';if(game.fuel<=0&&game.speed<1){status('⛽ Закінчилося пальне! Біля АЗС натисни F.','warn');}}
  if(game.kind==='trolley'){
    game.contactTimer=game.contactTimer||0;
    if(Math.abs(game.lateral)>1.94&&Math.abs(game.speed)>12){game.contactTimer+=dt;if(game.contactTimer>2&&game.poles){game.poles=false;game.contact=false;sound.poles();updateButtons();status('⚡ Штанги зійшли з контактної мережі. Зупинися та підніми їх [R].','warn');}}
    else game.contactTimer=0;
  }

  game.s=clamp(game.s+dz,0,(game.total-1)*STEP);
  const remaining=Math.abs(game.s-zAt(game.atStop));
  if(!game.boarded.has(game.atStop)&&remaining<105&&!game.announced.has(game.atStop)){
    game.announced.add(game.atStop);announcement('Наступна зупинка: '+currentStops()[game.atStop]+'.',true);
  }
  if(!game.boarded.has(game.atStop) && Math.abs(game.s-zAt(game.atStop))>105 && ((direction>0&&game.s>zAt(game.atStop))||(direction<0&&game.s<zAt(game.atStop)))){
    status('⚠️ Ти проїхав потрібну зупинку! Повернися назад або розпочни рейс знову.','warn');
  }
  sound.motor(game.speed,game.kind==='bus',game.poles||game.kind==='bus',game.doors);
  if(messageTimeout>0){messageTimeout-=dt;if(messageTimeout<=0)status('Дотримуйся маршруту, зупиняйся та оголошуй зупинки.');}
  if(game.speed>1)game.lateral=mix(game.lateral,0,dt*.2);
}
function trafficState(dt){for(const t of game.traffic){t.s+=t.dir*t.speed*dt;const max=(game.total-1)*STEP+180;if(t.s<-90)t.s=max+30;if(t.s>max+80)t.s=-40;
  const yaw=Math.atan2(routeX(t.s+.5)-routeX(t.s-.5),1)+(t.dir<0?Math.PI:0);
  t.pos=[routeX(t.s)+(t.dir>0?-3.7:3.7),0,t.s];t.yaw=yaw;
}}
function drawWeather(dt){const cv=game.weatherCanvas;if(!cv)return;const rect=$('frame').getBoundingClientRect(),dpr=window.devicePixelRatio||1,w=Math.floor(rect.width*dpr),h=Math.floor(rect.height*dpr);if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h;}const c=game.wctx;c.clearRect(0,0,w,h);if(game.weather==='sun')return;
  if(game.particles.length<170){for(let i=game.particles.length;i<180;i++)game.particles.push({x:Math.random()*w,y:Math.random()*h,v:Math.random()*2+1,r:Math.random()*1.8+.6});}
  c.lineWidth=game.weather==='rain'?dpr*1.1:dpr*.4;
  c.strokeStyle='rgba(185,219,245,.53)';c.fillStyle='rgba(235,245,250,.72)';
  for(const p of game.particles){p.y+=(game.weather==='rain'?430:62)*dt*p.v*dpr;p.x+=(game.weather==='rain'?-68:12)*dt*dpr;if(p.y>h+30){p.y=-30;p.x=Math.random()*w;}if(p.x<0)p.x=w;
    if(game.weather==='rain'){c.beginPath();c.moveTo(p.x,p.y);c.lineTo(p.x-dpr*4,p.y+dpr*13);c.stroke();}
    else{c.beginPath();c.arc(p.x,p.y,p.r*dpr,0,Math.PI*2);c.fill();}
  }
}
function loop(ts){const dt=clamp((ts-(game.last||ts))/1000,0,.04);game.last=ts;
  if(game.engine){if(!game.paused){simulate(dt);trafficState(dt);}const camera=cameraView(),dx=routeX(game.s)+game.lateral,yaw=camera.yaw;
    const model=game.vehicle||{};game.engine.frame(camera,game.daytime==='night',game.weather,game.city,{mesh:model.mesh,isTrolley:game.kind==='trolley',position:[dx,0,game.s],yaw},model.cab,game.doors?model.doorUp:model.doorDown,game.poles?model.up:model.down,game.traffic);
    renderMini();drawWeather(dt);
  }
  $('speed').textContent=(game.speed < -0.2?'R ':'')+String(Math.round(Math.abs(game.speed))).padStart(2,'0');$('speedBar').style.width=(Math.abs(game.speed)/(game.kind==='trolley'?55:65)*100).toFixed(1)+'%';$('clock').textContent=clock();$('condition').textContent=(game.weather==='rain'?'🌧️ Дощ':game.weather==='snow'?'❄️ Сніг':'☀️ Ясно')+(game.daytime==='night'?' • Ніч':' • День');gpsHint();
  game.raf=requestAnimationFrame(loop);
}
function applyVehicle(){setVehicle(game.kind);}
function mountGame(){try{game.engine=new Engine3D($('threeMount'));rebuild();game.traffic=[
  {mesh:genTrafficVehicle(game.engine,[.79,.82,.88]),s:180,dir:-1,speed:9,pos:[0,0,180],yaw:0},
  {mesh:genTrafficVehicle(game.engine,[.65,.23,.23]),s:390,dir:1,speed:10.5,pos:[0,0,390],yaw:0},
  {mesh:genTrafficVehicle(game.engine,[.31,.51,.69]),s:640,dir:-1,speed:11,pos:[0,0,640],yaw:0},
  {mesh:genTrafficVehicle(game.engine,[.89,.70,.30]),s:875,dir:1,speed:8.5,pos:[0,0,875],yaw:0},
  {mesh:genTrafficVehicle(game.engine,[.53,.64,.59]),s:1190,dir:-1,speed:9,pos:[0,0,1190],yaw:0}
  ];
  const cv=document.createElement('canvas');cv.id='weatherCanvas';cv.style.cssText='position:absolute;inset:0;pointer-events:none;width:100%;height:100%;z-index:1;';$('threeMount').appendChild(cv);game.weatherCanvas=cv;game.wctx=cv.getContext('2d');
  $('loading').hidden=true;game.last=performance.now();game.raf=requestAnimationFrame(loop);
}catch(e){console.error(e);$('loading').hidden=false;$('loadHint').textContent='Не вдалося запустити WebGL: '+e.message;}}

document.querySelectorAll('[data-vehicle]').forEach(el=>el.addEventListener('click',()=>{game.kind=el.dataset.vehicle;applyVehicle();if(game.running)start();}));
$('direction').addEventListener('change',()=>{updateOptionsFromUI();if(game.running)start();});
$('camera').addEventListener('change',()=>game.camera=$('camera').value);
$('weather').addEventListener('change',()=>{game.weather=$('weather').value;rebuild();});
$('daytime').addEventListener('change',()=>game.daytime=$('daytime').value);
$('start').addEventListener('click',start);$('heroStart').addEventListener('click',start);
$('doorBtn').addEventListener('click',toggleDoor);$('boardBtn').addEventListener('click',board);$('ticketBtn').addEventListener('click',ticket);
$('hornBtn').addEventListener('click',()=>{sound.start();sound.horn();status('Сигнал увімкнено.','good')});
$('poleBtn').addEventListener('click',togglePoles);$('fuelBtn').addEventListener('click',refuel);$('pauseBtn').addEventListener('click',togglePause);
$('helpBtn').addEventListener('click',()=>$('help').showModal());$('closeHelp').addEventListener('click',()=>$('help').close());
$('fullBtn').addEventListener('click',()=>{if(document.fullscreenElement)document.exitFullscreen();else $('frame').requestFullscreen?.()});
const codeKeys={KeyW:'gas',ArrowUp:'gas',KeyS:'brake',ArrowDown:'brake',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right'};
const cameraModes=['driver','chase','side','cabin'];
window.addEventListener('keydown',e=>{if(/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName||''))return;
  const key=codeKeys[e.code];if(key){e.preventDefault();keys[key]=true;}
  if(e.repeat||e.ctrlKey||e.metaKey)return;
  switch(e.code){case 'KeyO':toggleDoor();break;case 'KeyE':board();break;case 'KeyT':ticket();break;case 'KeyR':togglePoles();break;case 'KeyH':sound.start();sound.horn();break;case 'KeyC':game.camera=cameraModes[(cameraModes.indexOf(game.camera)+1)%cameraModes.length];$('camera').value=game.camera;break;case 'KeyF':refuel();break;case 'KeyP':togglePause();break;}
});
window.addEventListener('keyup',e=>{if(codeKeys[e.code])keys[codeKeys[e.code]]=false});window.addEventListener('blur',()=>Object.keys(keys).forEach(k=>keys[k]=false));
document.querySelectorAll('[data-hold]').forEach(el=>{const key=el.dataset.hold;
  el.addEventListener('pointerdown',e=>{e.preventDefault();keys[key]=true;el.classList.add('pressed');try{el.setPointerCapture(e.pointerId)}catch(_) {}});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(name,()=>{keys[key]=false;el.classList.remove('pressed')});
});
window.addEventListener('resize',()=>game.engine?.resize());
game.total=STOP_NAMES[game.kind].length;setVehicle('trolley');mountGame();

/* Canvas perspective fallback ONLY for blocked/unsupported WebGL environments. The normal mode is WebGL 3D. */
function fallbackFrame(c,cv,camera,night,weather,vehicle,traffic){
  const w=cv.width,h=cv.height, cx=w/2, horizon=h*.52,dir=driverDirection(),cameraMode=camera.kind;
  const sky=c.createLinearGradient(0,0,0,h);if(night){sky.addColorStop(0,'#081125');sky.addColorStop(.66,'#283752');sky.addColorStop(1,'#354557')}else if(weather==='rain'){sky.addColorStop(0,'#627b8e');sky.addColorStop(.7,'#a6b3be');sky.addColorStop(1,'#bdc6c8')}else{sky.addColorStop(0,'#5e9ad2');sky.addColorStop(.70,'#b6dcf2');sky.addColorStop(1,'#dceaf0')}
  c.fillStyle=sky;c.fillRect(0,0,w,h);c.fillStyle=night?'#22322d':weather==='snow'?'#e6e9e4':'#71945f';c.fillRect(0,horizon,w,h-horizon);
  function projection(dx,dist,height=0){const depth=Math.max(2,dist),s=h*.85/(depth+25);return [cx+dx*s,horizon+(2.0-height)*s+110/(1+dist/39),s]}
  // skyline and buildings
  const rz=game.s;const rightSide=routeX(rz);const buildings=[];
  for(let dist=350;dist>=10;dist-=27){let z=rz+dir*dist;if(z<-100||z>(game.total-1)*STEP+200)continue;
    for(const side of [-1,1]){const x=routeX(z)+side*(22+((Math.floor(z/27)%3)*4));const [px,py,s]=projection(x-rightSide,dist,0),height=(15+Math.abs(Math.floor(z/27)%6)*4)*s,width=(12+(Math.floor(dist)%7))*s;
      if(px+width<-w||px-width>w)continue;
      buildings.push({px,py,s,height,width,side,z});
    }
  }
  for(const b of buildings){const light=Math.round(100+b.side*14+Math.abs(b.z)%40);c.fillStyle=night?'#263d53':`rgb(${light+85},${light+84},${light+77})`;
    c.fillRect(b.px-b.width/2,b.py-b.height,b.width,b.height);
    c.fillStyle=night?'#ffce81':'#47778a';const cols=3,rows=Math.max(2,Math.floor(b.height/13));
    for(let iy=0;iy<rows;iy++)for(let ix=0;ix<cols;ix++){if(night && ((ix+iy+Math.floor(b.z))%4===0))continue;
      let ww=Math.min(13,b.width/(cols*2.2)),hh=Math.min(9,b.height/(rows*2.1));c.fillRect(b.px-b.width*.32+ix*b.width*.25,b.py-b.height+6+iy*b.height/rows,ww,hh)}
    c.fillStyle=night?'#102435':'#8a918c';c.fillRect(b.px-b.width/2-2,b.py-b.height-3,b.width+4,3);
  }
  // 3D perspective roadway with bends sampled toward the horizon
  let ptsLeft=[],ptsRight=[];
  for(let dist=340;dist>=0;dist-=8){const z=rz+dir*dist,x=routeX(z);const left=projection(x-rightSide-10.7,dist),right=projection(x-rightSide+10.7,dist);
    ptsLeft.push(left);ptsRight.push(right);}
  c.fillStyle=night?'#333e49':'#47525c';c.beginPath();for(let i=0;i<ptsLeft.length;i++){const p=ptsLeft[i];if(!i)c.moveTo(p[0],p[1]);else c.lineTo(p[0],p[1]);}for(let i=ptsRight.length-1;i>=0;i--){const p=ptsRight[i];c.lineTo(p[0],p[1]);}c.closePath();c.fill();
  c.strokeStyle='rgba(242,238,213,.82)';c.lineWidth=Math.max(1,w/1000);for(const arr of [ptsLeft,ptsRight]){c.beginPath();arr.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.stroke();}
  for(let dist=330;dist>4;dist-=24){const z=rz+dir*dist;const far=projection(routeX(z)-rightSide,dist),near=projection(routeX(z+dir*10)-rightSide,dist+10);
    if((Math.floor(z/28)%3)!==1){c.strokeStyle='rgba(236,216,153,.8)';c.lineWidth=Math.max(1,2.2*far[2]);c.beginPath();c.moveTo(far[0],far[1]);c.lineTo(near[0],near[1]);c.stroke();}
  }
  // roadside utilities, trees, lamps and shelter silhouettes
  for(let dist=310;dist>=12;dist-=39){const z=rz+dir*dist,x=routeX(z),side=(((Math.floor(z/39)+3)%2)*2-1),p=projection(x-rightSide+side*14.1,dist),stem=8*p[2];
    c.lineWidth=Math.max(1,stem*.11);c.strokeStyle=night?'#718492':'#57636a';c.beginPath();c.moveTo(p[0],p[1]);c.lineTo(p[0],p[1]-stem);c.stroke();
    c.fillStyle=night?'#ffe3a4':'#d6e0e3';c.fillRect(p[0]-2*p[2],p[1]-stem,4*p[2],p[2]);
  }
  // active bus stop shelter and stop sign
  const stopZ=zAt(game.atStop),stopDist=dir*(stopZ-rz);if(stopDist>0&&stopDist<270){const x=routeX(stopZ),[px,py,s]=projection(x-rightSide+15,stopDist),scale=clamp(s,1,14);
    c.fillStyle='#2b3e45';c.fillRect(px-4*scale,py-2.65*scale,8*scale,.20*scale);c.fillRect(px-3*scale,py-2.7*scale,.10*scale,2.7*scale);c.fillRect(px+3*scale,py-2.7*scale,.1*scale,2.7*scale);
    c.fillStyle='#7dc5e6';c.fillRect(px-1.5*scale,py-3.7*scale,1.9*scale,1.8*scale);c.fillStyle='white';c.textAlign='center';c.font=`bold ${Math.max(10,Math.min(28,s*1.6))}px sans-serif`;c.fillText('🚏',px,py-2.8*scale);
  }
  if(cameraMode==='driver'||cameraMode==='cabin'){
    // interior windshield frame, dashboard, mirrors and steering wheel
    c.lineWidth=Math.max(7,w*.015);c.strokeStyle=game.kind==='trolley'?'#253a46':'#b99531';c.beginPath();c.moveTo(w*.055,h*.07);c.lineTo(w*.075,h*.77);c.lineTo(w*.93,h*.77);c.lineTo(w*.945,h*.07);c.stroke();
    c.fillStyle=game.kind==='trolley'?'#52636e':'#b08e40';c.fillRect(w*.06,0,w*.88,h*.085);
    c.fillStyle=game.kind==='trolley'?'#25333d':'#493a2c';c.beginPath();c.moveTo(w*.055,h*.78);c.lineTo(w*.945,h*.78);c.lineTo(w,h);c.lineTo(0,h);c.closePath();c.fill();
    c.fillStyle='#131c25';c.fillRect(w*.2,h*.82,w*.48,h*.12);c.fillStyle='#7ec8dc';c.font=`bold ${Math.max(13,w*.019)}px system-ui`;c.textAlign='center';c.fillText(`${game.kind==='trolley'?'ŠKODA 14Tr • 107':'МАРШРУТ 38А'}   ${Math.round(game.speed)} км/год`,cx,h*.895);
    const wx=w*.35,wy=h*1.018,r=w*.075;c.lineWidth=w*.015;c.strokeStyle='#151f28';c.beginPath();c.arc(wx,wy,r,0,Math.PI*2);c.stroke();c.lineWidth=6;c.beginPath();c.moveTo(wx,wy);c.lineTo(wx,wy-r);c.stroke();
    c.fillStyle='#283844';c.fillRect(w*.73,h*.61,w*.13,h*.08);c.fillStyle='#a8c6d1';c.fillRect(w*.735,h*.618,w*.12,h*.063);
    if(cameraMode==='cabin'){c.fillStyle='rgba(39,43,50,.85)';for(let j=0;j<3;j++){const x=w*(.18+j*.3);c.fillRect(x,h*.64+j*5,48,68)}}
  } else {
    const scale=w/1000;const front=cameraMode==='chase';let x=cx,y=h*(front?.65:.73),width=(game.kind==='trolley'?138:106)*scale,height=(game.kind==='trolley'?160:122)*scale;
    c.fillStyle=game.kind==='trolley'?'#eceadf':'#ebbe30';c.fillRect(x-width/2,y-height,width,height);
    c.fillStyle=game.kind==='trolley'?'#2457a3':'#c79f24';c.fillRect(x-width/2,y-height*.45,width,height*.16);
    c.fillStyle='#253c52';c.fillRect(x-width*.43,y-height*.89,width*.86,height*.40);c.fillStyle='#a6bdcd';c.fillRect(x-width*.15,y-height*.38,width*.30,height*.22);
    c.fillStyle='#121d25';c.font=`bold ${Math.max(13,width*.18)}px system-ui`;c.textAlign='center';c.fillText(game.kind==='trolley'?'107':'38',x,y-height*.55);
  }
}
