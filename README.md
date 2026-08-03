# 장비예약대장 배포 가이드

이 프로젝트는 React + Firebase로 만든 실시간 장비 예약 캘린더입니다.
아래 순서대로 하면 20분 정도면 실제 웹 주소가 생깁니다.

## 1단계. Firebase 프로젝트 만들기 (무료, 5분)

1. https://console.firebase.google.com 접속 → 구글 계정으로 로그인
2. "프로젝트 추가" 클릭 → 이름 입력(예: equipment-booking) → 계속 진행
3. 왼쪽 메뉴에서 **Firestore Database** 클릭 → "데이터베이스 만들기"
   - 위치는 asia-northeast3(서울) 추천
   - 보안 규칙은 우선 "테스트 모드"로 시작 (아래 3단계에서 다시 설정)
4. 왼쪽 메뉴 톱니바퀴(프로젝트 설정) → 아래로 스크롤 → "웹 앱 추가"(</> 아이콘)
   - 앱 닉네임 아무거나 입력 → 앱 등록
   - 화면에 나오는 `firebaseConfig` 값을 복사

## 2단계. 코드에 Firebase 설정 붙여넣기

`src/firebase.js` 파일을 열고 `YOUR_API_KEY` 같은 부분을 방금 복사한 값으로 교체하세요.

## 3단계. Firestore 보안 규칙 설정 (중요)

Firebase 콘솔 → Firestore Database → 규칙(Rules) 탭에서 아래처럼 설정하세요.
(이 예시는 누구나 읽고 쓸 수 있게 열어둔 것이라, 회사/학교 내부용으로만 쓰시는 걸 권장해요.
로그인 기능이 필요하면 말씀해주세요.)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /bookings/{doc} {
      allow read, write: if true;
    }
  }
}
```

## 4단계. 로컬에서 테스트

터미널에서 이 폴더로 이동한 뒤:

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:5173` 접속해서 잘 작동하는지 확인하세요.

## 5단계. 실제 웹 주소로 배포하기 (Vercel 추천, 무료)

1. 이 폴더를 GitHub 저장소에 올리기 (GitHub Desktop 쓰면 클릭 몇 번으로 가능)
2. https://vercel.com 접속 → GitHub 계정으로 로그인
3. "Add New Project" → 방금 올린 저장소 선택 → Deploy 클릭
4. 몇 분 뒤 `https://프로젝트이름.vercel.app` 같은 실제 주소가 생성됨

배포가 끝나면, 그 주소로 접속하는 모든 사람이 같은 예약 현황을 실시간으로 보게 됩니다.

## 장비 목록 수정하기

`src/App.jsx` 상단의 `EQUIPMENT` 배열을 수정하면 장비를 추가/삭제/변경할 수 있어요.

## 예약 시간대 수정하기

`src/App.jsx`의 `START_HOUR`, `END_HOUR` 값을 바꾸면 시간표 범위가 바뀝니다.
