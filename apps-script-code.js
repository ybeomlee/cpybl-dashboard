// ========================================
// 리드체인지 상담 예약 - Google Apps Script
// ========================================
//
// [설정 방법]
// 1. 구글시트 "리체전화상담문의(응답)" 열기
// 2. 메뉴 → 확장 프로그램 → Apps Script
// 3. 기존 코드 전부 삭제 후 이 코드를 붙여넣기
// 4. "뉴상담예약" 시트가 없으면 새로 만들기
//    - 헤더: 신청일시 | 이름 | 학교 | 학년 | 전공 | 연락처 | 보호자연락처 | 유입경로 | 검색어 | 희망날짜 | 상담시간 | 상태 | 방문여부
// 5. 저장 (Ctrl+S)
// 6. 배포 → 새 배포 → 유형: 웹 앱 → 액세스: 모든 사용자 → 배포
// 7. 생성된 URL을 consult-form.html의 SCRIPT_URL에 붙여넣기
//

// 시트 이름
const SHEET_NAME = '뉴상담예약';

// POST 요청 처리 (폼에서 데이터 수신)
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);

    // 시트가 없으면 자동 생성
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow([
        '신청일시', '이름', '학교', '학년', '전공',
        '연락처', '보호자연락처', '유입경로', '검색어',
        '희망날짜', '상담시간', '상태', '방문여부'
      ]);
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

    // ═══ 카카오톡 알림 (3단계에서 설정) ═══
    // sendKakaoNotification(data);

    return ContentService
      .createTextOutput(JSON.stringify({result: 'success'}))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({result: 'error', message: error.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// GET 요청 (테스트용)
function doGet(e) {
  return ContentService
    .createTextOutput('리드체인지 상담예약 API가 정상 작동 중입니다.')
    .setMimeType(ContentService.MimeType.TEXT);
}

// ═══ 카카오톡 알림 함수 (3단계) ═══
// function sendKakaoNotification(data) {
//   // 카카오톡 비즈니스 API 또는 알림톡 연동
//   // 작성자, 상담자, 실장, 원장에게 알림
// }

// ═══ 방문완료 자동 체크 (4단계) ═══
// 리체상담시트에 상담이 기록되면 뉴상담예약 시트의 방문여부를 TRUE로 변경
// 트리거: onEdit 또는 시간 기반 트리거로 설정
// function checkVisitStatus() {
//   const ss = SpreadsheetApp.getActiveSpreadsheet();
//   const consultSheet = ss.getSheetByName('리체상담양식');
//   const reserveSheet = ss.getSheetByName(SHEET_NAME);
//
//   // 리체상담양식의 학생 이름 목록
//   const consultNames = consultSheet.getRange('D2:D').getValues().flat().filter(n => n);
//
//   // 뉴상담예약에서 매칭
//   const reserveData = reserveSheet.getDataRange().getValues();
//   for (let i = 1; i < reserveData.length; i++) {
//     const name = reserveData[i][1]; // 이름 컬럼
//     if (consultNames.includes(name) && reserveData[i][12] !== 'TRUE') {
//       reserveSheet.getRange(i + 1, 13).setValue('TRUE'); // 방문여부 = TRUE
//       reserveSheet.getRange(i + 1, 12).setValue('상담완료'); // 상태 = 상담완료
//     }
//   }
// }
