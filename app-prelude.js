function debounce(fn,ms){
  let t=null;
  return function(...args){clearTimeout(t);t=setTimeout(()=>fn.apply(this,args),ms||1000);};
}

function localDateStr(d){
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
  return y+'-'+m+'-'+day;
}
