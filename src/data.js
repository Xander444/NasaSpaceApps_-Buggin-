// Scientific evidence lives in the versioned public/search index.
// Earlier curator copy is archived in data/search/legacy_annotations.json.
export const portfolio = {title:'NASA Combustion Science Portfolio',url:'https://science.nasa.gov/biological-physical/programs/physical-sciences/combustion-science/'};
export const value = x => x === null || x === undefined || x === '' ? 'Not reported' : x;

export const family = (record) => {
 const name=record.program.toLowerCase()
 if(name.includes('saffire'))return 'Saffire'
 if(name.includes('bass'))return 'BASS'
 if(name.includes('same')||name.includes('daft'))return 'Detection'
 if(name.includes('flex')||name==='cfi'||name.includes('cool-flame'))return 'Droplet & cool flame'
 if(name.includes('acme'))return 'ACME'
 if(name.includes('spice')||name.includes('slice'))return 'Flame & soot'
 if(name.includes('model'))return 'Modeling'
 return record.program==='Cross-program'?'Overview':'Other'
}
