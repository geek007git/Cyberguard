import React,{useState} from 'react';

export default function ThreatChart({incidents,period}){
  const[hover,setHover]=useState(null),points=Array(25).fill(0);
  const now=Date.now(),anchor=Math.max(now,...incidents.map(i=>Date.parse(i.timestamp))),hours=Math.max(1,period);
  incidents.forEach(i=>{const age=(anchor-Date.parse(i.timestamp))/3600000,index=Math.max(0,Math.min(24,Math.floor((hours-age)/hours*24)));points[index]++;});
  const max=Math.max(4,...points),coords=points.map((n,i)=>[48+i*25.5,162-n/max*125]);
  const path=coords.map(([x,y],i)=>`${i?'L':'M'}${x},${y}`).join(' ');
  const hovered=hover==null?null:{x:Math.max(55,Math.min(540,coords[hover][0]-65)),y:Math.max(4,coords[hover][1]-57),count:points[hover],at:new Date(anchor-(24-hover)/24*hours*3600000)};
  return <div className="chart-wrap"><svg viewBox="0 0 690 204" role="group" aria-label={`${incidents.length} findings over ${Math.round(hours)} hours. Focus a data point for details.`}>
    <defs><linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#14a77c" stopOpacity=".17"/><stop offset="100%" stopColor="#14a77c" stopOpacity=".005"/></linearGradient></defs>
    {[0,1,2,3,4].map(n=><g key={n}><line x1="48" x2="660" y1={162-n*31.25} y2={162-n*31.25} stroke="#edf0f3" strokeDasharray="3 4"/><text x="29" y={166-n*31.25} textAnchor="end">{Math.round(max*n/4)}</text></g>)}
    <path d={`${path} L660,162 L48,162 Z`} fill="url(#area-fill)"/><path d={path} fill="none" stroke="#159c79" strokeWidth="2.3" strokeLinejoin="round"/>
    {coords.map(([x,y],i)=>points[i]>0&&<circle key={i} cx={x} cy={y} r={hover===i?5:3.5} fill="#159c79" stroke="white" strokeWidth="1.5" tabIndex="0" role="img" aria-label={`${points[i]} findings approximately ${Math.round((24-i)/24*hours)} hours before the range end`} onMouseEnter={()=>setHover(i)} onMouseLeave={()=>setHover(null)} onFocus={()=>setHover(i)} onBlur={()=>setHover(null)}><title>{`${points[i]} findings`}</title></circle>)}
    {[0,4,8,12,16,20,24].map(n=><text key={n} x={48+n*25.5} y="191" textAnchor="middle">{n===24?(anchor>now+60000?'Latest':'Now'):`−${Math.round(hours*(24-n)/24)}h`}</text>)}
    {hovered&&<g pointerEvents="none"><rect x={hovered.x} y={hovered.y} width="124" height="44" fill="#24483b" rx="5"/><text x={hovered.x+10} y={hovered.y+17} style={{fill:'#fff',fontSize:11}}>{`${hovered.count} findings`}</text><text x={hovered.x+10} y={hovered.y+32} style={{fill:'#b2d3c5',fontSize:9}}>{hovered.at.toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</text></g>}
  </svg></div>;
}
