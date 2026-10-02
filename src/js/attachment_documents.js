const TEXT_EXTENSION = /\.(?:txt|md|markdown|log|csv|tsv|jsonl?|ndjson|xml|ya?ml|toml|ini|cfg|conf|env|properties|cmd|bat|ps1|psm1|sh|bash|zsh|fish|py|pyw|js|mjs|cjs|jsx|tsx?|css|scss|less|html?|svg|sql|c|h|cpp|hpp|cs|java|kt|go|rs|rb|php|pl|lua|r|swift|vue|svelte|tex|rtf|diff|patch|gitignore|dockerfile)$/i;

export function dataUrlBytes(dataUrl) {
  const comma = String(dataUrl).indexOf(',');
  if (comma < 0) throw new Error('附件数据不是有效的 data URL');
  const header = dataUrl.slice(0, comma), payload = dataUrl.slice(comma + 1);
  if (/;base64/i.test(header)) return Uint8Array.from(atob(payload), char => char.charCodeAt(0));
  const chunks = payload.split(/(%[0-9a-f]{2})/i).filter(Boolean).map(part => /^%[0-9a-f]{2}$/i.test(part)
    ? Uint8Array.of(parseInt(part.slice(1),16)) : new TextEncoder().encode(part));
  const bytes = new Uint8Array(chunks.reduce((sum,chunk)=>sum+chunk.length,0));
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
  return bytes;
}

export function isPdf(bytes) { return new TextDecoder().decode(bytes.subarray(0, 5)) === '%PDF-'; }

export function decodeAttachmentText(bytes, name = '', mime = '') {
  const bom = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le'
    : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : '';
  const hint = /^text\//i.test(mime) || TEXT_EXTENSION.test(name) || /^(?:Dockerfile|Makefile|\.env|\.gitignore)$/i.test(name);
  // UTF-16 without BOM is common in Windows exports; require an alternating
  // zero pattern, not just an occasional NUL in arbitrary binary data.
  let utf16 = '';
  if (!bom && bytes.length >= 8 && bytes.length % 2 === 0) {
    const sample = bytes.subarray(0, 1024), pairs = sample.length / 2;
    const even = sample.filter((b,i) => i%2===0 && b===0).length;
    const odd = sample.filter((b,i) => i%2===1 && b===0).length;
    if (odd/pairs > 0.6 && even/pairs < 0.1) utf16 = 'utf-16le';
    if (even/pairs > 0.6 && odd/pairs < 0.1) utf16 = 'utf-16be';
  }
  const encodings = bom || utf16 ? [bom || utf16] : ['utf-8', ...(hint ? ['gb18030', 'windows-1252'] : [])];
  for (const encoding of encodings) {
    try {
      const text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
      if (/[\u0000-\u0008\u000b\u000e-\u001f\u007f-\u009f]/.test(text)) continue;
      return text;
    } catch { /* Try only documented text encodings; never silently replace bytes. */ }
  }
  throw new Error('无法将该格式解码为可读文本；请另存为 UTF-8 文本或支持的文档格式');
}

export async function extractDocumentText(bytes, name = '', mime = '') {
  if (isPdf(bytes)) return extractPdfText(bytes);
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return extractOfficeText(bytes, name);
  if ((bytes[0] === 0x4d && bytes[1] === 0x5a) || (bytes[0] === 0x7f && bytes[1] === 0x45)
    || (bytes[0] === 0xd0 && bytes[1] === 0xcf)) throw new Error('此二进制格式不能直接作为文本读取；旧版 Office 文档请另存为 DOCX、XLSX 或 PPTX');
  return decodeAttachmentText(bytes, name, mime);
}

async function extractPdfText(bytes) {
  const pdfjs = await import('../vendor/pdfjs/pdf.min.js');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.js', import.meta.url).href;
  const task = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, useWasm: false,
    cMapUrl: new URL('../vendor/pdfjs/cmaps/', import.meta.url).href, cMapPacked: true,
    standardFontDataUrl: new URL('../vendor/pdfjs/standard_fonts/', import.meta.url).href,
    useWorkerFetch: false, disableFontFace: true });
  try {
    const pdf = await task.promise, pages = [];
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      pages.push(content.items.map(item => (item.str || '') + (item.hasEOL ? '\n' : ' ')).join(''));
      page.cleanup();
    }
    if (!pages.some(text => text.trim())) throw new Error('PDF 中没有可提取文字（可能是扫描件）；请先 OCR，或使用支持 PDF 图像输入的模型接口');
    return pages.map((text,index) => `--- 第 ${index + 1} 页 ---\n${text}`).join('\n\n');
  } finally { await task.destroy(); }
}

async function extractOfficeText(bytes, name) {
  if (!/\.(docx|xlsx|pptx)$/i.test(name)) throw new Error('该压缩/封装格式尚不能读取；请解压后选择其中的文档或文本文件');
  const { unzip } = await import('../vendor/fflate/fflate.js');
  let expanded = 0;
  const files = await new Promise((resolve,reject) => unzip(bytes, { filter: entry => {
    if (!/^(?:word|xl|ppt)\/.*\.(?:xml|rels)$/.test(entry.name)) return false;
    expanded += entry.originalSize;
    if (expanded > 64 * 1024 * 1024) throw new Error('文档解压后的 XML 超过 64 MiB，已停止读取以保护设备内存；没有截断内容');
    return true;
  } }, (error,data) => error ? reject(error) : resolve(data)));
  const xml = path => {
    if (!files[path]) throw new Error(`文档缺少 ${path}`);
    const doc = new DOMParser().parseFromString(new TextDecoder('utf-8', {fatal:true}).decode(files[path]), 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error(`文档 XML 损坏：${path}`);
    return doc;
  };
  const elements = (node,name) => [...node.getElementsByTagNameNS('*',name)];
  const allText = node => elements(node,'t').map(item=>item.textContent).join('');
  const orderedParts = (manifest, rels, tag, fallback) => {
    if (!files[manifest] || !files[rels]) return fallback.map(path=>({path,name:path}));
    const relationships = new Map(elements(xml(rels),'Relationship').filter(item=>item.getAttribute('TargetMode')!=='External')
      .map(item=>[item.getAttribute('Id'),new URL(item.getAttribute('Target'),`https://archive.invalid/${manifest}`).pathname.slice(1)]));
    return elements(xml(manifest),tag).map(item=>{
      const path=relationships.get(item.getAttribute('r:id'));
      if (!path || !files[path]) throw new Error(`文档缺少引用的数据：${item.getAttribute('name') || item.getAttribute('r:id')}`);
      return {path,name:item.getAttribute('name') || path};
    });
  };
  const paragraph = node => [...node.childNodes].map(child => child.nodeType === 3 ? ''
    : child.localName === 't' ? child.textContent : child.localName === 'tab' ? '\t'
      : ['br','cr'].includes(child.localName) ? '\n' : paragraph(child)).join('');
  if (/\.docx$/i.test(name)) {
    const paths = ['word/document.xml', ...Object.keys(files).filter(path => /^word\/(?:header\d+|footer\d+|footnotes|endnotes)\.xml$/.test(path)).sort()];
    return paths.map(path => elements(xml(path),'p').map(paragraph).join('\n')).join('\n\n');
  }
  if (/\.pptx$/i.test(name)) {
    const paths = Object.keys(files).filter(path=>/^ppt\/slides\/slide\d+\.xml$/.test(path)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    if (!paths.length) throw new Error('演示文稿中没有可读取的幻灯片');
    return orderedParts('ppt/presentation.xml','ppt/_rels/presentation.xml.rels','sldId',paths)
      .map(({path},i)=>`--- 幻灯片 ${i+1} ---\n${elements(xml(path),'p').map(allText).join('\n')}`).join('\n\n');
  }
  const shared = files['xl/sharedStrings.xml'] ? elements(xml('xl/sharedStrings.xml'),'si').map(allText) : [];
  const sheets = Object.keys(files).filter(path=>/^xl\/worksheets\/sheet\d+\.xml$/.test(path)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  if (!sheets.length) throw new Error('工作簿中没有可读取的工作表');
  return orderedParts('xl/workbook.xml','xl/_rels/workbook.xml.rels','sheet',sheets)
    .map(({path,name}) => `--- ${name}（单元格地址 / 值；公式不执行）---\n` + elements(xml(path),'row').map(row=>elements(row,'c').map(cell=>{
    const type=cell.getAttribute('t'), value=elements(cell,'v')[0]?.textContent || '';
    const formula=elements(cell,'f')[0]?.textContent;
    const text=type==='s' ? shared[Number(value)] ?? '' : type==='inlineStr' ? allText(cell) : value;
    return `${cell.getAttribute('r') || ''}: ${JSON.stringify(text)}${formula ? ` [公式: ${formula}]` : ''}`;
  }).join('\t')).join('\n')).join('\n\n');
}
