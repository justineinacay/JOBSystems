(() => {
  document.querySelectorAll('[onclick]').forEach((element) => {
    if (element.tagName !== 'DIV' || element.getAttribute('role') || element.hasAttribute('tabindex')) return;
    element.setAttribute('role','button');
    element.setAttribute('tabindex','0');
    element.addEventListener('keydown',(event)=>{
      if(event.key==='Enter'||event.key===' '){event.preventDefault();element.click();}
    });
  });
  document.addEventListener('keydown',(event)=>{
    if(event.key!=='Escape')return;
    if(typeof closeMobileQuickAdd==='function')closeMobileQuickAdd();
    const menu=document.getElementById('mobileMoreMenu');
    if(menu&&!menu.classList.contains('hidden'))menu.classList.add('hidden');
  });
})();
