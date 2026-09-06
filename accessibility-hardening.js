(function(){
  'use strict';

  var previousFocus=new WeakMap();
  var observedModals=new WeakSet();
  var generatedId=0;
  var actionNames={
    openCmd:'Open command palette',openMobileSearch:'Search',toggleTopNotif:'Notifications',
    toggleMobileQuickAdd:'Add item',toggleVoice:'Voice input',toggleTheme:'Toggle color mode',
    openHelpAssistant:'Help and support',closeMobileSearch:'Close search',closeJelixDrawer:'Close J.E.L.I.X.'
  };

  function nextId(prefix){generatedId+=1;return prefix+'-'+generatedId;}

  function matchesWithin(root,selector){
    var scope=root||document;
    var matches=[];
    if(scope.nodeType===1&&scope.matches(selector))matches.push(scope);
    return matches.concat(Array.from(scope.querySelectorAll(selector)));
  }

  function labelForms(root){
    matchesWithin(root,'.fg label, label.fl').forEach(function(label){
      if(label.htmlFor)return;
      var owner=label.closest('.fg')||label.parentElement;
      var field=owner&&owner.querySelector('input:not([type="hidden"]),select,textarea');
      if(!field)return;
      if(!field.id)field.id=nextId('field');
      label.htmlFor=field.id;
    });
  }

  function humanize(value){
    return String(value||'').replace(/^(tf|cf|ce|hl|jf|sf|auth)-/,'').replace(/[-_]+/g,' ').replace(/\b\w/g,function(letter){return letter.toUpperCase();});
  }

  function labelLooseFields(root){
    matchesWithin(root,'input:not([type="hidden"]),select,textarea').forEach(function(field){
      if(field.getAttribute('aria-label')||field.getAttribute('aria-labelledby')||(field.labels&&field.labels.length))return;
      var name=field.getAttribute('placeholder')||field.getAttribute('name')||field.id||field.type||'Field';
      field.setAttribute('aria-label',humanize(name.replace(/\.{3}$/,'')));
    });
  }

  function readableAction(el){
    var text=(el.textContent||'').replace(/\s+/g,' ').trim();
    if(text)return text;
    if(el.title)return el.title;
    var onclick=el.getAttribute('onclick')||'';
    var match=onclick.match(/^\s*([\w$]+)/);
    if(match&&actionNames[match[1]])return actionNames[match[1]];
    var icon=el.querySelector('i');
    if(icon){
      var cls=icon.className||'';
      if(/trash|delete/.test(cls))return 'Delete';
      if(/pencil|edit/.test(cls))return 'Edit';
      if(/chevron-up/.test(cls))return 'Move up';
      if(/chevron-down/.test(cls))return 'Move down';
      if(/close|x/.test(cls))return 'Close';
      if(/search/.test(cls))return 'Search';
      if(/bell/.test(cls))return 'Notifications';
      if(/plus/.test(cls))return 'Add item';
    }
    return 'Action';
  }

  function enhanceActions(root){
    matchesWithin(root,'[onclick]').forEach(function(el){
      if(/^(BUTTON|A|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(el.tagName))return;
      if(!el.hasAttribute('role'))el.setAttribute('role','button');
      if(!el.hasAttribute('tabindex'))el.tabIndex=0;
      if(!el.hasAttribute('aria-label')&&!(el.textContent||'').trim())el.setAttribute('aria-label',readableAction(el));
      if(el.dataset.keyboardClick)return;
      el.dataset.keyboardClick='true';
      if(el.hasAttribute('onkeydown'))return;
      el.addEventListener('keydown',function(event){
        if(event.key==='Enter'||event.key===' '){event.preventDefault();el.click();}
      });
    });
    matchesWithin(root,'button:not([aria-label])').forEach(function(button){
      if(!(button.textContent||'').trim())button.setAttribute('aria-label',readableAction(button));
    });
  }

  function focusable(modal){
    return Array.from(modal.querySelectorAll('button,[href],input,select,textarea,summary,[tabindex]:not([tabindex="-1"])'))
      .filter(function(el){return !el.disabled&&el.getClientRects().length;});
  }

  function enhanceModals(root){
    matchesWithin(root,'.mov').forEach(function(modal){
      modal.setAttribute('role','dialog');
      modal.setAttribute('aria-modal','true');
      var title=modal.querySelector('.mt,.modal h1,.modal h2,[contenteditable="true"]');
      if(title){if(!title.id)title.id=nextId('dialog-title');modal.setAttribute('aria-labelledby',title.id);}
      if(title&&title.getAttribute('contenteditable')==='true'){
        title.setAttribute('role','textbox');
        if(!title.getAttribute('aria-label'))title.setAttribute('aria-label','Note title');
      }
      modal.querySelectorAll('.mc').forEach(function(close){if(!close.getAttribute('aria-label'))close.setAttribute('aria-label','Close dialog');});
    });
  }

  function observeModals(){
    matchesWithin(document,'.mov').forEach(function(modal){
      if(observedModals.has(modal))return;
      observedModals.add(modal);
      new MutationObserver(function(){
        if(modal.classList.contains('open')){
          previousFocus.set(modal,document.activeElement);
          requestAnimationFrame(function(){var items=focusable(modal);if(items[0])items[0].focus();});
        }else{
          var target=previousFocus.get(modal);
          if(target&&document.contains(target))target.focus();
        }
      }).observe(modal,{attributes:true,attributeFilter:['class']});
    });
  }

  function trapDialogKeys(event){
    var modal=document.querySelector('.mov.open');
    if(!modal)return;
    if(event.key==='Escape'){
      event.preventDefault();
      if(typeof window.closeModal==='function')window.closeModal(modal.id);
      return;
    }
    if(event.key!=='Tab')return;
    var items=focusable(modal);if(!items.length)return;
    var first=items[0],last=items[items.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }

  function init(){
    var taskStrip=document.querySelector('#view-tasks .task-kpi-strip');
    if(taskStrip){taskStrip.setAttribute('role','region');taskStrip.setAttribute('aria-label','Task metrics. Swipe horizontally for more.');taskStrip.tabIndex=0;}
    labelForms(document);labelLooseFields(document);enhanceActions(document);enhanceModals(document);observeModals();
    document.addEventListener('keydown',trapDialogKeys);
    new MutationObserver(function(records){records.forEach(function(record){record.addedNodes.forEach(function(node){if(node.nodeType!==1)return;labelForms(node);labelLooseFields(node);enhanceActions(node);enhanceModals(node);observeModals();});});}).observe(document.body,{childList:true,subtree:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
