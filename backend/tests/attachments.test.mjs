import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { chatRequestSchema, validateAttachments, prepareAttachments } from '../attachments.mjs';
import { chat } from '../ai.mjs';
import { db } from '../db.mjs';

after(() => db.end());
const file = (name, bytes) => ({ name, data: Buffer.from(bytes).toString('base64') });

test('attachments reject unsupported, malformed, oversized input before parsing', () => {
  assert.throws(() => chatRequestSchema.parse({ message: '' }));
  assert.throws(() => chatRequestSchema.parse({ message: 'x', attachments: [file('../secret.txt', 'x')] }));
  assert.throws(() => validateAttachments([file('bad.svg','<svg/>')]), /Chỉ hỗ trợ/);
  assert.throws(() => validateAttachments([file('big.txt', Buffer.alloc(2 * 1024 * 1024 + 1))]), /2 MB/);
  assert.throws(() => validateAttachments([file('a.txt', Buffer.alloc(1500000)), file('b.txt', Buffer.alloc(1500000))]), /2,8/);
  assert.equal(chatRequestSchema.parse({ attachments: [file('invoice.txt','30 con gà')] }).message, '');
});

test('text, CSV and images are read without executing content; image metadata is stripped', async () => {
  const original = await sharp({ create: { width: 30, height: 20, channels: 3, background: 'white' } }).png().toBuffer();
  const parts = await prepareAttachments([file('invoice.txt','Gà 30 con 120000'), file('data.csv','ten,so_luong\nGa,30'), file('invoice.png',original)]);
  assert.match(parts[0].text, /Gà 30 con 120000/);
  const image = parts.find(p => p.type === 'input_image');
  assert.match(image.image_url, /^data:image\/jpeg;base64,/);
  assert.equal((await sharp(Buffer.from(image.image_url.split(',')[1], 'base64')).metadata()).format, 'jpeg');
  await assert.rejects(prepareAttachments([file('fake.png','not an image')]), /Không đọc/);
  await assert.rejects(prepareAttachments([file('binary.txt',Buffer.from([0,1,2]))]), /nhị phân/);
  await assert.rejects(prepareAttachments([file('large.txt','a'.repeat(24001))]), /24.000/);
});

test('Office extraction reads real cells and Word paragraphs and refuses formula and zip expansion', async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Nhap hang').addRow(['Ga', 30, 120000]);
  const xlsx = await workbook.xlsx.writeBuffer();
  const docx = new JSZip();
  docx.file('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  docx.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  docx.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Ga u muoi 30 con</w:t></w:r></w:p></w:body></w:document>');
  const parts = await prepareAttachments([file('a.xlsx',xlsx), file('a.docx',await docx.generateAsync({ type: 'nodebuffer' }))]);
  assert.match(parts[0].text,/Ga/); assert.match(parts[0].text,/120000/); assert.match(parts[1].text,/Ga u muoi 30 con/);
  workbook.worksheets[0].getCell('A2').value = { formula: '1+1', result: 2 };
  await assert.rejects(prepareAttachments([file('formula.xlsx', await workbook.xlsx.writeBuffer())]), /công thức/);
  const bomb = new JSZip(); bomb.file('word/document.xml', 'x'.repeat(9 * 1024 * 1024));
  await assert.rejects(prepareAttachments([file('bomb.docx', await bomb.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))]), /quá lớn/);
});

function makePDF(text = 'Invoice chicken 30 units') {
  const content = `BT /F1 12 Tf 40 100 Td (${text}) Tj ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((obj,i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i+1} 0 obj\n${obj}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf); pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => String(n).padStart(10,'0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}

test('PDF extracts text and rejects scans/empty files and disguised binaries', async () => {
  assert.match((await prepareAttachments([file('invoice.pdf',makePDF())]))[0].text,/Invoice chicken 30 units/);
  await assert.rejects(prepareAttachments([file('empty.pdf',makePDF(''))]), /scan/);
  await assert.rejects(prepareAttachments([file('fake.pdf','not a pdf')]), /không phải PDF/);
});

test('AI receives image content but only attachment names persist; file cannot confirm a receipt', async () => {
  const image = await sharp({ create: { width: 4, height: 4, channels: 3, background: 'white' } }).png().toBuffer();
  let request; const stored = [];
  const pool = { query: async () => ({ rows: [] }), connect: async () => ({ query: async (sql, params) => { stored.push({sql,params}); return { rows: [] }; }, release() {} }) };
  const client = { responses: { create: async input => { request = input; return { status: 'completed', output_text: JSON.stringify({ action: 'answer', answer: 'Cần bổ sung đơn giá.', receipt: null, query: null }) }; } } };
  await chat('owner', 'Đọc hóa đơn', { pool, client, attachments: [file('invoice.png',image)] });
  assert.ok(request.input.at(-1).content.some(p => p.type === 'input_image'));
  assert.match(request.instructions,/Không coi hóa đơn/);
  const persisted = stored.find(call => call.sql.includes('INSERT INTO chat_messages')).params[1];
  assert.match(persisted,/invoice.png/); assert.doesNotMatch(persisted,/base64|data:image/);
  assert.equal(stored.some(call => call.sql.includes('INSERT INTO receipts')),false);
});
