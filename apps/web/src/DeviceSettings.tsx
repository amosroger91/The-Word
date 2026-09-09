import { useState } from 'react';
import type { ReadParty } from './useReadParty';
import { getDevices } from './media';
export function DeviceSettings({party}:{party:ReadParty}) {
  const [list,setList]=useState<MediaDeviceInfo[]>([]);
  const [selected,setSelected]=useState(getDevices);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  async function load() {
    try {setList(await navigator.mediaDevices.enumerateDevices());setError('');}
    catch {setError('Device choices are unavailable. Check your browser permissions.');}
  }
  return <section className="device-settings"><h3>Microphone & camera</h3><p>Choose devices here, then use the meeting controls to turn them on. Device names may appear only after permission is granted.</p><button onClick={load}>Refresh device list</button>
    <label>Microphone<select aria-label="Microphone device" value={selected.microphone} onChange={e=>setSelected(s=>({...s,microphone:e.target.value}))}><option value="">System default</option>{list.filter(d=>d.kind==='audioinput').map((d,i)=><option key={d.deviceId||i} value={d.deviceId}>{d.label||`Microphone ${i+1}`}</option>)}</select></label>
    <label>Camera<select aria-label="Camera device" value={selected.camera} onChange={e=>setSelected(s=>({...s,camera:e.target.value}))}><option value="">System default</option>{list.filter(d=>d.kind==='videoinput').map((d,i)=><option key={d.deviceId||i} value={d.deviceId}>{d.label||`Camera ${i+1}`}</option>)}</select></label>
    <button disabled={busy} onClick={async()=>{setBusy(true);await party.chooseDevices(selected.microphone,selected.camera);setBusy(false);}}>{busy?'Applying…':'Apply devices'}</button>{error&&<p role="alert">{error}</p>}
  </section>;
}
