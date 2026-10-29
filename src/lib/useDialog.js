import {useEffect,useRef} from 'react';
export function useDialog(ref,open,onClose){
  const close=useRef(onClose);close.current=onClose;
  useEffect(()=>{
    if(!open||!ref.current)return;
    const dialog=ref.current,previous=document.activeElement,overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const focusables=()=>[...dialog.querySelectorAll('button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')].filter(e=>e.getClientRects().length);
    focusables()[0]?.focus();
    const keydown=e=>{
      if(e.key==='Escape'){e.preventDefault();close.current();}
      if(e.key==='Tab'){const list=focusables(),first=list[0],last=list.at(-1);if(!list.length){e.preventDefault();return;}if(e.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){e.preventDefault();first.focus();}}
    };
    document.addEventListener('keydown',keydown);
    return()=>{document.removeEventListener('keydown',keydown);document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus();};
  },[open,ref]);
}
