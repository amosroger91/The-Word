import { useEffect, useRef, useState, type ReactNode } from 'react';
export type ToolId = 'group' | 'references' | 'guide' | 'image' | 'settings' | 'sound' | 'progress' | 'study' | 'breakdown' | 'share';
export const toolNames: Record<ToolId,string> = { group:'Group Study', references:'References', guide:'Passage guide', image:'Verse image', settings:'Settings', sound:'Sound', progress:'Your reading', study:'Plans & circles', breakdown:'Break it down', share:'Share passage' };
export const pageTools: ToolId[] = ['settings', 'study', 'progress', 'image'];
export function useTools() {
  // Keep visited views mounted so switching tasks preserves drafts and scroll.
  const [visited,setVisited] = useState<ToolId[]>([]);
  const [focused,setFocused] = useState<ToolId|null>(null);
  function open(id: ToolId) {
    setVisited(ids => ids.includes(id) ? ids : [...ids,id]);
    setFocused(id);
  }
  function close(id: ToolId) { setFocused(current => current === id ? null : current); }
  function dismiss() { setFocused(null); }
  return { visited, focused, open, close, dismiss };
}
export function ToolDock({ tools, children, names = toolNames, backLabel, onBack }: {
  tools:ReturnType<typeof useTools>; children:Partial<Record<ToolId,ReactNode>>;
  names?: Record<ToolId,string>; backLabel:string; onBack:()=>void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (tools.focused) heading.current?.focus(); }, [tools.focused]);
  return <aside className="tool-dock" aria-label={tools.focused ? names[tools.focused] : 'Study'} hidden={!tools.focused}
    onKeyDown={event=>{if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();onBack();}}}>
    <div className="dock-heading"><button className="pane-close" aria-label={backLabel} title={backLabel} onClick={onBack}><span aria-hidden="true">×</span></button>
      <h2 ref={heading} tabIndex={-1}>{tools.focused ? names[tools.focused] : ''}</h2></div>
    {tools.visited.map(id=><section key={id} className="tool-pane" aria-label={names[id]} hidden={tools.focused!==id}>
      <div className="pane-content">{children[id]}</div>
    </section>)}
  </aside>;
}
