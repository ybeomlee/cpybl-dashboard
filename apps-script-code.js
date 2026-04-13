// ========================================
// 리드체인지 상담 예약 - Google Apps Script
// ========================================

// ═══ 설정 ═══
const RESERVE_SHEET = '뉴상담예약';  // 이 파일 안의 시트 (폼 데이터 저장)

// 리체상담양식이 있는 구글시트 (별도 파일)
const CONSULT_FILE_ID = '1H3ttMuGs-kwHoaA6z4ApSo9kvQZPNA0EOu8OnwkI2u8';
const CONSULT_SHEET = '리체상담양식';

// 뉴상담예약 헤더 (A~N)
const HEADERS = ['신청일시','이름','학교','학년','전공','연락처','보호자연락처','유입경로','검색어','희망날짜','상담시간','상태','방문완료','상담자'];

// ═══ 폼에서 데이터 수신 ═══
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(RESERVE_SHEET);

    if (!sheet) {
      sheet = ss.insertSheet(RESERVE_SHEET);
    }

    // 1행 헤더
    if (!sheet.getRange('A1').getValue()) {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
      // M열 헤더 아래에 체크박스 데이터 유효성 설정은 데이터 입력 시 처리
    }

    const newRow = sheet.getLastRow() + 1;

    // A~L열 데이터
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

    // M열: 체크박스 (빈 상태)
    sheet.getRange(newRow, 13).insertCheckboxes();

    // N열: 상담자 (아직 비어있음 - 상담 완료 시 자동 입력)
    sheet.getRange(newRow, 14).setValue('');

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
//
// 리체상담양식(별도 파일)에 상담이 기록되면
// 뉴상담예약의 M열 체크박스를 체크 + N열에 상담자 이메일 기록
//
// [트리거 설정]
// 1. Apps Script 왼쪽 ⏰ 트리거 클릭
// 2. + 트리거 추가
// 3. 함수: checkVisitStatus
// 4. 이벤트: 시간 기반 트리거 → 분 타이머 → 매 5분
// 5. 저장

function checkVisitStatus() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const reserveSheet = ss.getSheetByName(RESERVE_SHEET);

  if (!reserveSheet) {
    Logger.log('뉴상담예약 시트를 찾을 수 없습니다');
    return;
  }

  // 리체상담양식 (별도 파일에서 열기)
  let consultSheet;
  try {
    const consultSS = SpreadsheetApp.openById(CONSULT_FILE_ID);
    consultSheet = consultSS.getSheetByName(CONSULT_SHEET);
    if (!consultSheet) {
      // 시트 이름이 다를 수 있으니 첫 번째 시트 사용
      consultSheet = consultSS.getSheets()[0];
    }
  } catch (e) {
    Logger.log('리체상담양식 파일 접근 실패: ' + e.message);
    return;
  }

  // 리체상담양식 데이터 수집
  // 구조: A:타임스탬프 | B:이메일 | C:학생이름 | D:학교 | E:학년 | F:학생연락처
  const consultData = consultSheet.getDataRange().getValues();
  const consultStudents = [];

  for (let i = 1; i < consultData.length; i++) {
    const row = consultData[i];
    const name = String(row[2] || '').trim();   // C열: 학생 이름
    const email = String(row[1] || '').trim();   // B열: 상담자 이메일
    const school = String(row[3] || '').trim();  // D열: 학교
    const grade = String(row[4] || '').trim();   // E열: 학년
    const phone = String(row[5] || '').trim();   // F열: 학생 연락처

    if (name) {
      consultStudents.push({ name, email, school, grade, phone });
    }
  }

  if (consultStudents.length === 0) {
    Logger.log('리체상담양식에 데이터 없음');
    return;
  }

  // 뉴상담예약 데이터
  // 구조: B:이름 | C:학교 | D:학년 | F:연락처 | M:체크박스 | N:상담자
  const reserveData = reserveSheet.getDataRange().getValues();
  let updated = 0;

  for (let i = 1; i < reserveData.length; i++) {
    const rName = String(reserveData[i][1] || '').trim();    // B열: 이름
    const rSchool = String(reserveData[i][2] || '').trim();   // C열: 학교
    const rGrade = String(reserveData[i][3] || '').trim();    // D열: 학년
    const rPhone = String(reserveData[i][5] || '').trim();    // F열: 연락처
    const isChecked = reserveData[i][12];                      // M열: 체크박스

    // 이미 체크된 건 스킵
    if (isChecked === true) continue;

    // 매칭: 이름이 같고 + (학교 OR 연락처 OR 학년이 같으면) 방문완료
    for (const student of consultStudents) {
      const nameMatch = rName === student.name;
      if (!nameMatch) continue;

      // 전화번호 비교 (하이픈 제거)
      const cleanPhone = s => s.replace(/[-\s]/g, '');
      const phoneMatch = rPhone && student.phone && cleanPhone(rPhone) === cleanPhone(student.phone);
      const schoolMatch = rSchool && student.school && rSchool === student.school;
      const gradeMatch = rGrade && student.grade && rGrade === student.grade;

      if (phoneMatch || schoolMatch || gradeMatch) {
        // M열: 체크박스 체크
        reserveSheet.getRange(i + 1, 13).setValue(true);
        // L열: 상태 → 상담완료
        reserveSheet.getRange(i + 1, 12).setValue('상담완료');
        // N열: 상담자 이메일
        reserveSheet.getRange(i + 1, 14).setValue(student.email);

        updated++;
        Logger.log('매칭: ' + rName + ' ← ' + student.email);
        break;
      }
    }
  }

  Logger.log('방문완료 체크 완료: ' + updated + '건 업데이트 (총 ' + consultStudents.length + '명 비교)');
}
