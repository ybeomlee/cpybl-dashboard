// ========================================
// 리드체인지 상담 예약 + 학생 명단 API
// ========================================

// ═══ 설정 ═══
const RESERVE_SHEET = '뉴상담예약';
const CONSULT_FILE_ID = '1H3ttMuGs-kwHoaA6z4ApSo9kvQZPNA0EOu8OnwkI2u8';
const CONSULT_SHEET = '리체상담양식';
const HEADERS = ['신청일시','이름','학교','학년','전공','연락처','보호자연락처','유입경로','검색어','희망날짜','상담시간','상태','방문완료','상담자'];

// 월별 운영시트 링크가 있는 시트 (pub CSV URL에서 가져옴)
const LINK_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTtFxvq0fYLGdn7A324uISyftJPX7AG2JnuSPCkH3_ydVXM3dnkPkJ2vkA0cVcRaqdCLTyLTOM_p-Yi/pub?output=csv';

// ═══ POST: 상담 예약 폼 수신 ═══
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(RESERVE_SHEET);
    if (!sheet) sheet = ss.insertSheet(RESERVE_SHEET);
    if (!sheet.getRange('A1').getValue()) {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    const newRow = sheet.getLastRow() + 1;
    sheet.getRange(newRow, 1, 1, 12).setValues([[
      data.timestamp || new Date().toLocaleString('ko-KR'),
      data.name||'', data.school||'', data.grade||'', data.major||'',
      data.phone||'', data.parentPhone||'', data.source||'', data.keyword||'',
      data.date||'', data.time||'', '예약대기'
    ]]);
    sheet.getRange(newRow, 13).insertCheckboxes();
    sheet.getRange(newRow, 14).setValue('');
    return ContentService.createTextOutput(JSON.stringify({result:'success'})).setMimeType(ContentService.MimeType.JSON);
  } catch(error) {
    return ContentService.createTextOutput(JSON.stringify({result:'error',message:error.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}

// ═══ GET: 학생 명단 API ═══
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'status';

  if (action === 'roster') {
    return getRoster();
  }
  return ContentService.createTextOutput('리드체인지 API 정상 작동 중').setMimeType(ContentService.MimeType.TEXT);
}

// ═══ 학생 명단 가져오기 ═══
function getRoster() {
  try {
    // 1. 링크 시트에서 최신 월의 URL 가져오기
    const linkCsv = UrlFetchApp.fetch(LINK_CSV_URL).getContentText();
    const linkRows = Utilities.parseCsv(linkCsv);

    // 최신 월 찾기 (데이터가 있는 마지막 행)
    let latestRow = null;
    let latestMonth = '';
    for (let i = linkRows.length - 1; i >= 1; i--) {
      const month = (linkRows[i][0] || '').trim();
      if (month && month.match(/^\d{4}-\d{2}$/) && linkRows[i][2]) {
        latestRow = linkRows[i];
        latestMonth = month;
        break;
      }
    }

    // 강동은 최신 월에 없을 수 있으니 별도 체크
    let gangdongRow = latestRow;
    if (!latestRow[3]) {
      // 강동 URL이 비어있으면 이전 월에서 찾기
      for (let i = linkRows.length - 1; i >= 1; i--) {
        if (linkRows[i][3] && linkRows[i][3].trim()) {
          gangdongRow = linkRows[i];
          break;
        }
      }
    }

    const result = {
      month: latestMonth,
      campuses: {}
    };

    // 2. 각 캠퍼스 시트 읽기
    // 컬럼: 년월, 년월, 광진URL, 강동URL, 리체URL, 스카URL

    // 광진
    if (latestRow[2]) {
      const gjId = extractSheetId(latestRow[2]);
      if (gjId) result.campuses.gwangjin = readCampusSheet(gjId, 'gwangjin');
    }

    // 강동
    if (gangdongRow[3]) {
      const gdId = extractSheetId(gangdongRow[3]);
      if (gdId) {
        result.campuses.gangdong = readCampusSheet(gdId, 'gangdong');
        result.campuses.gangdong.month = (gangdongRow[0]||'').trim();
      }
    }

    // 리체
    if (latestRow[4]) {
      const lcId = extractSheetId(latestRow[4]);
      if (lcId) result.campuses.riche = readCampusSheet(lcId, 'riche');
    }

    // 스카
    if (latestRow[5]) {
      const skId = extractSheetId(latestRow[5]);
      if (skId) result.campuses.ska = readCampusSheet(skId, 'ska');
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(e) {
    return ContentService
      .createTextOutput(JSON.stringify({error: e.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// URL에서 구글시트 ID 추출
function extractSheetId(url) {
  if (!url) return null;
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

// 캠퍼스 시트 읽기
function readCampusSheet(fileId, type) {
  try {
    const ss = SpreadsheetApp.openById(fileId);
    const sheets = ss.getSheets();

    if (type === 'ska') {
      return readSkaSheet(sheets[0]);
    }

    // 첫 번째 시트 읽기 (보통 학생 명단)
    const sheet = sheets[0];
    const data = sheet.getDataRange().getValues();

    const students = [];
    const summary = { total: 0, paid: 0, unpaid: 0 };

    // 헤더 행 찾기 (이름이 있는 열 감지)
    let nameCol = -1, schoolCol = -1, gradeCol = -1, phoneCol = -1, paidCol = -1, amountCol = -1;

    for (let r = 0; r < Math.min(10, data.length); r++) {
      for (let c = 0; c < data[r].length; c++) {
        const v = String(data[r][c] || '').trim();
        if (v === '이름' || v === '학생이름') nameCol = c;
        if (v === '학교' || v === '고등학교') schoolCol = c;
        if (v === '학년') gradeCol = c;
        if (v === '연락처' || v === '학생연락처' || v === '전화번호') phoneCol = c;
        if (v === '납부' || v === '결제' || v === '완납' || v.includes('납부')) paidCol = c;
        if (v === '금액' || v === '결제금액' || v === '수납') amountCol = c;
      }
      if (nameCol >= 0) break;
    }

    // 학생 데이터 수집
    if (nameCol >= 0) {
      for (let r = 1; r < data.length; r++) {
        const name = String(data[r][nameCol] || '').trim();
        if (!name || name === '합계' || name === '소계') continue;

        const student = {
          name: name,
          school: schoolCol >= 0 ? String(data[r][schoolCol] || '').trim() : '',
          grade: gradeCol >= 0 ? String(data[r][gradeCol] || '').trim() : '',
          phone: phoneCol >= 0 ? String(data[r][phoneCol] || '').trim() : '',
          paid: paidCol >= 0 ? !!data[r][paidCol] : false,
          amount: amountCol >= 0 ? Number(data[r][amountCol]) || 0 : 0
        };

        if (student.name.length > 1 && student.name.length < 10) {
          students.push(student);
          summary.total++;
          if (student.paid) summary.paid++;
          else summary.unpaid++;
        }
      }
    }

    return { students, summary, sheetName: sheet.getName() };

  } catch(e) {
    return { error: e.toString(), students: [], summary: { total: 0, paid: 0, unpaid: 0 } };
  }
}

// 스카 시트 읽기
function readSkaSheet(sheet) {
  try {
    const data = sheet.getDataRange().getValues();
    const members = [];
    let total = 0, richeMembers = 0, generalMembers = 0;

    for (let r = 0; r < data.length; r++) {
      for (let c = 0; c < data[r].length; c++) {
        const v = String(data[r][c] || '').trim();
        if (v.length >= 2 && v.length <= 4 && /^[가-힣]+$/.test(v)) {
          // 한글 이름 감지
          members.push({ name: v, row: r, col: c });
          total++;
        }
      }
    }

    return {
      members,
      summary: { total, richeMembers, generalMembers },
      sheetName: sheet.getName()
    };

  } catch(e) {
    return { error: e.toString(), members: [], summary: { total: 0 } };
  }
}

// ═══ 방문완료 자동 체크 ═══
function checkVisitStatus() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const reserveSheet = ss.getSheetByName(RESERVE_SHEET);
  if (!reserveSheet) { Logger.log('뉴상담예약 시트 없음'); return; }

  let consultSheet;
  try {
    const consultSS = SpreadsheetApp.openById(CONSULT_FILE_ID);
    consultSheet = consultSS.getSheetByName(CONSULT_SHEET) || consultSS.getSheets()[0];
  } catch(e) { Logger.log('리체상담양식 접근 실패: ' + e.message); return; }

  const consultData = consultSheet.getDataRange().getValues();
  const consultStudents = [];
  for (let i = 1; i < consultData.length; i++) {
    const name = String(consultData[i][2] || '').trim();
    if (name) consultStudents.push({
      name, email: String(consultData[i][1]||'').trim(),
      school: String(consultData[i][3]||'').trim(),
      grade: String(consultData[i][4]||'').trim(),
      phone: String(consultData[i][5]||'').trim()
    });
  }
  if (!consultStudents.length) { Logger.log('상담 데이터 없음'); return; }

  const reserveData = reserveSheet.getDataRange().getValues();
  let updated = 0;
  for (let i = 1; i < reserveData.length; i++) {
    const rName = String(reserveData[i][1]||'').trim();
    if (!rName || reserveData[i][12] === true) continue;
    const rSchool = String(reserveData[i][2]||'').trim();
    const rGrade = String(reserveData[i][3]||'').trim();
    const rPhone = String(reserveData[i][5]||'').trim();
    const clean = s => s.replace(/[-\s]/g,'');
    for (const s of consultStudents) {
      if (rName !== s.name) continue;
      if ((rPhone && s.phone && clean(rPhone)===clean(s.phone)) || (rSchool && s.school && rSchool===s.school) || (rGrade && s.grade && rGrade===s.grade)) {
        reserveSheet.getRange(i+1,13).setValue(true);
        reserveSheet.getRange(i+1,12).setValue('상담완료');
        reserveSheet.getRange(i+1,14).setValue(s.email);
        updated++;
        break;
      }
    }
  }
  Logger.log('방문완료 체크: ' + updated + '건');
}
