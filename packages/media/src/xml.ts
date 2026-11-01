/** Escapes text for SVG/XML and drops control characters. */
export function escapeXml(text:string):string{return text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'})[c]??c).split('').filter(c=>c.charCodeAt(0)>=32||'\t\n\r'.includes(c)).join('');}
