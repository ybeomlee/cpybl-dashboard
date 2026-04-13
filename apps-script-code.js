// ========================================
// 리드체인지 상담 예약 - Google Apps Script
// ========================================
const RESERVE_SHEET = '뉴상담예약';
const CONSULT_SHEET = '리체상담양식'; // 실제 상담 기록 시트 이름 (맞지 않으면 변경)
const HEADERS = ['신청일시','이름','학교','학년','전공','연락처','보호자연락처','유입경로','검색어','희망날짜','상담시간','상태','방문완료'];

// ═══ 폼에서 데이터 수신 ═══
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(RESERVE_SHEET);

    if (!sheet) {
      sheet = ss.insertSheet(RESERVE_SHEET);
    }

    // 1행 헤더 확인
    if (!sheet.getRange('A1').getValue()) {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    // 새 행 번호
    const newRow = sheet.getLastRow() + 1;

    // 데이터 기록 (A~L열)
    sheet.getRange(newRow, 1, 1, 12).setValues([[
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
      '예약대기'
    ]]);

    // M열에 체크박스 삽입 (비어있는 상태 = false)
    sheet.getRange(newRow, 13).insertCheckboxes();

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

// ═══ 방문완료 자동 체크 ═══
// 리체상담양식 시트에 상담이 기록되면 뉴상담예약의 M열 체크박스를 체크
// 매칭: 이름 + (학교 또는 연락처)
//
// [설정 방법]
// 1. Apps Script 에디터에서 이 함수를 저장
// 2. 왼쪽 시계 아이콘 (트리거) 클릭
// 3. + 트리거 추가 → 함수: checkVisitStatus → 이벤트: 시간 기반 → 매 5분 또는 매 10분
// 4. 저장
//
// 또는 수동 실행: Apps Script에서 checkVisitStatus 함수를 선택 후 ▶ 실행

function checkVisitStatus() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const consultSheet = ss.getSheetByName(CONSULT_SHEET);
  const reserveSheet = ss.getSheetByName(RESERVE_SHEET);

  if (!consultSheet || !reserveSheet) {
    Logger.log('시트를 찾을 수 없습니다: ' + CONSULT_SHEET + ' 또는 ' + RESERVE_SHEET);
    return;
  }

  // 리체상담양식에서 상담 완료된 학생 정보 수집
  // 헤더: 타임스탬프 | 이메일 | 학생이름(C) | 학교(D) | 학년(E) | 학생연락처(F) | ...
  const consultData = consultSheet.getDataRange().getValues();
  const consultStudents = [];
  for (let i = 1; i < consultData.length; i++) {
    const row = consultData[i];
    // 이름이 있는 행만 (컬럼 위치는 시트 구조에 따라 조정 필요)
    const name = String(row[2] || '').trim();  // C열: 학생이름
    const school = String(row[3] || '').trim(); // D열: 학교
    const phone = String(row[5] || '').trim();  // F열: 연락처
    if (name) {
      consultStudents.push({ name, school, phone });
    }
  }

  if (consultStudents.length === 0) return;

  // 뉴상담예약에서 매칭 확인
  const reserveData = reserveSheet.getDataRange().getValues();
  let updated = 0;

  for (let i = 1; i < reserveData.length; i++) {
    const rName = String(reserveData[i][1] || '').trim();   // B열: 이름
    const rSchool = String(reserveData[i][2] || '').trim();  // C열: 학교
    const rPhone = String(reserveData[i][5] || '').trim();   // F열: 연락처
    const isChecked = reserveData[i][12];                     // M열: 체크박스

    // 이미 체크된 건 스킵
    if (isChecked === true) continue;

    // 매칭: 이름이 같고 (학교 또는 연락처가 같으면) 방문완료
    for (const student of consultStudents) {
      const nameMatch = rName === student.name;
      const schoolMatch = rSchool && student.school && rSchool === student.school;
      const phoneMatch = rPhone && student.phone && rPhone.replace(/-/g,'') === student.phone.replace(/-/g,'');

      if (nameMatch && (schoolMatch || phoneMatch)) {
        // M열 체크박스 체크
        reserveSheet.getRange(i + 1, 13).setValue(true);
        // L열 상태를 "상담완료"로 변경
        reserveSheet.getRange(i + 1, 12).setValue('상담완료');
        updated++;
        break;
      }
    }
  }

  Logger.log('방문완료 체크 완료: ' + updated + '건 업데이트');
}
