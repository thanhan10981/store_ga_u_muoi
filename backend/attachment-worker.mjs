import { parentPort, workerData } from 'node:worker_threads';
import sharp from 'sharp';
import yauzl from 'yauzl';

const TEXT_LIMIT = 24000;
class AttachmentError extends Error {}
function fail(message) { throw new AttachmentError(message); }
function boundedText(text) {
  if (text.length > TEXT_LIMIT) fail('Tài liệu vượt 24.000 ký tự. Hãy chia nhỏ, không có phần nào được âm thầm bỏ qua.');
  if (!text.trim()) fail('Tệp không có văn bản đọc được. Nếu là bản scan, hãy gửi ảnh JPG/PNG của các trang.');
  return text;
}

// Inspect actual decompressed bytes before handing an OOXML archive to a parser.
export async function checkOfficeZip(buffer, requiredEntry) {
  await new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error) return reject(new AttachmentError('Tệp Office không hợp lệ.'));
      let count = 0; let total = 0; let found = false;
      const stop = message => { zip.close(); reject(new AttachmentError(message)); };
      zip.on('error', () => stop('Tệp Office bị lỗi.'));
      zip.on('end', () => found ? resolve() : reject(new AttachmentError('Nội dung tệp không khớp phần mở rộng.')));
      zip.on('entry', entry => {
        if (++count > 800 || entry.uncompressedSize > 8 * 1024 * 1024 || entry.generalPurposeBitFlag & 1) return stop('Tệp Office quá lớn, quá phức tạp hoặc được mã hóa.');
        if (/vbaProject|embeddings\//i.test(entry.fileName)) return stop('Không hỗ trợ tệp có macro hoặc đối tượng nhúng.');
        if (entry.fileName === requiredEntry) found = true;
        zip.openReadStream(entry, (error, stream) => {
          if (error) return stop('Không giải nén được tài liệu.');
          stream.on('error', () => stop('Không đọc được tài liệu.'));
          stream.on('data', chunk => { total += chunk.length; if (total > 12 * 1024 * 1024) { stream.destroy(); stop('Tài liệu sau giải nén vượt 12 MB.'); } });
          stream.on('end', () => zip.readEntry());
        });
      });
      zip.readEntry();
    });
  });
}

async function extract(file) {
  const bytes = Buffer.from(file.data, 'base64');
  const ext = file.name.split('.').at(-1).toLowerCase();
  if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
    const image = sharp(bytes, { limitInputPixels: 20_000_000, animated: false, failOn: 'error' });
    const meta = await image.metadata();
    if (!['png','jpeg','webp'].includes(meta.format) || (meta.pages ?? 1) > 1) fail('Chỉ hỗ trợ ảnh PNG/JPG/WEBP tĩnh hợp lệ.');
    const expected = ext === 'jpg' ? 'jpeg' : ext;
    if (meta.format !== expected) fail('Nội dung ảnh không khớp phần mở rộng.');
    const output = await image.rotate().resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 88 }).toBuffer();
    return [{ type: 'input_text', text: `Ảnh đính kèm: ${file.name}. Chỉ đọc thông tin nhìn thấy; phần mờ cần hỏi lại.` }, { type: 'input_image', image_url: `data:image/jpeg;base64,${output.toString('base64')}`, detail: 'auto' }];
  }
  let text;
  if (['txt','csv'].includes(ext)) {
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('TXT/CSV phải được lưu với mã hóa UTF-8.'); }
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) fail('Tệp văn bản chứa dữ liệu nhị phân.');
  } else if (ext === 'pdf') {
    if (bytes.subarray(0,5).toString() !== '%PDF-') fail('Nội dung tệp không phải PDF.');
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: false });
    try {
      const info = await parser.getInfo();
      if (info.total > 20) fail('PDF tối đa 20 trang. Hãy tách tài liệu trước khi gửi.');
      const result = await parser.getText();
      if (result.pages.some(page => !page.text.trim())) fail('Tệp PDF có trang scan hoặc trang không có chữ. Hãy gửi ảnh các trang cần đọc.');
      text = result.pages.map(page => `Trang ${page.num}:\n${page.text}`).join('\n');
    } finally { await parser.destroy(); }
  } else if (ext === 'xlsx') {
    await checkOfficeZip(bytes, 'xl/workbook.xml');
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes);
    if (workbook.worksheets.length > 10) fail('Excel tối đa 10 sheet.');
    const lines = []; let cells = 0;
    for (const sheet of workbook.worksheets) {
      lines.push(`Sheet: ${sheet.name}`);
      sheet.eachRow((row, index) => {
        if (index > 2000) fail('Excel tối đa 2.000 dòng mỗi sheet.');
        const values = [];
        row.eachCell((cell, column) => {
          if (column > 60 || ++cells > 12000) fail('Excel vượt giới hạn 60 cột hoặc 12.000 ô.');
          if (cell.formula) fail('Excel chứa công thức. Hãy xuất bản chỉ có giá trị để tránh dùng kết quả tính cũ.');
          values.push(`${column}: ${cell.text}`);
        });
        lines.push(`${index}\t${values.join('\t')}`);
        if (lines.join('\n').length > TEXT_LIMIT) fail('Excel quá dài. Hãy chia nhỏ bảng.');
      });
    }
    text = lines.join('\n');
  } else if (ext === 'docx') {
    await checkOfficeZip(bytes, 'word/document.xml');
    const { default: mammoth } = await import('mammoth');
    text = (await mammoth.extractRawText({ buffer: bytes }, { externalFileAccess: false })).value;
  } else fail('Định dạng tệp chưa được hỗ trợ.');
  return [{ type: 'input_text', text: `Tài liệu: ${file.name}\n${boundedText(text)}` }];
}

if (parentPort) {
  try {
    const parts = [];
    for (const file of workerData) parts.push(...await extract(file));
    if (parts.filter(p => p.type === 'input_text').reduce((n,p) => n + p.text.length, 0) > 30000) fail('Tổng nội dung vượt 30.000 ký tự. Hãy gửi từng tệp riêng.');
    if (Buffer.byteLength(JSON.stringify(parts)) > 3500000) fail('Tổng nội dung ảnh quá lớn sau xử lý. Hãy gửi từng ảnh riêng.');
    parentPort.postMessage({ parts });
  } catch (error) {
    // Only expose our own messages; parser internals and input content stay private.
    parentPort.postMessage({ error: error instanceof AttachmentError ? error.message : 'Không đọc được tệp. Tệp có thể hỏng, có mật khẩu hoặc sai định dạng.' });
  } finally { parentPort.close(); }
}
