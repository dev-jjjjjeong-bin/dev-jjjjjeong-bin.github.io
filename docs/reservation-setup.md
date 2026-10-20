# 예약 시스템 연결 안내

현재 웹페이지 주소를 그대로 사용합니다. 고객 화면은 `/reservation.html`, 관리자 화면은 `/admin.html`입니다.
예약 신청 → 센터 확인·연락 → 관리자 확정 순서입니다. 변경·취소는 고객 요청만 접수하고 승인 전까지 기존 예약을 유지합니다.
고객 예약 알림용 자동 문자·이메일 발송, 결제, 실시간 빈 시간표 기능은 없습니다. 희망 일시를 접수하므로 겹치는 신청은 관리자가 조율합니다.

예약 상품은 `js/booking-products.js`에서 관리합니다. 2026-10-20 네이버 예약에서 확인한 상담·체험 4종(각 50분)을 반영했습니다.
손진석 대표원장: 도수 재활 스트레칭 / 기능재활운동 각 70,000원. 윤수진 원장: 기능재활운동 / 산전·산후 산모운동 각 50,000원.
네이버와 자동 연동되지 않습니다. 상품·요금이 바뀌면 이 파일도 갱신해야 합니다. 네이버로 받은 예약은 별도로 확인해 중복 일정을 조율합니다.

## 1. Firebase 프로젝트 만들기

1. [Firebase 콘솔](https://console.firebase.google.com/)에서 프로젝트를 만들고 웹 앱을 등록합니다. Analytics는 예약 화면에 필요하지 않습니다.
2. Cloud Firestore를 **Standard / Native 모드**, 기본 데이터베이스 `(default)`로 생성합니다. 위치는 운영에 맞게 선택하고 생성 전 확인합니다.
3. Firestore 규칙에 이 저장소의 `firestore.rules` 내용을 게시합니다. 브라우저 직접 읽기·쓰기는 모두 차단됩니다.
   Firestore → 색인에서 복합 색인도 만듭니다: 컬렉션 `bookings`, `phoneHash` 오름차순 + `createdAt` 내림차순, 범위 `컬렉션`. 설정은 `firestore.indexes.json`에도 있습니다. 색인이 사용 가능 상태가 된 뒤 조회를 테스트합니다.
4. Authentication → 로그인 방법 → **이메일/비밀번호**를 활성화하고 저장합니다. 비밀번호 없는 이메일 링크 로그인은 켜지 않습니다. Google 로그인은 사용하지 않습니다.
5. Authentication → 설정 → 승인된 도메인에 `bundang-teunteun-sports-medicine-center.pages.dev`를 추가합니다. 로컬 개발을 할 때만 `localhost`도 추가합니다.
6. 프로젝트 설정 → 일반 → 웹 앱 설정의 `projectId`, `apiKey`, `authDomain`, `appId`를 아래 환경변수에 대응시킵니다. 이 네 값은 공개 웹 설정입니다.
7. 서버 전용 서비스 계정을 만들고 **Cloud Datastore User** 역할만 부여합니다. 전용 계정의 JSON 키를 발급하고 `client_email`, `private_key`를 Cloudflare의 암호화된 Secret에 넣습니다. JSON 파일은 저장소에 복사하지 않습니다.

Firebase Cloud Functions는 사용하지 않습니다. 실제 요금제·무료 사용량은 콘솔에서 확인하며, 유료 전환은 필요할 때 별도로 결정합니다.

## 2. Cloudflare 설정

기존 Pages 프로젝트의 빌드 설정:

- 빌드 명령: `npm run build`
- 출력 디렉터리: `dist`
- Node.js: 22 이상

공개 파일만 `dist`에 복사합니다. **저장소 루트 전체를 배포하지 마세요.** `server/`, 테스트, 설정 문서, 비밀값은 공개 디렉터리에 포함하지 않습니다.
Pages Functions는 저장소 루트의 `functions/`에서 자동으로 빌드됩니다.

Cloudflare Turnstile에 사이트를 등록하고 실제 도메인을 허용합니다. 전화 인증이 아닌 자동 요청 방지 확인입니다.
다음 값을 Pages의 **Production 환경**에 설정합니다. Preview에는 운영 비밀값을 복사하지 말고 별도의 테스트 프로젝트를 사용합니다.

| 변수 | 값 |
| --- | --- |
| `SITE_ORIGIN` | `https://bundang-teunteun-sports-medicine-center.pages.dev` (끝의 `/` 없음) |
| `FIREBASE_PROJECT_ID` | Firebase 프로젝트 ID |
| `FIREBASE_API_KEY` | 웹 앱 API 키 |
| `FIREBASE_AUTH_DOMAIN` | 웹 앱 authDomain |
| `FIREBASE_APP_ID` | 웹 앱 appId |
| `FIREBASE_CLIENT_EMAIL` | 전용 서비스 계정 이메일 (Secret) |
| `FIREBASE_PRIVATE_KEY` | 전용 서비스 계정 private_key 전체 (Secret) |
| `PHONE_HASH_SECRET` | 비밀번호 생성기로 만든 32바이트 이상의 무작위 값 (Secret) |
| `ADMIN_UIDS` | 관리자로 허용할 Firebase 사용자 UID. 여러 명이면 쉼표 구분 (Secret) |
| `TURNSTILE_SITE_KEY` | Turnstile 사이트 키 |
| `TURNSTILE_SECRET_KEY` | Turnstile 비밀 키 (Secret) |

`PHONE_HASH_SECRET`은 운영 중 임의로 바꾸면 기존 예약 조회가 안 됩니다. 보관·교체 시 데이터 마이그레이션이 필요합니다.
Firebase API 키에 HTTP referrer 제한을 적용하면 서버의 관리자 인증 확인이 실패할 수 있습니다. 서버 REST 인증에 맞는 API 제한을 사용하고 정상 로그인을 확인하세요.

## 3. 최초 관리자 등록

1. Firebase Authentication → **사용자 → 사용자 추가**에서 관리자 이메일과 **홈페이지 전용 비밀번호**를 등록합니다. 네이버·다음 등 실제로 메일을 받을 수 있는 이메일을 사용할 수 있습니다. 해당 메일 서비스의 비밀번호를 입력하는 것이 아닙니다.
2. 생성된 사용자의 **UID**를 복사해 Cloudflare Pages의 `ADMIN_UIDS`에 넣고 배포합니다. 여러 관리자는 각자 계정을 만들고 UID를 쉼표로 구분합니다. `setup-pending`으로 먼저 배포할 필요가 없습니다.
3. 배포된 `/admin.html`에서 등록한 이메일과 비밀번호로 로그인합니다.
4. 처음에는 **확인 메일 보내기**를 누르고, 받은 메일의 확인 링크를 엽니다. 원래 관리자 화면으로 돌아와 **이메일 확인 완료**를 누릅니다. 이메일 확인은 최초 한 번이며 고객에게 요구하는 절차가 아닙니다.
5. 예약 목록이 표시되면 테스트 예약의 확정·변경·취소를 확인합니다.
6. 비밀번호를 잊었다면 로그인 화면에 이메일만 입력하고 **비밀번호 재설정 메일 받기**를 누릅니다. 메일의 링크에서 새 비밀번호를 설정한 뒤 다시 로그인합니다. 받은편지함에 없다면 스팸함을 확인합니다.

회원가입 화면은 제공하지 않습니다. Firebase에 계정이 존재해도 `ADMIN_UIDS`에 등록되지 않으면 예약 정보를 볼 수 없습니다.
서버는 이메일 확인, 이메일·비밀번호 로그인, 허용 UID, 토큰 유효성을 모두 검사합니다. 권한이 없다는 안내가 나오면 UID와 재배포 여부를 확인합니다.
Authentication 설정에서 이메일 열거 보호를 활성화하고, 이메일 템플릿의 발신자 이름을 센터명으로 설정하면 좋습니다. 관리자 확인·재설정 메일은 Firebase가 발송하며 고객 예약 알림과는 별개입니다.

관리자는 새로고침·탭 종료 후 다시 로그인합니다. 공용 기기에서는 사용 후 로그아웃하세요.

## 4. 운영 전 확인

- 신청 후 목록에 `확인 대기`로 표시되는지, 관리자 확정 후 `예약 확정`으로 표시되는지 확인합니다.
- 변경·취소 요청을 승인/거절했을 때 기존 일정이 올바르게 유지/변경되는지 확인합니다.
- 허용되지 않은 UID, 이메일 미확인 계정, Google 로그인 토큰은 관리자 API에 접근할 수 없는지 확인합니다.
- 로그인 실패, 이메일 확인, 비밀번호 재설정, 로그아웃 후 재접속을 확인합니다.
- 공휴일은 관리자가 조율합니다. 일요일·영업시간 밖·과거·90일 이후의 신청은 서버에서 차단합니다.
- 신청 번호 오입력/변경 요청의 당사자 여부는 **센터에서 직접 연락해 확인**합니다.
- 실제 고객 데이터를 받기 전에 폼의 개인정보 수집·보관 안내를 센터 운영 정책에 맞춰 검토하고, 정기 삭제 담당자와 주기를 정합니다. 현재 종료된 예약은 관리자 화면에서 개별 삭제합니다. 자동 삭제 기능은 없습니다.
- `bookingLimits`는 전화번호/IP를 HMAC으로 처리한 제한 기록입니다. 원문 IP는 저장하지 않습니다. 오래된 제한 기록은 정기적으로 정리합니다.
- 모든 설정이 없으면 접수를 막고 전화/네이버 안내를 표시합니다. 데이터가 브라우저에만 저장되거나 접수가 된 것처럼 보이지 않습니다.

## 전화번호 단독 조회의 범위

요청하신 대로 고객 로그인·비밀번호·예약번호·SMS 인증은 없습니다. **전화번호는 본인 확인 수단이 아니므로 그 번호를 아는 사람은 일정·상태를 조회하고 변경 요청을 남길 수 있습니다.**
고객 응답에는 이름·연락처·관리 이력을 포함하지 않습니다. Turnstile과 요청 횟수 제한은 대량 조회를 줄일 뿐, 전화번호 소유자를 인증하지 않습니다.
변경 요청만으로 예약이 취소되거나 이동하지 않도록 했습니다. 나중에 본인 인증이 필요해지면 별도로 추가할 수 있습니다.

## 개발 및 확인

```sh
npm test
npm run build
npm run preview
```

`preview`는 로컬에서 화면과 서버 미설정 안내를 확인하는 용도입니다. 실제 예약을 저장하지 않습니다.
기존 Live Server 등 정적 미리보기에서 신청 흐름을 확인하려면 `node scripts/prepare-ui-test.mjs` 실행 후 `/tests/ui-reservation.html`을 엽니다. 메모리만 사용하는 가상 데이터 화면이며 새로고침하면 사라집니다. 실제 개인정보를 입력하지 마세요. `tests/`는 배포 결과물에서 제외됩니다.
로컬 API 개발은 `.dev.vars.example`을 `.dev.vars`로 복사하고 **테스트용 Firebase** 값을 입력한 후 `npm run dev`로 실행합니다.
Turnstile은 localhost 허용 테스트 위젯을 사용합니다. 테스트 예약과 실제 예약을 섞지 마세요.

참고: [Firestore REST 인증](https://firebase.google.com/docs/firestore/use-rest-api), [Firebase Auth REST](https://firebase.google.com/docs/reference/rest/auth), [Pages Functions](https://developers.cloudflare.com/pages/functions/), [Turnstile 서버 검증](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)

## VS Code에서 동일한 예약 테스트 실행

1. VS Code에서 홈페이지 저장소 폴더를 엽니다.
2. 터미널 → 새 터미널을 선택합니다.
3. `npm run dev:local`을 실행합니다.
4. 홈은 `http://localhost:8790/`, 고객 예약은 `http://localhost:8790/reservation.html`, 관리자 화면은 `http://localhost:8790/admin.html`을 엽니다.
5. 파일을 수정한 뒤 브라우저를 새로고침합니다. 화면은 저장소의 HTML·CSS·JS를 직접 사용하므로 별도 빌드가 필요 없습니다. 종료는 터미널에서 Ctrl+C입니다.

이 실행 방식은 로컬 컴퓨터에서만 접속할 수 있으며 운영 배포를 수행하지 않습니다. 이전 임시 테스트 안내 배너도 넣지 않아 본래 홈페이지와 같은 레이아웃을 표시합니다. Live Server는 화면만 실행하므로 예약 테스트에는 사용하지 않습니다.

현재 `.booking-local.json`은 `bundang-teunteun-booking` Firebase를 참조합니다. 예약은 이 데이터베이스에 실제로 저장됩니다. 테스트용 정보만 입력하고 실제 고객 운영을 시작하기 전에 테스트 예약을 정리하세요.

다른 컴퓨터에서 설정할 때는 `.booking-local.example.json`을 `.booking-local.json`으로 복사하고 서비스 계정 JSON 경로, 전화번호 비밀값 파일 경로, Firebase 웹 앱 설정과 관리자 UID를 입력합니다. 경로는 저장소 기준 상대 경로 또는 절대 경로를 사용할 수 있습니다. 현재 전화번호 비밀값은 프로젝트 루트의 `booking-phone-secret.txt`에 두고, `phoneSecretFile`은 `booking-phone-secret.txt`로 설정합니다. 비밀값 파일에는 생성한 64자리 16진수 비밀값 하나를 저장합니다. 기존 파일을 임의로 변경하면 전화번호 조회 결과가 달라질 수 있습니다.

Cloudflare 공식 테스트 키를 사용하며, 테스트 키가 반환하는 고정 호스트명은 로컬 실행 스크립트 안에서만 검사합니다. 운영 서버의 호스트명 검사나 운영용 비밀값은 바꾸지 않습니다. 실제 Turnstile 동작과 Cloudflare 환경은 정식 배포 후 별도로 확인해야 합니다.

`.booking-local.json`, 서비스 계정 JSON, 전화번호 비밀값은 커밋하거나 공개 폴더에 넣지 마세요. 빌드는 공개 파일만 `dist`에 복사하므로 로컬 실행 스크립트와 설정은 포함되지 않습니다. `8790 포트가 사용 중`이라고 나오면 이미 열려 있는 테스트 서버를 종료하거나 해당 주소를 그대로 사용하세요.

## 텔레그램 관리자 알림

예약 신청·변경 요청·취소 요청 알림을 추가할 수 있습니다. [텔레그램 설정 안내](telegram-setup.md)를 따라 봇 생성 → `npm run telegram:setup` → 로컬 확인 → 운영 Secret 설정 순서로 진행합니다. 텔레그램을 설정하지 않아도 예약 기능은 유지됩니다.
