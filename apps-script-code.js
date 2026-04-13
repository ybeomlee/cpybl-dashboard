// ========================================
// 리드체인지 상담 예약 - Google Apps Script
// ========================================
const SHEET_NAME = '뉴상담예약';
const HEADERS = ['신청일시','이름','학교','학년','전공','연락처','보호자연락처','유입경로','검색어','희망날짜','상담시간','상태','방문여부'];

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);

    // 시트가 없으면 생성 + 헤더
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
    }

    // 1행이 비어있으면 헤더 추가
    if (!sheet.getRange('A1').getValue()) {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    // 데이터 기록
    sheet.appendRow([
      data.timestamp || new Date().toLocaleString('ko-KR'),
      data.name || '',
      data.school || '',
      data.grade || '',
      data.major || '',
      data.phone || '',
      data.parentPhone || '',
      data.source || '',
      data.keyword || '',
      data.date || '',
      data.time || '',
      data.status || '예약대기',
      data.visited || 'FALSE'
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({result: 'success'}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({result: 'error', message: error.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput('리드체인지 상담예약 API 정상 작동 중')
    .setMimeType(ContentService.MimeType.TEXT);
}
