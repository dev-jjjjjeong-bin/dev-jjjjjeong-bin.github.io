# dev-jjjjjeong-bin.github.io

예약 시스템 연결 및 운영 안내: [설정 안내](docs/reservation-setup.md)

검증: `npm test` · 공개 파일 빌드: `npm run build`

## VS Code에서 예약까지 테스트하기

VS Code 터미널에서 `npm run dev:local`을 실행하고 `http://localhost:8790/`을 엽니다. 예약은 `/reservation.html`, 관리자는 `/admin.html`입니다. Live Server의 `5501` 주소는 예약 API를 실행하지 않습니다.

로컬 설정은 Git에서 제외되는 `.booking-local.json`에 있습니다. 서비스 계정 비밀키는 저장소 밖의 기존 파일을 읽고, 전화번호 비밀값은 프로젝트 루트의 `booking-phone-secret.txt`에서 읽습니다. 두 비밀값 파일은 커밋하지 않습니다. **이 환경에서 신청한 예약도 연결된 Firebase에 실제 저장됩니다.** 자세한 설정은 [예약 운영 안내](docs/reservation-setup.md)를 확인하세요.
