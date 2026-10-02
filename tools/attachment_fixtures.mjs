import { zipSync, strToU8 } from '../src/vendor/fflate/fflate.js';

function pdf(text) {
  const stream=`BT /F1 12 Tf 50 750 Td (${text}) Tj ET`;
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let out='%PDF-1.4\n', offsets=[0];
  objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(out));out+=`${i+1} 0 obj\n${object}\nendobj\n`;});
  const xref=Buffer.byteLength(out);out+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out);
}

export function attachmentFixtures() {
  const data=(name,bytes,mime='application/octet-stream')=>({name,mime,type:'file',dataUrl:`data:${mime};base64,${Buffer.from(bytes).toString('base64')}`});
  const docx=zipSync({'word/document.xml':strToU8('<w:document xmlns:w="urn:word"><w:body><w:p><w:r><w:t>DOCX_MARKER_2718</w:t></w:r></w:p></w:body></w:document>')});
  const xlsx=zipSync({'xl/sharedStrings.xml':strToU8('<sst xmlns="urn:sheet"><si><t>XLSX_MARKER_1618</t></si></sst>'),
    'xl/workbook.xml':strToU8('<workbook xmlns:r="urn:rels"><sheets><sheet name="销售数据" r:id="r1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels':strToU8('<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml':strToU8('<worksheet xmlns="urn:sheet"><sheetData><row><c r="A1" t="s"><v>0</v></c><c r="B1"><v>42</v></c></row></sheetData></worksheet>')});
  const pptx=zipSync({'ppt/slides/slide1.xml':strToU8('<p:sld xmlns:p="urn:ppt" xmlns:a="urn:draw"><a:p><a:r><a:t>PPTX_MARKER_3141</a:t></a:r></a:p></p:sld>'),
    'ppt/slides/slide2.xml':strToU8('<sld><p><t>PPTX_FIRST_SLIDE</t></p></sld>'),
    'ppt/presentation.xml':strToU8('<presentation xmlns:r="urn:rels"><sldIdLst><sldId r:id="r2"/><sldId r:id="r1"/></sldIdLst></presentation>'),
    'ppt/_rels/presentation.xml.rels':strToU8('<Relationships><Relationship Id="r1" Target="slides/slide1.xml"/><Relationship Id="r2" Target="slides/slide2.xml"/></Relationships>')});
  const long='@echo off\r\n'+'rem long line\r\n'.repeat(600)+'echo END_OF_FULL_CMD_999';
  return {
    cmd:data('测试.cmd',Buffer.from('@echo off\r\necho CMD_MARKER_1729 你好')),long:data('long.cmd',Buffer.from(long)),
    utf16:data('utf16.ps1',Buffer.concat([Buffer.from([255,254]),Buffer.from('Write-Output "UTF16_MARKER_2026 你好"','utf16le')])),
    gb:data('gb.cmd',Buffer.concat([Buffer.from('@echo off\necho GB_MARKER_826 '),Buffer.from([0xc4,0xe3,0xba,0xc3])])),
    unknown:data('config.rare-extension',Buffer.from('UNKNOWN_MARKER_2048=value\n')),
    image:{...data('image.png',Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4i8AAAAASUVORK5CYII=','base64'),'image/png'),type:'image'},
    audio:{...data('audio.wav',Buffer.from('RIFFfixture-audio-bytes'),'audio/wav'),type:'audio'},
    pdf:data('report.pdf',pdf('PDF_MARKER_5772')), rejectedPdf:data('rejected.pdf',pdf('REJECTED_PDF_0001')),
    longErrorPdf:data('long-error.pdf',pdf('LONG_ERROR_PDF_0003')),
    otherPdf:data('accepted.pdf',pdf('ACCEPTED_PDF_0002')), docx:data('report.docx',docx),xlsx:data('report.xlsx',xlsx),pptx:data('report.pptx',pptx),
    binary:data('unsupported.bin',Buffer.from([0,255,0,129,0,254,13,0,1,2,3,4])),
    groupBinary:data('group-unsupported.bin',Buffer.from([0,255,0,129,0,254,13,0,1,2,3,7])),
    legacyBinary:data('legacy-unsupported.bin',Buffer.from([0,255,0,129,0,254,13,0,1,2,3,8]))
  };
}
