import { useState, type ReactNode } from 'react';
export type ToolId = 'group' | 'references' | 'guide' | 'image' | 'settings' | 'sound' | 'progress' | 'study';
export const toolNames: Record<ToolId,string> = { group:'Group Study', references:'References', guide:'Passage guide', image:'Verse image', settings:'Settings', sound:'Sound', progress:'Your reading', study:'Plans & circles' };
type Entry = { id: ToolId; slot: number };
export function useTools() {
  const [entries,setEntries] = useState<Entry[]>([]);
  const [active,setActive] = useState<(ToolId|null)[]>([null,null]);
  const [focused,setFocused] = useState<ToolId|null>(null);
  const [expanded,setExpanded] = useState(false);
  function open(id: ToolId) {
    setFocused(id);
    const existing=entries.find(e=>e.id===id);
    const slot=existing?.slot ?? (id==='group' ? 0 : entries.some(e=>e.slot===0) ? 1 : 0);
    if (!existing) setEntries(es=>[...es,{id,slot}]);
    setActive(a=>a.map((v,i)=>i===slot?id:v));
  }
  function close(id: ToolId) {
    const remaining=entries.filter(e=>e.id!==id);
    setFocused(current=>current===id?remaining[0]?.id??null:current);
    setEntries(remaining); setActive(a=>a.map((v,i)=>v===id ? remaining.find(e=>e.slot===i)?.id??null : v));
  }
  function move(id: ToolId) {
    const source=entries.find(e=>e.id===id)?.slot??0, target=1-source;
    setEntries(es=>es.map(e=>e.id===id?{...e,slot:target}:e));
    setActive(a=>a.map((v,i)=>i===target?id:v===id?entries.find(e=>e.id!==id&&e.slot===i)?.id??null:v));
  }
  return { focused,entries,active,setActive,open,close,move,expanded,setExpanded };
}
export function ToolDock({ tools, children }: { tools:ReturnType<typeof useTools>; children:Partial<Record<ToolId,ReactNode>> }) {
  const [split,setSplit] = useState(50);
  const slots=[0,1].filter(slot=>tools.entries.some(e=>e.slot===slot));
  return <aside className={`tool-dock ${tools.expanded?'expanded':''}`} aria-label="Study workspace tools" hidden={!tools.entries.length}>
    <div className="dock-heading"><span className="workspace-eyebrow">Your study desk</span><button onClick={()=>tools.setExpanded(!tools.expanded)} aria-pressed={tools.expanded}>{tools.expanded?'Restore width':'Expand'}</button></div>
    {slots.length===2 && <label className="pane-resize">Panel split<input type="range" min="25" max="75" value={split} onChange={e=>setSplit(+e.target.value)} aria-label="Resize study panels" /></label>}
    <nav className="mobile-tool-tabs" aria-label="Open tools">{tools.entries.map(e=><button key={e.id} aria-pressed={tools.focused===e.id} onClick={()=>tools.open(e.id)}>{toolNames[e.id]}</button>)}</nav>
    <div className="tool-grid" style={{gridTemplateRows:slots.length===2?`auto minmax(0, ${split}fr) auto minmax(0, ${100-split}fr)`:'auto minmax(0, 1fr)'}}>
      {slots.map((slot,index)=><div key={`tabs-${slot}`} className="tool-tabs" role="tablist" aria-label={slot===0?'Upper tools':'Lower tools'} style={{gridRow:index*2+1}}>{tools.entries.filter(e=>e.slot===slot).map(e=><button key={e.id} id={`tab-${e.id}`} role="tab" aria-selected={tools.active[slot]===e.id} aria-controls={`tool-${e.id}`} onClick={()=>tools.open(e.id)}>{toolNames[e.id]}</button>)}</div>)}
      {tools.entries.map(e=><section key={e.id} id={`tool-${e.id}`} className={`tool-pane ${tools.focused===e.id?'mobile-active':''}`} role="tabpanel" aria-labelledby={`tab-${e.id}`} hidden={tools.active[e.slot]!==e.id} style={{gridRow:slots.indexOf(e.slot)*2+2}}>
        <div className="pane-actions"><button onClick={()=>tools.move(e.id)} aria-label={`Move ${toolNames[e.id]} to ${e.slot===0?'lower':'upper'} pane`}>{e.slot===0?'Move below':'Move above'}</button><button onClick={()=>tools.close(e.id)} aria-label={`Close ${toolNames[e.id]}`}>Close ×</button></div>
        <div className="pane-content">{children[e.id]}</div>
      </section>)}
    </div>
  </aside>;
}
