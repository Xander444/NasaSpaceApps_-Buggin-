const steps=[
  {id:'project',label:'Project',href:'/'},
  {id:'evidence',label:'Evidence',href:'/evidence'},
  {id:'cabin',label:'Cabin screening',href:'/simulator?demo=1'},
  {id:'hotspot',label:'Hotspot explanation',href:'/simulator?demo=1#hotspot-explanation'},
];

export default function DemoPath({currentStep,compact=false}){
  return <nav className={`demo-path${compact?' compact':''}`} aria-label="Guided demo path">
    <ol>{steps.map((step,index)=><li key={step.id}>
      <a href={step.href} aria-current={currentStep===step.id?'step':undefined}>
        <span>{String(index+1).padStart(2,'0')}</span>{step.label}
      </a>
    </li>)}</ol>
  </nav>;
}
