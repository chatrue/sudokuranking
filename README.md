# SuDoKu ranking (Next.js + Supabase, PWA)

## 0) 준비물
- Node.js 18+ (권장 20+)
- Supabase 프로젝트 1개

## 1) Supabase 설정
1. Supabase 프로젝트 생성
2. SQL Editor에서 `supabase.sql` 실행
3. Project Settings → API 에서
   - Project URL
   - anon public key
   - service_role key
   값을 확인

## 2) 로컬 실행
```bash
npm install
cp .env.local.example .env.local
# .env.local에 Supabase 값 넣기
npm run dev
```

브라우저에서 http://localhost:3000

## 3) 배포(예: Vercel)
- 환경변수 3개를 그대로 등록:
  - NEXT_PUBLIC_SUPABASE_URL
  - NEXT_PUBLIC_SUPABASE_ANON_KEY
  - SUPABASE_SERVICE_ROLE_KEY

## 4) 점수 규칙
- 기본점수: 쉬움 3 / 중간 5 / 어려움 7
- 보너스: 쉬움 3분 / 중간 5분 / 어려움 7분 이내 완료 시 (기본점수와 동일한 보너스 점수)
- 감점:
  - 같은 숫자 보임 켬: -1
  - 완성 숫자 표시 켬: -1

보너스 점수 값은 `lib/scoring.ts`의 `BONUS_POINTS`에서 바꿀 수 있습니다.

## 5) 기능
- 스도쿠 입력/메모/삭제
- 되돌리기/다시하기(Undo/Redo)
- 새문제(샘플 퍼즐 풀에서 랜덤)
- 타이머
- 설정(출신국가/언어/기본 난이도/같은 숫자 보임/완성 숫자 표시)
- 제출하기(완성+충돌 없음일 때만)
- 랭킹 Today/Total 조회(모달)
- 내보내기 CSV 다운로드

## 6) 다음 확장(원하면 내가 계속 붙여줄 수 있어)
- 퍼즐 생성기/퍼즐 풀 확장
- 난이도별 “퍼즐 검증”
- 랭킹 UI(더 예쁘게, 내 기록 하이라이트)
- 부정 제출 방지(퍼즐 해시/정답 검증 강화)
- iOS 홈화면 최적화(스플래시, 서비스워커 오프라인)
