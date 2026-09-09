import { useEffect, useState } from 'react';
import { localBible, type CrossReference } from '@the-word/bible';
import type { WordApp } from '@the-word/core';
export interface PassageSnapshot { bookId:number; chapter:number; verse:number; reference:string; translationId:string; text:string; refs:CrossReference[] }
export function snapshot(app:WordApp, verse:number):PassageSnapshot {
  return { bookId:app.bookId, chapter:app.chapterNumber, verse, reference:`${app.bookName} ${app.chapterNumber}:${verse}`, translationId:app.translationId,
    text:app.chapter?.verses.find(v=>v.ref.verse===verse)?.text??'', refs:app.crossRefs[verse]??[] };
}
export function PassageTools({passage,app,guide,onNavigate,onRefresh,follow,onFollow}: {passage:PassageSnapshot|null;app:WordApp;guide?:boolean;onNavigate:(book:number,chapter:number,verse:number)=>void;onRefresh:()=>void;follow:boolean;onFollow:(value:boolean)=>void}) {
  const [texts,setTexts]=useState<Record<string,string>>({});
  const [context,setContext]=useState<{verse:number;text:string}[]>([]);
  const [failed,setFailed]=useState(false);
  useEffect(()=>{
    let live=true; setFailed(false); setTexts({}); setContext([]);
    if (!passage) return;
    Promise.all([localBible.getChapter(passage.translationId,passage.bookId,passage.chapter),Promise.all(passage.refs.map(async r=>{
      const chapter=await localBible.getChapter(passage.translationId,r.bookId,r.chapter);
      return [`${r.bookId}:${r.chapter}:${r.verse}`,chapter?.verses.find(v=>v.ref.verse===r.verse)?.text??''] as const;
    }))]).then(([chapter,refs])=>{if(live){setTexts(Object.fromEntries(refs));setContext(chapter?.verses.filter(v=>Math.abs(v.ref.verse-passage.verse)<=2).map(v=>({verse:v.ref.verse,text:v.text}))??[]);}}).catch(()=>{if(live)setFailed(true);});
    return ()=>{live=false;};
  },[passage]);
  if (!passage) return <div className="tool-empty"><h2>A little more context.</h2><p>Select a verse to explore its surrounding passage and references.</p></div>;
  const translation=app.translations.find(t=>t.id===passage.translationId)?.shortName??passage.translationId;
  return <div className="passage-tool"><span className="workspace-eyebrow">{guide?'Read in context':'Cross references'} · {translation}</span><h2>{passage.reference}</h2><blockquote>{passage.text}</blockquote>
    <div className="context-options"><label><input type="checkbox" checked={follow} onChange={e=>onFollow(e.target.checked)} />Follow current verse</label><button onClick={onRefresh}>Use selected verse</button></div>
    <p className="muted">{follow?'Updates with the current reading.':'Pinned to this passage. Group navigation will not change it.'}</p>
    {failed && <p role="alert">This passage could not be loaded. Try selecting it again when connected.</p>}
    {guide && <><h3>Read the surrounding verses</h3>{context.map(v=><p key={v.verse} className={v.verse===passage.verse?'context-current':''}><sup>{v.verse}</sup> {v.text}</p>)}<h3>Reflect on the text</h3><ul><li>Who is speaking, and to whom?</li><li>How do the surrounding verses clarify this passage?</li><li>Which words support your understanding?</li></ul><p className="muted">This guide quotes Scripture and offers study questions. It does not generate an interpretation. Model-based explanations remain a separate future feature.</p></>}
    <h3>Related Scripture</h3>{passage.refs.length ? passage.refs.map(r=>{const key=`${r.bookId}:${r.chapter}:${r.verse}`;return <button className="xref-item" key={key} onClick={()=>onNavigate(r.bookId,r.chapter,r.verse)}><strong>{localBible.getBook(r.bookId,passage.translationId)?.name} {r.chapter}:{r.verse}</strong><span>{texts[key]||'Loading passage…'}</span><small>Open in reader · browse independently</small></button>;}):<p className="muted">No cross references are listed for this verse.</p>}
    <p className="xref-credit">{app.label.crossReferenceCredit}</p>
  </div>;
}
