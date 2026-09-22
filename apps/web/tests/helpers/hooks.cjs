// Small hook runner for exercising queue transitions without a browser renderer.
exports.hooks = function hooks(render) {
  let cursor = 0, dirty = true, value;
  const slots = [], effects = [];
  const changed = (a,b) => !a || !b || a.length !== b.length || a.some((v,i) => !Object.is(v,b[i]));
  const react = {
    useState(initial) {
      const i = cursor++;
      slots[i] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, next => {
        next = typeof next === 'function' ? next(slots[i].value) : next;
        if (!Object.is(next, slots[i].value)) { slots[i].value = next; dirty = true; }
      }];
    },
    useRef(initial) { const i=cursor++; slots[i] ??= {value:{current:initial}}; return slots[i].value; },
    useMemo(fn,deps) { const i=cursor++; if (!slots[i] || changed(slots[i].deps,deps)) slots[i]={value:fn(),deps}; return slots[i].value; },
    useCallback(fn,deps) { return react.useMemo(()=>fn,deps); },
    useEffect(fn,deps) { const i=cursor++; if (!slots[i] || changed(slots[i].deps,deps)) effects.push(()=>{slots[i]?.cleanup?.(); slots[i]={deps,cleanup:fn()};}); },
  };
  return {
    react,
    flush() { dirty=true; let loops=0; while(dirty) { if(++loops>60) throw Error('Hook render loop'); dirty=false; cursor=0; value=render(); effects.splice(0).forEach(fn=>fn()); } return value; },
    dispose() { slots.forEach(s=>s?.cleanup?.()); },
  };
};
