import React from 'react';
import {Citations} from './Evidence';
import {DISPLAY_FIELDS,displayValue,evidenceFieldValue,uniqueObservationFields} from './insights';

function Claim({label,children,sourceIds,index,tone=''}){
  return <section className={`insight-claim${tone?` ${tone}`:''}`}>
    <h3>{label}</h3>
    <p>{children}</p>
    {sourceIds?.length>0&&<Citations ids={sourceIds} index={index}/>}
  </section>;
}

export default function InsightPanel({insight,index}){
  if(!insight)return null;
  return <section className="scientific-insight" aria-labelledby="scientific-insight-title">
    <div className="scientific-insight-heading">
      <div><span className="step-label">SCIENTIFIC INSIGHT · INDEX-BOUNDED</span><h2 id="scientific-insight-title">Understand what this search supports</h2></div>
      <span className="insight-method">Deterministic templates · source-linked</span>
    </div>
    <Claim label="What the indexed research covers" sourceIds={insight.sourceIds} index={index}>{insight.summary}</Claim>

    <details className="insight-experiments">
      <summary>Experimental evidence · {insight.evidenceRows.length} indexed test row(s)</summary>
      {!insight.evidenceRows.length?<p className="insight-empty">No test rows were retrieved in this search. Investigation descriptions are not test measurements.</p>:<div className="insight-row-list">{insight.evidenceRows.map(({doc,investigation})=><article className="insight-row" key={doc.id}>
        <div className="insight-row-heading"><div><b>{investigation.program} · {doc.accession}</b><span>{doc.title} · {doc.evidence_level}</span></div><code>{doc.id}</code></div>
        {doc.evidence_scope&&<p className="insight-scope">Scope: {doc.evidence_scope}</p>}
        <dl>{DISPLAY_FIELDS.map(field=><div key={field}><dt>{displayValue(field)}</dt><dd>{evidenceFieldValue(doc,field)}{doc.conditions?.[field]?.method&&<small>{doc.conditions[field].method}</small>}</dd></div>)}</dl>
        {doc.warnings?.length>0&&<ul className="insight-warnings">{doc.warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul>}
        <Citations ids={doc.source_ids} index={index}/>
      </article>)}</div>}
    </details>

    <div className="insight-interpretations">
      <Claim label="Reported observations" sourceIds={insight.observations.flatMap(item=>item.row.doc.source_ids||[])} index={index} tone="reported">
        {insight.observations.length
          ? `The indexed rows report values for ${uniqueObservationFields(insight.observations).join(', ')}. Values below are shown as source-reported conditions or outcomes, not safety thresholds.`
          : 'No normalized test measurements or outcomes were retrieved. Unknown fields remain unknown; catalog objectives and hypotheses are not treated as findings.'}
      </Claim>
      <Claim label="Scientific interpretation" sourceIds={insight.sourceIds} index={index} tone="interpretation">{insight.interpretation}</Claim>
      <Claim label="Why it may matter" sourceIds={insight.sourceIds} index={index} tone="relevance">{insight.relevance}</Claim>
    </div>

    <details className="insight-gaps" open={insight.noMatches||insight.gaps.some(gap=>gap.kind==='gap'||gap.kind==='no-tests')}>
      <summary>Evidence gaps and limitations · {insight.gaps.length}</summary>
      <ul>{insight.gaps.map((gap,i)=><li className={`gap-${gap.kind}`} key={`${gap.kind}-${i}`}>{gap.text}{gap.sourceIds?.length>0&&<Citations ids={gap.sourceIds} index={index}/>}</li>)}</ul>
    </details>
  </section>;
}
