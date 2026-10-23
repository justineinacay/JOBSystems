/*
 * JOBSystems animated contour field.
 * Visual behavior inspired by the MIT-licensed BrewedOps portfolio-template.
 * This implementation is purpose-built for the JOBSystems shell.
 */
(function(){
  'use strict';

  var canvas=document.getElementById('osContourCanvas');
  if(!canvas)return;

  var reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  var coarse=window.matchMedia('(pointer: coarse)');
  var gl=canvas.getContext('webgl2',{
    alpha:false,antialias:false,depth:false,stencil:false,powerPreference:'low-power'
  });
  if(!gl){document.documentElement.dataset.osContourFallback='true';return;}

  var vertexSource='#version 300 es\n'+
    'precision highp float;out vec2 vUv;void main(){'+
    'vec2 p=vec2(gl_VertexID==1?2.0:0.0,gl_VertexID==2?2.0:0.0);'+
    'vUv=p*.5;gl_Position=vec4(p*2.0-1.0,0.0,1.0);}';

  var fragmentSource='#version 300 es\n'+
    'precision highp float;uniform float uTime;uniform vec2 uPointer;uniform float uEnergy;'+
    'uniform float uAspect;uniform float uDark;in vec2 vUv;out vec4 outColor;'+
    'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}'+
    'float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);'+
    'return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}'+
    'float fbm(vec2 p){float value=0.0,amp=.5;mat2 turn=mat2(.8,-.6,.6,.8);'+
    'for(int i=0;i<5;i++){value+=amp*noise(p);p=turn*p*2.03+17.1;amp*=.5;}return value;}'+
    'void main(){vec2 uv=vUv;uv.x*=uAspect;vec2 pointer=(uPointer*.5+.5);pointer.x*=uAspect;'+
    'float influence=smoothstep(.72,0.0,distance(uv,pointer))*uEnergy;'+
    'vec2 drift=vec2(uTime*.15,-uTime*.11);float field=fbm(uv*1.22+drift+influence*.08);'+
    'field+=.28*fbm(uv*2.1-drift*.45);float bands=field*5.1;float edge=abs(fract(bands)-.5);'+
    'float line=1.0-smoothstep(.006+.5*fwidth(bands),.018+fwidth(bands),edge);'+
    'vec3 lightBg=vec3(.957,.965,.953),darkBg=vec3(.032,.043,.038);'+
    'vec3 lightLine=vec3(.29,.49,.12),darkLine=vec3(.57,.86,.20);'+
    'vec3 bg=mix(lightBg,darkBg,uDark),ink=mix(lightLine,darkLine,uDark);'+
    'float alpha=line*mix(.16,.18,uDark);vec3 color=mix(bg,ink,alpha);'+
    'color+=influence*mix(vec3(.006,.012,.004),vec3(.006,.018,.008),uDark);outColor=vec4(color,1.0);}';

  function shader(type,source){
    var item=gl.createShader(type);
    gl.shaderSource(item,source);gl.compileShader(item);
    if(!gl.getShaderParameter(item,gl.COMPILE_STATUS)){
      console.warn('[JOBSystems] Contour shader unavailable.');gl.deleteShader(item);return null;
    }
    return item;
  }

  var vertex=shader(gl.VERTEX_SHADER,vertexSource);
  var fragment=shader(gl.FRAGMENT_SHADER,fragmentSource);
  if(!vertex||!fragment)return;
  var program=gl.createProgram();
  gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
  gl.deleteShader(vertex);gl.deleteShader(fragment);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS)){gl.deleteProgram(program);return;}
  gl.useProgram(program);

  var uniforms={
    time:gl.getUniformLocation(program,'uTime'),pointer:gl.getUniformLocation(program,'uPointer'),
    energy:gl.getUniformLocation(program,'uEnergy'),aspect:gl.getUniformLocation(program,'uAspect'),
    dark:gl.getUniformLocation(program,'uDark')
  };
  var target={x:0,y:0},current={x:0,y:0},previous={x:0,y:0};
  var energy=0,time=0,dark=document.documentElement.dataset.theme==='dark'?1:0;
  var darkTarget=dark,frame=0,last=performance.now(),visible=document.visibilityState!=='hidden',disposed=false;

  function resize(){
    var bounds=canvas.getBoundingClientRect();
    var scale=coarse.matches?.72:Math.min(window.devicePixelRatio||1,1.25);
    var width=Math.max(1,Math.round(bounds.width*scale));
    var height=Math.max(1,Math.round(bounds.height*scale));
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;gl.viewport(0,0,width,height);}
    gl.uniform1f(uniforms.aspect,bounds.width/Math.max(bounds.height,1));
  }
  function readTheme(){darkTarget=document.documentElement.dataset.theme==='dark'?1:0;}
  function draw(now){
    if(disposed||!visible)return;
    frame=requestAnimationFrame(draw);
    var interval=coarse.matches?1000/18:1000/30;
    if(!reduced.matches&&now-last<interval-1)return;
    var delta=Math.min(.05,Math.max(.001,(now-last)/1000));last=now;
    if(!reduced.matches)time+=delta*.075;
    var follow=1-Math.exp(-4*delta);
    current.x+=(target.x-current.x)*follow;current.y+=(target.y-current.y)*follow;
    var speed=Math.min(1,Math.hypot(current.x-previous.x,current.y-previous.y)/delta*.22);
    energy+=(speed-energy)*(1-Math.exp(-7*delta));previous.x=current.x;previous.y=current.y;
    dark+=(darkTarget-dark)*(1-Math.exp(-7*delta));
    gl.uniform1f(uniforms.time,time);gl.uniform2f(uniforms.pointer,current.x,current.y);
    gl.uniform1f(uniforms.energy,reduced.matches||coarse.matches?0:energy);gl.uniform1f(uniforms.dark,dark);
    gl.drawArrays(gl.TRIANGLES,0,3);
    document.documentElement.dataset.osContourReady='true';
    if(reduced.matches)cancelAnimationFrame(frame);
  }
  function restart(){cancelAnimationFrame(frame);last=performance.now();frame=requestAnimationFrame(draw);}
  function pointerMove(event){
    if(coarse.matches||reduced.matches)return;
    var bounds=canvas.getBoundingClientRect();
    target.x=((event.clientX-bounds.left)/Math.max(bounds.width,1))*2-1;
    target.y=-(((event.clientY-bounds.top)/Math.max(bounds.height,1))*2-1);
  }
  function visibility(){visible=document.visibilityState!=='hidden';if(visible)restart();else cancelAnimationFrame(frame);}

  var themeObserver=new MutationObserver(readTheme);
  themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  window.addEventListener('resize',resize,{passive:true});
  window.addEventListener('pointermove',pointerMove,{passive:true});
  document.addEventListener('visibilitychange',visibility);
  reduced.addEventListener?.('change',restart);
  coarse.addEventListener?.('change',function(){resize();restart();});
  canvas.addEventListener('webglcontextlost',function(event){event.preventDefault();cancelAnimationFrame(frame);});
  canvas.addEventListener('webglcontextrestored',restart);
  window.addEventListener('pagehide',function(){
    disposed=true;cancelAnimationFrame(frame);themeObserver.disconnect();gl.deleteProgram(program);
  },{once:true});

  resize();restart();
})();
